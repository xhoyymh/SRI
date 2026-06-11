// device.js: 设备标识管理
// deviceId 首次生成并持久化，每个请求都要携带
function getDeviceId() {
  let id = wx.getStorageSync('deviceId')
  if (!id) {
    // 生成唯一设备标识：时间戳 + 随机字符串
    id = 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    wx.setStorageSync('deviceId', id)
  }
  return id
}

module.exports = { getDeviceId }
