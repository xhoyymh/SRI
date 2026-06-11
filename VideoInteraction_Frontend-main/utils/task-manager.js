const uploadApi = require('../api/upload')
const analysisApi = require('../api/analysis')

const UPLOAD_CONCURRENCY = 3
const UPLOAD_RETRY_LIMIT = 2
const MAX_VISIBLE_UPLOAD_JOBS = 6
const RAG_POLL_INTERVAL = 3000
const TASK_BAR_VISIBLE_MS = 5000

const listeners = []
const uploadJobs = []
const taskBarTimers = {}
const hiddenTaskBarKeys = {}

let ragPollTimer = null
let currentRag = idleRag()

function idleRag() {
  return {
    type: 'rag',
    active: false,
    taskId: null,
    batchId: null,
    status: 'IDLE',
    stage: '',
    progress: 0,
    message: '',
    errorMessage: ''
  }
}

function subscribe(listener, options = {}) {
  if (typeof listener !== 'function') return function noop() {}
  const entry = {
    listener,
    includeTaskBars: options.includeTaskBars !== false
  }
  listeners.push(entry)
  listener(snapshot({ includeTaskBars: entry.includeTaskBars }))
  return function unsubscribe() {
    const index = listeners.indexOf(entry)
    if (index >= 0) listeners.splice(index, 1)
  }
}

function snapshot(options = {}) {
  const includeTaskBars = options.includeTaskBars !== false
  return {
    upload: getUploadState(),
    rag: cloneRag(currentRag),
    taskBars: includeTaskBars ? buildTaskBars() : []
  }
}

function notify() {
  listeners.slice().forEach((entry) => {
    try {
      entry.listener(snapshot({ includeTaskBars: entry.includeTaskBars }))
    } catch (err) {
      console.error('任务状态订阅回调失败', err)
    }
  })
}

function startUpload(payload) {
  const dramaTitle = String(payload && payload.dramaTitle || '').trim()
  const videoDescription = String(payload && payload.videoDescription || '').trim()
  const files = (payload && payload.files) || []
  const coverFile = (payload && payload.coverFile) || null
  if (!dramaTitle) return Promise.reject(new Error('请输入短剧名称'))
  if (!videoDescription) return Promise.reject(new Error('请输入视频简介'))
  if (!files.length) return Promise.reject(new Error('请选择视频'))

  const job = createUploadJob(dramaTitle, files, coverFile)
  uploadJobs.push(job)
  trimUploadJobs()
  notify()
  runUploadJob(job.id, { dramaTitle, videoDescription, files, coverFile })
  return Promise.resolve(publicUploadJob(job))
}

async function runUploadJob(jobId, payload) {
  const job = findUploadJob(jobId)
  if (!job) return
  try {
    markUploadJob(job, {
      status: 'RUNNING',
      stage: 'create',
      message: '正在创建上传批次'
    })
    const batch = await uploadApi.createUploadBatch({
      dramaTitle: payload.dramaTitle,
      dramaDescription: payload.videoDescription,
      coverFile: payload.coverFile ? {
        fileName: payload.coverFile.name,
        fileSize: payload.coverFile.size,
        contentType: payload.coverFile.type || 'image/jpeg'
      } : null,
      files: job.files.map((file) => ({
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || 'video/mp4',
        episodeNo: file.episodeNo
      }))
    })
    markUploadJob(job, {
      batchId: batch.batchId,
      status: 'RUNNING',
      stage: 'upload',
      message: '正在上传到 COS'
    })

    const uploadedAssetIds = await uploadAll(job, batch.uploads || [])
    const uploadedCover = await uploadCover(job, payload.coverFile, batch.coverUpload)
    markUploadJob(job, {
      status: 'COMPLETING',
      stage: 'complete',
      progress: Math.max(job.progress, 98),
      message: '正在确认上传结果'
    })
    const complete = await uploadApi.completeUploadBatch(batch.batchId, uploadedAssetIds, uploadedCover ? {
      coverKey: uploadedCover.objectKey,
      coverUrl: uploadedCover.cosUrl
    } : {})
    markUploadJob(job, {
      status: 'SUCCESS',
      stage: 'done',
      progress: 100,
      complete,
      message: '上传完成，点击进入 RAG 调用页面'
    })
  } catch (err) {
    console.error('上传任务失败', err)
    markUploadJob(job, {
      status: 'FAILED',
      stage: 'failed',
      message: uploadErrorText(err),
      errorMessage: uploadErrorText(err)
    })
  }
}

