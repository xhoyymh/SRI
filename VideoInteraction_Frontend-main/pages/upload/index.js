const taskManager = require('../../utils/task-manager')
const authStore = require('../../utils/auth-store')

const MAX_VIDEO_FILES = 100

Page({
  data: {
    dramaTitle: '',
    videoDescription: '',
    coverFile: null,
    files: [],
    submitting: false,
    uploadState: { jobs: [] }
  },

  taskUnsubscribe: null,

  onLoad() {
    if (!this.ensureLogin()) return
    this.attachTaskManager()
  },

  onShow() {
    if (!this.ensureLogin()) return
    this.attachTaskManager()
    taskManager.refreshActiveRag()
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
      this.setData({
        uploadState: state.upload
      })
    }, { includeTaskBars: false })
  },

  ensureLogin() {
    return authStore.requirePageLogin('登录后可以上传短剧')
  },

  onDramaTitleInput(e) { this.setData({ dramaTitle: e.detail.value }) },
  onVideoDescriptionInput(e) { this.setData({ videoDescription: e.detail.value }) },

  chooseCoverImage() {
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => this.setCoverFile((res.tempFiles || [])[0]),
        fail: (err) => {
          if (err && String(err.errMsg || '').includes('cancel')) return
          this.chooseCoverImageLegacy()
        }
      })
      return
    }
    this.chooseCoverImageLegacy()
  },

  chooseCoverImageLegacy() {
    if (!wx.chooseImage) {
      wx.showToast({ title: '当前环境不支持选择图片', icon: 'none' })
      return
    }
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed', 'original'],
      sourceType: ['album', 'camera'],
      success: (res) => this.setCoverFile((res.tempFiles || [])[0] || { path: (res.tempFilePaths || [])[0] }),
      fail: (err) => {
        if (err && String(err.errMsg || '').includes('cancel')) return
        wx.showToast({ title: '选择封面失败', icon: 'none' })
      }
    })
  },

  setCoverFile(file) {
    const path = file && (file.path || file.tempFilePath)
    if (!path) {
      wx.showToast({ title: '没有可用的封面图片', icon: 'none' })
      return
    }
    const ext = extensionOf(file.name || file.originalFileName || file.fileName || path) || '.jpg'
    this.setData({
      coverFile: {
        id: `cover_${Date.now()}`,
        name: cleanFileName(file.name || file.originalFileName || file.fileName) || `cover${ext}`,
        path,
        size: file.size || 0,
        sizeText: formatFileSize(file.size || 0),
        type: normalizeImageContentType(file.type || file.fileType || path)
      }
    })
  },

  removeCover() {
    this.setData({ coverFile: null })
  },

  chooseAlbumVideos() {
    const remain = MAX_VIDEO_FILES - this.data.files.length
    if (remain <= 0) {
      wx.showToast({ title: `最多选择 ${MAX_VIDEO_FILES} 个视频`, icon: 'none' })
      return
    }
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: Math.min(20, remain),
        mediaType: ['video'],
        sourceType: ['album', 'camera'],
        success: (res) => this.appendFiles(res.tempFiles || [], { preserveName: false }),
        fail: () => this.chooseSingleVideo()
      })
      return
    }
    this.chooseSingleVideo()
  },

  chooseSingleVideo() {
    if (!wx.chooseVideo) {
      wx.showToast({ title: '当前环境不支持选择视频', icon: 'none' })
      return
    }
    wx.chooseVideo({
      sourceType: ['album', 'camera'],
      success: (res) => this.appendFiles([res], { preserveName: false }),
      fail: (err) => {
        if (err && String(err.errMsg || '').includes('cancel')) return
        wx.showToast({ title: '选择视频失败', icon: 'none' })
      }
    })
  },

  appendFiles(selected, options = {}) {
    const start = this.data.files.length
    const files = (selected || []).map((file, index) => {
      const path = file.path || file.tempFilePath || ''
      const realName = cleanFileName(file.name || file.originalFileName || file.fileName)
      const fallbackNo = start + index + 1
      const inferredNo = realName ? inferEpisodeNo(realName, fallbackNo) : fallbackNo
      const episodeNo = inferredNo > 0 ? inferredNo : fallbackNo
      const name = options.preserveName && realName ? realName : displayNameForEpisode(episodeNo, realName)
      return {
        id: `${Date.now()}_${start}_${index}`,
        name,
        originalName: realName || '',
        path,
        size: file.size || 0,
        sizeText: formatFileSize(file.size || 0),
        type: normalizeContentType(file.type || file.fileType || name),
        episodeNo,
        statusText: '待上传',
        progress: 0,
        assetId: null
      }
    }).filter((file) => file.path)
    if (files.length === 0) {
      wx.showToast({ title: '没有可用的视频文件', icon: 'none' })
      return
    }
    this.setData({ files: dedupeFilesKeepLatest(this.data.files.concat(files)) })
  },

  onEpisodeNoInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const value = Number(e.detail.value || 0)
    if (index < 0 || !value) return
    const current = this.data.files[index] || {}
    const nextName = shouldRegenerateName(current) ? displayNameForEpisode(value, current.originalName) : current.name
    this.setData({
      [`files[${index}].episodeNo`]: value,
      [`files[${index}].name`]: nextName
    })
  },

  removeFile(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (index < 0) return
    this.setData({ files: this.data.files.filter((_, i) => i !== index) })
  },

  async submitUpload() {
    if (!this.validate()) return
    this.setData({ submitting: true })
    try {
      await taskManager.startUpload({
        dramaTitle: this.data.dramaTitle.trim(),
        videoDescription: this.data.videoDescription.trim(),
        coverFile: this.data.coverFile,
        files: this.data.files
      })
      wx.showToast({ title: '已开始上传', icon: 'success' })
      this.setData({ coverFile: null, files: [] })
    } catch (err) {
      const message = uploadErrorText(err)
      wx.showToast({ title: message.slice(0, 80), icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  onGoHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  onGoRag() {
    wx.navigateTo({ url: '/pages/rag/index' })
  },

  validate() {
    if (!this.data.dramaTitle.trim()) {
      wx.showToast({ title: '请输入短剧名称', icon: 'none' })
      return false
    }
    if (!this.data.videoDescription.trim()) {
      wx.showToast({ title: '请输入视频简介', icon: 'none' })
      return false
    }
    if (this.data.files.length === 0) {
      wx.showToast({ title: '请选择视频', icon: 'none' })
      return false
    }
    return true
  }
})

function dedupeFilesKeepLatest(files) {
  const map = {}
  const order = []
  ;(files || []).forEach((file) => {
    const key = file.episodeNo ? `episode:${file.episodeNo}` : normalizeFileName(file.name)
    if (!key) return
    if (map[key]) {
      const index = order.indexOf(key)
      if (index >= 0) order.splice(index, 1)
    }
    map[key] = file
    order.push(key)
  })
  return order.map((key, index) => Object.assign({}, map[key], { episodeNo: map[key].episodeNo || index + 1 }))
}

function cleanFileName(name) {
  const text = String(name || '').trim()
  if (!text || !text.includes('.')) return ''
  return text.replace(/[\\/]/g, '_')
}

function displayNameForEpisode(episodeNo, realName) {
  const ext = extensionOf(realName) || '.mp4'
  return `第${episodeNo || 1}集${ext}`
}

function shouldRegenerateName(file) {
  return !file.originalName || /^第\d+集\.[A-Za-z0-9]+$/.test(file.name || '')
}

function extensionOf(name) {
  const text = String(name || '')
  const dot = text.lastIndexOf('.')
  if (dot < 0) return ''
  const ext = text.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, '')
  return ext && ext !== '.' ? ext : ''
}

function normalizeContentType(typeOrName) {
  const text = String(typeOrName || '').toLowerCase()
  if (text.startsWith('video/')) return text
  if (text.endsWith('.mov')) return 'video/quicktime'
  if (text.endsWith('.m4v')) return 'video/x-m4v'
  return 'video/mp4'
}

function normalizeImageContentType(typeOrName) {
  const text = String(typeOrName || '').toLowerCase()
  if (text.startsWith('image/')) return text
  if (text.endsWith('.png')) return 'image/png'
  if (text.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function formatFileSize(size) {
  const bytes = Number(size) || 0
  if (bytes <= 0) return '未知大小'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

function normalizeFileName(name) {
  return String(name || '').trim().toLowerCase()
}

function uploadErrorText(err) {
  const msg = (err && (err.message || err.errMsg || err.data || err.error)) || (err && err.message !== undefined ? String(err.message) : '')
  if (msg) return String(msg).replace(/\s+/g, ' ').slice(0, 180)
  return '上传失败'
}

function inferEpisodeNo(name, fallback) {
  const text = name || ''
  const patterns = [
    /第\s*(\d{1,4})\s*集/,
    /ep(?:isode)?[_\-\s]*(\d{1,4})/i,
    /episode[_\-\s]*(\d{1,4})/i,
    /(^|[^\d])(\d{1,4})([^\d]|$)/
  ]
  for (let i = 0; i < patterns.length; i++) {
    const m = text.match(patterns[i])
    if (m) {
      const raw = m[2] || m[1]
      const n = Number(raw)
      if (n > 0) return n
    }
  }
  return fallback
}
