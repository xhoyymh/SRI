// pages/play/index.js - 播放页（P2 播放 + P3 高光浮层/调度）
const episodeApi = require('../../api/episode')
const dramaApi = require('../../api/drama')
const aiApi = require('../../api/ai')
const interactionApi = require('../../api/interaction')
const danmakuApi = require('../../api/danmaku')
const {
  FORCE_NATIVE_VIDEO_CONTROLS_ON_ANDROID,
  USE_EXTERNAL_VIDEO_OVERLAY_ON_ANDROID,
  ENABLE_PLAYBACK_DIAGNOSTICS
} = require('../../utils/config')
const { getBigImage, getEmotionIcon } = require('../../utils/icon-assets')
const taskManager = require('../../utils/task-manager')
const authStore = require('../../utils/auth-store')
const userStore = require('../../utils/user-store')
const highlightStats = require('../../utils/highlight-stats')
const danmakuData = require('../../utils/danmaku-data')
const storyVideoCache = require('../../utils/story-video-cache')
const { isActionInteractionLocked } = require('../../utils/action-lock')
const {
  createActionSpeedBoostState,
  normalizeActionSpeedBoostConfig,
  shouldShowActionSpeedBoost
} = require('../../utils/action-speed-boost')

const SEEK_PREVIEW_HIDE_MS = 1500
const ACTION_PROMPT_DEFAULT_SHOW_AT = 1.5
const PROGRESS_UI_UPDATE_MS = 250
const HIGHLIGHT_CHECK_INTERVAL_MS = 180
const DIAGNOSTIC_LOG_INTERVAL_MS = 3000
const DANMAKU_QUEUE_DELAY_MS = 650
const DANMAKU_LANE_COUNT = 4
const DANMAKU_BAND_TOP = 220
const DANMAKU_LANE_GAP = 54
const DANMAKU_LANE_COOLDOWN_MS = 2400
const STORY_PREFETCH_BEFORE_SECONDS = 5
const STORY_PREFETCH_AFTER_SECONDS = 1
const SPEED_LOCK_THRESHOLD = 70
const SPEED_HOLD_DELAY_MS = 220
const EPISODE_RANGE_SIZE = 30

function getScreenWidth() {
  if (wx.getWindowInfo) {
    return wx.getWindowInfo().screenWidth || 375
  }
  if (wx.getDeviceInfo) {
    return wx.getDeviceInfo().screenWidth || 375
  }
  return 375
}

function isAndroidRuntime() {
  try {
    const device = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()
    const text = [
      device.platform,
      device.system,
      device.model,
      device.brand
    ].filter(Boolean).join(' ').toLowerCase()
    return text.indexOf('android') >= 0
  } catch (e) {
    return false
  }
}

function shouldUseExternalVideoOverlay() {
  return !!(USE_EXTERNAL_VIDEO_OVERLAY_ON_ANDROID && isAndroidRuntime() && !shouldUseNativeVideoControls())
}

function shouldUseNativeVideoControls() {
  return !!(FORCE_NATIVE_VIDEO_CONTROLS_ON_ANDROID && isAndroidRuntime())
}

function formatVideoError(detail) {
  const info = detail || {}
  const code = info.errCode != null ? `code=${info.errCode}` : ''
  const msg = info.errMsg || info.errMessage || 'unknown'
  return [code, msg].filter(Boolean).join(' ')
}

function normalizePlayableVideoUrl(url) {
  return String(url || '').trim()
}

function stripUrlQuery(url) {
  return String(url || '').split('?')[0]
}

function isCosProxyUrl(url) {
  return /\/media\/cos\b/i.test(String(url || ''))
}

function playbackUrlMode(url) {
  if (!url) return 'empty'
  if (isCosProxyUrl(url)) return 'backend-proxy'
  if (/\.cos\.[^/]+\.myqcloud\.com/i.test(url)) return 'cos-direct'
  return 'other'
}

function danmakuLikeCount(item) {
  return Array.isArray(item) ? Number(item[1]) || 0 : 0
}

function normalizeDanmakuTitle(title) {
  return String(title || '').replace(/[\s·.。:：,，、\-—_]/g, '').toLowerCase()
}

const DANMAKU_TITLE_SKIP_CODES = [9, 10, 13, 32, 34, 39, 40, 41, 44, 45, 46, 47, 58, 59, 60, 62, 91, 92, 93, 95, 123, 124, 125, 183, 8211, 8212, 12289, 12290, 65306, 65292]

function normalizeDanmakuTitleSafe(title) {
  return String(title || '')
    .toLowerCase()
    .split('')
    .filter((char) => DANMAKU_TITLE_SKIP_CODES.indexOf(char.charCodeAt(0)) < 0)
    .join('')
}

function getDanmakuEpisode(title, episodeNo) {
  const exact = danmakuData[title]
  if (exact) return exact[String(episodeNo)] || []
  const target = normalizeDanmakuTitleSafe(title)
  const key = Object.keys(danmakuData).find((item) => {
    const value = normalizeDanmakuTitleSafe(item)
    return value && target && (value === target || value.indexOf(target) >= 0 || target.indexOf(value) >= 0)
  })
  return key ? (danmakuData[key][String(episodeNo)] || []) : []
}

function createActionPromptState() {
  return {
    show: false,
    offered: false,
    clicked: false,
    label: '',
    optionCode: ''
  }
}

function nonNegativeNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function normalizeActionPromptConfig(config, action) {
  if (!config) return null
  const cfg = typeof config === 'object' ? config : {}
  return {
    showAt: nonNegativeNumber(cfg.showAt, ACTION_PROMPT_DEFAULT_SHOW_AT),
    label: cfg.label || action.label || action.actionLabel || '点击给他打火',
    optionCode: cfg.optionCode || action.optionCode || ''
  }
}

function shouldAutoStartAction(cfg) {
  const mode = String((cfg && cfg.startMode) || '').toUpperCase()
  return !!(cfg && (cfg.autoStart === true || mode === 'AUTO'))
}

function sortEpisodes(episodes) {
  return (episodes || []).slice().sort((a, b) => (Number(a.episodeNo) || 0) - (Number(b.episodeNo) || 0))
}

function buildEpisodeRanges(episodes) {
  const sorted = sortEpisodes(episodes)
  const ranges = []
  for (let i = 0; i < sorted.length; i += EPISODE_RANGE_SIZE) {
    const group = sorted.slice(i, i + EPISODE_RANGE_SIZE)
    const startNo = Number(group[0] && group[0].episodeNo) || i + 1
    const endNo = Number(group[group.length - 1] && group[group.length - 1].episodeNo) || (i + group.length)
    ranges.push({
      index: ranges.length,
      label: `${startNo}-${endNo}`,
      episodes: group
    })
  }
  return ranges
}

function findEpisodeRangeIndex(ranges, episodeNo) {
  const no = Number(episodeNo) || 0
  if (!no) return 0
  const index = (ranges || []).findIndex((range) => {
    return (range.episodes || []).some((item) => Number(item.episodeNo) === no)
  })
  return index >= 0 ? index : 0
}

