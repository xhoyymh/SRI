const analysisApi = require('../../api/analysis')
const taskManager = require('../../utils/task-manager')
const authStore = require('../../utils/auth-store')

const STARTABLE_RAG_STATUSES = ['PENDING', 'FAILED']

Page({
  data: {
    groups: [],
    pendingGroups: [],
    processedGroups: [],
    expandedGroups: {},
    hasPendingGroups: false,
    selectedBatchId: null,
    judgeApiKey: '',
    judgeEndpointId: '',
    generationApiKey: '',
    loading: false,
    starting: false,
    ragState: {}
  },

  taskUnsubscribe: null,

  onLoad() {
    if (!this.ensureLogin()) return
    this.attachTaskManager()
    this.refresh()
  },

  onShow() {
    if (!this.ensureLogin()) return
    this.attachTaskManager()
    this.refresh()
  },

  onUnload() {
    if (this.taskUnsubscribe) {
      this.taskUnsubscribe()
      this.taskUnsubscribe = null
    }
  },

  attachTaskManager() {
    if (this.taskUnsubscribe) return
    this.taskUnsubscribe = taskManager.subscribe((state) => {
      const oldStatus = this.data.ragState && this.data.ragState.status
      this.setData({
        ragState: state.rag
      })
      if (oldStatus && oldStatus !== state.rag.status && (state.rag.status === 'SUCCESS' || state.rag.status === 'FAILED')) {
        this.loadPendingVideos()
      }
    }, { includeTaskBars: false })
  },

  ensureLogin() {
    return authStore.requirePageLogin('登录后可以调用 RAG')
  },

  refresh() {
    this.loadPendingVideos()
    taskManager.refreshActiveRag()
  },

  async loadPendingVideos() {
    this.setData({ loading: true })
    try {
      const groups = normalizeGroups(await analysisApi.getPendingVideos())
      const selected = pickSelectedBatch(groups, this.data.selectedBatchId)
      this.setData(Object.assign({
        groups,
        selectedBatchId: selected
      }, buildDisplayState(groups, this.data.expandedGroups)))
    } catch (err) {
      console.error('加载待处理视频失败', err)
    } finally {
      this.setData({ loading: false })
    }
  },

  onJudgeKeyInput(e) { this.setData({ judgeApiKey: e.detail.value }) },
  onJudgeEndpointInput(e) { this.setData({ judgeEndpointId: e.detail.value }) },
  onGenerationKeyInput(e) { this.setData({ generationApiKey: e.detail.value }) },

  onSelectGroup(e) {
    this.setData({ selectedBatchId: Number(e.currentTarget.dataset.batchId) })
  },

  toggleGroupDetails(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const expandedGroups = Object.assign({}, this.data.expandedGroups)
    expandedGroups[key] = !expandedGroups[key]
    this.setData(Object.assign({
      expandedGroups
    }, buildDisplayState(this.data.groups, expandedGroups)))
  },

  async startRag() {
    const group = this.data.groups.find((item) => item.batchId === this.data.selectedBatchId)
    if (!group || !group.pendingAssetIds.length) {
      wx.showToast({ title: '当前短剧没有待处理视频', icon: 'none' })
      return
    }
    if (this.data.ragState && this.data.ragState.active) {
      wx.showToast({ title: '已有 RAG 任务处理中', icon: 'none' })
      return
    }
    if (!this.validateModelInfo()) return
    this.setData({ starting: true })
    try {
      await taskManager.startRag({
        assetIds: group.pendingAssetIds,
        judgeApiKey: this.data.judgeApiKey.trim(),
        judgeEndpointId: this.data.judgeEndpointId.trim(),
        generationApiKey: this.data.generationApiKey.trim()
      })
      wx.showToast({ title: 'RAG 已开始', icon: 'success' })
      this.loadPendingVideos()
    } catch (err) {
      const message = taskErrorText(err)
      wx.showToast({ title: message.slice(0, 80), icon: 'none' })
    } finally {
      this.setData({ starting: false })
    }
  },

  async retryTask() {
    const taskId = this.data.ragState && this.data.ragState.taskId
    if (!taskId) return
    this.setData({ starting: true })
    try {
      await analysisApi.retryAnalysisTask(taskId)
      await taskManager.refreshRagTask(taskId)
      this.loadPendingVideos()
    } catch (err) {
      wx.showToast({ title: taskErrorText(err).slice(0, 80), icon: 'none' })
    } finally {
      this.setData({ starting: false })
    }
  },

  onGoHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  validateModelInfo() {
    if (!this.data.judgeApiKey.trim() || !this.data.judgeEndpointId.trim()) {
      wx.showToast({ title: '请输入模型A（互动点判断模型）apiKey 和 ep', icon: 'none' })
      return false
    }
    return true
  }
})

