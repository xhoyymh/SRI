// request.js: HTTP 请求封装
// 注入 BASE_URL + 自动携带 deviceId
// 拆解 {code, message, data} 统一响应
const { BASE_URL, USE_MOCK } = require('../utils/config')
const { getDeviceId } = require('../utils/device')
const { handleMock } = require('../utils/mock')

const TOKEN_KEY = 'svimvp_auth_token'

function request(options) {
  const { url, method = 'GET', data = {} } = options
  const deviceId = getDeviceId()

  // 使用本地 Mock（后端未就绪时）
  if (USE_MOCK) {
    return handleMock({ url, method, data: { ...data, deviceId } })
  }

  // 真实请求
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync(TOKEN_KEY)
    const header = { 'content-type': 'application/json' }
    if (token) header.Authorization = `Bearer ${token}`
    wx.request({
      url: BASE_URL + url,
      method,
      data: { ...data, deviceId },
      header,
      success(res) {
        const body = res.data || {}
        if (body.code === 0) {
          resolve(body.data)
        } else {
          wx.showToast({ title: body.message || '请求失败', icon: 'none' })
          reject(body)
        }
      },
      fail(err) {
        wx.showToast({ title: '网络请求失败', icon: 'none' })
        reject(err)
      }
    })
  })
}

module.exports = { request }
