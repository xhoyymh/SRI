const dramaApi = require('../../api/drama')
const episodeApi = require('../../api/episode')
const authStore = require('../../utils/auth-store')
const userStore = require('../../utils/user-store')
const highlightStats = require('../../utils/highlight-stats')
const danmakuData = require('../../utils/danmaku-data')
const interactionApi = require('../../api/interaction')
const danmakuApi = require('../../api/danmaku')
const aiApi = require('../../api/ai')
const {
  FORCE_NATIVE_VIDEO_CONTROLS_ON_ANDROID,
  USE_EXTERNAL_VIDEO_OVERLAY_ON_ANDROID
} = require('../../utils/config')
const { getBigImage, getEmotionIcon } = require('../../utils/icon-assets')
const storyVideoCache = require('../../utils/story-video-cache')

const SEEK_PREVIEW_HIDE_MS = 1500
const PROGRESS_UI_UPDATE_MS = 250
const HIGHLIGHT_CHECK_INTERVAL_MS = 180
const DANMAKU_QUEUE_DELAY_MS = 650
const DANMAKU_LANE_COUNT = 4
const DANMAKU_BAND_TOP = 220
const DANMAKU_LANE_GAP = 54
const DANMAKU_LANE_COOLDOWN_MS = 2400
const SPEED_LOCK_THRESHOLD = 70
const SPEED_HOLD_DELAY_MS = 220
const FEED_PREFETCH_DELAY_MS = 450
const STORY_PREFETCH_BEFORE_SECONDS = 5
const STORY_PREFETCH_AFTER_SECONDS = 1

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

function buildRemoteDanmakuBySecond(list) {
  const map = {}
  ;(list || []).forEach((item) => {
    const content = String((item && item.content) || '').trim()
    if (!content) return
    const sec = Math.max(0, Math.floor(Number(item.currentTime) || 0))
    const key = String(sec)
    map[key] = map[key] || []
    map[key].push(content)
  })
  return map
}