async function uploadAll(job, uploadInfos) {
  const total = uploadInfos.length
  const uploadedAssetIds = new Array(total)
  let cursor = 0
  let completed = 0
  const workerCount = Math.min(UPLOAD_CONCURRENCY, total || 1)
  const runWorker = async () => {
    while (cursor < total) {
      const index = cursor
      cursor += 1
      const uploadInfo = uploadInfos[index]
      const file = findFileForUpload(job.files, uploadInfo, index)
      if (!file) throw new Error(`找不到本地视频文件：${uploadInfo.originalFileName || index + 1}`)
      if (isSkipUpload(uploadInfo)) {
        job.sentBytes[index] = Number(file.size) || job.sentBytes[index] || 0
        uploadedAssetIds[index] = uploadInfo.assetId
        completed += 1
        updateJobFile(job, index, {
          assetId: uploadInfo.assetId,
          statusText: '已存在，跳过上传',
          progress: 100
        })
        updateUploadAggregate(job, completed, total)
        continue
      }
      updateJobFile(job, index, { assetId: uploadInfo.assetId, statusText: '上传中' })
      await uploadOneWithRetry(job, file, uploadInfo, index, completed, total)
      job.sentBytes[index] = Number(file.size) || job.sentBytes[index] || 0
      uploadedAssetIds[index] = uploadInfo.assetId
      completed += 1
      updateJobFile(job, index, {
        assetId: uploadInfo.assetId,
        statusText: '已上传',
        progress: 100
      })
      updateUploadAggregate(job, completed, total)
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
  return uploadedAssetIds.filter(Boolean)
}

async function uploadCover(job, coverFile, coverUpload) {
  if (!coverFile) return null
  if (!coverUpload || !coverUpload.objectKey) {
    throw new Error('后端没有返回封面上传参数')
  }
  markUploadJob(job, {
    stage: 'upload-cover',
    progress: Math.max(job.progress, 95),
    message: '正在上传短剧封面'
  })
  await uploadApi.uploadAssetToCos(coverUpload, coverFile.path, coverFile.type || 'image/jpeg', (progress) => {
    const displayProgress = clamp(Number(progress && progress.progress) || 0, 0, 100)
    markUploadJob(job, {
      progress: Math.max(job.progress, Math.min(97, 90 + Math.round(displayProgress / 15))),
      message: `正在上传短剧封面 ${displayProgress}%`
    })
  }, { fileSize: coverFile.size || 0 })
  markUploadJob(job, {
    progress: Math.max(job.progress, 97),
    message: '短剧封面已上传'
  })
  return coverUpload
}

async function uploadOneWithRetry(job, file, uploadInfo, index, completed, total) {
  let lastError = null
  for (let attempt = 1; attempt <= UPLOAD_RETRY_LIMIT; attempt++) {
    try {
      if (attempt > 1) {
        job.sentBytes[index] = 0
        updateJobFile(job, index, {
          progress: 0,
          statusText: `重试中 ${attempt}/${UPLOAD_RETRY_LIMIT}`
        })
        updateUploadAggregate(job, completed, total)
      }
      await uploadApi.uploadAssetToCos(uploadInfo, file.path, file.type || 'video/mp4', (progress) => {
        const fileSize = Number(file.size) || Number(progress.totalBytesExpectedToSend) || 0
        const sentInFile = Number(progress.totalBytesSent) || Math.round(fileSize * (Number(progress.progress) || 0) / 100)
        const currentFileSent = fileSize > 0 ? Math.min(fileSize, sentInFile) : sentInFile
        const fileProgress = Number(progress.progress) || (fileSize > 0 ? Math.round(currentFileSent / fileSize * 100) : 0)
        const displayProgress = clamp(fileProgress, 0, 100)
        job.sentBytes[index] = currentFileSent
        updateJobFile(job, index, {
          progress: displayProgress,
          statusText: `${progress.stage || '上传'} ${displayProgress}%`
        })
        updateUploadAggregate(job, completed, total)
      }, { fileSize: file.size || 0 })
      return
    } catch (err) {
      lastError = err
      if (attempt >= UPLOAD_RETRY_LIMIT) {
        break
      }
    }
  }
  throw lastError || new Error('上传失败')
}

function updateUploadAggregate(job, completed, total) {
  const totalBytes = job.totalBytes || 0
  const sent = sumNumbers(job.sentBytes)
  const byBytes = totalBytes > 0 ? Math.round(clamp(sent / totalBytes, 0, 1) * 100) : 0
  const byFiles = total > 0 ? Math.round(clamp(completed / total, 0, 1) * 100) : 0
  const uploading = (job.files || []).filter((file) => {
    const status = String(file.statusText || '')
    return status.includes('上传') && status !== '已上传' && status !== '待上传'
  }).length
  markUploadJob(job, {
    progress: Math.max(byBytes, byFiles),
    message: `正在上传视频 ${completed}/${total}，并发 ${Math.min(uploading, UPLOAD_CONCURRENCY)}/${UPLOAD_CONCURRENCY}`
  })
}

function startRag(payload) {
  if (currentRag.active) {
    return Promise.reject(new Error('当前已有 RAG 任务在处理，请等待完成'))
  }
  const assetIds = (payload && payload.assetIds || []).map(Number).filter(Boolean)
  const judgeApiKey = String(payload && payload.judgeApiKey || '').trim()
  const judgeEndpointId = String(payload && payload.judgeEndpointId || '').trim()
  const generationApiKey = String(payload && payload.generationApiKey || '').trim()
  if (!assetIds.length) return Promise.reject(new Error('请选择待处理视频'))
  if (!judgeApiKey || !judgeEndpointId) return Promise.reject(new Error('请输入模型A（互动点判断模型）apiKey 和 endpointId/ep'))
  return analysisApi.startAnalysisTask({
    assetIds,
    judgeApiKey,
    judgeEndpointId,
    generationApiKey
  }).then((task) => {
    setRagFromTask(task, true)
    startRagPolling(task && task.taskId)
    return task
  })
}

function refreshActiveRag() {
  return analysisApi.getActiveTask()
    .then((task) => {
      if (task && task.taskId) {
        setRagFromTask(task, true)
        startRagPolling(task.taskId)
      } else {
        clearRag()
      }
      return task
    })
    .catch((err) => {
      console.error('获取活跃 RAG 任务失败', err)
      return null
    })
}

function startRagPolling(taskId) {
  if (!taskId) return
  if (ragPollTimer) clearInterval(ragPollTimer)
  ragPollTimer = setInterval(() => refreshRagTask(taskId), RAG_POLL_INTERVAL)
  refreshRagTask(taskId)
}

function refreshRagTask(taskId) {
  if (!taskId) return Promise.resolve(null)
  return analysisApi.getAnalysisTask(taskId)
    .then((task) => {
      const active = !isFinalTaskStatus(task && task.status)
      setRagFromTask(task, active)
      if (!active && ragPollTimer) {
        clearInterval(ragPollTimer)
        ragPollTimer = null
      }
      return task
    })
    .catch((err) => {
      console.error('刷新 RAG 任务失败', err)
      return null
    })
}

function clearRag() {
  if (ragPollTimer) {
    clearInterval(ragPollTimer)
    ragPollTimer = null
  }
  currentRag = idleRag()
  notify()
}

function navigate(type) {
  dismissTaskBars(type)
  const url = type === 'rag' ? '/pages/rag/index' : '/pages/upload/index'
  if (typeof wx === 'undefined' || !wx.navigateTo) return
  wx.navigateTo({ url })
}

function createUploadJob(dramaTitle, files, coverFile) {
  const now = Date.now()
  return {
    id: `upload_${now}_${Math.floor(Math.random() * 10000)}`,
    type: 'upload',
    dramaTitle,
    batchId: null,
    status: 'RUNNING',
    stage: 'create',
    progress: 0,
    message: '正在创建上传批次',
    errorMessage: '',
    startedAt: now,
    updatedAt: now,
    complete: null,
    coverFile: coverFile ? Object.assign({}, coverFile) : null,
    totalBytes: files.reduce((sum, file) => sum + (Number(file.size) || 0), 0),
    sentBytes: files.map(() => 0),
    files: files.map((file, index) => Object.assign({}, file, {
      index,
      assetId: null,
      progress: Number(file.progress) || 0,
      statusText: '待上传'
    }))
  }
}

function markUploadJob(job, patch) {
  Object.assign(job, patch || {}, { updatedAt: Date.now() })
  notify()
}

function updateJobFile(job, index, patch) {
  if (!job.files[index]) return
  job.files[index] = Object.assign({}, job.files[index], patch || {})
}

function getUploadState() {
  const visibleJobs = uploadJobs.filter((job) => job.status !== 'CLEARED')
  const activeJobs = visibleJobs.filter(isActiveUploadStatus)
  const latest = visibleJobs[visibleJobs.length - 1]
  const progressJobs = activeJobs.length ? activeJobs : (latest ? [latest] : [])
  const progress = computeUploadProgress(progressJobs)
  const status = activeJobs.length ? 'RUNNING' : (latest && latest.status) || 'IDLE'
  return {
    type: 'upload',
    active: activeJobs.length > 0,
    status,
    progress,
    message: uploadStateMessage(activeJobs, latest),
    canEnterRag: visibleJobs.some((job) => job.status === 'SUCCESS'),
    jobs: visibleJobs.slice(-MAX_VISIBLE_UPLOAD_JOBS).map(publicUploadJob)
  }
}

function publicUploadJob(job) {
  return {
    id: job.id,
    dramaTitle: job.dramaTitle,
    batchId: job.batchId,
    status: job.status,
    stage: job.stage,
    progress: clamp(Number(job.progress) || 0, 0, 100),
    message: job.message,
    errorMessage: job.errorMessage,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    complete: job.complete,
    files: (job.files || []).map((file) => ({
      id: file.id,
      name: file.name,
      originalName: file.originalName,
      size: file.size,
      sizeText: file.sizeText,
      type: file.type,
      episodeNo: file.episodeNo,
      statusText: file.statusText,
      progress: clamp(Number(file.progress) || 0, 0, 100),
      assetId: file.assetId
    }))
  }
}

function cloneRag(rag) {
  return Object.assign({}, rag || idleRag())
}

function setRagFromTask(task, active) {
  currentRag = {
    type: 'rag',
    active: !!active,
    taskId: task && task.taskId || null,
    batchId: task && task.batchId || null,
    status: task && task.status || 'IDLE',
    stage: task && task.stage || '',
    progress: clamp(Number(task && task.progress) || (active ? 5 : 0), 0, 100),
    message: task && (task.message || task.errorMessage) || '',
    errorMessage: task && task.errorMessage || ''
  }
  notify()
}

function buildTaskBars() {
  const rawBars = buildRawTaskBars()
  syncTaskBarState(rawBars)
  return rawBars
    .filter((bar) => !hiddenTaskBarKeys[bar.key])
    .map(publicTaskBar)
}

function buildRawTaskBars() {
  const bars = []
  const upload = getUploadState()
  if (upload.active || upload.status === 'SUCCESS' || upload.status === 'FAILED') {
    bars.push({
      key: uploadTaskBarKey(upload),
      autoDismiss: upload.status === 'SUCCESS',
      type: 'upload',
      title: '视频上传',
      progress: upload.progress,
      message: upload.message || '上传任务'
    })
  }
  if (currentRag.active || currentRag.status === 'SUCCESS' || currentRag.status === 'FAILED') {
    bars.push({
      key: ragTaskBarKey(currentRag),
      autoDismiss: currentRag.status === 'SUCCESS',
      type: 'rag',
      title: 'RAG 处理',
      progress: clamp(Number(currentRag.progress) || 0, 0, 100),
      message: currentRag.message || ragStatusLabel(currentRag.status)
    })
  }
  return bars
}

function publicTaskBar(bar) {
  const copy = Object.assign({}, bar)
  delete copy.key
  delete copy.autoDismiss
  return copy
}

function syncTaskBarState(rawBars) {
  const active = {}
  ;(rawBars || []).forEach((bar) => {
    if (!bar || !bar.key) return
    active[bar.key] = true
    if (bar.autoDismiss) ensureTaskBarTimer(bar.key)
  })
  Object.keys(taskBarTimers).forEach((key) => {
    if (!active[key]) clearTaskBarKey(key)
  })
  Object.keys(hiddenTaskBarKeys).forEach((key) => {
    if (!active[key]) delete hiddenTaskBarKeys[key]
  })
}

function ensureTaskBarTimer(key) {
  if (!key || hiddenTaskBarKeys[key] || taskBarTimers[key]) return
  taskBarTimers[key] = setTimeout(() => {
    delete taskBarTimers[key]
    hiddenTaskBarKeys[key] = true
    notify()
  }, TASK_BAR_VISIBLE_MS)
}

function clearTaskBarKey(key) {
  if (taskBarTimers[key]) {
    clearTimeout(taskBarTimers[key])
    delete taskBarTimers[key]
  }
  delete hiddenTaskBarKeys[key]
}

function dismissTaskBars(type) {
  buildRawTaskBars()
    .filter((bar) => !type || bar.type === type)
    .forEach((bar) => {
      if (taskBarTimers[bar.key]) {
        clearTimeout(taskBarTimers[bar.key])
        delete taskBarTimers[bar.key]
      }
      hiddenTaskBarKeys[bar.key] = true
    })
  notify()
}

function uploadStateMessage(activeJobs, latest) {
  if (activeJobs.length) {
    const fileTotals = activeJobs.reduce((acc, job) => {
      acc.total += (job.files || []).length
      acc.done += (job.files || []).filter((file) => Number(file.progress) >= 100).length
      return acc
    }, { done: 0, total: 0 })
    return activeJobs.length > 1
      ? `${activeJobs.length} 个上传任务进行中，视频 ${fileTotals.done}/${fileTotals.total}`
      : (activeJobs[0].message || `正在上传视频 ${fileTotals.done}/${fileTotals.total}`)
  }
  if (!latest) return ''
  if (latest.status === 'SUCCESS') return '上传完成，点击进入 RAG 调用页面'
  if (latest.status === 'FAILED') return `上传失败：${latest.errorMessage || latest.message || '请重试'}`
  return latest.message || ''
}

function computeUploadProgress(jobs) {
  const list = jobs || []
  if (!list.length) return 0
  const total = list.reduce((sum, job) => sum + (job.totalBytes || 0), 0)
  if (total > 0) {
    const sent = list.reduce((sum, job) => sum + sumNumbers(job.sentBytes), 0)
    return clamp(Math.round(sent / total * 100), 0, 100)
  }
  const average = list.reduce((sum, job) => sum + (Number(job.progress) || 0), 0) / list.length
  return clamp(Math.round(average), 0, 100)
}

function trimUploadJobs() {
  if (uploadJobs.length <= MAX_VISIBLE_UPLOAD_JOBS) return
  for (let i = 0; i < uploadJobs.length && uploadJobs.length > MAX_VISIBLE_UPLOAD_JOBS; i++) {
    if (!isActiveUploadStatus(uploadJobs[i])) {
      uploadJobs.splice(i, 1)
      i -= 1
    }
  }
}

function findUploadJob(jobId) {
  return uploadJobs.find((job) => job.id === jobId)
}

function findFileForUpload(files, uploadInfo, fallbackIndex) {
  const key = normalizeFileName(uploadInfo && uploadInfo.originalFileName)
  return (files || []).find((file) => normalizeFileName(file.name) === key) || files[fallbackIndex]
}

function isSkipUpload(uploadInfo) {
  return String(uploadInfo && uploadInfo.uploadMethod || '').toUpperCase() === 'SKIP'
    || (uploadInfo && uploadInfo.status === 'UPLOADED' && !uploadInfo.uploadUrl)
}

function isActiveUploadStatus(job) {
  return job && (job.status === 'RUNNING' || job.status === 'COMPLETING')
}

function isFinalTaskStatus(status) {
  return status === 'SUCCESS' || status === 'FAILED' || status === 'CANCELLED'
}

function uploadTaskBarKey(upload) {
  const jobs = upload && upload.jobs || []
  const activeIds = jobs
    .filter(isActiveUploadStatus)
    .map((job) => job.id)
    .join(',')
  if (activeIds) return `upload:${activeIds}:active`
  const latest = jobs[jobs.length - 1]
  return `upload:${latest && latest.id || upload && upload.status || 'latest'}:${taskBarPhase(upload && upload.status)}`
}

function ragTaskBarKey(rag) {
  return `rag:${rag && rag.taskId || 'current'}:${taskBarPhase(rag && rag.status)}`
}

function taskBarPhase(status) {
  if (status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'failed'
  if (status === 'CANCELLED') return 'cancelled'
  return 'active'
}

function ragStatusLabel(status) {
  const map = {
    IDLE: '',
    QUEUED: '等待处理',
    RUNNING: '正在处理互动内容',
    SUCCESS: 'RAG 处理完成',
    FAILED: 'RAG 处理失败'
  }
  return map[status] || status || ''
}

function uploadErrorText(err) {
  const msg = (err && (err.message || err.errMsg || err.data || err.error)) || (err && err.message !== undefined ? String(err.message) : '')
  if (msg) return String(msg).replace(/\s+/g, ' ').slice(0, 180)
  return '上传失败'
}

function normalizeFileName(name) {
  return String(name || '').trim().toLowerCase()
}

function sumNumbers(values) {
  return (values || []).reduce((sum, value) => sum + (Number(value) || 0), 0)
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0))
}

module.exports = {
  subscribe,
  snapshot,
  startUpload,
  startRag,
  refreshActiveRag,
  refreshRagTask,
  navigate
}
