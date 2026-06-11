const authApi = require('../api/auth')
const socialApi = require('../api/social')

const LEGACY_DATA_KEY = 'svimvp_user_data'
const TOKEN_KEY = 'svimvp_auth_token'
const CURRENT_USER_KEY = 'svimvp_current_user'
const MIGRATED_KEY_PREFIX = 'svimvp_migrated_'
let pageLoginPrompting = false

function sanitizeName(name) {
  return String(name || '').trim()
}

function getCurrentUser() {
  const current = wx.getStorageSync(CURRENT_USER_KEY)
  if (!current || !current.username) return null
  return {
    userId: current.userId,
    username: current.username,
    createdAt: current.createdAt
  }
}

function isLoggedIn() {
  return !!(wx.getStorageSync(TOKEN_KEY) && getCurrentUser())
}

function listUsers() {
  const current = getCurrentUser()
  return current ? [current] : []
}

async function register(username, password) {
  const name = sanitizeName(username)
  const pwd = String(password || '')
  if (!name) throw new Error('请输入用户名')
  if (!pwd) throw new Error('请输入密码')
  const auth = await authApi.register(name, pwd)
  persistAuth(auth)
  await migrateLocalUserData(name)
  return getCurrentUser()
}

async function login(username, password) {
  const name = sanitizeName(username)
  const pwd = String(password || '')
  const auth = await authApi.login(name, pwd)
  persistAuth(auth)
  await migrateLocalUserData(name)
  return getCurrentUser()
}

async function logout() {
  try {
    if (wx.getStorageSync(TOKEN_KEY)) await authApi.logout()
  } catch (e) {
    console.warn('远端退出失败，本地仍清除登录态', e)
  }
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(CURRENT_USER_KEY)
}

function switchUser() {
  throw new Error('跨设备账号请重新登录')
}

function requireLogin(message) {
  if (isLoggedIn()) return true
  wx.showModal({
    title: '需要登录',
    content: message || '请先登录或注册账号',
    confirmText: '去登录',
    cancelText: '先看看',
    success: (res) => {
      if (res.confirm) {
        wx.switchTab({
          url: '/pages/mine/index',
          fail: () => wx.navigateTo({ url: '/pages/mine/index' })
        })
      }
    }
  })
  return false
}

function requirePageLogin(message) {
  if (isLoggedIn()) return true
  if (pageLoginPrompting) return false
  pageLoginPrompting = true
  wx.showModal({
    title: '需要登录',
    content: message || '请先登录或注册账号',
    confirmText: '去登录',
    cancelText: '返回首页',
    success: (res) => {
      wx.switchTab({
        url: res.confirm ? '/pages/mine/index' : '/pages/home/index'
      })
    },
    complete: () => {
      pageLoginPrompting = false
    }
  })
  return false
}

function persistAuth(auth) {
  if (!auth || !auth.token || !auth.user) throw new Error('登录响应无效')
  wx.setStorageSync(TOKEN_KEY, auth.token)
  wx.setStorageSync(CURRENT_USER_KEY, auth.user)
}

async function migrateLocalUserData(username) {
  const migratedKey = `${MIGRATED_KEY_PREFIX}${username}`
  if (wx.getStorageSync(migratedKey)) return
  const payload = buildMigrationPayload(username)
  if (!payload) {
    wx.setStorageSync(migratedKey, true)
    return
  }
  try {
    await socialApi.migrateLocalSocial(payload)
    wx.setStorageSync(migratedKey, true)
  } catch (e) {
    console.warn('本机旧数据迁移失败，下次登录会重试', e)
  }
}

function buildMigrationPayload(username) {
  const all = wx.getStorageSync(LEGACY_DATA_KEY)
  const data = all && typeof all === 'object' ? all[username] : null
  if (!data) return null
  const likedDramaIds = Object.keys(data.likedDramas || {}).map(Number).filter(Boolean)
  const favoriteDramaIds = Object.keys(data.favoriteDramas || {}).map(Number).filter(Boolean)
  const comments = []
  Object.keys(data.comments || {}).forEach((dramaId) => {
    const list = data.comments[dramaId]
    if (!Array.isArray(list)) return
    list.forEach((item, index) => {
      const content = String((item && item.content) || '').trim()
      if (!content) return
      comments.push({
        dramaId: Number(dramaId),
        clientCommentId: String((item && item.commentId) || `${dramaId}_${item && item.createdAt}_${index}`),
        content,
        createdAt: Number(item && item.createdAt) || Date.now()
      })
    })
  })
  if (!likedDramaIds.length && !favoriteDramaIds.length && !comments.length) return null
  return { likedDramaIds, favoriteDramaIds, comments }
}

module.exports = {
  getCurrentUser,
  isLoggedIn,
  listUsers,
  login,
  logout,
  register,
  requireLogin,
  requirePageLogin,
  switchUser
}
