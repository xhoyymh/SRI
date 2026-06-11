// interaction.js: 互动上报 API
const { request } = require('./request')

// 上报一次互动点击，返回该选项最新计数（§4.5）
// params: { episodeId, highlightId, interactionType:'click', optionCode, content? }
function createInteraction(params) {
  return request({ url: '/interactions', method: 'POST', data: params })
}

function getHighlightStats(highlightId) {
  return request({ url: `/highlights/${highlightId}/stats` })
}

module.exports = { createInteraction, getHighlightStats }