Page({
  data: {
    episodeId: null,
    dramaId: null,
    dramaMeta: null,
    currentEpisodeNo: null,
    videoUrl: '',
    title: '',
    loading: false,
    useExternalVideoOverlay: false,
    useNativeVideoControls: false,
    videoAutoplay: true,
    videoInitialTime: 0,
    objectFit: 'contain', // 竖屏 cover 占满，横屏 contain 居中
    highlights: [],
    overlay: {
      show: false,
      highlightId: null,
      title: '',
      buttons: [],
      sessionKey: ''
    },
    floats: [], // 飘屏元素（点击爆发的表情）
    danmakuTexts: [], // CSV 弹幕和高光统计弹幕
    bigImage: { show: false, src: '', beat: false }, // 右下角大图（一动一动）
    playing: false, // 播放状态（自绘控制用）
    progressPercent: 0, // 进度条百分比
    speeding: false, // 是否二倍速中
    speedLocked: false,
    speedLockText: '',
    playbackRate: 1,
    speedOptions: [0.5, 0.75, 1, 1.25, 1.5, 2],
    speedMenu: false,
    seeking: false, // 是否正在拖动进度
    seekText: '', // 拖动时显示 当前/总时长
    episodes: [], // 选集列表
    episodeRanges: [],
    activeEpisodeRangeIndex: 0,
    visibleEpisodes: [],
    episodePanel: false, // 选集面板开关
    branch: { show: false, title: '', options: [] }, // 分支选择弹窗
    blackout: { show: false, text: '', visible: false }, // 错误分支黑屏（visible 控制文字渐显）
    action: { show: false, title: '', label: '', optionCode: '', generationMode: '', generationId: null, resumeTime: null }, // 动作互动按钮
    actionVideoActive: false, // 动作插入视频播放期间隐藏普通倍速入口
    actionPrompt: createActionPromptState(), // 动作插入视频内必须点击的动作按钮
    dramaSocial: { liked: false, favorited: false, likeCount: 0, favoriteCount: 0, commentCount: 0 },
    story: { show: false, generationId: null, contentType: '', title: '', content: '', contentUrl: '', images: [], imageIndex: 0, currentImage: '', liked: false, likeCount: 0, commentCount: 0 }, // 生成内容
    dramaCommentPanel: { show: false, list: [], input: '' },
    commentPanel: { show: false, list: [], total: 0, input: '' }, // 评论面板
    actionLockActive: false, // 动作互动强锁：等待点击/播放动作视频/回跳期间禁用其他操作
    actionSpeedBoost: createActionSpeedBoostState(), // 动作视频内的可选加速提示
    taskBars: []
  },

  // 非渲染状态（不放 data，避免无谓 setData）
  videoCtx: null,
  videoCtxList: [],
  videoId: 'dramavideo',
  playbackClockTimer: null,
  videoReloadTimer: null,
  lastClockAt: 0,
  lastTimeUpdateAt: 0,
  forceReloadedPaused: false,
  triggeredMap: {}, // 已触发过的高光（triggerOnce 用）
  shownMap: {}, // 当前正显示的高光
  optionMeta: {}, // optionCode -> { icon, label }，飘屏取图标用
  lastStats: {}, // 上次轮询计数：`${highlightId}:${optionCode}` -> count
  pollTimer: null, // 计数轮询定时器
  bigImgTimer: null, // 大图隐藏定时器
  bigBeatTimer: null, // 大图跳动定时器
  imageSeqTimer: null, // IMAGE_SEQ 自动轮播定时器
  highlightStatDanmakuTimer: null,
  pendingHighlightStatDanmaku: null,
  actionSpeedBoostTimer: null, // 动作视频加速按钮自动消失定时器
  seekHideTimer: null, // 点击进度条后的时长提示隐藏定时器
  screenW: 0, // 屏幕宽度(px)，进度条拖动定位用
  duration: 0, // 视频时长(秒)
  curTime: 0, // 当前播放时间(秒)
  suppressTapUntil: 0, // 长按倍速结束后短暂屏蔽 tap，避免误切播放状态
  autoPlayOnLoaded: false, // 进入播放页/切集后，元数据就绪时自动播放
  wasPlayingBeforeSpeed: false, // 暂停态长按 2x 时，松手恢复暂停
  speedTouchStartY: 0,
  speedGestureActive: false,
  speedPressTimer: null,
  touchStartX: 0,
  touchStartY: 0,
  manualPaused: false,
  danmakuLaneAvailableAt: [],
  originalUrl: '', // 原集视频地址（分支切播后用于还原）
  resumeAt: 0, // 分支结束后回到原片的时间点 = a + b
  inBranchVideo: false, // 是否正在播放分支插入视频
  pendingSeek: null, // 切换视频源后待执行的 seek(秒)
  // ===== 对错分支 =====
  currentBranch: null, // 当前分支高光对象，错误后重选用
  branchStartTime: 0, // 分支点起始秒数，错误重选时回跳到此
  disabledOptions: {}, // { [highlightId]: { optionCode: true } } 已选错的置灰项
  selectedOptionCode: '', // 本次选中的分支项编码
  selectedIsCorrect: true, // 本次选中是否正确主线
  selectedFailText: '', // 本次选中（错误时）的黑屏文案
  pendingReopenBranch: false, // 切回主线 seek 后是否重新弹分支（错误重选用）
  inMandatoryActionVideo: false, // 是否处于强制动作互动视频流程
  mandatoryActionPauseReason: '', // 动作视频内等待点击时允许真正暂停
  taskUnsubscribe: null,
  danmakuSecondMap: {},
  statDanmakuMap: {},
  activeHighlightSessionKey: '',
  highlightSessionSeq: 0,
  remoteDanmakuBySecond: {},
  initialStartAt: 0,
  lastProgressSavedAt: 0,
  pendingSeekTime: null,
  lastProgressUiAt: 0,
  lastProgressPercent: 0,
  lastHighlightCheckAt: 0,
  currentLocalDanmakuBySecond: {},
  playbackMetrics: null,
  storyCache: {},
  storyPrefetchPromises: {},

  onLoad(options) {
    this.attachTaskManager()
    const episodeId = Number(options.episodeId)
    const dramaId = Number(options.dramaId)
    this.initialStartAt = Math.max(0, Number(options.startAt) || 0)
    this.lastProgressSavedAt = 0
    this.triggeredMap = {}
    this.shownMap = {}
    this.optionMeta = {}
    this.lastStats = {}
    this.disabledOptions = {}
    this.danmakuSecondMap = {}
    this.statDanmakuMap = {}
    this.storyCache = {}
    this.storyPrefetchPromises = {}
    this.clearHighlightStatDanmakuTimer()
    this.pendingHighlightStatDanmaku = null
    this.activeHighlightSessionKey = ''
    this.danmakuLaneAvailableAt = []
    this.remoteDanmakuBySecond = {}
    this.currentLocalDanmakuBySecond = {}
    this.pendingSeekTime = null
    this.lastProgressUiAt = 0
    this.lastProgressPercent = 0
    this.lastHighlightCheckAt = 0
    this.speedGestureActive = false
    this.storyCache = {}
    this.storyPrefetchPromises = {}
    this.clearSpeedPressTimer()
    this.suppressTapUntil = 0
    this.manualPaused = false
    this.currentBranch = null
    this.inBranchVideo = false
    this.inMandatoryActionVideo = false
    this.mandatoryActionPauseReason = ''
    this.clearActionSpeedBoostTimer()
    this.autoPlayOnLoaded = true
    try {
      this.screenW = getScreenWidth()
    } catch (e) {
      this.screenW = 375
    }
    const useNativeVideoControls = shouldUseNativeVideoControls()
    const useExternalVideoOverlay = useNativeVideoControls ? false : shouldUseExternalVideoOverlay()
    this.setData({
      episodeId,
      dramaId,
      dramaMeta: null,
      currentEpisodeNo: null,
      useExternalVideoOverlay,
      useNativeVideoControls,
      actionLockActive: false,
      actionVideoActive: false,
      actionPrompt: createActionPromptState(),
      videoAutoplay: true,
      videoInitialTime: this.initialStartAt || 0,
      dramaSocial: { liked: false, favorited: false, likeCount: 0, favoriteCount: 0, commentCount: 0 },
      dramaCommentPanel: { show: false, list: [], input: '' },
      actionSpeedBoost: createActionSpeedBoostState()
    })
    this.bindVideoContext('dramavideo')
    this.loadEpisode(episodeId)
    this.loadHighlights(episodeId)
    this.loadEpisodes(dramaId)
    taskManager.refreshActiveRag()
  },

  onUnload() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.bigImgTimer) clearTimeout(this.bigImgTimer)
    if (this.bigBeatTimer) clearInterval(this.bigBeatTimer)
    if (this.imageSeqTimer) clearInterval(this.imageSeqTimer)
    this.stopPlaybackClock()
    this.clearVideoReloadTimer()
    this.clearHighlightStatDanmakuTimer()
    this.clearActionSpeedBoostTimer()
    this.clearSeekHideTimer()
    this.pollTimer = null
    this.bigImgTimer = null
    this.bigBeatTimer = null
    this.imageSeqTimer = null
    this.pendingHighlightStatDanmaku = null
    this.storyCache = {}
    this.storyPrefetchPromises = {}
    this.triggeredMap = {}
    this.shownMap = {}
    this.danmakuSecondMap = {}
    this.statDanmakuMap = {}
    this.clearHighlightStatDanmakuTimer()
    this.pendingHighlightStatDanmaku = null
    this.activeHighlightSessionKey = ''
    this.danmakuLaneAvailableAt = []
    this.currentLocalDanmakuBySecond = {}
    this.pendingSeekTime = null
    this.playbackMetrics = null
    this.speedGestureActive = false
    this.inMandatoryActionVideo = false
    this.mandatoryActionPauseReason = ''
    if (this.taskUnsubscribe) {
      this.taskUnsubscribe()
      this.taskUnsubscribe = null
    }
  },

  attachTaskManager() {
    if (this.taskUnsubscribe) return
    this.taskUnsubscribe = taskManager.subscribe((state) => {
      this.setData({ taskBars: state.taskBars })
    })
  },

  onTapTaskBar(e) {
    if (this.isActionLocked()) return
    taskManager.navigate(e.currentTarget.dataset.type)
  },

  isActionLocked() {
    return this.data.actionLockActive || isActionInteractionLocked(this.data.action, this.inMandatoryActionVideo)
  },

  clearActionSpeedBoostTimer() {
    if (this.actionSpeedBoostTimer) {
      clearTimeout(this.actionSpeedBoostTimer)
      this.actionSpeedBoostTimer = null
    }
  },

  onBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      wx.switchTab({ url: '/pages/home/index' })
    }
  },

  clearSeekHideTimer() {
    if (this.seekHideTimer) {
      clearTimeout(this.seekHideTimer)
      this.seekHideTimer = null
    }
  },

  clearSpeedPressTimer() {
    if (this.speedPressTimer) {
      clearTimeout(this.speedPressTimer)
      this.speedPressTimer = null
    }
  },

  scheduleSeekHide() {
    this.clearSeekHideTimer()
    this.seekHideTimer = setTimeout(() => {
      this.seekHideTimer = null
      this.setData({ seeking: false, seekText: '' })
    }, SEEK_PREVIEW_HIDE_MS)
  },

  resetPlaybackMetrics(url) {
    const now = Date.now()
    this.playbackMetrics = {
      urlMode: playbackUrlMode(url),
      urlPath: stripUrlQuery(url),
      loadStartedAt: now,
      metadataAt: 0,
      firstFrameAt: 0,
      waitingCount: 0,
      waitingStartedAt: 0,
      waitingTotalMs: 0,
      seekStartedAt: 0,
      seekTarget: null,
      lastProgressLogAt: 0
    }
    this.logPlaybackDiagnostic('source', {
      urlMode: this.playbackMetrics.urlMode,
      viaBackendProxy: isCosProxyUrl(url),
      urlPath: this.playbackMetrics.urlPath
    })
  },

  logPlaybackDiagnostic(event, extra = {}) {
    if (!ENABLE_PLAYBACK_DIAGNOSTICS) return
    const metrics = this.playbackMetrics || {}
    console.info('playback diagnostic', Object.assign({
      event,
      episodeId: this.data.episodeId,
      urlMode: metrics.urlMode || playbackUrlMode(this.data.videoUrl),
      viaBackendProxy: isCosProxyUrl(this.data.videoUrl),
      currentTime: Math.round((this.curTime || 0) * 10) / 10
    }, extra))
  },

  markFirstFrame(source) {
    const metrics = this.playbackMetrics
    if (!metrics || metrics.firstFrameAt) return
    metrics.firstFrameAt = Date.now()
    this.logPlaybackDiagnostic('firstFrame', {
      source,
      firstFrameMs: metrics.loadStartedAt ? metrics.firstFrameAt - metrics.loadStartedAt : 0
    })
  },

  bindVideoContext(videoId) {
    this.videoId = videoId
    const contexts = []
    try {
      const scoped = wx.createVideoContext(videoId, this)
      if (scoped) contexts.push(scoped)
    } catch (e) {}
    try {
      const plain = wx.createVideoContext(videoId)
      if (plain) contexts.push(plain)
    } catch (e) {}
    this.videoCtxList = contexts
    this.videoCtx = contexts[0] || null
    this.refreshVideoContext()
  },

  refreshVideoContext() {
    const videoId = this.videoId || 'dramavideo'
    const query = () => {
      if (!wx.createSelectorQuery) return
      try {
        wx.createSelectorQuery()
          .select(`#${videoId}`)
          .context((res) => {
            if (!res || !res.context) return
            const list = this.videoCtxList || []
            if (list.indexOf(res.context) < 0) list.unshift(res.context)
            this.videoCtxList = list
            this.videoCtx = res.context
          })
          .exec()
      } catch (e) {}
    }
    if (wx.nextTick) wx.nextTick(query)
    setTimeout(query, 120)
  },

  callVideo(method, arg) {
    this.refreshVideoContext()
    const seen = []
    const fresh = []
    try {
      const scoped = wx.createVideoContext(this.videoId || 'dramavideo', this)
      if (scoped) fresh.push(scoped)
    } catch (e) {}
    try {
      const plain = wx.createVideoContext(this.videoId || 'dramavideo')
      if (plain) fresh.push(plain)
    } catch (e) {}
    const list = fresh.concat([this.videoCtx]).concat(this.videoCtxList || [])
    let called = false
    list.forEach((ctx) => {
      if (!ctx || seen.indexOf(ctx) >= 0 || typeof ctx[method] !== 'function') return
      seen.push(ctx)
      try {
        if (arg === undefined) ctx[method]()
        else ctx[method](arg)
        called = true
      } catch (e) {}
    })
    return called
  },

  shouldUseVideoReloadFallback() {
    return false
  },

  clearVideoReloadTimer() {
    if (this.videoReloadTimer) clearTimeout(this.videoReloadTimer)
    this.videoReloadTimer = null
  },

  reloadVideoAt(target, shouldPlay) {
    if (!this.shouldUseVideoReloadFallback() || !this.data.videoUrl) return false
    const videoUrl = this.data.videoUrl
    const safeTime = Math.max(0, Number(target) || 0)
    const duration = this.duration || 0
    const percent = duration > 0 ? Math.min(100, (safeTime / duration) * 100) : this.data.progressPercent
    this.clearVideoReloadTimer()
    this.curTime = safeTime
    this.setData({
      videoUrl: '',
      videoAutoplay: !!shouldPlay,
      videoInitialTime: safeTime,
      playing: !!shouldPlay,
      progressPercent: percent
    }, () => {
      this.videoReloadTimer = setTimeout(() => {
        this.videoReloadTimer = null
        this.setData({
          videoUrl,
          videoAutoplay: !!shouldPlay,
          videoInitialTime: safeTime
        }, () => {
          this.refreshVideoContext()
          setTimeout(() => {
            if (safeTime > 0) this.callVideo('seek', safeTime)
            if (shouldPlay) {
              this.callVideo('play')
              this.startPlaybackClock()
            } else {
              this.callVideo('pause')
              this.stopPlaybackClock()
            }
          }, 180)
        })
      }, 60)
    })
    return true
  },

  playVideo() {
    this.setData({ videoAutoplay: true })
    if (this.forceReloadedPaused && this.shouldUseVideoReloadFallback()) {
      this.forceReloadedPaused = false
      this.reloadVideoAt(this.curTime || 0, true)
      return
    }
    this.callVideo('play')
    setTimeout(() => this.callVideo('play'), 80)
    this.startPlaybackClock()
  },

  pauseVideo() {
    this.setData({ videoAutoplay: false })
    this.callVideo('pause')
    setTimeout(() => this.callVideo('pause'), 80)
    setTimeout(() => this.callVideo('pause'), 240)
    if (this.shouldUseVideoReloadFallback()) {
      this.forceReloadedPaused = true
      this.clearVideoReloadTimer()
      this.videoReloadTimer = setTimeout(() => {
        this.videoReloadTimer = null
        if (!this.data.playing || this.manualPaused || this.shouldBlockPlaybackByOverlay()) {
          this.reloadVideoAt(this.curTime || 0, false)
        }
      }, 320)
    }
    this.stopPlaybackClock()
  },

  seekVideo(target, shouldPlayOverride) {
    this.curTime = Number(target) || 0
    this.setData({ videoInitialTime: this.curTime })
    this.callVideo('seek', this.curTime)
    setTimeout(() => this.callVideo('seek', this.curTime), 120)
    if (this.shouldUseVideoReloadFallback()) {
      const shouldPlay = shouldPlayOverride != null
        ? !!shouldPlayOverride
        : (!this.manualPaused && !this.shouldBlockPlaybackByOverlay() && (!!this.data.playing || !!this.data.videoAutoplay))
      this.reloadVideoAt(this.curTime, shouldPlay)
    }
  },

  setVideoPlaybackRate(rate) {
    this.callVideo('playbackRate', rate)
  },

  startPlaybackClock() {
    if (this.playbackClockTimer) return
    this.lastClockAt = Date.now()
    this.playbackClockTimer = setInterval(() => this.tickPlaybackClock(), 250)
  },

  stopPlaybackClock() {
    if (this.playbackClockTimer) clearInterval(this.playbackClockTimer)
    this.playbackClockTimer = null
    this.lastClockAt = 0
  },

  tickPlaybackClock() {
    const now = Date.now()
    const last = this.lastClockAt || now
    this.lastClockAt = now
    if (!this.data.playing || this.data.seeking) return
    if (now - (this.lastTimeUpdateAt || 0) < 700) return
    const rate = this.data.speeding || this.data.speedLocked ? 2 : (Number(this.data.playbackRate) || 1)
    const next = (this.curTime || 0) + Math.max(0, (now - last) / 1000) * rate
    this.applyPlaybackTime(this.duration ? Math.min(this.duration, next) : next, this.duration || 0)
  },

  resetActionPlaybackState() {
    this.clearActionSpeedBoostTimer()
    this.mandatoryActionPauseReason = ''
    this.setVideoPlaybackRate(1)
    this.setData({
      playbackRate: 1,
      speedMenu: false,
      speeding: false,
      speedLocked: false,
      speedLockText: '',
      actionVideoActive: false,
      actionPrompt: createActionPromptState(),
      actionSpeedBoost: createActionSpeedBoostState()
    })
  },

  // 取剧集 → 视频地址、标题
  async loadEpisode(episodeId) {
    this.setData({ loading: true })
    try {
      const episode = await episodeApi.getEpisode(episodeId)
      const videoUrl = normalizePlayableVideoUrl(episode.videoUrl)
      this.originalUrl = videoUrl
      this.inBranchVideo = false
      this.autoPlayOnLoaded = true
      this.duration = Number(episode.duration) || 0
      const currentEpisodeNo = Number(episode.episodeNo) || episodeNoFromTitle(episode.title)
      const dramaId = episode.dramaId || this.data.dramaId
      this.resetPlaybackMetrics(videoUrl)
      this.prepareEpisodeDanmakuCache((this.data.dramaMeta && this.data.dramaMeta.title) || episode.dramaTitle || episode.title, currentEpisodeNo)
      this.forceReloadedPaused = false
      this.setData({
        videoUrl,
        title: episode.title,
        currentEpisodeNo,
        loading: false,
        videoAutoplay: true,
        videoInitialTime: this.initialStartAt || 0
      }, () => {
        this.refreshVideoContext()
        this.syncEpisodeRangeForCurrent()
        setTimeout(() => this.playIfAllowed(), 80)
      })
      this.loadRemoteDanmaku(episodeId)
      userStore.getDramaSocial(dramaId)
        .then((dramaSocial) => this.setData({ dramaSocial }))
        .catch((err) => console.warn('加载短剧社交数据失败', err))
    } catch (e) {
      console.error('加载剧集失败', e)
      this.setData({ loading: false })
    }
  },

  prepareEpisodeDanmakuCache(title, episodeNo) {
    const no = Number(episodeNo) || 0
    if (!title || !no) {
      this.currentLocalDanmakuBySecond = {}
      return
    }
    const bySecond = getDanmakuEpisode(title, no) || {}
    this.currentLocalDanmakuBySecond = bySecond
    this.danmakuSecondMap = {}
  },

  syncEpisodeRangeForCurrent() {
    const episodes = this.data.episodes || []
    if (!episodes.length) return
    const episodeRanges = this.data.episodeRanges && this.data.episodeRanges.length ? this.data.episodeRanges : buildEpisodeRanges(episodes)
    const activeEpisodeRangeIndex = findEpisodeRangeIndex(episodeRanges, this.data.currentEpisodeNo)
    const activeRange = episodeRanges[activeEpisodeRangeIndex] || { episodes }
    this.setData({
      episodeRanges,
      activeEpisodeRangeIndex,
      visibleEpisodes: activeRange.episodes || []
    })
  },

  // 取高光列表（本地缓存到 data），并建立 optionCode→图标/文案映射（飘屏用）
  async loadHighlights(episodeId) {
    try {
      const highlights = await episodeApi.getHighlights(episodeId)
      const meta = {}
      ;(highlights || []).forEach((h) => {
        const btns = (h.interactionConfig && h.interactionConfig.buttons) || []
        btns.forEach((b) => {
          meta[b.optionCode] = { icon: getEmotionIcon(b.optionCode, b.icon), label: b.label }
        })
      })
      this.optionMeta = meta
      this.setData({ highlights: highlights || [] })
      this.prefetchUpcomingStories(this.curTime || this.initialStartAt || 0)
      console.log('play highlights loaded', { episodeId, count: (highlights || []).length })
    } catch (e) {
      console.error('加载高光失败', e)
      this.optionMeta = {}
      this.setData({ highlights: [] })
    }
  },

  // 取同剧集集列表（选集用）
  async loadEpisodes(dramaId) {
    try {
      const detail = await dramaApi.getDramaDetail(dramaId)
      const episodes = sortEpisodes(detail.episodes || [])
      const episodeRanges = buildEpisodeRanges(episodes)
      const activeEpisodeRangeIndex = findEpisodeRangeIndex(episodeRanges, this.data.currentEpisodeNo)
      const activeRange = episodeRanges[activeEpisodeRangeIndex] || { episodes }
      const dramaSocial = await userStore.getDramaSocial(detail.dramaId || dramaId)
      this.setData({
        episodes,
        episodeRanges,
        activeEpisodeRangeIndex,
        visibleEpisodes: activeRange.episodes || [],
        dramaMeta: {
          dramaId: detail.dramaId || dramaId,
          title: detail.title || '',
          description: detail.description || '',
          coverUrl: detail.coverUrl || '',
          tags: userStore.normalizeTags(detail.tags),
          episodeCount: episodes.length
        },
        dramaSocial
      })
      this.prepareEpisodeDanmakuCache(detail.title || this.data.title, this.data.currentEpisodeNo)
      return episodes
    } catch (e) {
      console.error('加载选集失败', e)
      return []
    }
  },

  // 视频报错回调
  onVideoError(e) {
    const detail = e.detail || {}
    console.error('video error', detail, this.data.videoUrl)
    if (this.inMandatoryActionVideo) {
      this.mandatoryActionPauseReason = ''
      this.pendingSeek = this.resumeAt
      this.resetPlaybackMetrics(this.originalUrl)
      this.setData({
        videoUrl: this.originalUrl,
        'story.show': false,
        actionPrompt: createActionPromptState(),
        actionSpeedBoost: createActionSpeedBoostState(),
        progressPercent: 0
      })
      return
    }
    wx.showModal({
      title: '视频加载失败',
      content: `${formatVideoError(detail)}\n${this.data.videoUrl || ''}`,
      showCancel: false
    })
  },

  // 元数据加载：按宽高判断方向 + 记录时长 + 处理待执行 seek
  onVideoLoaded(e) {
    const { width, height, duration } = e.detail || {}
    if (Number(duration) > 0) this.duration = Number(duration)
    this.refreshVideoContext()
    if (this.playbackMetrics) {
      this.playbackMetrics.metadataAt = Date.now()
      this.logPlaybackDiagnostic('metadata', {
        duration: this.duration,
        metadataMs: this.playbackMetrics.loadStartedAt ? this.playbackMetrics.metadataAt - this.playbackMetrics.loadStartedAt : 0
      })
    }
    this.setData({ objectFit: height > width ? 'cover' : 'contain' })
    const returningFromMandatoryAction = this.pendingSeek != null && this.inMandatoryActionVideo
    if (this.data.playbackRate && !returningFromMandatoryAction) {
      this.setVideoPlaybackRate(this.data.speeding ? 2.0 : this.data.playbackRate)
    }
    if (this.pendingSeek != null) {
      const t = this.pendingSeek
      this.pendingSeek = null
      if (this.playbackMetrics) {
        this.playbackMetrics.seekStartedAt = Date.now()
        this.playbackMetrics.seekTarget = t
      }
      this.logPlaybackDiagnostic('seekStart', { seekTarget: t })
      this.seekVideo(t, !this.pendingReopenBranch)
      if (returningFromMandatoryAction) this.resetActionPlaybackState()
      if (this.pendingReopenBranch) {
        // 错误重选：回到分支点后暂停并重新弹出分支（不自动续播）
        this.pendingReopenBranch = false
        this.pauseVideo()
        this.setData({ playing: false })
        if (this.currentBranch) this.openBranch(this.currentBranch)
      } else {
        this.playVideo()
        this.setData({ playing: true })
      }
      if (this.inMandatoryActionVideo) {
        this.inMandatoryActionVideo = false
        this.mandatoryActionPauseReason = ''
        this.setData({
          actionLockActive: false,
          actionVideoActive: false,
          actionPrompt: createActionPromptState()
        })
      }
    } else if (this.initialStartAt > 0) {
      const t = this.initialStartAt
      this.initialStartAt = 0
      if (this.playbackMetrics) {
        this.playbackMetrics.seekStartedAt = Date.now()
        this.playbackMetrics.seekTarget = t
      }
      this.logPlaybackDiagnostic('seekStart', { seekTarget: t })
      this.seekVideo(t, true)
      this.playVideo()
      this.setData({ playing: true })
    } else if (this.autoPlayOnLoaded) {
      this.playIfAllowed()
    }
  },

  onVideoFirstFrame() {
    this.markFirstFrame('loadeddata')
  },

  onVideoWaiting() {
    const metrics = this.playbackMetrics
    if (metrics) {
      metrics.waitingCount += 1
      if (!metrics.waitingStartedAt) metrics.waitingStartedAt = Date.now()
    }
    this.logPlaybackDiagnostic('waiting', {
      waitingCount: metrics ? metrics.waitingCount : 0
    })
  },

  onVideoProgress(e) {
    const metrics = this.playbackMetrics
    if (!metrics) return
    const now = Date.now()
    if (now - (metrics.lastProgressLogAt || 0) < DIAGNOSTIC_LOG_INTERVAL_MS) return
    metrics.lastProgressLogAt = now
    this.logPlaybackDiagnostic('progress', {
      buffered: e && e.detail ? e.detail.buffered : undefined
    })
  },

  onVideoSeekComplete() {
    const metrics = this.playbackMetrics
    if (!metrics || !metrics.seekStartedAt) return
    const seekRecoverMs = Date.now() - metrics.seekStartedAt
    metrics.seekStartedAt = 0
    this.logPlaybackDiagnostic('seekComplete', {
      seekRecoverMs,
      seekTarget: metrics.seekTarget
    })
  },

  // 播放进度更新（秒）：驱动高光调度 + 更新进度条
  onTimeUpdate(e) {
    const cur = e.detail.currentTime
    const dur = e.detail.duration || this.duration || 0
    this.lastTimeUpdateAt = Date.now()
    this.duration = dur
    this.curTime = cur
    const percent = dur > 0 ? (cur / dur) * 100 : 0
    this.markFirstFrame('timeupdate')
    const metrics = this.playbackMetrics
    if (metrics && metrics.waitingStartedAt) {
      metrics.waitingTotalMs += Date.now() - metrics.waitingStartedAt
      metrics.waitingStartedAt = 0
      this.logPlaybackDiagnostic('waitingEnd', {
        waitingCount: metrics.waitingCount,
        waitingTotalMs: metrics.waitingTotalMs
      })
    }
    if (metrics && metrics.seekStartedAt) {
      const reachedTarget = metrics.seekTarget == null || Math.abs(cur - metrics.seekTarget) < 1 || Date.now() - metrics.seekStartedAt > 500
      if (reachedTarget) this.onVideoSeekComplete()
    }
    const now = Date.now()
    if (!this.data.useNativeVideoControls && !this.data.seeking) {
      const shouldUpdateProgress = now - this.lastProgressUiAt >= PROGRESS_UI_UPDATE_MS
        || Math.abs(percent - this.lastProgressPercent) >= 1
      if (shouldUpdateProgress) {
        this.lastProgressUiAt = now
        this.lastProgressPercent = percent
        this.setData({ progressPercent: percent })
      }
    }
    this.saveCurrentProgress(cur)
    if (!this.inBranchVideo) this.checkDanmaku(cur)
    if (this.inMandatoryActionVideo) {
      this.checkActionPrompt(cur)
      this.checkActionSpeedBoost(cur)
    }
    // 分支插入视频播放期间不跑原片高光调度
    if (!this.inBranchVideo && now - this.lastHighlightCheckAt >= HIGHLIGHT_CHECK_INTERVAL_MS) {
      this.lastHighlightCheckAt = now
      this.checkHighlight(cur)
    }
  },

  // 视频播放结束：分支插入视频结束后，按对/错分流
  applyPlaybackTime(cur, dur) {
    this.duration = dur
    this.curTime = cur
    const percent = dur > 0 ? (cur / dur) * 100 : 0
    this.markFirstFrame('clock')
    const metrics = this.playbackMetrics
    if (metrics && metrics.waitingStartedAt) {
      metrics.waitingTotalMs += Date.now() - metrics.waitingStartedAt
      metrics.waitingStartedAt = 0
      this.logPlaybackDiagnostic('waitingEnd', {
        waitingCount: metrics.waitingCount,
        waitingTotalMs: metrics.waitingTotalMs
      })
    }
    if (metrics && metrics.seekStartedAt) {
      const reachedTarget = metrics.seekTarget == null || Math.abs(cur - metrics.seekTarget) < 1 || Date.now() - metrics.seekStartedAt > 500
      if (reachedTarget) this.onVideoSeekComplete()
    }
    const now = Date.now()
    if (!this.data.useNativeVideoControls && !this.data.seeking) {
      const shouldUpdateProgress = now - this.lastProgressUiAt >= PROGRESS_UI_UPDATE_MS
        || Math.abs(percent - this.lastProgressPercent) >= 1
      if (shouldUpdateProgress) {
        this.lastProgressUiAt = now
        this.lastProgressPercent = percent
        this.setData({ progressPercent: percent })
      }
    }
    this.saveCurrentProgress(cur)
    if (!this.inBranchVideo) this.checkDanmaku(cur)
    if (this.inMandatoryActionVideo) {
      this.checkActionPrompt(cur)
      this.checkActionSpeedBoost(cur)
    }
    if (!this.inBranchVideo && now - this.lastHighlightCheckAt >= HIGHLIGHT_CHECK_INTERVAL_MS) {
      this.lastHighlightCheckAt = now
      this.checkHighlight(cur)
    }
  },

  onVideoEnded() {
    if (!this.inBranchVideo) {
      this.playNextEpisodeOrFinish()
      return
    }
    this.inBranchVideo = false
    if (this.selectedIsCorrect === false) {
      // 错误分支：置灰该选项 → 进入黑屏失败序列
      this.markOptionDisabled()
      this.showBlackout(this.selectedFailText)
    } else {
      // 正确分支：切回主线，从 resumeAt 续播
      this.pendingSeek = this.resumeAt
      this.resetPlaybackMetrics(this.originalUrl)
      this.setData({ videoUrl: this.originalUrl, 'story.show': false, progressPercent: 0 })
    }
  },

  // 把本次选中的错误项加入置灰集合
  markOptionDisabled() {
    const hl = this.currentBranch && this.currentBranch.highlightId
    if (hl == null || !this.selectedOptionCode) return
    this.disabledOptions[hl] = this.disabledOptions[hl] || {}
    this.disabledOptions[hl][this.selectedOptionCode] = true
  },

  // 显示黑屏 + 缓慢浮现文案（文案缺省时只显示「重新选择」）
  showBlackout(text) {
    this.setData({ blackout: { show: true, text: text || '', visible: false }, 'story.show': false })
    // 下一拍翻转 visible，触发 wxss 的 opacity 过渡，让文字缓慢浮现
    setTimeout(() => this.setData({ 'blackout.visible': true }), 60)
  },

  // 点「重新选择」：回到分支点重新弹出分支（错误项已置灰）
  onRetryBranch() {
    this.inBranchVideo = false
    this.pendingSeek = this.branchStartTime
    this.pendingReopenBranch = true
    this.resetPlaybackMetrics(this.originalUrl)
    this.setData({
      blackout: { show: false, text: '', visible: false },
      videoUrl: this.originalUrl,
      'story.show': false,
      progressPercent: 0
    })
  },

  // 播放/暂停状态回调
  onPlay() {
    if (this.manualPaused) {
      this.pauseVideo()
      this.setData({ playing: false })
      return
    }
    // 分支/动作弹窗期间硬锁：任何来源触发的播放都立即回到暂停，确保停在互动点等用户操作
    if (this.shouldBlockPlaybackByOverlay()) {
      this.pauseVideo()
      return
    }
    this.manualPaused = false
    this.logPlaybackDiagnostic('play')
    this.startPlaybackClock()
    this.setData({ playing: true })
  },

  onPause() {
    this.logPlaybackDiagnostic('pause')
    this.stopPlaybackClock()
    this.setData({ playing: false })
  },

  shouldBlockPlaybackByOverlay() {
    if (this.data.useNativeVideoControls) return false
    if (this.data.branch.show || this.data.blackout.show || this.data.action.show || this.data.actionPrompt.show) return true
    if (this.data.actionSpeedBoost.show && this.mandatoryActionPauseReason === 'actionSpeedBoost') return true
    return !!(this.data.story.show && (this.data.story.contentType === 'TEXT' || this.data.story.contentType === 'IMAGE_SEQ'))
  },

  // 点击屏幕：切换播放/暂停
  onTapVideo() {
    if (this.data.useNativeVideoControls) return
    if (this.suppressTapUntil && Date.now() < this.suppressTapUntil) return
    this.toggleVideoPlayback()
  },

  toggleVideoPlayback() {
    // 分支弹窗 / 黑屏失败 / 文本剧情弹窗显示时锁定，禁止点屏恢复播放（必须先做出选择）
    if (this.shouldBlockPlaybackByOverlay() || this.isActionLocked()) return
    if (this.data.playing) {
      this.manualPaused = true
      this.pauseVideo()
      this.setData({ playing: false })
    } else {
      this.manualPaused = false
      this.playVideo()
      this.setData({ playing: true })
    }
  },

  toggleVideoFromTouch() {
    this.suppressTapUntil = Date.now() + 350
    this.toggleVideoPlayback()
  },

  isTapTouch(e) {
    const touch = (e && e.changedTouches && e.changedTouches[0]) || {}
    const x = touch.clientX != null ? touch.clientX : this.touchStartX
    const y = touch.clientY != null ? touch.clientY : this.touchStartY
    return Math.abs(x - this.touchStartX) < 28 && Math.abs(y - this.touchStartY) < 28
  },

  // 秒 → mm:ss
  fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0))
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  },

  // 点击/拖动进度条跳转，拖动时显示 当前/总时长
  onSeekTouch(e) {
    if (this.data.useNativeVideoControls) return
    if (this.isActionLocked()) return
    const isTap = e && e.type === 'tap'
    if (!isTap) this.clearSeekHideTimer()
    const cur = this.getSeekTimeFromEvent(e)
    if (cur == null) return
    this.pendingSeekTime = cur
    this.updateSeekPreview(cur)
    if (isTap) {
      this.performSeek(cur)
      this.scheduleSeekHide()
    }
  },

  // 松手隐藏时长提示
  onSeekEnd() {
    if (this.data.useNativeVideoControls) return
    if (this.pendingSeekTime != null) {
      this.performSeek(this.pendingSeekTime)
      this.pendingSeekTime = null
    }
    this.scheduleSeekHide()
  },

  getSeekTimeFromEvent(e) {
    const p = (e && e.touches && e.touches[0]) || (e && e.changedTouches && e.changedTouches[0]) || (e && e.detail) || {}
    const x = p.x != null ? p.x : (p.clientX != null ? p.clientX : p.pageX)
    if (x == null || !this.duration || !this.screenW) return null
    const ratio = Math.max(0, Math.min(1, x / this.screenW))
    return ratio * this.duration
  },

  updateSeekPreview(cur) {
    const safeCur = Math.max(0, Math.min(this.duration || 0, Number(cur) || 0))
    const percent = this.duration > 0 ? (safeCur / this.duration) * 100 : 0
    this.setData({
      progressPercent: percent,
      seeking: true,
      seekText: `${this.fmtTime(safeCur)} / ${this.fmtTime(this.duration)}`
    })
  },

  performSeek(cur) {
    if (!this.duration) return
    const target = Math.max(0, Math.min(this.duration, Number(cur) || 0))
    this.pendingSeekTime = null
    if (this.playbackMetrics) {
      this.playbackMetrics.seekStartedAt = Date.now()
      this.playbackMetrics.seekTarget = target
    }
    this.logPlaybackDiagnostic('seekStart', { seekTarget: target })
    this.seekVideo(target)
    this.resetHighlightForSeek(target)
    this.updateSeekPreview(target)
  },

  // 按住右下角：二倍速；松手恢复
  onSpeedTouchStart(e) {
    const touch = e.touches && e.touches[0]
    this.clearSpeedPressTimer()
    this.touchStartX = touch ? touch.clientX : 0
    this.touchStartY = touch ? touch.clientY : 0
    this.speedTouchStartY = touch ? touch.clientY : 0
    if (!this.videoCtx || this.data.speeding || this.data.speedLocked) return
    this.speedPressTimer = setTimeout(() => {
      this.speedPressTimer = null
      this.onSpeedStart({ touches: [{ clientX: this.touchStartX, clientY: this.speedTouchStartY }] })
    }, SPEED_HOLD_DELAY_MS)
  },
  onSpeedStart(e) {
    this.clearSpeedPressTimer()
    if (this.isActionLocked()) return
    if (!this.videoCtx) return
    if (this.data.speeding) return
    if (this.inMandatoryActionVideo || this.data.actionVideoActive) return
    if (this.data.branch.show || this.data.blackout.show) return
    if (this.data.story.show && (this.data.story.contentType === 'TEXT' || this.data.story.contentType === 'IMAGE_SEQ')) return
    const touch = e && e.touches && e.touches[0]
    if (touch) this.speedTouchStartY = touch.clientY
    this.speedGestureActive = true
    this.wasPlayingBeforeSpeed = !!this.data.playing
    this.manualPaused = false
    this.setVideoPlaybackRate(2.0)
    this.playVideo()
    this.setData({ speeding: true, speedMenu: false, speedLockText: this.data.speedLocked ? '2倍速已锁定' : '2倍速' })
  },
  onSpeedMove(e) {
    if (this.isActionLocked()) return
    const touch = e.touches && e.touches[0]
    if (!touch) return
    const delta = touch.clientY - this.speedTouchStartY
    if (!this.data.speeding && !this.data.speedLocked) {
      if (Math.abs(delta) > 28) this.clearSpeedPressTimer()
      return
    }
    if (delta > SPEED_LOCK_THRESHOLD && !this.data.speedLocked) {
      this.setVideoPlaybackRate(2.0)
      this.playVideo()
      this.setData({ speeding: true, speedLocked: true, speedLockText: '2倍速已锁定' })
    } else if (delta < -SPEED_LOCK_THRESHOLD && this.data.speedLocked) {
      this.unlockSpeed()
    }
  },
  onSpeedEnd(e) {
    this.clearSpeedPressTimer()
    if (this.isActionLocked()) {
      this.setData({ speeding: false, speedLocked: false, speedLockText: '' })
      return
    }
    if (!this.videoCtx) return
    if (!this.data.speeding && !this.data.speedLocked) {
      if (this.isTapTouch(e)) this.toggleVideoFromTouch()
      return
    }
    if (this.data.speedLocked) {
      this.speedGestureActive = false
      return
    }
    this.restoreSpeedAfterGesture()
  },
  restoreSpeedAfterGesture() {
    if (!this.videoCtx) return
    this.setVideoPlaybackRate(this.data.playbackRate || 1.0)
    if (!this.wasPlayingBeforeSpeed) {
      this.manualPaused = true
      this.pauseVideo()
      this.setData({ playing: false })
    }
    this.speedGestureActive = false
    this.setData({ speeding: false, speedLocked: false, speedLockText: '' })
    this.suppressTapUntil = Date.now() + 300
  },
  unlockSpeed() {
    if (!this.videoCtx) return
    this.setVideoPlaybackRate(this.data.playbackRate || 1.0)
    if (!this.wasPlayingBeforeSpeed) {
      this.manualPaused = true
      this.pauseVideo()
      this.setData({ playing: false })
    }
    this.speedGestureActive = false
    this.setData({ speeding: false, speedLocked: false, speedLockText: '' })
    this.suppressTapUntil = Date.now() + 300
  },
  toggleSpeedMenu() {
    if (this.data.branch.show || this.data.blackout.show || this.data.actionVideoActive || this.isActionLocked()) return
    this.setData({ speedMenu: !this.data.speedMenu })
  },
  setPlaybackRate(e) {
    if (this.isActionLocked()) return
    if (this.data.actionVideoActive) return
    const rate = Number(e.currentTarget.dataset.rate) || 1
    if (this.videoCtx) {
      this.setVideoPlaybackRate(rate)
    }
    this.setData({ playbackRate: rate, speedMenu: false, speeding: false, speedLocked: false, speedLockText: '' })
  },

  // ===== 选集 =====
  openEpisodePanel() {
    if (this.isActionLocked()) return
    const episodeRanges = this.data.episodeRanges && this.data.episodeRanges.length ? this.data.episodeRanges : buildEpisodeRanges(this.data.episodes)
    const activeEpisodeRangeIndex = findEpisodeRangeIndex(episodeRanges, this.data.currentEpisodeNo)
    const activeRange = episodeRanges[activeEpisodeRangeIndex] || { episodes: this.data.episodes || [] }
    this.setData({
      episodePanel: true,
      speedMenu: false,
      episodeRanges,
      activeEpisodeRangeIndex,
      visibleEpisodes: activeRange.episodes || []
    })
  },
  closeEpisodePanel() {
    this.setData({ episodePanel: false })
  },
  selectEpisodeRange(e) {
    const index = Number(e.currentTarget.dataset.index) || 0
    const range = (this.data.episodeRanges || [])[index]
    this.setData({
      activeEpisodeRangeIndex: index,
      visibleEpisodes: range ? (range.episodes || []) : []
    })
  },
  switchEpisode(e) {
    if (this.isActionLocked()) return
    const id = Number(e.currentTarget.dataset.id)
    this.setData({ episodePanel: false })
    if (id === this.data.episodeId) return
    this.switchToEpisode(id)
  },

  switchToEpisode(id) {
    this.triggeredMap = {}
    this.shownMap = {}
    this.lastStats = {}
    this.disabledOptions = {}
    this.danmakuSecondMap = {}
    this.statDanmakuMap = {}
    this.clearHighlightStatDanmakuTimer()
    this.pendingHighlightStatDanmaku = null
    this.activeHighlightSessionKey = ''
    this.danmakuLaneAvailableAt = []
    this.currentLocalDanmakuBySecond = {}
    this.speedGestureActive = false
    this.suppressTapUntil = 0
    this.manualPaused = false
    this.lastProgressSavedAt = 0
    this.pendingSeekTime = null
    this.lastProgressUiAt = 0
    this.lastProgressPercent = 0
    this.lastHighlightCheckAt = 0
    this.playbackMetrics = null
    this.currentBranch = null
    this.inBranchVideo = false
    this.inMandatoryActionVideo = false
    this.mandatoryActionPauseReason = ''
    this.pendingReopenBranch = false
    this.clearActionSpeedBoostTimer()
    this.pendingSeek = null
    this.initialStartAt = 0
    this.autoPlayOnLoaded = true
    this.duration = 0
    this.setData({
      episodeId: id,
      currentEpisodeNo: null,
      overlay: { show: false, highlightId: null, title: '', buttons: [], sessionKey: '' },
      floats: [],
      danmakuTexts: [],
      bigImage: { show: false, src: '', beat: false },
      branch: { show: false, title: '', options: [] },
      action: { show: false, title: '', label: '', optionCode: '', generationMode: '', generationId: null, resumeTime: null },
      actionVideoActive: false,
      actionPrompt: createActionPromptState(),
      blackout: { show: false, text: '', visible: false },
      actionLockActive: false,
      actionSpeedBoost: createActionSpeedBoostState(),
      story: { show: false, generationId: null, contentType: '', title: '', content: '', contentUrl: '', images: [], imageIndex: 0, currentImage: '', liked: false, likeCount: 0, commentCount: 0 },
      commentPanel: { show: false, list: [], total: 0, input: '' },
      dramaCommentPanel: { show: false, list: [], input: '' },
      progressPercent: 0,
      playing: false,
      speedMenu: false,
      speeding: false,
      speedLocked: false,
      speedLockText: ''
    })
    this.loadEpisode(id)
    this.loadHighlights(id)
  },

  async playNextEpisodeOrFinish() {
    let next = this.nextEpisode()
    if (!next && this.data.dramaId) {
      const episodes = await this.loadEpisodes(this.data.dramaId)
      next = this.nextEpisode(episodes)
    }
    if (next && next.episodeId) {
      this.switchToEpisode(Number(next.episodeId))
      return
    }
    this.autoPlayOnLoaded = false
    this.setData({ playing: false, speeding: false, speedLocked: false, speedLockText: '', speedMenu: false, progressPercent: 100 })
    if (this.videoCtx) {
      this.setVideoPlaybackRate(this.data.playbackRate || 1.0)
      this.pauseVideo()
    }
  },

  nextEpisode(sourceEpisodes) {
    const episodes = (sourceEpisodes || this.data.episodes || []).slice().sort((a, b) => {
      return (Number(a.episodeNo) || 0) - (Number(b.episodeNo) || 0)
    })
    const currentId = Number(this.data.episodeId)
    const index = episodes.findIndex((item) => Number(item.episodeId) === currentId)
    return index >= 0 ? episodes[index + 1] : null
  },

  playIfAllowed() {
    if (this.shouldBlockPlaybackByOverlay()) return
    this.autoPlayOnLoaded = false
    this.manualPaused = false
    this.setVideoPlaybackRate(this.data.playbackRate || 1.0)
    this.playVideo()
    this.setData({ playing: true })
  },

  // ===== F6 分支 =====
  openBranch(h) {
    const pauseForInteraction = !this.data.useNativeVideoControls
    if (pauseForInteraction) this.pauseVideo()
    this.prefetchStoriesForHighlight(h)
    this.prefetchStoryVideosForHighlight(h)
    // 回跳点兜底：a(触发时原片时间) + b(被覆盖时长 = 高光窗口长度)；
    // 若选项带后端下发的 resumeTime，则在 onTapBranch 里优先用它覆盖。
    const a = this.curTime || h.startTime
    const b = (h.endTime - h.startTime) || 0
    this.resumeAt = a + b
    this.originalUrl = this.data.videoUrl
    this.currentBranch = h
    this.branchStartTime = h.startTime
    const disabled = this.disabledOptions[h.highlightId] || {}
    const opts = (h.interactionConfig.options || []).map((o) => ({
      branchOutcome: o.branchOutcome || (o.isCorrect === false ? 'TRIAL' : 'MAINLINE'),
      optionCode: o.optionCode,
      label: o.label,
      generationMode: o.generationMode || (o.branchOutcome === 'MAINLINE' ? 'MAINLINE' : 'PREGEN'),
      generationId: o.generationId || null,
      resumeTime: o.resumeTime != null ? o.resumeTime : null,
      retryTime: o.retryTime != null ? o.retryTime : null,
      isCorrect: o.branchOutcome ? o.branchOutcome === 'MAINLINE' : o.isCorrect !== false, // 缺省视为正确
      failText: o.failText || '',
      disabled: !!disabled[o.optionCode] // 选过的错误项置灰
    }))
    this.setData({ playing: pauseForInteraction ? false : this.data.playing, branch: { show: true, title: h.title, options: opts } })
  },

  // 选择分支：取该项预生成内容并切播；记录对/错供 onVideoEnded 分流
  async onTapBranch(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const opt = this.data.branch.options[idx]
    if (!opt || opt.disabled) return // 置灰项不可选
    // 回跳点：优先后端 resumeTime（绝对秒数），缺省沿用 openBranch 的 a+b
    if (opt.resumeTime != null) this.resumeAt = Number(opt.resumeTime)
    this.selectedOptionCode = opt.optionCode
    this.selectedIsCorrect = opt.isCorrect !== false
    this.selectedFailText = opt.failText || ''
    this.setData({ 'branch.show': false })
    if (opt.branchOutcome === 'MAINLINE' || opt.generationMode === 'MAINLINE') {
      this.playVideo()
      this.setData({ playing: true })
      return
    }
    wx.showLoading({ title: '加载中...', mask: true })
    try {
      let story
      if (opt.generationMode === 'PREGEN') {
        story = await this.getStoryWithCache(opt.generationId)
      } else {
        story = await aiApi.generateStory({
          episodeId: this.data.episodeId,
          highlightId: this.currentBranch ? this.currentBranch.highlightId : null,
          optionCode: opt.optionCode
        })
      }
      story = await storyVideoCache.withPlayableVideoUrl(story, 900)
      this.showStory(story)
    } catch (err) {
      console.error('取分支内容失败', err)
    } finally {
      wx.hideLoading()
    }
  },

  // 展示生成内容：VIDEO 切播 / TEXT 文本弹窗
  showStory(story) {
    const contentUrl = normalizePlayableVideoUrl(story.contentUrl)
    const base = {
      show: true,
      generationId: story.generationId,
      contentType: story.contentType,
      title: story.title || '',
      content: story.content || '',
      contentUrl,
      images: [],
      imageIndex: 0,
      currentImage: '',
      liked: !!story.liked,
      likeCount: story.likeCount || 0,
      commentCount: story.commentCount || 0
    }
    if (story.contentType === 'VIDEO' && contentUrl) {
      // 切换主播放器到分支插入视频；播完由 onVideoEnded 还原原片到 a+b
      this.manualPaused = false
      this.curTime = 0
      this.duration = 0
      this.inBranchVideo = true
      this.pendingSeek = null
      this.resetPlaybackMetrics(contentUrl)
      this.setData({
        videoUrl: contentUrl,
        videoInitialTime: 0,
        videoAutoplay: true,
        playing: true,
        progressPercent: 0,
        story: base
      }, () => {
        this.refreshVideoContext()
        setTimeout(() => this.playVideo(), 160)
        setTimeout(() => this.playVideo(), 520)
      })
    } else if (story.contentType === 'IMAGE_SEQ') {
      this.loadImageSeq(story, base)
    } else {
      // TEXT：视频保持暂停，弹文本
      this.setData({ story: base })
    }
  },

  // 展示 IMAGE_SEQ：contentUrl 指向 manifest.json，失败时退回文本
  loadImageSeq(story, base) {
    if (this.imageSeqTimer) {
      clearInterval(this.imageSeqTimer)
      this.imageSeqTimer = null
    }
    if (!story.contentUrl) {
      this.setData({ story: base })
      return
    }
    wx.request({
      url: story.contentUrl,
      success: (res) => {
        const manifest = res.data || {}
        const images = manifest.images || []
        const nextStory = Object.assign({}, base, {
          content: base.content || manifest.prompt || '',
          images,
          imageIndex: 0,
          currentImage: images[0] || ''
        })
        this.setData({ story: nextStory })
        if (images.length > 1) {
          this.imageSeqTimer = setInterval(() => this.nextImageSeq(), manifest.intervalMs || 1600)
        }
      },
      fail: () => this.setData({ story: base })
    })
  },

  nextImageSeq() {
    const s = this.data.story
    const images = s.images || []
    if (images.length <= 1) return
    const index = (s.imageIndex + 1) % images.length
    this.setData({ 'story.imageIndex': index, 'story.currentImage': images[index] })
  },

  prevImageSeq() {
    const s = this.data.story
    const images = s.images || []
    if (images.length <= 1) return
    const index = (s.imageIndex - 1 + images.length) % images.length
    this.setData({ 'story.imageIndex': index, 'story.currentImage': images[index] })
  },

  // 关闭文本剧情：原片从暂停处继续播放
  closeStory() {
    if (this.imageSeqTimer) {
      clearInterval(this.imageSeqTimer)
      this.imageSeqTimer = null
    }
    const contentType = this.data.story.contentType
    this.setData({ 'story.show': false })
    if (!this.inBranchVideo && contentType === 'IMAGE_SEQ' && this.selectedIsCorrect === false) {
      this.markOptionDisabled()
      this.showBlackout(this.selectedFailText)
      return
    }
    if (!this.inBranchVideo && this.videoCtx) this.playVideo()
  },

  // ===== 动作互动 =====
  openAction(h) {
    const pauseForInteraction = !this.data.useNativeVideoControls
    if (pauseForInteraction) this.pauseVideo()
    this.prefetchStoriesForHighlight(h)
    this.prefetchStoryVideosForHighlight(h)
    const cfg = h.interactionConfig || {}
    const speedBoost = normalizeActionSpeedBoostConfig(cfg.speedBoost)
    const label = cfg.label || cfg.actionLabel || cfg.userAction || '助力'
    const optionCode = cfg.optionCode || 'action_boost'
    const actionPrompt = normalizeActionPromptConfig(cfg.actionPrompt, { label, optionCode })
    const autoStart = shouldAutoStartAction(cfg)
    this.originalUrl = this.data.videoUrl
    this.resumeAt = cfg.resumeTime != null ? Number(cfg.resumeTime) : h.endTime
    this.inMandatoryActionVideo = false
    this.mandatoryActionPauseReason = ''
    this.clearActionSpeedBoostTimer()
    const action = {
      show: !autoStart,
      title: h.title || '动作互动',
      label,
      optionCode,
      generationMode: cfg.generationMode || 'PREGEN',
      generationId: cfg.generationId || null,
      resumeTime: cfg.resumeTime != null ? Number(cfg.resumeTime) : h.endTime,
      speedBoost,
      actionPrompt,
      autoStart
    }
    this.setData({
      speedMenu: false,
      speeding: false,
      speedLocked: false,
      speedLockText: '',
      playbackRate: 1,
      'commentPanel.show': false,
      playing: pauseForInteraction ? false : this.data.playing,
      actionLockActive: true,
      actionVideoActive: autoStart,
      actionPrompt: createActionPromptState(),
      actionSpeedBoost: createActionSpeedBoostState(),
      action
    }, () => {
      if (autoStart) this.startActionVideo()
    })
  },

  async onTapAction() {
    return this.startActionVideo()
  },

  async startActionVideo() {
    const action = this.data.action
    if (!action.generationId) {
      this.mandatoryActionPauseReason = ''
      this.setData({
        'action.show': false,
        actionLockActive: false,
        actionVideoActive: false,
        actionPrompt: createActionPromptState()
      })
      this.playVideo()
      return
    }
    this.selectedIsCorrect = true
    this.inMandatoryActionVideo = true
    this.mandatoryActionPauseReason = ''
    this.setVideoPlaybackRate(1)
    this.setData({
      playbackRate: 1,
      speedMenu: false,
      speeding: false,
      speedLocked: false,
      speedLockText: '',
      'action.show': false,
      actionLockActive: true,
      actionVideoActive: true,
      actionPrompt: createActionPromptState(),
      actionSpeedBoost: createActionSpeedBoostState()
    })
    wx.showLoading({ title: '加载中...', mask: true })
    try {
      const story = await this.getStoryWithCache(action.generationId)
      const playableStory = await storyVideoCache.withPlayableVideoUrl(story, 900)
      this.showStory(playableStory)
    } catch (e) {
      console.error('加载动作互动内容失败', e)
      this.inMandatoryActionVideo = false
      this.mandatoryActionPauseReason = ''
      this.resetActionPlaybackState()
      this.setData({ actionLockActive: false })
      this.playVideo()
    } finally {
      wx.hideLoading()
    }
  },

  pauseForActionGate(reason) {
    this.mandatoryActionPauseReason = reason
    this.pauseVideo()
    this.setData({ playing: false })
  },

  checkActionPrompt(cur) {
    const prompt = normalizeActionPromptConfig(this.data.action.actionPrompt, this.data.action)
    const state = this.data.actionPrompt || {}
    if (!prompt || state.offered || state.clicked || state.show) return
    const t = Number(cur)
    if (!Number.isFinite(t) || t < prompt.showAt) return
    this.pauseForActionGate('actionPrompt')
    this.setData({
      actionPrompt: {
        show: true,
        offered: true,
        clicked: false,
        label: prompt.label,
        optionCode: prompt.optionCode
      }
    })
  },

  onTapActionPrompt() {
    const state = this.data.actionPrompt || {}
    this.mandatoryActionPauseReason = ''
    this.setData({
      actionPrompt: Object.assign({}, state, {
        show: false,
        clicked: true
      })
    }, () => {
      this.playVideo()
    })
  },

  checkActionSpeedBoost(cur) {
    if (this.data.actionPrompt && this.data.actionPrompt.show) return
    if (!shouldShowActionSpeedBoost(cur, this.data.actionSpeedBoost, this.data.action.speedBoost)) return
    this.showActionSpeedBoost()
  },

  showActionSpeedBoost() {
    const speedBoost = normalizeActionSpeedBoostConfig(this.data.action.speedBoost)
    this.clearActionSpeedBoostTimer()
    const waitForClick = this.inMandatoryActionVideo || speedBoost.pauseUntilClick
    if (waitForClick) this.pauseForActionGate('actionSpeedBoost')
    this.setData({
      'actionSpeedBoost.show': true,
      'actionSpeedBoost.offered': true
    })
    if (!waitForClick) {
      this.actionSpeedBoostTimer = setTimeout(() => this.hideActionSpeedBoost(), speedBoost.autoHideMs)
    }
  },

  hideActionSpeedBoost() {
    this.clearActionSpeedBoostTimer()
    if (this.data.actionSpeedBoost.show) {
      this.setData({ 'actionSpeedBoost.show': false })
    }
  },

  dismissActionSpeedBoost() {
    const speedBoost = normalizeActionSpeedBoostConfig(this.data.action.speedBoost)
    if (this.inMandatoryActionVideo || speedBoost.pauseUntilClick) return
    if (!speedBoost.dismissible) return
    this.hideActionSpeedBoost()
  },

  onTapActionSpeedBoost() {
    const speedBoost = normalizeActionSpeedBoostConfig(this.data.action.speedBoost)
    this.clearActionSpeedBoostTimer()
    this.mandatoryActionPauseReason = ''
    if (this.videoCtx) {
      this.setVideoPlaybackRate(speedBoost.rate)
      this.playVideo()
    }
    this.setData({
      playbackRate: speedBoost.rate,
      speedMenu: false,
      speeding: false,
      speedLocked: false,
      speedLockText: '',
      'actionSpeedBoost.show': false,
      'actionSpeedBoost.boosted': true
    })
  },

  // 点赞 / 取消（本地即时反馈）
  async onTapLike() {
    if (this.isActionLocked()) return
    const s = this.data.story
    if (!s.generationId) return
    const liked = !s.liked
    this.setData({ 'story.liked': liked, 'story.likeCount': s.likeCount + (liked ? 1 : -1) })
    try {
      const r = liked ? await aiApi.likeStory(s.generationId) : await aiApi.unlikeStory(s.generationId)
      this.setData({ 'story.liked': r.liked, 'story.likeCount': r.likeCount })
    } catch (e) {
      console.error('点赞失败', e)
    }
  },

  // ===== F7 评论 =====
  // 打开评论：视频缩到顶部继续播放，下方展开评论区（不隐藏、不暂停）
  async openComments() {
    if (this.isActionLocked()) return
    const gid = this.data.story.generationId
    if (!gid) return
    this.setData({ 'commentPanel.show': true })
    try {
      const r = await aiApi.getComments(gid)
      this.setData({ 'commentPanel.list': r.list || [], 'commentPanel.total': r.total || 0 })
    } catch (e) {
      console.error('评论加载失败', e)
    }
  },

  closeComments() {
    this.setData({ 'commentPanel.show': false })
  },

  onTapCommentSearch(e) {
    const keyword = String(e.currentTarget.dataset.keyword || '').trim()
    if (!keyword) return
    if (!authStore.requireLogin('登录后可以搜索短剧')) return
    this.rememberSearchOrigin()
    wx.setStorageSync('svimvp_theater_search_keyword', keyword)
    this.setData({
      'commentPanel.show': false,
      'dramaCommentPanel.show': false
    })
    wx.switchTab({ url: '/pages/index/index' })
  },

  onTapEpisodeTag(e) {
    const keyword = String(e.currentTarget.dataset.keyword || '').trim()
    if (!keyword) return
    if (!authStore.requireLogin('登录后可以搜索短剧')) return
    this.rememberSearchOrigin()
    wx.setStorageSync('svimvp_theater_search_keyword', keyword)
    this.setData({ episodePanel: false })
    wx.switchTab({ url: '/pages/index/index' })
  },

  rememberSearchOrigin() {
    wx.setStorageSync('svimvp_theater_search_origin', {
      type: 'play',
      episodeId: this.data.episodeId,
      dramaId: this.data.dramaId,
      startAt: Math.max(0, Math.floor(this.curTime || this.initialStartAt || 0))
    })
  },

  onCommentInput(e) {
    this.setData({ 'commentPanel.input': e.detail.value })
  },

  async onSendComment() {
    const gid = this.data.story.generationId
    const content = (this.data.commentPanel.input || '').trim()
    if (!gid || !content) return
    try {
      await aiApi.postComment(gid, content)
      const r = await aiApi.getComments(gid)
      this.setData({
        'commentPanel.list': r.list || [],
        'commentPanel.total': r.total || 0,
        'commentPanel.input': '',
        'story.commentCount': r.total || 0
      })
    } catch (e) {
      console.error('评论失败', e)
    }
  },

  prefetchUpcomingStories(current) {
    const cur = Number(current) || 0
    ;(this.data.highlights || []).forEach((h) => {
      const start = Number(h.startTime)
      const end = Number(h.endTime)
      if (!Number.isFinite(start) || !Number.isFinite(end)) return
      if (cur >= start - STORY_PREFETCH_BEFORE_SECONDS && cur <= end + STORY_PREFETCH_AFTER_SECONDS) {
        this.prefetchStoriesForHighlight(h)
      }
    })
  },

  prefetchStoriesForHighlight(h) {
    const cfg = (h && h.interactionConfig) || {}
    if (cfg.componentType === 'branch_choice') {
      ;(cfg.options || []).forEach((opt) => {
        if (opt && opt.generationMode !== 'MAINLINE' && opt.generationId) this.prefetchStory(opt.generationId)
      })
    } else if (cfg.componentType === 'action_button') {
      if (cfg.generationId) this.prefetchStory(cfg.generationId)
    }
  },

  prefetchStoryVideosForHighlight(h) {
    const cfg = (h && h.interactionConfig) || {}
    if (cfg.componentType === 'branch_choice') {
      ;(cfg.options || []).forEach((opt) => {
        if (opt && opt.generationMode !== 'MAINLINE' && opt.generationId) this.prefetchStoryVideo(opt.generationId)
      })
    } else if (cfg.componentType === 'action_button') {
      if (cfg.generationId) this.prefetchStoryVideo(cfg.generationId)
    }
  },

  prefetchStoryVideo(generationId) {
    return this.getStoryWithCache(generationId)
      .then((story) => storyVideoCache.prefetch(story))
      .catch((err) => {
        console.warn('预热互动视频失败', generationId, err)
        return ''
      })
  },

  prefetchStory(generationId) {
    const key = String(generationId || '')
    if (!key || this.storyCache[key] || this.storyPrefetchPromises[key]) return this.storyPrefetchPromises[key] || Promise.resolve(this.storyCache[key])
    this.storyPrefetchPromises[key] = aiApi.getStory(Number(generationId))
      .then((story) => {
        if (story) this.storyCache[key] = story
        return story
      })
      .catch((err) => {
        console.warn('预取互动内容失败', generationId, err)
        return null
      })
      .finally(() => {
        delete this.storyPrefetchPromises[key]
      })
    return this.storyPrefetchPromises[key]
  },

  async getStoryWithCache(generationId) {
    const key = String(generationId || '')
    if (key && this.storyCache[key]) return this.storyCache[key]
    if (key && this.storyPrefetchPromises[key]) {
      const prefetched = await this.storyPrefetchPromises[key]
      if (prefetched) return prefetched
    }
    const story = await aiApi.getStory(Number(generationId))
    if (key && story) this.storyCache[key] = story
    return story
  },

  // 高光调度：高光弹幕跟随播放进度；进入 startTime/endTime 显示，离开立即隐藏
  checkHighlight(cur) {
    const current = Number(cur) || 0
    const highlights = this.data.highlights || []
    this.prefetchUpcomingStories(current)
    const activeEmotion = this.findActiveEmotionHighlight(current)

    if (activeEmotion) {
      const id = String(activeEmotion.highlightId)
      const currentOverlayId = this.data.overlay.highlightId == null ? '' : String(this.data.overlay.highlightId)
      if (!this.data.overlay.show || currentOverlayId !== id) {
        this.showOverlay(activeEmotion)
      }
      this.shownMap[id] = true
    } else if (this.data.overlay.show) {
      this.hideOverlay()
    }

    highlights.forEach((h) => {
      const cfg = h.interactionConfig || {}
      const type = cfg.componentType
      const id = String(h.highlightId)
      const inWin = this.isHighlightActive(h, current)
      const alreadyTriggered = h.triggerOnce && this.triggeredMap[id]

      if (type === 'emotion_button') {
        if (!inWin) {
          delete this.shownMap[id]
        }
      } else if (type === 'branch_choice') {
        // 命中分支：每次进入时间窗都暂停并弹出（不做一次性限制）
        if (inWin && !this.shownMap[id]) {
          this.openBranch(h)
          this.shownMap[id] = true
        }
        if (!inWin && this.shownMap[id]) {
          delete this.shownMap[id]
        }
      } else if (type === 'action_button') {
        if (inWin && !this.shownMap[id] && !alreadyTriggered) {
          this.openAction(h)
          this.shownMap[id] = true
          if (h.triggerOnce) this.triggeredMap[id] = true
        }
        if (!inWin && this.shownMap[id]) {
          delete this.shownMap[id]
          this.setData({ 'action.show': false })
        }
      }
    })
  },

  isHighlightActive(h, cur) {
    const start = Number(h.startTime)
    const end = Number(h.endTime)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false
    return cur >= start && cur <= end
  },

  // 显示高光浮层
  showOverlay(h) {
    const sessionKey = `${h.highlightId}_${Date.now()}_${++this.highlightSessionSeq}`
    this.activeHighlightSessionKey = sessionKey
    highlightStats.reset(h.highlightId, sessionKey)
    const buttons = (h.interactionConfig.buttons || []).map((b) => ({
      optionCode: b.optionCode,
      label: b.label,
      icon: getEmotionIcon(b.optionCode, b.icon),
      currentCount: highlightStats.getOptionCount(h.highlightId, b.optionCode, sessionKey),
      animating: false
    }))
    this.setData({
      overlay: { show: true, highlightId: h.highlightId, title: h.title, buttons, sessionKey }
    })
    // Keep visible counts scoped to this page session; backend totals are analytics only.
  },

  async refreshHighlightStats(highlightId) {
    try {
      const stats = await interactionApi.getHighlightStats(highlightId)
      const options = stats && stats.options ? stats.options : []
      const overlay = this.data.overlay || {}
      if (!overlay.show || String(overlay.highlightId) !== String(highlightId)) return
      if (overlay.sessionKey) return
      const nextButtons = (overlay.buttons || []).map((button) => {
        const stat = options.find((item) => item.optionCode === button.optionCode)
        return Object.assign({}, button, { currentCount: stat ? Number(stat.count) || 0 : button.currentCount })
      })
      this.setData({ 'overlay.buttons': nextButtons })
    } catch (e) {
      console.warn('加载高光统计失败', e)
    }
  },

  flushHighlightStatDanmaku(overlay) {
    const pending = this.pendingHighlightStatDanmaku
    if (!pending) return
    const sessionKey = (overlay && overlay.sessionKey) || this.activeHighlightSessionKey || pending.sessionKey
    if (sessionKey && pending.sessionKey && sessionKey !== pending.sessionKey) return
    const key = `stat:${pending.sessionKey || ''}:${pending.highlightId || ''}`
    if (!this.statDanmakuMap[key]) {
      this.statDanmakuMap[key] = true
      this.spawnDanmakuText(pending.text, { kind: 'stat', top: 170 })
    }
    this.pendingHighlightStatDanmaku = null
    this.clearHighlightStatDanmakuTimer()
  },

  clearHighlightStatDanmakuTimer() {
    if (this.highlightStatDanmakuTimer) clearTimeout(this.highlightStatDanmakuTimer)
    this.highlightStatDanmakuTimer = null
  },

  queueHighlightStatDanmaku(overlay, remote) {
    if (!remote || remote.participantCount == null) return
    const current = overlay || this.data.overlay || {}
    const sessionKey = current.sessionKey || this.activeHighlightSessionKey || String(current.highlightId || '')
    if (!sessionKey) return
    const liveOverlay = this.data.overlay || {}
    const stillCurrentSession = (liveOverlay.sessionKey && liveOverlay.sessionKey === sessionKey) || this.activeHighlightSessionKey === sessionKey
    if (!stillCurrentSession) return
    this.pendingHighlightStatDanmaku = {
      sessionKey,
      highlightId: current.highlightId,
      text: `已有 ${remote.participantCount} 人参与高光弹幕，累计 ${remote.totalCount || 0} 次`
    }
    this.clearHighlightStatDanmakuTimer()
    if (!liveOverlay.show || liveOverlay.sessionKey !== sessionKey) {
      this.flushHighlightStatDanmaku({ sessionKey, highlightId: current.highlightId })
    }
  },

  // 隐藏浮层
  hideOverlay() {
    const overlay = this.data.overlay
    this.flushHighlightStatDanmaku(overlay)
    this.setData({ overlay: { show: false, highlightId: null, title: '', buttons: [], sessionKey: '' } })
  },

  // 点击情绪按钮：本地动效 + 上报 + 用 currentCount 更新角标
  async onTapEmotion(e) {
    const optionCode = e.currentTarget.dataset.optionCode
    const highlightId = this.data.overlay.highlightId
    const episodeId = this.data.episodeId
    if (highlightId == null || episodeId == null) return
    if (!authStore.requireLogin('登录后可以点击高光弹幕')) return
    const tapKey = `${highlightId}:${optionCode}`
    const now = Date.now()
    if (this.lastEmotionTapKey === tapKey && now - (this.lastEmotionTapAt || 0) < 280) return
    this.lastEmotionTapKey = tapKey
    this.lastEmotionTapAt = now

    const idx = this.data.overlay.buttons.findIndex((b) => b.optionCode === optionCode)
    if (idx < 0) return

    // 本地立即动效：按钮 scale + 表情爆发 + 大字动画
    this.setData({ [`overlay.buttons[${idx}].animating`]: true })
    setTimeout(() => this.setData({ [`overlay.buttons[${idx}].animating`]: false }), 300)
    this.spawnBurst(optionCode)
    this.showBigImage(optionCode)

    const sessionKey = this.data.overlay.sessionKey || this.activeHighlightSessionKey
    const result = highlightStats.recordClick(highlightId, optionCode, sessionKey)
    this.setData({ [`overlay.buttons[${idx}].currentCount`]: result.currentCount })
    const overlaySnapshot = Object.assign({}, this.data.overlay)
    const clickStatKey = `click:${sessionKey || highlightId}:${highlightId}`
    this.statDanmakuMap[clickStatKey] = true
    try {
      const remote = await interactionApi.createInteraction({
        dramaId: this.data.dramaId,
        episodeId,
        highlightId,
        interactionType: 'click',
        optionCode
      })
      this.queueHighlightStatDanmaku(overlaySnapshot, remote)
    } catch (err) {
      console.error('上报高光互动失败', err)
    }
  },

  // ===== F5 计数轮询：每 4s 拉统计，更新角标（模拟他人实时互动） =====
  startPolling(episodeId) {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = setInterval(() => this.pollStats(episodeId), 4000)
  },

  async pollStats(episodeId) {
    let stats
    try {
      stats = await episodeApi.getInteractionStats(episodeId)
    } catch (e) {
      return
    }
    (stats || []).forEach((h) => {
      (h.options || []).forEach((opt) => {
        // 浮层正在显示该选项时，同步角标计数
        this.syncOverlayCount(opt.optionCode, opt.count)
      })
    })
  },

  // 点击爆发：一次涌出一簇同款表情，从底部散开往上飘，终点过屏幕一半且随机
  spawnBurst(optionCode) {
    const meta = this.optionMeta[optionCode]
    if (!meta) return
    const count = 8
    const now = Date.now()
    const newFloats = []
    for (let k = 0; k < count; k++) {
      newFloats.push({
        id: `${now}_${optionCode}_${k}_${Math.floor(Math.random() * 1000)}`,
        icon: meta.icon,
        left: 120 + Math.floor(Math.random() * 420), // 起点横向随机(rpx)
        riseY: 700 + Math.floor(Math.random() * 620), // 终点高度：屏幕一半以上
        driftX: Math.floor(Math.random() * 240) - 120, // 上飘时横向漂移(rpx)
        size: 48 + Math.floor(Math.random() * 40), // 大小随机
        rise: false
      })
    }
    const ids = newFloats.map((n) => n.id)
    this.setData({ floats: this.data.floats.concat(newFloats) })
    // 下一拍触发上升
    setTimeout(() => {
      this.setData({
        floats: this.data.floats.map((f) => (ids.indexOf(f.id) >= 0 ? Object.assign({}, f, { rise: true }) : f))
      })
    }, 50)
    // 动效结束后移除
    setTimeout(() => {
      this.setData({ floats: this.data.floats.filter((f) => ids.indexOf(f.id) < 0) })
    }, 2700)
  },

  // 右下角大图：点击弹出对应大图并持续“一动一动”，停手后淡出
  showBigImage(optionCode) {
    const src = getBigImage(optionCode)
    if (!src) return
    this.setData({ bigImage: { show: true, src, beat: true } })
    // 跳动：每 350ms 切换一次 transform（配合 wxss transition 形成一动一动）
    if (!this.bigBeatTimer) {
      this.bigBeatTimer = setInterval(() => {
        this.setData({ 'bigImage.beat': !this.data.bigImage.beat })
      }, 350)
    }
    // 每次点击刷新隐藏倒计时；停手 1.8s 后收起
    if (this.bigImgTimer) clearTimeout(this.bigImgTimer)
    this.bigImgTimer = setTimeout(() => {
      if (this.bigBeatTimer) {
        clearInterval(this.bigBeatTimer)
        this.bigBeatTimer = null
      }
      this.setData({ 'bigImage.show': false })
    }, 1800)
  },

  saveCurrentProgress(cur) {
    if (!authStore.isLoggedIn()) return
    if (this.inBranchVideo || this.inMandatoryActionVideo) return
    const now = Date.now()
    if (now - this.lastProgressSavedAt < 2000) return
    this.lastProgressSavedAt = now
    userStore.saveProgress(this.data.dramaId, this.data.episodeId, cur)
  },

  currentDramaSnapshot() {
    const meta = this.data.dramaMeta || {}
    return {
      dramaId: meta.dramaId || this.data.dramaId,
      title: meta.title || '',
      description: meta.description || '',
      coverUrl: meta.coverUrl || '',
      tags: meta.tags || [],
      episodeCount: meta.episodeCount || (this.data.episodes || []).length
    }
  },

  async onTapDramaLike() {
    if (this.isActionLocked()) return
    if (!authStore.requireLogin('登录后可以点赞短剧')) return
    try {
      this.setData({ dramaSocial: await userStore.toggleLike(this.currentDramaSnapshot()) })
    } catch (err) {
      wx.showToast({ title: '点赞失败', icon: 'none' })
    }
  },

  async onTapDramaFavorite() {
    if (this.isActionLocked()) return
    if (!authStore.requireLogin('登录后可以收藏短剧')) return
    try {
      this.setData({ dramaSocial: await userStore.toggleFavorite(this.currentDramaSnapshot()) })
    } catch (err) {
      wx.showToast({ title: '收藏失败', icon: 'none' })
    }
  },

  async openDramaComments() {
    if (this.isActionLocked()) return
    if (!authStore.requireLogin('登录后可以评论短剧')) return
    const dramaId = this.data.dramaId
    this.setData({
      dramaCommentPanel: {
        show: true,
        list: formatLocalComments(await userStore.getComments(dramaId)),
        input: ''
      }
    })
  },

  findActiveEmotionHighlight(current) {
    return (this.data.highlights || []).find((h) => {
      const cfg = h.interactionConfig || {}
      return cfg.componentType === 'emotion_button' && this.isHighlightActive(h, current)
    })
  },

  resetHighlightForSeek(current) {
    this.shownMap = {}
    this.flushHighlightStatDanmaku(this.data.overlay)
    this.activeHighlightSessionKey = ''
    this.clearActionSpeedBoostTimer()
    this.setData({
      overlay: { show: false, highlightId: null, title: '', buttons: [], sessionKey: '' },
      branch: { show: false, title: '', options: [] },
      blackout: { show: false, text: '', visible: false },
      action: { show: false, title: '', label: '', optionCode: '', generationMode: '', generationId: null, resumeTime: null },
      actionPrompt: createActionPromptState(),
      actionSpeedBoost: createActionSpeedBoostState(),
      actionLockActive: false,
      actionVideoActive: false,
      speedMenu: false
    })
    this.lastHighlightCheckAt = 0
    if (!this.inBranchVideo) this.checkHighlight(current)
  },

  closeDramaComments() {
    this.setData({ 'dramaCommentPanel.show': false })
  },

  onDramaCommentInput(e) {
    this.setData({ 'dramaCommentPanel.input': e.detail.value })
  },

  async onSendDramaComment() {
    if (!authStore.requireLogin('登录后可以评论短剧')) return
    const dramaId = this.data.dramaId
    const content = (this.data.dramaCommentPanel.input || '').trim()
    if (!content) return
    try {
      const comments = await userStore.addComment(dramaId, content)
      this.setData({
        'dramaCommentPanel.list': formatLocalComments(comments),
        'dramaCommentPanel.input': '',
        dramaSocial: await userStore.getDramaSocial(dramaId)
      })
    } catch (err) {
      wx.showToast({ title: err.message || '评论失败', icon: 'none' })
    }
  },

  openDanmakuInput() {
    if (this.isActionLocked()) return
    if (!authStore.requireLogin('登录后可以发送弹幕')) return
    wx.showModal({
      title: '发弹幕',
      editable: true,
      placeholderText: '发一条弹幕',
      confirmText: '发送',
      success: (res) => {
        if (!res.confirm) return
        const text = String(res.content || '').trim()
        if (!text) return
        this.sendUserDanmaku(text)
      }
    })
  },

  async sendUserDanmaku(text) {
    this.spawnDanmakuText(text, { kind: 'user', force: true })
    const episodeId = this.data.episodeId
    if (!episodeId) return
    try {
      const item = await danmakuApi.postDanmaku(episodeId, {
        dramaId: this.data.dramaId,
        currentTime: this.curTime || 0,
        content: text,
        clientDanmakuId: `${Date.now()}_${Math.random().toString(16).slice(2)}`
      })
      this.addRemoteDanmaku(item)
    } catch (e) {
      console.error('发送弹幕失败', e)
      wx.showToast({ title: '弹幕保存失败', icon: 'none' })
    }
  },

  async loadRemoteDanmaku(episodeId) {
    this.remoteDanmakuBySecond = {}
    if (!episodeId) return
    try {
      const list = await danmakuApi.listDanmaku(episodeId)
      ;(list || []).forEach((item) => this.addRemoteDanmaku(item))
    } catch (e) {
      console.warn('加载远端弹幕失败', e)
    }
  },

  addRemoteDanmaku(item) {
    const content = String((item && item.content) || '').trim()
    if (!content) return
    const sec = Math.max(0, Math.floor(Number(item.currentTime) || 0))
    const key = String(sec)
    this.remoteDanmakuBySecond[key] = this.remoteDanmakuBySecond[key] || []
    this.remoteDanmakuBySecond[key].push(content)
  },

  checkDanmaku(cur) {
    const episodeNo = Number(this.data.currentEpisodeNo) || 0
    if (!episodeNo) return
    const sec = Math.max(0, Math.floor(Number(cur) || 0))
    const key = `${this.data.episodeId || episodeNo}:${sec}`
    if (this.danmakuSecondMap[key]) return
    this.danmakuSecondMap[key] = true
    const list = ((this.currentLocalDanmakuBySecond || {})[String(sec)] || []).concat(this.remoteDanmakuBySecond[String(sec)] || [])
    list
      .slice()
      .sort((a, b) => danmakuLikeCount(b) - danmakuLikeCount(a))
      .forEach((item, index) => {
        const text = Array.isArray(item) ? item[0] : item
        this.spawnDanmakuText(text, { delay: index * DANMAKU_QUEUE_DELAY_MS, lane: index % DANMAKU_LANE_COUNT })
      })
  },

  spawnDanmakuText(text, options = {}) {
    const content = String(text || '').trim()
    if (!content) return
    const id = `${Date.now()}_${Math.floor(Math.random() * 100000)}`
    const requestedLane = Number.isFinite(Number(options.lane)) ? Number(options.lane) : Math.floor(Math.random() * DANMAKU_LANE_COUNT)
    const item = {
      id,
      text: content,
      top: options.top != null ? Number(options.top) : DANMAKU_BAND_TOP,
      kind: options.kind || 'normal',
      move: false
    }
    const add = () => {
      const activeTexts = this.data.danmakuTexts || []
      if (item.kind === 'normal' || item.kind === 'user') {
        const lane = this.reserveDanmakuLane(requestedLane, !!options.force)
        if (lane < 0) {
          const retryCount = Number(options.retryCount) || 0
          setTimeout(() => this.spawnDanmakuText(content, Object.assign({}, options, { delay: 0, retryCount: retryCount + 1 })), 500)
          return
        }
        item.top = DANMAKU_BAND_TOP + lane * DANMAKU_LANE_GAP
      }
      this.setData({ danmakuTexts: activeTexts.concat(item) })
      setTimeout(() => {
        this.setData({
          danmakuTexts: this.data.danmakuTexts.map((entry) => entry.id === id ? Object.assign({}, entry, { move: true }) : entry)
        })
      }, 40)
      setTimeout(() => {
        this.setData({ danmakuTexts: this.data.danmakuTexts.filter((entry) => entry.id !== id) })
      }, 6100)
    }
    if (options.delay) {
      setTimeout(add, options.delay)
    } else {
      add()
    }
  },

  reserveDanmakuLane(preferredLane, force) {
    const now = Date.now()
    const preferred = Math.max(0, Number(preferredLane) || 0)
    for (let i = 0; i < DANMAKU_LANE_COUNT; i++) {
      const lane = (preferred + i) % DANMAKU_LANE_COUNT
      if (!this.danmakuLaneAvailableAt[lane] || this.danmakuLaneAvailableAt[lane] <= now) {
        this.danmakuLaneAvailableAt[lane] = now + DANMAKU_LANE_COOLDOWN_MS
        return lane
      }
    }
    return -1
  },

  // 浮层显示中时，按 optionCode 同步角标
  syncOverlayCount(optionCode, count) {
    if (!this.data.overlay.show) return
    if (this.data.overlay.sessionKey) return
    const i = this.data.overlay.buttons.findIndex((b) => b.optionCode === optionCode)
    if (i >= 0) this.setData({ [`overlay.buttons[${i}].currentCount`]: count })
  }
})

function episodeNoFromTitle(title) {
  const match = String(title || '').match(/第\s*(\d+)\s*集/)
  return match ? Number(match[1]) : 0
}

function formatLocalComments(list) {
  return (list || []).map((item) => {
    const name = item.nickname || '用户'
    return Object.assign({}, item, {
      avatar: name.slice(0, 1).toUpperCase(),
      timeText: formatCommentTime(item.createdAt || item.createTime),
      likeCount: item.likeCount || 0
    })
  })
}

function formatCommentTime(value) {
  if (!value) return '刚刚'
  const time = typeof value === 'number' ? value : new Date(value).getTime()
  if (!Number.isFinite(time)) return '刚刚'
  const diff = Date.now() - time
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / 60000))}分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / 3600000))}小时前`
  if (diff < 48 * 60 * 60 * 1000) return '1天前'
  const date = new Date(time)
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