function normalizeGroups(groups) {
  return (groups || []).map((group, orderIndex) => {
    const videos = (group.videos || []).map((video) => {
      const ragStatus = video.ragStatus || 'PENDING'
      return Object.assign({}, video, {
        ragStatus,
        statusLabel: ragStatusLabel(ragStatus),
        statusClass: statusClass(ragStatus)
      })
    })
    const counts = countStatuses(videos)
    const split = splitVideosByProcessed(videos)
    const pendingAssetIds = videos
      .filter((video) => STARTABLE_RAG_STATUSES.indexOf(video.ragStatus) >= 0)
      .map((video) => video.assetId)
      .filter(Boolean)
    return Object.assign({}, group, {
      videos,
      unprocessedVideos: split.unprocessed,
      processedVideos: split.processed,
      unprocessedCount: split.unprocessed.length,
      processedCount: split.processed.length,
      pendingAssetIds,
      pendingCount: pendingAssetIds.length,
      processingCount: counts.PROCESSING || 0,
      analyzedCount: counts.ANALYZED || 0,
      noInteractionCount: counts.NO_INTERACTION || 0,
      failedCount: counts.FAILED || 0,
      orderIndex
    })
  }).sort(compareGroupOrder).map((group) => {
    const copy = Object.assign({}, group)
    delete copy.orderIndex
    return copy
  })
}

function buildDisplayState(groups, expandedGroups) {
  const expanded = expandedGroups || {}
  const pendingGroups = []
  const processedGroups = []
  ;(groups || []).forEach((group) => {
    if (group.unprocessedVideos && group.unprocessedVideos.length) {
      const detailKey = 'pending-' + group.batchId
      pendingGroups.push(Object.assign({}, group, {
        detailKey,
        detailExpanded: !!expanded[detailKey]
      }))
    }
    if (group.processedVideos && group.processedVideos.length) {
      const detailKey = 'processed-' + group.batchId
      processedGroups.push(Object.assign({}, group, {
        detailKey,
        detailExpanded: !!expanded[detailKey]
      }))
    }
  })
  return {
    pendingGroups,
    processedGroups,
    hasPendingGroups: pendingGroups.some((group) => group.pendingAssetIds && group.pendingAssetIds.length)
  }
}

function countStatuses(videos) {
  return (videos || []).reduce((acc, video) => {
    const key = video.ragStatus || 'PENDING'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

function splitVideosByProcessed(videos) {
  return (videos || []).reduce((acc, video) => {
    if (isProcessedRagStatus(video.ragStatus)) {
      acc.processed.push(video)
    } else {
      acc.unprocessed.push(video)
    }
    return acc
  }, { unprocessed: [], processed: [] })
}

function isProcessedRagStatus(status) {
  return status === 'ANALYZED' || status === 'NO_INTERACTION'
}

function compareGroupOrder(a, b) {
  const aDone = a.unprocessedVideos && a.unprocessedVideos.length ? 0 : 1
  const bDone = b.unprocessedVideos && b.unprocessedVideos.length ? 0 : 1
  if (aDone !== bDone) return aDone - bDone
  return (a.orderIndex || 0) - (b.orderIndex || 0)
}

function pickSelectedBatch(groups, current) {
  if ((groups || []).some((group) => group.batchId === current && group.pendingAssetIds && group.pendingAssetIds.length)) return current
  const pending = (groups || []).find((group) => group.pendingAssetIds && group.pendingAssetIds.length)
  return pending ? pending.batchId : null
}

function ragStatusLabel(status) {
  const map = {
    WAITING_UPLOAD: '等待上传',
    PENDING: '待处理',
    PROCESSING: '处理中',
    ANALYZED: '已生成互动',
    NO_INTERACTION: '已判断无互动点',
    FAILED: '处理失败'
  }
  return map[status] || status || '待处理'
}

function statusClass(status) {
  const map = {
    WAITING_UPLOAD: 'waiting',
    PENDING: 'pending',
    PROCESSING: 'processing',
    ANALYZED: 'analyzed',
    NO_INTERACTION: 'none',
    FAILED: 'failed'
  }
  return map[status] || 'pending'
}

function taskErrorText(err) {
  const msg = (err && (err.message || err.errMsg || err.data || err.error)) || (err && err.message !== undefined ? String(err.message) : '')
  if (msg) return String(msg).replace(/\s+/g, ' ').slice(0, 180)
  return '请求失败'
}
