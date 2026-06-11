// mock.js: 本地 Mock 数据（后端未就绪时使用）
// 对应 API 契约 §4 各接口样例响应

// GET /dramas 响应
const mockDramas = {
  code: 0,
  message: 'success',
  data: [
    {
      dramaId: 1,
      title: '北派寻宝笔记',
      description: '寻宝+反转',
      coverUrl: 'https://picsum.photos/seed/d1/300/400',
      tags: ['爽剧', '反转', '悬疑'],
      episodeCount: 2
    },
    {
      dramaId: 2,
      title: '天下第一纨绔',
      description: '逆袭',
      coverUrl: 'https://picsum.photos/seed/d2/300/400',
      tags: ['逆袭', '搞笑'],
      episodeCount: 1
    }
  ]
}

// GET /dramas/{dramaId} 响应
const mockDramaDetail = {
  1: {
    code: 0,
    data: {
      dramaId: 1,
      title: '北派寻宝笔记',
      coverUrl: 'https://picsum.photos/seed/d1/300/400',
      tags: ['爽剧', '反转', '悬疑'],
      episodes: [
        { episodeId: 101, episodeNo: 1, title: '第1集', duration: 180 },
        { episodeId: 102, episodeNo: 2, title: '第2集', duration: 175 }
      ]
    }
  },
  2: {
    code: 0,
    data: {
      dramaId: 2,
      title: '天下第一纨绔',
      coverUrl: 'https://picsum.photos/seed/d2/300/400',
      tags: ['逆袭', '搞笑'],
      episodes: [{ episodeId: 201, episodeNo: 1, title: '第1集', duration: 180 }]
    }
  }
}

// GET /episodes/{episodeId} 响应
const mockEpisodes = {
  101: {
    code: 0,
    data: {
      episodeId: 101,
      dramaId: 1,
      episodeNo: 1,
      title: '第1集：藏宝图出现',
      // 本地静态服务（运行根目录 serve-video.py）；localhost 在开发者工具免域名校验
      videoUrl: 'http://localhost:8000/episode-01.mp4',
      duration: 180
    }
  },
  102: {
    code: 0,
    data: {
      episodeId: 102,
      dramaId: 1,
      episodeNo: 2,
      title: '第2集：深入古墓',
      videoUrl: 'http://localhost:8000/episode-02.mp4',
      duration: 175
    }
  },
  201: {
    code: 0,
    data: {
      episodeId: 201,
      dramaId: 2,
      episodeNo: 1,
      title: '第1集：废物逆袭',
      videoUrl: 'http://localhost:8000/episode-03.mp4',
      duration: 180
    }
  }
}

// GET /episodes/{episodeId}/highlights 响应（§4.4，按 startTime 升序）
const mockHighlights = {
  101: {
    code: 0,
    data: [
      {
        highlightId: 1004,
        episodeId: 101,
        startTime: 8,
        endTime: 14,
        highlightType: 'SWEET',
        title: '心动名场面',
        triggerOnce: true,
        interactionConfig: {
          componentType: 'emotion_button',
          buttons: [
            { optionCode: 'sweet', label: '甜', effect: 'float', icon: '/icon/sweet.png' }
          ]
        }
      },
      {
        highlightId: 1001,
        episodeId: 101,
        startTime: 15,
        endTime: 22,
        highlightType: '高光弹幕',
        title: '男主强势反击',
        triggerOnce: true,
        interactionConfig: {
          componentType: 'emotion_button',
          buttons: [
            { optionCode: 'cool', label: '爽', effect: 'float', icon: '/icon/shaung.png' },
            { optionCode: 'famous_scene', label: '名场面', effect: 'bubble', icon: '/icon/mingchangmian.png' }
          ]
        }
      },
      {
        highlightId: 1003,
        episodeId: 101,
        startTime: 30,
        endTime: 36,
        highlightType: '高光弹幕',
        title: '搞笑桥段',
        triggerOnce: true,
        interactionConfig: {
          componentType: 'emotion_button',
          buttons: [
            { optionCode: 'funny', label: '笑出鹅叫', effect: 'shake', icon: '/icon/xiao.png' }
          ]
        }
      },
      {
        highlightId: 1002,
        episodeId: 101,
        startTime: 45,
        endTime: 55,
        highlightType: '分支创建',
        title: '是否独自进入古墓',
        triggerOnce: true,
        interactionConfig: {
          componentType: 'branch_choice',
          options: [
            { optionCode: 'alone', label: '独自进入', generationMode: 'PREGEN', generationId: 3001, resumeTime: 55, isCorrect: true },
            { optionCode: 'team', label: '叫上伙伴', generationMode: 'PREGEN', generationId: 3002, isCorrect: false, failText: '由于你做出了错误的选择，导致世界崩坏……' }
          ]
        }
      }
    ]
  }
}

