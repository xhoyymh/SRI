const authStore = require('../../utils/auth-store')
const userStore = require('../../utils/user-store')
const dramaApi = require('../../api/drama')

Page({
  data: {
    currentUser: null,
    users: [],
    username: '',
    password: '',
    activeTab: 'liked',
    liked: [],
    favorites: []
  },

  onShow() {
    this.syncTabBar(2)
    this.refresh()
  },

  syncTabBar(selected) {
    if (typeof this.getTabBar !== 'function') return
    const tabBar = this.getTabBar()
    if (tabBar) tabBar.setData({ selected })
  },

  async refresh() {
    const currentUser = authStore.getCurrentUser()
    this.setData({
      currentUser,
      users: authStore.listUsers(),
      liked: [],
      favorites: []
    })
    if (!currentUser) return
    const liked = await userStore.listLiked()
    const favorites = await userStore.listFavorites()
    this.setData({ liked, favorites })
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
  },

  async onLogin() {
    try {
      await authStore.login(this.data.username, this.data.password)
      this.setData({ password: '' })
      await this.refresh()
      wx.showToast({ title: '已登录', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '登录失败', icon: 'none' })
    }
  },

  async onRegister() {
    try {
      await authStore.register(this.data.username, this.data.password)
      this.setData({ password: '' })
      await this.refresh()
      wx.showToast({ title: '注册并登录成功', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '注册失败', icon: 'none' })
    }
  },

  onSwitchUser(e) {
    try {
      authStore.switchUser(e.currentTarget.dataset.username)
      this.refresh()
      wx.showToast({ title: '已切换账号', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '切换失败', icon: 'none' })
    }
  },

  async onLogout() {
    await authStore.logout()
    await this.refresh()
  },

  onTapUpload() {
    if (!authStore.requireLogin('登录后可以上传短剧')) return
    wx.navigateTo({ url: '/pages/upload/index' })
  },

  onTapRag() {
    if (!authStore.requireLogin('登录后可以调用 RAG')) return
    wx.navigateTo({ url: '/pages/rag/index' })
  },

  onSelectTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab })
  },

  async onTapDrama(e) {
    const dramaId = Number(e.currentTarget.dataset.id)
    if (!dramaId) return
    try {
      const detail = await dramaApi.getDramaDetail(dramaId)
      const episodes = detail.episodes || []
      const progress = userStore.getProgress(dramaId)
      const target = progress
        ? episodes.find((item) => Number(item.episodeId) === Number(progress.episodeId)) || episodes[0]
        : episodes[0]
      if (!target) {
        wx.showToast({ title: '暂无可播放剧集', icon: 'none' })
        return
      }
      const startAt = progress && Number(progress.episodeId) === Number(target.episodeId) ? Number(progress.currentTime) || 0 : 0
      wx.navigateTo({ url: `/pages/play/index?episodeId=${target.episodeId}&dramaId=${dramaId}&startAt=${Math.floor(startAt)}` })
    } catch (err) {
      wx.showToast({ title: '打开短剧失败', icon: 'none' })
    }
  }
})
