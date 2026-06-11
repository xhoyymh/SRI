// ai.js: AI 生成剧情 / 点赞 / 评论 API（§4.8-4.11）
const { request } = require('./request')

// PREGEN：按 generationId 取已生成内容
function getStory(generationId) {
  return request({ url: `/ai/story/${generationId}` })
}

// ONDEMAND：实时生成
// data: { episodeId, highlightId, optionCode, prompt? }
function generateStory(data) {
  return request({ url: '/ai/story/generate', method: 'POST', data })
}

// 点赞 / 取消点赞
function likeStory(generationId) {
  return request({ url: `/ai/story/${generationId}/like`, method: 'POST' })
}
function unlikeStory(generationId) {
  return request({ url: `/ai/story/${generationId}/like`, method: 'DELETE' })
}

// 评论：列表 / 发表
function getComments(generationId) {
  return request({ url: `/ai/story/${generationId}/comments` })
}
function postComment(generationId, content, nickname) {
  return request({ url: `/ai/story/${generationId}/comments`, method: 'POST', data: { content, nickname } })
}

module.exports = { getStory, generateStory, likeStory, unlikeStory, getComments, postComment }
