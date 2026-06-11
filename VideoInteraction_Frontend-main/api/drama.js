// drama.js: 剧集相关 API
const { request } = require('./request')

// 获取短剧列表
function listDramas() {
  return request({ url: '/dramas' })
}

// 获取短剧详情（含集数列表）
function getDramaDetail(dramaId) {
  return request({ url: `/dramas/${dramaId}` })
}

module.exports = { listDramas, getDramaDetail }