// 互动计数本地存储（POST /interactions 累加，模拟后端 currentCount）
const interactionCounts = {
  '1004:sweet': 66,
  '1001:cool': 128,
  '1001:famous_scene': 40,
  '1003:funny': 88
}

// 飘屏轮询涉及的高光与选项（interaction-stats 用）
const statsConfig = {
  1004: ['sweet'],
  1001: ['cool', 'famous_scene'],
  1003: ['funny']
}

// AI 生成内容存储（§4.9 PREGEN 样例 + 运行时 ONDEMAND 生成）
const aiStories = {
  3001: {
    generationId: 3001,
    contentType: 'VIDEO',
    title: '独自深入古墓',
    content: null,
    contentUrl: 'http://localhost:8000/episode-06.mp4',
    likeCount: 56,
    commentCount: 2,
    liked: false
  },
  3002: {
    generationId: 3002,
    contentType: 'VIDEO',
    title: '携手闯古墓',
    content: null,
    contentUrl: 'http://localhost:8000/episode-07.mp4',
    likeCount: 0,
    commentCount: 0,
    liked: false
  }
}

// 评论存储
const aiComments = {
  3001: [
    { commentId: 7001, nickname: '用户1234', content: '这个分支绝了', createTime: '2026-06-05 12:00:00' },
    { commentId: 7002, nickname: '用户5678', content: '独自进入太刺激', createTime: '2026-06-05 12:01:00' }
  ]
}
let commentSeq = 7100
let genSeq = 3100
let uploadBatchSeq = 9000
let mockDramaSeq = 20
let analysisTaskSeq = 9500
let mockHighlightSeq = 12000
const analysisTasks = {}
const uploadBatches = {}
const pendingVideoGroups = {}
const assetIndex = {}

// 时间戳 yyyy-MM-dd HH:mm:ss
function nowStr() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function finishMockAnalysisTask(task) {
  if (!task || task.imported) return
  task.imported = true
  ;(task.assetIds || []).forEach((assetId, index) => {
    const video = assetIndex[assetId]
    if (!video) return
    const hasInteraction = index % 2 === 0
    video.ragStatus = hasInteraction ? 'ANALYZED' : 'NO_INTERACTION'
    video.ragMessage = hasInteraction ? 'Mock 已生成互动内容' : 'Mock 已判断无互动点'
    video.ragUpdateTime = nowStr()
    if (hasInteraction) {
      const highlightId = ++mockHighlightSeq
      statsConfig[highlightId] = ['cool']
      interactionCounts[`${highlightId}:cool`] = 0
      mockHighlights[video.episodeId] = {
        code: 0,
        data: [
          {
            highlightId,
            episodeId: video.episodeId,
            startTime: 12,
            endTime: 18,
            highlightType: '高光弹幕',
            title: 'AI 识别互动点',
            triggerOnce: true,
            interactionConfig: {
              componentType: 'emotion_button',
              buttons: [
                { optionCode: 'cool', label: '爽', effect: 'float', icon: '/icon/shaung.png' }
              ]
            }
          }
        ]
      }
    } else {
      mockHighlights[video.episodeId] = { code: 0, data: [] }
    }
  })
  const group = pendingVideoGroups[task.batchId]
  if (group) {
    group.batchStatus = 'ANALYZED'
    group.taskId = task.taskId
  }
}

