const dramaApi = require('../../api/drama')
const authStore = require('../../utils/auth-store')
const userStore = require('../../utils/user-store')

Page({
  data: {
    dramas: [],
    filteredDramas: [],
    categories: [],
    selectedCategory: '',
    keyword: '',
    loading: false,
    emptyText: '',
    searchHistory: [],
    guessDramas: [],
    rankedDramas: []
  },

  onLoad() {
    this.loadSearchHistory()
    this.loadDramas()
  },

  onShow() {
    this.syncTabBar(1)
    if (!authStore.isLoggedIn()) {
      wx.showModal({
        title: '需要登录',
        content: '登录后可以进入剧场搜索和按分类找短剧',
        confirmText: '去登录',
        cancelText: '返回首页',
        success: (res) => {
          wx.switchTab({ url: res.confirm ? '/pages/mine/index' : '/pages/home/index' })
        }
      })
      return
    }
    const pendingKeyword = String(wx.getStorageSync('svimvp_theater_search_keyword') || '').trim()
    if (pendingKeyword) {
      wx.removeStorageSync('svimvp_theater_search_keyword')
      this.setData({ keyword: pendingKeyword, selectedCategory: '' }, () => {
        this.saveSearchKeyword(pendingKeyword)
        this.loadDramas()
      })
      return
    }
    const tag = wx.getStorageSync('svimvp_theater_filter')
    if (tag) {
      wx.removeStorageSync('svimvp_theater_filter')
      this.setData({ selectedCategory: tag }, () => this.applyFilters())
    } else {
      this.loadDramas()
    }
  },

  syncTabBar(selected) {
    if (typeof this.getTabBar !== 'function') return
    const tabBar = this.getTabBar()
    if (tabBar) tabBar.setData({ selected })
  },

  async loadDramas() {
    this.setData({ loading: true })
    try {
      const dramas = (await dramaApi.listDramas() || []).map(normalizeDrama)
      const categories = buildCategories(dramas)
      this.setData({
        dramas,
        categories,
        guessDramas: pickGuessDramas(dramas),
        rankedDramas: dramas.slice()
      }, () => this.applyFilters())
    } catch (err) {
      console.error('加载剧场失败', err)
      wx.showToast({ title: '加载剧场失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value }, () => this.applyFilters())
  },

  onSearchConfirm() {
    const keyword = String(this.data.keyword || '').trim()
    if (!keyword) return
    this.saveSearchKeyword(keyword)
    this.applyFilters()
  },

  onTapHistory(e) {
    const keyword = e.currentTarget.dataset.keyword || ''
    this.setData({ keyword }, () => this.onSearchConfirm())
  },

  onClearHistory() {
    wx.removeStorageSync('svimvp_search_history')
    this.setData({ searchHistory: [] })
  },

  onBackHome() {
    const origin = wx.getStorageSync('svimvp_theater_search_origin') || null
    wx.removeStorageSync('svimvp_theater_search_origin')
    if (origin && origin.type === 'play' && origin.episodeId && origin.dramaId) {
      const startAt = Math.max(0, Math.floor(Number(origin.startAt) || 0))
      wx.navigateTo({
        url: `/pages/play/index?episodeId=${origin.episodeId}&dramaId=${origin.dramaId}&startAt=${startAt}`
      })
      return
    }
    if (origin && origin.type === 'mine') {
      wx.switchTab({ url: '/pages/mine/index' })
      return
    }
    wx.switchTab({ url: '/pages/home/index' })
  },

  onRefreshGuess() {
    this.setData({ guessDramas: pickGuessDramas(this.data.dramas || []) })
  },

  onTapCategory(e) {
    const category = e.currentTarget.dataset.category || ''
    this.setData({ selectedCategory: category }, () => this.applyFilters())
  },

  onTapQuickAction(e) {
    const type = e.currentTarget.dataset.type
    if (type === 'category' && this.data.categories.length) {
      this.setData({ selectedCategory: this.data.categories[0] }, () => this.applyFilters())
    } else if (type === 'new') {
      this.onRefreshGuess()
    } else if (type === 'rank') {
      this.setData({ keyword: '', selectedCategory: '' }, () => this.applyFilters())
    } else {
      wx.showToast({ title: '功能测试中', icon: 'none' })
    }
  },

  applyFilters() {
    const keyword = String(this.data.keyword || '').trim().toLowerCase()
    const category = this.data.selectedCategory
    const filtered = (this.data.dramas || []).filter((item) => {
      const matchCategory = !category || (item.tags || []).indexOf(category) >= 0
      const title = String(item.title || '').toLowerCase()
      const description = String(item.description || '').toLowerCase()
      const tags = (item.tags || []).join(' ').toLowerCase()
      const matchKeyword = !keyword || title.indexOf(keyword) >= 0 || description.indexOf(keyword) >= 0 || tags.indexOf(keyword) >= 0
      return matchCategory && matchKeyword
    })
    const emptyText = keyword && filtered.length === 0 ? '抱歉该短剧暂未收录' : '暂无短剧'
    this.setData({ filteredDramas: filtered, emptyText })
  },

  loadSearchHistory() {
    const history = wx.getStorageSync('svimvp_search_history')
    this.setData({ searchHistory: Array.isArray(history) ? history : [] })
  },

  saveSearchKeyword(keyword) {
    const next = [keyword].concat(this.data.searchHistory.filter((item) => item !== keyword)).slice(0, 6)
    wx.setStorageSync('svimvp_search_history', next)
    this.setData({ searchHistory: next })
  },

  async onTapDrama(e) {
    if (!authStore.requireLogin('登录后可以观看完整短剧')) return
    const dramaId = Number(e.currentTarget.dataset.id)
    try {
      const detail = await dramaApi.getDramaDetail(dramaId)
      const episodes = (detail.episodes || []).slice().sort((a, b) => (Number(a.episodeNo) || 0) - (Number(b.episodeNo) || 0))
      const progress = userStore.getProgress(dramaId)
      const target = episodes.find((item) => progress && Number(item.episodeId) === Number(progress.episodeId)) || episodes[0]
      if (!target) {
        wx.showToast({ title: '暂无剧集', icon: 'none' })
        return
      }
      const startAt = progress && Number(progress.episodeId) === Number(target.episodeId) ? Math.floor(Number(progress.currentTime) || 0) : 0
      wx.navigateTo({ url: `/pages/play/index?episodeId=${target.episodeId}&dramaId=${dramaId}&startAt=${startAt}` })
    } catch (err) {
      console.error('打开短剧失败', err)
      wx.showToast({ title: '打开短剧失败', icon: 'none' })
    }
  }
})

function normalizeDrama(item) {
  return Object.assign({}, item, {
    tags: userStore.normalizeTags(item.tags)
  })
}

function buildCategories(dramas) {
  const set = {}
  ;(dramas || []).forEach((item) => {
    ;(item.tags || []).forEach((tag) => {
      set[tag] = true
    })
  })
  return Object.keys(set).sort()
}

function pickGuessDramas(dramas) {
  const list = (dramas || []).slice()
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = list[i]
    list[i] = list[j]
    list[j] = tmp
  }
  return list.slice(0, 3)
}
