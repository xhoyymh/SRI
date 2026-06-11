Component({
  data: {
    selected: 0,
    list: [
      { pagePath: 'pages/home/index', text: '首页' },
      { pagePath: 'pages/index/index', text: '剧场' },
      { pagePath: 'pages/mine/index', text: '我的' }
    ]
  },

  lifetimes: {
    attached() {
      this.updateSelected()
    }
  },

  pageLifetimes: {
    show() {
      this.updateSelected()
    }
  },

  methods: {
    updateSelected() {
      const pages = getCurrentPages()
      const route = pages.length ? pages[pages.length - 1].route : ''
      const selected = this.data.list.findIndex((item) => item.pagePath === route)
      if (selected >= 0 && selected !== this.data.selected) this.setData({ selected })
    },

    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index)
      const item = this.data.list[index]
      if (!item) return
      const pages = getCurrentPages()
      const currentPage = pages.length ? pages[pages.length - 1] : null
      if (currentPage && currentPage.route === 'pages/home/index' && item.pagePath !== 'pages/home/index' && typeof currentPage.pauseHomeVideoForNavigation === 'function') {
        currentPage.pauseHomeVideoForNavigation()
      }
      if (index !== this.data.selected) this.setData({ selected: index })
      wx.switchTab({ url: `/${item.pagePath}` })
    }
  }
})