// 辅助函数：根据 URL 路径匹配 Mock 数据
function handleMock(options) {
  const { url, method = 'GET', data = {} } = options
  return new Promise((resolve, reject) => {
    // 模拟网络延迟
    setTimeout(() => {
      let response = null

      // GET /dramas
      if (url === '/dramas') {
        response = mockDramas
      }
      // GET /dramas/{dramaId}
      else if (url.startsWith('/dramas/')) {
        const dramaId = parseInt(url.split('/')[2])
        response = mockDramaDetail[dramaId] || { code: 1002, message: '剧集不存在' }
      }
      // GET /episodes/{episodeId}
      else if (url.startsWith('/episodes/') && !url.includes('/highlights') && !url.includes('/interaction-stats')) {
        const episodeId = parseInt(url.split('/')[2])
        response = mockEpisodes[episodeId] || { code: 1002, message: '剧集不存在' }
      }
      // POST /interactions：累加并返回 currentCount（§4.5）
      else if (url === '/interactions' && method === 'POST') {
        const key = `${data.highlightId}:${data.optionCode}`
        interactionCounts[key] = (interactionCounts[key] || 0) + 1
        response = { code: 0, data: { highlightId: data.highlightId, optionCode: data.optionCode, currentCount: interactionCounts[key] } }
      }
      // GET /episodes/{episodeId}/highlights
      else if (url.includes('/highlights')) {
        const episodeId = parseInt(url.split('/')[2])
        response = mockHighlights[episodeId] || { code: 0, data: [] }
      }
      // GET /episodes/{episodeId}/interaction-stats（每 4s 轮询，模拟他人互动随机 +1~3 制造飘屏）
      else if (url.includes('/interaction-stats')) {
        const data = Object.keys(statsConfig).map((hid) => ({
          highlightId: Number(hid),
          options: statsConfig[hid].map((oc) => {
            const key = `${hid}:${oc}`
            interactionCounts[key] = (interactionCounts[key] || 0) + Math.floor(Math.random() * 3) + 1
            return { optionCode: oc, count: interactionCounts[key] }
          })
        }))
        response = { code: 0, data }
      }
      // POST /uploads/batches：上传页本地 mock
      else if (url === '/uploads/batches' && method === 'POST') {
        const batchId = ++uploadBatchSeq
        const uploads = (data.files || []).map((file, idx) => ({
          assetId: batchId * 100 + idx + 1,
          originalFileName: file.fileName,
          episodeNo: file.episodeNo || idx + 1,
          bucket: 'mock-bucket',
          region: 'ap-guangzhou',
          objectKey: `mock/${batchId}/${idx + 1}.mp4`,
          cosUrl: `http://localhost:8000/episode-0${idx + 1}.mp4`,
          uploadMethod: 'COS_SDK',
          uploadUrl: 'mock://cos-upload',
          formData: {},
          expiresAt: Date.now() + 3600000,
          mock: true
        }))
        const coverUpload = data.coverFile ? {
          originalFileName: data.coverFile.fileName,
          bucket: 'mock-bucket',
          region: 'ap-guangzhou',
          objectKey: `mock/${batchId}/cover.jpg`,
          cosUrl: `https://picsum.photos/seed/upload-${batchId}/300/400`,
          uploadMethod: 'COS_SDK',
          uploadUrl: 'mock://cos-upload',
          formData: {},
          expiresAt: Date.now() + 3600000,
          mock: true
        } : null
        uploadBatches[batchId] = { batchId, dramaTitle: data.dramaTitle, status: 'CREATED', uploads, coverUpload }
        response = { code: 0, data: { batchId, dramaTitle: data.dramaTitle, status: 'CREATED', coverUpload, uploads } }
      }
      // POST /uploads/batches/{id}/complete：确认上传完成，不自动触发 RAG
      else if (url.startsWith('/uploads/batches/') && url.endsWith('/complete') && method === 'POST') {
        const batchId = Number(url.split('/')[3])
        const batch = uploadBatches[batchId] || { batchId, dramaTitle: 'Mock 上传短剧', uploads: [] }
        const assetIds = (data.assetIds || []).map(Number)
        const dramaId = ++mockDramaSeq
        const coverUrl = data.coverUrl || (batch.coverUpload && batch.coverUpload.cosUrl) || ''
        const videos = (batch.uploads || [])
          .filter((upload) => assetIds.length === 0 || assetIds.indexOf(upload.assetId) >= 0)
          .map((upload, idx) => {
            const episodeId = batchId * 1000 + idx + 1
            const video = {
              assetId: upload.assetId,
              batchId,
              dramaId,
              episodeId,
              episodeNo: upload.episodeNo || idx + 1,
              originalFileName: upload.originalFileName,
              cosUrl: upload.cosUrl,
              status: 'UPLOADED',
              ragStatus: 'PENDING',
              ragTaskId: null,
              ragMessage: 'Ready for RAG',
              ragUpdateTime: nowStr()
            }
            assetIndex[video.assetId] = video
            mockEpisodes[episodeId] = {
              code: 0,
              data: {
                episodeId,
                dramaId,
                episodeNo: video.episodeNo,
                title: `第${video.episodeNo}集`,
                videoUrl: upload.cosUrl,
                duration: 180
              }
            }
            mockHighlights[episodeId] = { code: 0, data: [] }
            return video
          })
        pendingVideoGroups[batchId] = {
          batchId,
          dramaId,
          dramaTitle: batch.dramaTitle,
          batchStatus: 'READY_FOR_RAG',
          taskId: null,
          videos
        }
        mockDramas.data.unshift({
          dramaId,
          title: batch.dramaTitle,
          description: '用户上传',
          coverUrl,
          tags: ['上传'],
          episodeCount: videos.length
        })
        mockDramaDetail[dramaId] = {
          code: 0,
          data: {
            dramaId,
            title: batch.dramaTitle,
            coverUrl,
            tags: ['上传'],
            episodes: videos.map((video) => ({
              episodeId: video.episodeId,
              episodeNo: video.episodeNo,
              title: `第${video.episodeNo}集`,
              duration: 180
            }))
          }
        }
        response = { code: 0, data: { batchId, dramaId, taskId: null, status: 'READY_FOR_RAG', episodeIds: videos.map((video) => video.episodeId) } }
      }
      // GET /analysis-tasks/pending-videos
      else if (url === '/analysis-tasks/pending-videos' && method === 'GET') {
        response = { code: 0, data: Object.keys(pendingVideoGroups).map((key) => pendingVideoGroups[key]) }
      }
      // GET /analysis-tasks/active
      else if (url === '/analysis-tasks/active' && method === 'GET') {
        const active = Object.keys(analysisTasks)
          .map((key) => analysisTasks[key])
          .find((task) => task.status === 'QUEUED' || task.status === 'RUNNING')
        response = { code: 0, data: active || null }
      }
      // POST /analysis-tasks/start
      else if (url === '/analysis-tasks/start' && method === 'POST') {
        const active = Object.keys(analysisTasks)
          .map((key) => analysisTasks[key])
          .find((task) => task.status === 'QUEUED' || task.status === 'RUNNING')
        if (active) {
          response = { code: 1001, message: '已有 RAG 任务处理中' }
        } else {
          const assetIds = (data.assetIds || []).map(Number)
          const firstAsset = assetIndex[assetIds[0]]
          if (!firstAsset) {
            response = { code: 1002, message: '待处理视频不存在' }
          } else {
            const taskId = ++analysisTaskSeq
            analysisTasks[taskId] = {
              taskId,
              batchId: firstAsset.batchId,
              status: 'RUNNING',
              stage: 'rag',
              progress: 10,
              message: 'Mock RAG 处理中',
              hasGenerationKey: !!data.generationApiKey,
              assetIds
            }
            assetIds.forEach((assetId) => {
              const video = assetIndex[assetId]
              if (video) {
                video.ragStatus = 'PROCESSING'
                video.ragTaskId = taskId
                video.ragMessage = 'RAG processing'
                video.ragUpdateTime = nowStr()
              }
            })
            const group = pendingVideoGroups[firstAsset.batchId]
            if (group) {
              group.taskId = taskId
              group.batchStatus = 'RAG_RUNNING'
            }
            response = { code: 0, data: analysisTasks[taskId] }
          }
        }
      }
      // GET /analysis-tasks/{id}
      else if (url.startsWith('/analysis-tasks/') && method === 'GET') {
        const taskId = Number(url.split('/')[2])
        const task = analysisTasks[taskId]
        if (task) {
          task.progress = Math.min(100, (task.progress || 0) + 25)
          if (task.progress >= 100) {
            task.status = 'SUCCESS'
            task.stage = 'done'
            task.message = 'Mock 分析完成'
            finishMockAnalysisTask(task)
          }
        }
        response = task ? { code: 0, data: task } : { code: 1002, message: '任务不存在' }
      }
      // POST /analysis-tasks/{id}/retry
      else if (url.startsWith('/analysis-tasks/') && url.endsWith('/retry') && method === 'POST') {
        const taskId = Number(url.split('/')[2])
        analysisTasks[taskId] = Object.assign(analysisTasks[taskId] || {}, {
          taskId,
          status: 'RUNNING',
          stage: 'rag',
          progress: 10,
          message: 'Mock 重试中'
        })
        ;(analysisTasks[taskId].assetIds || []).forEach((assetId) => {
          const video = assetIndex[assetId]
          if (video) {
            video.ragStatus = 'PROCESSING'
            video.ragMessage = 'RAG retrying'
            video.ragUpdateTime = nowStr()
          }
        })
        response = { code: 0, data: analysisTasks[taskId] }
      }
      // POST /ai/story/generate（ONDEMAND 实时生成，§4.8）
      else if (url === '/ai/story/generate' && method === 'POST') {
        const gid = ++genSeq
        const story = {
          generationId: gid,
          contentType: 'TEXT',
          title: '携手闯古墓',
          content: '你叫上伙伴一同深入古墓。三人配合默契，躲过重重机关，终于在石棺后发现了真正的藏宝图……',
          contentUrl: null,
          status: 'success',
          likeCount: 0,
          commentCount: 0,
          liked: false
        }
        aiStories[gid] = story
        aiComments[gid] = []
        response = { code: 0, data: story }
      }
      // POST/DELETE /ai/story/{id}/like（§4.10）
      else if (url.startsWith('/ai/story/') && url.endsWith('/like')) {
        const gid = parseInt(url.split('/')[3])
        const story = aiStories[gid]
        if (!story) {
          response = { code: 1002, message: '内容不存在' }
        } else {
          if (method === 'DELETE') {
            if (story.liked) { story.liked = false; story.likeCount-- }
          } else {
            if (!story.liked) { story.liked = true; story.likeCount++ }
          }
          response = { code: 0, data: { generationId: gid, likeCount: story.likeCount, liked: story.liked } }
        }
      }
      // GET/POST /ai/story/{id}/comments（§4.11）
      else if (url.startsWith('/ai/story/') && url.endsWith('/comments')) {
        const gid = parseInt(url.split('/')[3])
        const list = aiComments[gid] || (aiComments[gid] = [])
        if (method === 'POST') {
          const c = { commentId: ++commentSeq, nickname: data.nickname || '我', content: data.content, createTime: nowStr() }
          list.push(c)
          if (aiStories[gid]) aiStories[gid].commentCount = list.length
          response = { code: 0, data: { commentId: c.commentId, createTime: c.createTime } }
        } else {
          response = { code: 0, data: { list, total: list.length } }
        }
      }
      // GET /ai/story/{id}（PREGEN，§4.9）
      else if (url.startsWith('/ai/story/')) {
        const gid = parseInt(url.split('/')[3])
        response = aiStories[gid] ? { code: 0, data: aiStories[gid] } : { code: 1002, message: '内容不存在' }
      }
      else {
        response = { code: 404, message: 'API not found in mock' }
      }

      // 统一处理：code === 0 时返回 data，否则 reject
      if (response.code === 0) {
        resolve(response.data)
      } else {
        wx.showToast({ title: response.message || '请求失败', icon: 'none' })
        reject(response)
      }
    }, 200)
  })
}

module.exports = { handleMock }
