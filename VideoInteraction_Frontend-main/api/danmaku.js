const { request } = require('./request')

function listDanmaku(episodeId) {
  return request({ url: `/episodes/${episodeId}/danmaku` })
}

function postDanmaku(episodeId, data) {
  return request({ url: `/episodes/${episodeId}/danmaku`, method: 'POST', data })
}

module.exports = { listDanmaku, postDanmaku }