Page({
  data: {
    loading: false,
    dramas: [],
    currentDrama: null,
    currentEpisode: null,
    videoUrl: '',
    descExpanded: false,
    social: { liked: false, favorited: false, likeCount: 0, favoriteCount: 0, commentCount: 0 },
    commentPanel: { show: false, list: [], input: '' },
    useExternalVideoOverlay: false,
    useNativeVideoControls: false,
    videoAutoplay: true,
    videoInitialTime: 0,
    playing: false,
    progressPercent: 0,
    speeding: false,
    speedLocked: false,
    speedLockText: '',
    playbackRate: 1,
    speedOptions: [0.5, 0.75, 1, 1.25, 1.5, 2],
    speedMenu: false,
    seeking: false,
    seekText: '',
    highlights: [],
    overlay: { show: false, highlightId: null, title: '', buttons: [], sessionKey: '' },
    branch: { show: false, title: '', options: [] },
    action: { show: false, title: '', label: '', optionCode: '', generationMode: '', generationId: null, resumeTime: null },
    actionVideoActive: false,
    floats: [],
    bigImage: { show: false, src: '', beat: false },
    danmakuTexts: []
  },

  videoCtx: null,
  videoCtxList: [],
  videoId: 'homevideo',
  playbackClockTimer: null,
  videoReloadTimer: null,
  lastClockAt: 0,
  lastTimeUpdateAt: 0,
  touchStartX: 0,
  touchStartY: 0,
  curTime: 0,
  duration: 0,
  screenW: 375,
  lastProgressSavedAt: 0,
  seekHideTimer: null,
  feedTouchBlockedUntil: 0,
  wasPlayingBeforeSpeed: false,
  speedTouchStartY: 0,
  speedGestureActive: false,
  speedPressTimer: null,
  suppressTapUntil: 0,
  manualPaused: false,
  homeResumeOnShow: false,
  danmakuLaneAvailableAt: [],
  optionMeta: {},
  shownMap: {},
  danmakuSecondMap: {},
  statDanmakuMap: {},
  activeHighlightSessionKey: '',
  highlightSessionSeq: 0,
  bigImgTimer: null,
  bigBeatTimer: null,
  highlightStatDanmakuTimer: null,
  pendingHighlightStatDanmaku: null,
  remoteDanmakuBySecond: {},
  currentLocalDanmakuBySecond: {},
  forceReloadedPaused: false,
  lastProgressUiAt: 0,
  lastProgressPercent: 0,
  lastHighlightCheckAt: 0,
  pendingSeekTime: null,
  originalUrl: '',
  resumeAt: 0,
  currentBranch: null,
  inBranchVideo: false,
  selectedOptionCode: '',
  selectedIsCorrect: true,
  feedSwitching: false,
  nextFeedEntry: null,
  nextFeedPromise: null,
  nextFeedTimer: null,
  storyCache: {},
  storyPrefetchPromises: {},

  onLoad() {
    this.bindVideoContext('homevideo')
    try {
      this.screenW = getScreenWidth()
    } catch (e) {
      this.screenW = 375
    }
    const useNativeVideoControls = shouldUseNativeVideoControls()
    const useExternalVideoOverlay = useNativeVideoControls ? false : shouldUseExternalVideoOverlay()
    this.setData({
      useExternalVideoOverlay,
      useNativeVideoControls
    })
    this.loadDramas()
  },

  onShow() {
    this.syncTabBar(0)
    this.refreshSocial()
    this.resumeHomeVideoAfterNavigation()
  },

  onHide() {
    this.pauseHomeVideoForNavigation()
  },

  onUnload() {
    this.pauseHomeVideoForNavigation()
    this.stopPlaybackClock()
    this.clearVideoReloadTimer()
    this.clearSeekHideTimer()
    if (this.bigImgTimer) clearTimeout(this.bigImgTimer)
    if (this.bigBeatTimer) clearInterval(this.bigBeatTimer)
    if (this.nextFeedTimer) clearTimeout(this.nextFeedTimer)
    this.clearHighlightStatDanmakuTimer()
    this.bigImgTimer = null
    this.bigBeatTimer = null
    this.nextFeedTimer = null
    this.nextFeedEntry = null
    this.nextFeedPromise = null
    this.storyCache = {}
    this.storyPrefetchPromises = {}
    this.pendingHighlightStatDanmaku = null
    this.shownMap = {}
    this.danmakuSecondMap = {}
    this.statDanmakuMap = {}
    this.clearHighlightStatDanmakuTimer()
    this.pendingHighlightStatDanmaku = null
    this.activeHighlightSessionKey = ''
    this.danmakuLaneAvailableAt = []
    this.currentLocalDanmakuBySecond = {}
    this.originalUrl = ''
    this.resumeAt = 0
    this.currentBranch = null
    this.inBranchVideo = false
    this.selectedOptionCode = ''
    this.selectedIsCorrect = true
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
    const videoId = this.videoId || 'homevideo'
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
      const scoped = wx.createVideoContext(this.videoId || 'homevideo', this)
      if (scoped) fresh.push(scoped)
    } catch (e) {}
    try {
      const plain = wx.createVideoContext(this.videoId || 'homevideo')
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
        if (!this.data.playing || this.manualPaused) this.reloadVideoAt(this.curTime || 0, false)
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
        : (!this.manualPaused && (!!this.data.playing || !!this.data.videoAutoplay))
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

  async loadDramas() {
    this.setData({ loading: true })
    try {
      const dramas = normalizeDramas(await dramaApi.listDramas())
      this.setData({ dramas })
      if (dramas.length) await this.playRandomDrama()
    } catch (err) {
      console.error('加载首页短剧失败', err)
      wx.showToast({ title: '加载短剧失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async playRandomDrama() {
    if (this.feedSwitching) return
    const dramas = this.data.dramas || []
    if (!dramas.length) return
    this.feedSwitching = true
    try {
      const currentId = this.data.currentDrama && this.data.currentDrama.dramaId
      let entry = this.consumePrefetchedFeedEntry(currentId)
      if (!entry && this.nextFeedPromise) {
        const pending = await this.nextFeedPromise.catch(() => null)
        entry = pending && String(pending.currentDrama && pending.currentDrama.dramaId) !== String(currentId || '') ? pending : null
      }
      if (!entry) {
        const drama = this.pickNextDrama(currentId)
        entry = await this.buildFeedEntry(drama)
      }
      if (entry) this.applyFeedEntry(entry)
      this.scheduleNextFeedPrefetch()
    } catch (err) {
      console.error('播放随机短剧失败', err)
      wx.showToast({ title: '播放短剧失败', icon: 'none' })
    } finally {
      this.feedSwitching = false
    }
  },

  pickNextDrama(currentId) {
    const dramas = this.data.dramas || []
    const pool = dramas.length > 1 ? dramas.filter((item) => String(item.dramaId) !== String(currentId || '')) : dramas
    return pool[Math.floor(Math.random() * pool.length)]
  },

  async buildFeedEntry(drama) {
    if (!drama || !drama.dramaId) return null
    const detail = await dramaApi.getDramaDetail(drama.dramaId)
    const episodes = (detail.episodes || []).slice().sort((a, b) => (Number(a.episodeNo) || 0) - (Number(b.episodeNo) || 0))
    if (!episodes.length) {
      wx.showToast({ title: '暂无剧集', icon: 'none' })
      return null
    }
    const progress = userStore.getProgress(drama.dramaId)
    const episode = episodes.find((item) => progress && Number(item.episodeId) === Number(progress.episodeId)) || episodes[0]
    const episodeDetail = await episodeApi.getEpisode(episode.episodeId)
    const description = drama.description || detail.description || ''
    const descriptionState = createDescriptionState(description)
    const currentDrama = Object.assign({}, drama, {
      title: drama.title || detail.title || '',
      description,
      descriptionBrief: descriptionState.brief,
      descriptionCollapsedText: descriptionState.collapsedText,
      descriptionClipped: descriptionState.clipped,
      tags: userStore.normalizeTags(drama.tags || detail.tags),
      episodeCount: drama.episodeCount || episodes.length
    })
    const initialTime = progress && Number(progress.episodeId) === Number(episode.episodeId) ? Number(progress.currentTime) || 0 : 0
    const [social, highlights, remoteDanmaku] = await Promise.all([
      userStore.getDramaSocial(currentDrama.dramaId),
      episodeApi.getHighlights(episodeDetail.episodeId).catch((err) => {
        console.warn('预取高光失败', err)
        return []
      }),
      danmakuApi.listDanmaku(episodeDetail.episodeId).catch((err) => {
        console.warn('预取弹幕失败', err)
        return []
      })
    ])
    return {
      currentDrama,
      currentEpisode: episodeDetail,
      videoUrl: episodeDetail.videoUrl,
      initialTime,
      duration: Number(episodeDetail.duration) || 0,
      social,
      highlights: highlights || [],
      optionMeta: this.buildOptionMeta(highlights || []),
      localDanmakuBySecond: getDanmakuEpisode(currentDrama.title, Number(episodeDetail.episodeNo) || 0) || {},
      remoteDanmakuBySecond: buildRemoteDanmakuBySecond(remoteDanmaku)
    }
  },

  applyFeedEntry(entry) {
    if (!entry || !entry.currentEpisode) return
    this.resetPlaybackSession()
    this.optionMeta = entry.optionMeta || {}
    this.currentLocalDanmakuBySecond = entry.localDanmakuBySecond || {}
    this.remoteDanmakuBySecond = entry.remoteDanmakuBySecond || {}
    this.curTime = entry.initialTime || 0
    this.duration = entry.duration || 0
    this.setData({
      currentDrama: entry.currentDrama,
      currentEpisode: entry.currentEpisode,
      videoUrl: entry.videoUrl,
      videoAutoplay: true,
      videoInitialTime: this.curTime || 0,
      descExpanded: false,
      commentPanel: { show: false, list: [], input: '' },
      social: entry.social,
      highlights: entry.highlights || []
    }, () => {
      this.refreshVideoContext()
      this.manualPaused = false
      this.playVideo()
      this.setData({ playing: true })
    })
    this.prefetchUpcomingStories(this.curTime)
  },

  buildOptionMeta(highlights) {
    const meta = {}
    ;(highlights || []).forEach((h) => {
      const cfg = h.interactionConfig || {}
      ;(cfg.buttons || []).forEach((b) => {
        meta[b.optionCode] = { icon: getEmotionIcon(b.optionCode, b.icon), label: b.label }
      })
    })
    return meta
  },

  consumePrefetchedFeedEntry(currentId) {
    const entry = this.nextFeedEntry
    this.nextFeedEntry = null
    if (!entry) return null
    if (String(entry.currentDrama && entry.currentDrama.dramaId) === String(currentId || '')) return null
    return entry
  },

  scheduleNextFeedPrefetch() {
    if (this.nextFeedTimer) clearTimeout(this.nextFeedTimer)
    this.nextFeedTimer = setTimeout(() => {
      this.nextFeedTimer = null
      this.prefetchNextFeedEntry()
    }, FEED_PREFETCH_DELAY_MS)
  },

  prefetchNextFeedEntry() {
    if (this.nextFeedEntry) {
      const currentId = this.data.currentDrama && this.data.currentDrama.dramaId
      if (String(this.nextFeedEntry.currentDrama && this.nextFeedEntry.currentDrama.dramaId) !== String(currentId || '')) {
        return Promise.resolve(this.nextFeedEntry)
      }
      this.nextFeedEntry = null
    }
    if (this.nextFeedPromise) return this.nextFeedPromise
    const currentId = this.data.currentDrama && this.data.currentDrama.dramaId
    const drama = this.pickNextDrama(currentId)
    if (!drama) return Promise.resolve(null)
    this.nextFeedPromise = this.buildFeedEntry(drama)
      .then((entry) => {
        if (entry && String(entry.currentDrama && entry.currentDrama.dramaId) !== String(this.data.currentDrama && this.data.currentDrama.dramaId)) {
          this.nextFeedEntry = entry
        }
        return entry
      })
      .catch((err) => {
        console.warn('预取下一条短剧失败', err)
        return null
      })
      .finally(() => {
        this.nextFeedPromise = null
      })
    return this.nextFeedPromise
  },

  async playDrama(drama) {
    if (!drama || !drama.dramaId) return
    try {
      const detail = await dramaApi.getDramaDetail(drama.dramaId)
      const episodes = (detail.episodes || []).slice().sort((a, b) => (Number(a.episodeNo) || 0) - (Number(b.episodeNo) || 0))
      if (!episodes.length) {
        wx.showToast({ title: '暂无剧集', icon: 'none' })
        return
      }
      const progress = userStore.getProgress(drama.dramaId)
      const episode = episodes.find((item) => progress && Number(item.episodeId) === Number(progress.episodeId)) || episodes[0]
      const episodeDetail = await episodeApi.getEpisode(episode.episodeId)
      const description = drama.description || detail.description || ''
      const descriptionState = createDescriptionState(description)
      const currentDrama = Object.assign({}, drama, {
        title: drama.title || detail.title || '',
        description,
        descriptionBrief: descriptionState.brief,
        descriptionCollapsedText: descriptionState.collapsedText,
        descriptionClipped: descriptionState.clipped,
        tags: userStore.normalizeTags(drama.tags || detail.tags),
        episodeCount: drama.episodeCount || episodes.length
      })
      this.resetPlaybackSession()
      this.currentLocalDanmakuBySecond = getDanmakuEpisode(currentDrama.title, Number(episodeDetail.episodeNo) || 0) || {}
      this.curTime = progress && Number(progress.episodeId) === Number(episode.episodeId) ? Number(progress.currentTime) || 0 : 0
      this.duration = Number(episodeDetail.duration) || 0
      const social = await userStore.getDramaSocial(currentDrama.dramaId)
      this.setData({
        currentDrama,
        currentEpisode: episodeDetail,
        videoUrl: episodeDetail.videoUrl,
        videoAutoplay: true,
        videoInitialTime: this.curTime || 0,
        descExpanded: false,
        commentPanel: { show: false, list: [], input: '' },
        social
      }, () => {
        this.refreshVideoContext()
        this.manualPaused = false
        this.playVideo()
        this.setData({ playing: true })
      })
      this.loadHighlights(episodeDetail.episodeId)
      this.loadRemoteDanmaku(episodeDetail.episodeId)
    } catch (err) {
      console.error('播放随机短剧失败', err)
      wx.showToast({ title: '播放短剧失败', icon: 'none' })
    }
  },

  resetPlaybackSession() {
    this.clearSeekHideTimer()
    this.clearSpeedPressTimer()
    this.clearVideoReloadTimer()
    this.stopPlaybackClock()
    this.duration = 0
    this.lastProgressSavedAt = 0
    this.optionMeta = {}
    this.shownMap = {}
    this.danmakuSecondMap = {}
    this.statDanmakuMap = {}
    this.clearHighlightStatDanmakuTimer()
    this.pendingHighlightStatDanmaku = null
    this.activeHighlightSessionKey = ''
    this.danmakuLaneAvailableAt = []
    this.remoteDanmakuBySecond = {}
    this.currentLocalDanmakuBySecond = {}
    this.lastProgressUiAt = 0
    this.lastProgressPercent = 0
    this.lastHighlightCheckAt = 0
    this.pendingSeekTime = null
    this.speedGestureActive = false
    this.wasPlayingBeforeSpeed = false
    this.suppressTapUntil = 0
    this.manualPaused = false
    this.homeResumeOnShow = false
    this.forceReloadedPaused = false
    this.originalUrl = ''
    this.resumeAt = 0
    this.currentBranch = null
    this.inBranchVideo = false
    this.selectedOptionCode = ''
    this.selectedIsCorrect = true
    this.setData({
      playing: false,
      videoAutoplay: true,
      videoInitialTime: 0,
      progressPercent: 0,
      speeding: false,
      speedLocked: false,
      speedLockText: '',
      speedMenu: false,
      seeking: false,
      seekText: '',
      highlights: [],
      overlay: { show: false, highlightId: null, title: '', buttons: [], sessionKey: '' },
      branch: { show: false, title: '', options: [] },
      action: { show: false, title: '', label: '', optionCode: '', generationMode: '', generationId: null, resumeTime: null },
      actionVideoActive: false,
      floats: [],
      bigImage: { show: false, src: '', beat: false },
      danmakuTexts: []
    })
  },

  async loadHighlights(episodeId) {
    try {
      const highlights = await episodeApi.getHighlights(episodeId)
      const meta = {}
      ;(highlights || []).forEach((h) => {
        const cfg = h.interactionConfig || {}
        ;(cfg.buttons || []).forEach((b) => {
          meta[b.optionCode] = { icon: getEmotionIcon(b.optionCode, b.icon), label: b.label }
        })
      })
      this.optionMeta = meta
      this.setData({ highlights: highlights || [] })
      this.prefetchUpcomingStories(this.curTime || 0)
    } catch (err) {
      console.error('加载首页高光失败', err)
      this.optionMeta = {}
      this.setData({ highlights: [] })
    }
  },

  onLoadedMeta(e) {
    const duration = Number(e.detail && e.detail.duration) || 0
    if (duration > 0) this.duration = duration
    this.refreshVideoContext()
    this.setVideoPlaybackRate(this.data.playbackRate || 1)
    if (this.curTime > 0) this.seekVideo(this.curTime)
    if (!this.manualPaused && this.data.videoAutoplay) {
      this.playVideo()
      this.setData({ playing: true })
    }
  },

  onPlay() {
    if (this.manualPaused) {
      this.pauseVideo()
      this.setData({ playing: false })
      return
    }
    this.startPlaybackClock()
    this.setData({ playing: true })
  },

  onPause() {
    this.stopPlaybackClock()
    this.setData({ playing: false })
  },

  onTapVideo() {
    if (this.data.useNativeVideoControls) return
    if (this.suppressTapUntil && Date.now() < this.suppressTapUntil) return
    this.toggleVideoPlayback()
  },

  toggleVideoPlayback() {
    if (this.speedGestureActive) return
    this.setData({ speedMenu: false })
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
    if (this.data.useNativeVideoControls) return
    this.suppressTapUntil = Date.now() + 350
    this.toggleVideoPlayback()
  },

  pauseHomeVideoForNavigation() {
    this.homeResumeOnShow = !!(this.homeResumeOnShow || (!this.manualPaused && this.data.videoUrl && (this.data.playing || this.data.videoAutoplay)))
    this.pauseVideo()
    const drama = this.data.currentDrama
    const episode = this.data.currentEpisode
    if (drama && episode && authStore.isLoggedIn()) {
      userStore.saveProgress(drama.dramaId, episode.episodeId, this.curTime || 0)
      this.lastProgressSavedAt = Date.now()
    }
    this.clearSpeedPressTimer()
    this.speedGestureActive = false
    this.wasPlayingBeforeSpeed = false
    this.setData({
      playing: false,
      videoAutoplay: false,
      speeding: false,
      speedLocked: false,
      speedLockText: '',
      speedMenu: false
    })
  },

  resumeHomeVideoAfterNavigation() {
    if (!this.homeResumeOnShow || !this.data.videoUrl) return
    this.homeResumeOnShow = false
    this.manualPaused = false
    this.setData({
      videoAutoplay: true,
      playing: true
    }, () => {
      this.refreshVideoContext()
      if (this.curTime > 0) this.seekVideo(this.curTime, true)
      this.playVideo()
      setTimeout(() => this.playVideo(), 180)
      setTimeout(() => this.playVideo(), 520)
    })
  },

  isTapTouch(e) {
    const touch = (e && e.changedTouches && e.changedTouches[0]) || {}
    const x = touch.clientX != null ? touch.clientX : this.touchStartX
    const y = touch.clientY != null ? touch.clientY : this.touchStartY
    return Math.abs(x - this.touchStartX) < 28 && Math.abs(y - this.touchStartY) < 28
  },

  onTimeUpdate(e) {
    const current = Number(e.detail.currentTime) || 0
    const duration = Number(e.detail.duration) || this.duration || 0
    this.lastTimeUpdateAt = Date.now()
    this.applyPlaybackTime(current, duration)
  },

  applyPlaybackTime(current, duration) {
    this.curTime = current
    this.duration = duration
    const percent = duration > 0 ? (current / duration) * 100 : 0
    const now = Date.now()
    const shouldUpdateProgress = !this.data.useNativeVideoControls
      && !this.data.seeking
      && (now - this.lastProgressUiAt >= PROGRESS_UI_UPDATE_MS || Math.abs(percent - this.lastProgressPercent) >= 1)
    if (shouldUpdateProgress) {
      this.lastProgressUiAt = now
      this.lastProgressPercent = percent
      this.setData({ progressPercent: percent })
    }
    if (authStore.isLoggedIn()) this.saveProgress(current)
    if (!this.inBranchVideo && !this.data.actionVideoActive) this.checkDanmaku(current)
    if (!this.inBranchVideo && !this.data.actionVideoActive && now - this.lastHighlightCheckAt >= HIGHLIGHT_CHECK_INTERVAL_MS) {
      this.lastHighlightCheckAt = now
      this.checkHighlight(current)
    }
  },

  saveProgress(current) {
    if (Date.now() - this.lastProgressSavedAt < 2000) return
    const drama = this.data.currentDrama
    const episode = this.data.currentEpisode
    if (drama && episode) {
      userStore.saveProgress(drama.dramaId, episode.episodeId, current)
      this.lastProgressSavedAt = Date.now()
    }
  },

  onVideoEnded() {
    if (this.inBranchVideo || this.data.actionVideoActive) {
      this.restoreHomeMainVideo()
      return
    }
    this.playRandomDrama()
  },

  onVideoError(e) {
    const detail = e.detail || {}
    const message = formatVideoError(detail)
    console.error('home video error', detail, this.data.videoUrl)
    wx.showModal({
      title: '视频加载失败',
      content: `${message}\n${this.data.videoUrl || ''}`,
      showCancel: false
    })
  },

  onTouchStart(e) {
    if (Date.now() < this.feedTouchBlockedUntil) return
    const touch = e.touches && e.touches[0]
    this.touchStartX = touch ? touch.clientX : 0
    this.touchStartY = touch ? touch.clientY : 0
  },

  onTouchEnd(e) {
    if (Date.now() < this.feedTouchBlockedUntil) return
    if (this.speedGestureActive) return
    const touch = (e.changedTouches && e.changedTouches[0]) || {}
    const delta = touch.clientY - this.touchStartY
    if (Math.abs(delta) < 60) return
    this.playRandomDrama()
  },

  onFeedTouchStart(e) {
    this.onTouchStart(e)
    this.onSpeedTouchStart(e)
  },

  onFeedTouchEnd(e) {
    const wasSpeeding = !!(this.speedGestureActive || this.data.speeding || this.data.speedLocked)
    this.onSpeedEnd(e)
    if (wasSpeeding) return
    if (this.isTapTouch(e)) {
      this.toggleVideoFromTouch()
      return
    }
    this.onTouchEnd(e)
  },

  onFeedTouchCancel(e) {
    this.onSpeedEnd(e)
  },

  clearSpeedPressTimer() {
    if (this.speedPressTimer) {
      clearTimeout(this.speedPressTimer)
      this.speedPressTimer = null
    }
  },

  fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0))
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  },

  clearSeekHideTimer() {
    if (this.seekHideTimer) {
      clearTimeout(this.seekHideTimer)
      this.seekHideTimer = null
    }
  },

  scheduleSeekHide() {
    this.clearSeekHideTimer()
    this.seekHideTimer = setTimeout(() => {
      this.seekHideTimer = null
      this.setData({ seeking: false, seekText: '' })
    }, SEEK_PREVIEW_HIDE_MS)
  },

  getSeekTimeFromEvent(e) {
    const p = (e && e.touches && e.touches[0]) || (e && e.changedTouches && e.changedTouches[0]) || (e && e.detail) || {}
    const x = p.x != null ? p.x : (p.clientX != null ? p.clientX : p.pageX)
    if (x == null || !this.duration || !this.screenW) return null
    const ratio = Math.max(0, Math.min(1, x / this.screenW))
    return ratio * this.duration
  },

  updateSeekPreview(current) {
    const safeCurrent = Math.max(0, Math.min(this.duration || 0, Number(current) || 0))
    const percent = this.duration > 0 ? (safeCurrent / this.duration) * 100 : 0
    this.setData({
      progressPercent: percent,
      seeking: true,
      seekText: `${this.fmtTime(safeCurrent)} / ${this.fmtTime(this.duration)}`
    })
  },

  performSeek(current) {
    if (!this.duration) return
    const target = Math.max(0, Math.min(this.duration, Number(current) || 0))
    this.pendingSeekTime = null
    this.curTime = target
    this.seekVideo(target)
    this.resetHighlightForSeek(target)
  },

  onSeekTouch(e) {
    if (this.data.useNativeVideoControls) return
    this.feedTouchBlockedUntil = Date.now() + 500
    const isTap = e && e.type === 'tap'
    if (!isTap) this.clearSeekHideTimer()
    const current = this.getSeekTimeFromEvent(e)
    if (current == null) return
    this.pendingSeekTime = current
    this.updateSeekPreview(current)
    if (isTap) {
      this.performSeek(current)
      this.scheduleSeekHide()
    }
  },

  onSeekEnd() {
    if (this.data.useNativeVideoControls) return
    this.feedTouchBlockedUntil = Date.now() + 500
    if (this.pendingSeekTime != null) this.performSeek(this.pendingSeekTime)
    this.scheduleSeekHide()
  },

  onSpeedTouchStart(e) {
    const touch = e.touches && e.touches[0]
    this.clearSpeedPressTimer()
    this.touchStartX = touch ? touch.clientX : this.touchStartX
    this.touchStartY = touch ? touch.clientY : this.touchStartY
    this.speedTouchStartY = touch ? touch.clientY : 0
    if (!this.videoCtx || this.data.speeding || this.data.speedLocked) return
    this.speedPressTimer = setTimeout(() => {
      this.speedPressTimer = null
      this.onSpeedStart({ touches: [{ clientX: this.touchStartX, clientY: this.speedTouchStartY }] })
    }, SPEED_HOLD_DELAY_MS)
  },

  onSpeedStart(e) {
    this.clearSpeedPressTimer()
    if (!this.videoCtx) return
    if (this.data.speeding) return
    const touch = e.touches && e.touches[0]
    if (touch) this.speedTouchStartY = touch.clientY
    this.speedGestureActive = true
    this.feedTouchBlockedUntil = Date.now() + 900
    this.wasPlayingBeforeSpeed = !!this.data.playing
    this.manualPaused = false
    this.setVideoPlaybackRate(2)
    this.playVideo()
    this.setData({
      speeding: true,
      speedMenu: false,
      speedLockText: this.data.speedLocked ? '2倍速已锁定' : '2倍速'
    })
  },

  onSpeedMove(e) {
    const touch = e.touches && e.touches[0]
    if (!touch) return
    const delta = touch.clientY - this.speedTouchStartY
    if (!this.data.speeding && !this.data.speedLocked) {
      if (Math.abs(delta) > 28) this.clearSpeedPressTimer()
      return
    }
    if (delta > SPEED_LOCK_THRESHOLD && !this.data.speedLocked) {
      this.feedTouchBlockedUntil = Date.now() + 900
      this.setData({ speedLocked: true, speeding: true, speedLockText: '2倍速已锁定' })
      this.setVideoPlaybackRate(2)
      this.playVideo()
    } else if (delta < -SPEED_LOCK_THRESHOLD && this.data.speedLocked) {
      this.unlockSpeed()
    }
  },

  onSpeedEnd() {
    this.clearSpeedPressTimer()
    if (!this.data.speeding && !this.data.speedLocked) return
    this.feedTouchBlockedUntil = Date.now() + 900
    if (this.data.speedLocked) {
      this.speedGestureActive = false
      return
    }
    this.restoreSpeedAfterGesture()
  },

  restoreSpeedAfterGesture() {
    if (!this.videoCtx) return
    this.setVideoPlaybackRate(this.data.playbackRate || 1)
    if (!this.wasPlayingBeforeSpeed) {
      this.manualPaused = true
      this.pauseVideo()
      this.setData({ playing: false })
    }
    this.speedGestureActive = false
    this.setData({ speeding: false, speedLocked: false, speedLockText: '' })
  },

  unlockSpeed() {
    if (!this.videoCtx) return
    this.setVideoPlaybackRate(this.data.playbackRate || 1)
    if (!this.wasPlayingBeforeSpeed) {
      this.manualPaused = true
      this.pauseVideo()
      this.setData({ playing: false })
    }
    this.feedTouchBlockedUntil = Date.now() + 900
    this.speedGestureActive = false
    this.setData({ speeding: false, speedLocked: false, speedLockText: '' })
  },

  toggleSpeedMenu() {
    this.setData({ speedMenu: !this.data.speedMenu })
  },

  setPlaybackRate(e) {
    const rate = Number(e.currentTarget.dataset.rate) || 1
    this.setVideoPlaybackRate(rate)
    this.setData({ playbackRate: rate, speedMenu: false, speeding: false, speedLocked: false, speedLockText: '' })
  },

  openDanmakuInput() {
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
    const episode = this.data.currentEpisode
    const drama = this.data.currentDrama
    if (!episode || !episode.episodeId) return
    try {
      const item = await danmakuApi.postDanmaku(episode.episodeId, {
        dramaId: drama && drama.dramaId,
        currentTime: this.curTime || 0,
        content: text,
        clientDanmakuId: `${Date.now()}_${Math.random().toString(16).slice(2)}`
      })
      this.addRemoteDanmaku(item)
    } catch (e) {
      console.error('发送弹幕失败', e)
    }
  },

  onTapSearch() {
    if (!authStore.requireLogin('登录后可以搜索和进入剧场')) return
    this.rememberSearchOrigin()
    this.pauseHomeVideoForNavigation()
    wx.switchTab({ url: '/pages/index/index' })
  },

  onTapTitle() {
    const drama = this.data.currentDrama
    const episode = this.data.currentEpisode
    if (!drama || !episode) return
    if (!authStore.requireLogin('登录后可以继续观看完整短剧')) return
    userStore.saveProgress(drama.dramaId, episode.episodeId, this.curTime)
    wx.navigateTo({
      url: `/pages/play/index?episodeId=${episode.episodeId}&dramaId=${drama.dramaId}&startAt=${Math.floor(this.curTime || 0)}`
    })
  },

  onTapTag(e) {
    const tag = e.currentTarget.dataset.tag
    if (!tag) return
    if (!authStore.requireLogin('登录后可以搜索短剧')) return
    this.rememberSearchOrigin()
    wx.setStorageSync('svimvp_theater_search_keyword', tag)
    this.pauseHomeVideoForNavigation()
    wx.switchTab({ url: '/pages/index/index' })
  },

  onToggleDescription() {
    this.setData({ descExpanded: !this.data.descExpanded })
  },

  async refreshSocial() {
    const drama = this.data.currentDrama
    if (!drama) return
    this.setData({ social: await userStore.getDramaSocial(drama.dramaId) })
  },

  syncTabBar(selected) {
    if (typeof this.getTabBar !== 'function') return
    const tabBar = this.getTabBar()
    if (tabBar) tabBar.setData({ selected })
  },

  async onTapLike() {
    const drama = this.data.currentDrama
    if (!drama) return
    if (!authStore.requireLogin('登录后可以点赞短剧')) return
    try {
      this.setData({ social: await userStore.toggleLike(drama) })
    } catch (err) {
      wx.showToast({ title: '点赞失败', icon: 'none' })
    }
  },

  async onTapFavorite() {
    const drama = this.data.currentDrama
    if (!drama) return
    if (!authStore.requireLogin('登录后可以收藏短剧')) return
    try {
      this.setData({ social: await userStore.toggleFavorite(drama) })
    } catch (err) {
      wx.showToast({ title: '收藏失败', icon: 'none' })
    }
  },

  async openComments() {
    const drama = this.data.currentDrama
    if (!drama) return
    if (!authStore.requireLogin('登录后可以评论短剧')) return
    this.setData({
      commentPanel: {
        show: true,
        list: formatLocalComments(await userStore.getComments(drama.dramaId)),
        input: ''
      }
    })
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
    this.closeComments()
    this.pauseHomeVideoForNavigation()
    wx.switchTab({ url: '/pages/index/index' })
  },

  rememberSearchOrigin() {
    wx.setStorageSync('svimvp_theater_search_origin', { type: 'home' })
  },

  onCommentInput(e) {
    this.setData({ 'commentPanel.input': e.detail.value })
  },

  async sendComment() {
    const drama = this.data.currentDrama
    if (!drama) return
    try {
      const comments = await userStore.addComment(drama.dramaId, this.data.commentPanel.input)
      this.setData({
        commentPanel: {
          show: true,
          list: formatLocalComments(comments),
          input: ''
        },
        social: await userStore.getDramaSocial(drama.dramaId)
      })
    } catch (err) {
      wx.showToast({ title: err.message || '评论失败', icon: 'none' })
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

  checkHighlight(cur) {
    const current = Number(cur) || 0
    this.prefetchUpcomingStories(current)
    const active = this.findActiveEmotionHighlight(current)
    if (active) {
      const id = String(active.highlightId)
      const currentOverlayId = this.data.overlay.highlightId == null ? '' : String(this.data.overlay.highlightId)
      if (!this.data.overlay.show || currentOverlayId !== id) {
        this.showOverlay(active)
      }
      this.shownMap[id] = true
    } else if (this.data.overlay.show) {
      this.hideOverlay()
    }

    const interactive = (this.data.highlights || []).find((h) => {
      const cfg = h.interactionConfig || {}
      const type = cfg.componentType
      return (type === 'branch_choice' || type === 'action_button') && this.isHighlightActive(h, current)
    })
    if (!interactive) return
    const id = String(interactive.highlightId)
    if (this.shownMap[id]) return
    const cfg = interactive.interactionConfig || {}
    if (cfg.componentType === 'branch_choice') {
      this.shownMap[id] = true
      this.openBranch(interactive)
    } else if (cfg.componentType === 'action_button') {
      this.shownMap[id] = true
      this.openAction(interactive)
    }
  },

  findActiveEmotionHighlight(current) {
    return (this.data.highlights || []).find((h) => {
      const cfg = h.interactionConfig || {}
      return cfg.componentType === 'emotion_button' && this.isHighlightActive(h, current)
    })
  },

  resetHighlightForSeek(current) {
    const active = this.findActiveEmotionHighlight(current)
    if (!active) return
    const id = String(active.highlightId)
    delete this.shownMap[id]
    this.flushHighlightStatDanmaku(this.data.overlay)
    this.activeHighlightSessionKey = ''
    this.setData({ overlay: { show: false, highlightId: null, title: '', buttons: [], sessionKey: '' } })
  },

  isHighlightActive(h, cur) {
    const start = Number(h.startTime)
    const end = Number(h.endTime)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false
    return cur >= start && cur <= end
  },

  openBranch(h) {
    const pauseForInteraction = !this.data.useNativeVideoControls
    if (pauseForInteraction) this.pauseVideo()
    this.prefetchStoriesForHighlight(h)
    this.prefetchStoryVideosForHighlight(h)
    const cfg = h.interactionConfig || {}
    const options = (cfg.options || []).map((o) => ({
      branchOutcome: o.branchOutcome || (o.isCorrect === false ? 'TRIAL' : 'MAINLINE'),
      optionCode: o.optionCode,
      label: o.label,
      generationMode: o.generationMode || (o.branchOutcome === 'MAINLINE' ? 'MAINLINE' : 'PREGEN'),
      generationId: o.generationId || null,
      resumeTime: o.resumeTime != null ? o.resumeTime : null,
      isCorrect: o.branchOutcome ? o.branchOutcome === 'MAINLINE' : o.isCorrect !== false
    }))
    this.originalUrl = this.data.videoUrl
    this.resumeAt = cfg.resumeTime != null ? Number(cfg.resumeTime) : Number(h.endTime) || this.curTime
    this.currentBranch = h
    this.hideOverlay()
    this.setData({
      playing: pauseForInteraction ? false : this.data.playing,
      speedMenu: false,
      branch: { show: true, title: h.title || '选择剧情走向', options }
    })
  },

  async onTapBranch(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const opt = this.data.branch.options[idx]
    if (!opt) return
    if (opt.resumeTime != null) this.resumeAt = Number(opt.resumeTime)
    this.selectedOptionCode = opt.optionCode
    this.selectedIsCorrect = opt.isCorrect !== false
    this.setData({ 'branch.show': false })
    if (opt.branchOutcome === 'MAINLINE' || opt.generationMode === 'MAINLINE') {
      this.playVideo()
      this.setData({ playing: true })
      return
    }
    await this.playGeneratedStory(opt.generationId, {
      episodeId: this.data.currentEpisode && this.data.currentEpisode.episodeId,
      highlightId: this.currentBranch ? this.currentBranch.highlightId : null,
      optionCode: opt.optionCode
    }, 'branch')
  },

  openAction(h) {
    const pauseForInteraction = !this.data.useNativeVideoControls
    if (pauseForInteraction) this.pauseVideo()
    this.prefetchStoriesForHighlight(h)
    this.prefetchStoryVideosForHighlight(h)
    const cfg = h.interactionConfig || {}
    this.originalUrl = this.data.videoUrl
    this.resumeAt = cfg.resumeTime != null ? Number(cfg.resumeTime) : Number(h.endTime) || this.curTime
    this.hideOverlay()
    this.setData({
      playing: pauseForInteraction ? false : this.data.playing,
      speedMenu: false,
      action: {
        show: true,
        highlightId: h.highlightId,
        title: h.title || '动作互动',
        label: cfg.label || cfg.actionLabel || cfg.userAction || '助力',
        optionCode: cfg.optionCode || 'action_boost',
        generationMode: cfg.generationMode || 'PREGEN',
        generationId: cfg.generationId || null,
        resumeTime: cfg.resumeTime != null ? Number(cfg.resumeTime) : this.resumeAt
      }
    })
  },

  async onTapAction() {
    const action = this.data.action || {}
    this.setData({ 'action.show': false, actionVideoActive: true })
    await this.playGeneratedStory(action.generationId, {
      episodeId: this.data.currentEpisode && this.data.currentEpisode.episodeId,
      highlightId: action.highlightId || null,
      optionCode: action.optionCode
    }, 'action')
  },

  async playGeneratedStory(generationId, payload, source) {
    wx.showLoading({ title: '加载中...', mask: true })
    try {
      let story = generationId ? await this.getStoryWithCache(generationId) : await aiApi.generateStory(payload)
      story = await storyVideoCache.withPlayableVideoUrl(story, 900)
      const contentUrl = String((story && story.contentUrl) || '').trim()
      if (story && story.contentType === 'VIDEO' && contentUrl) {
        this.manualPaused = false
        this.inBranchVideo = source === 'branch'
        this.curTime = 0
        this.duration = 0
        this.setData({
          videoUrl: contentUrl,
          videoInitialTime: 0,
          videoAutoplay: true,
          playing: true,
          progressPercent: 0,
          actionVideoActive: source === 'action'
        }, () => {
          this.refreshVideoContext()
          setTimeout(() => this.playVideo(), 160)
          setTimeout(() => this.playVideo(), 520)
        })
        return
      }
      const text = String((story && (story.title || story.content)) || '').trim()
      if (text) this.spawnDanmakuText(text, { kind: 'highlight', top: 170 })
      this.setData({ actionVideoActive: false })
      this.playVideo()
    } catch (err) {
      console.error('首页互动内容加载失败', err)
      this.setData({ actionVideoActive: false })
      this.playVideo()
    } finally {
      wx.hideLoading()
    }
  },

  restoreHomeMainVideo() {
    const url = this.originalUrl || this.data.videoUrl
    const resumeAt = Number(this.resumeAt) || this.curTime || 0
    this.inBranchVideo = false
    this.originalUrl = ''
    this.resumeAt = 0
    this.curTime = resumeAt
    this.setData({
      videoUrl: url,
      actionVideoActive: false,
      action: { show: false, title: '', label: '', optionCode: '', generationMode: '', generationId: null, resumeTime: null },
      progressPercent: this.duration > 0 ? (resumeAt / this.duration) * 100 : 0
    })
  },

  showOverlay(h) {
    const cfg = h.interactionConfig || {}
    const sessionKey = `${h.highlightId}_${Date.now()}_${++this.highlightSessionSeq}`
    this.activeHighlightSessionKey = sessionKey
    highlightStats.reset(h.highlightId, sessionKey)
    const buttons = (cfg.buttons || []).map((b) => ({
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

  hideOverlay() {
    this.flushHighlightStatDanmaku(this.data.overlay)
    this.setData({ overlay: { show: false, highlightId: null, title: '', buttons: [], sessionKey: '' } })
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

  async onTapEmotion(e) {
    if (!authStore.requireLogin('登录后可以点击高光弹幕')) return
    const optionCode = e.currentTarget.dataset.optionCode
    const highlightId = this.data.overlay.highlightId
    const episode = this.data.currentEpisode
    const drama = this.data.currentDrama
    if (highlightId == null || !optionCode) return
    const tapKey = `${highlightId}:${optionCode}`
    const now = Date.now()
    if (this.lastEmotionTapKey === tapKey && now - (this.lastEmotionTapAt || 0) < 280) return
    this.lastEmotionTapKey = tapKey
    this.lastEmotionTapAt = now
    const idx = this.data.overlay.buttons.findIndex((b) => b.optionCode === optionCode)
    if (idx < 0) return
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
        dramaId: drama && drama.dramaId,
        episodeId: episode && episode.episodeId,
        highlightId,
        interactionType: 'click',
        optionCode
      })
      this.queueHighlightStatDanmaku(overlaySnapshot, remote)
    } catch (err) {
      console.error('上报高光互动失败', err)
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

  spawnBurst(optionCode) {
    const meta = this.optionMeta[optionCode]
    if (!meta) return
    const now = Date.now()
    const items = []
    for (let i = 0; i < 8; i++) {
      items.push({
        id: `${now}_${optionCode}_${i}_${Math.floor(Math.random() * 1000)}`,
        icon: meta.icon,
        left: 120 + Math.floor(Math.random() * 420),
        riseY: 620 + Math.floor(Math.random() * 520),
        driftX: Math.floor(Math.random() * 220) - 110,
        size: 44 + Math.floor(Math.random() * 34),
        rise: false
      })
    }
    const ids = items.map((item) => item.id)
    this.setData({ floats: this.data.floats.concat(items) })
    setTimeout(() => {
      this.setData({
        floats: this.data.floats.map((item) => ids.indexOf(item.id) >= 0 ? Object.assign({}, item, { rise: true }) : item)
      })
    }, 50)
    setTimeout(() => {
      this.setData({ floats: this.data.floats.filter((item) => ids.indexOf(item.id) < 0) })
    }, 2700)
  },

  showBigImage(optionCode) {
    const src = getBigImage(optionCode)
    if (!src) return
    this.setData({ bigImage: { show: true, src, beat: true } })
    if (!this.bigBeatTimer) {
      this.bigBeatTimer = setInterval(() => {
        this.setData({ 'bigImage.beat': !this.data.bigImage.beat })
      }, 350)
    }
    if (this.bigImgTimer) clearTimeout(this.bigImgTimer)
    this.bigImgTimer = setTimeout(() => {
      if (this.bigBeatTimer) {
        clearInterval(this.bigBeatTimer)
        this.bigBeatTimer = null
      }
      this.setData({ 'bigImage.show': false })
    }, 1800)
  },

  checkDanmaku(cur) {
    const drama = this.data.currentDrama
    const episode = this.data.currentEpisode
    const episodeNo = Number(episode && episode.episodeNo) || 0
    if (!drama || !drama.title || !episodeNo) return
    const sec = Math.max(0, Math.floor(Number(cur) || 0))
    const key = `${drama.title}:${episodeNo}:${sec}`
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
  }
})

function normalizeDramas(dramas) {
  return (dramas || []).map((item) => {
    const descriptionState = createDescriptionState(item.description)
    return Object.assign({}, item, {
      tags: userStore.normalizeTags(item.tags),
      descriptionBrief: descriptionState.brief,
      descriptionCollapsedText: descriptionState.collapsedText,
      descriptionClipped: descriptionState.clipped
    })
  })
}

function createDescriptionState(text) {
  const value = String(text || '').trim()
  const limit = 20
  const clipped = value.length > limit
  const brief = clipped ? value.slice(0, limit) : value
  return {
    brief,
    collapsedText: clipped ? `${brief}...` : brief,
    clipped
  }
}

function formatLocalComments(list) {
  return (list || []).map((item, index) => {
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
  const time = typeof value === 'number' ? value : new Date(value || 0).getTime()
  if (!Number.isFinite(time)) return '刚刚'
  const diff = Date.now() - time
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / 60000))}分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / 3600000))}小时前`
  if (diff < 48 * 60 * 60 * 1000) return '1天前'
  const date = new Date(time)
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
