// episode.js: 剧集详情 API
const { request } = require('./request')

// 获取剧集信息
function getEpisode(episodeId) {
  return request({ url: `/episodes/${episodeId}` })
}

// 获取高光时刻列表
function getHighlights(episodeId) {
  return request({ url: `/episodes/${episodeId}/highlights` })
}

// 获取互动统计数据（轮询用）
function getInteractionStats(episodeId) {
  return request({ url: `/episodes/${episodeId}/interaction-stats` })
}

module.exports = { getEpisode, getHighlights, getInteractionStats }
