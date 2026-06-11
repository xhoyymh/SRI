const { request } = require('./request')

function getDramaSocial(dramaId) {
  return request({ url: `/dramas/${dramaId}/social` })
}

function likeDrama(dramaId) {
  return request({ url: `/dramas/${dramaId}/like`, method: 'POST' })
}

function unlikeDrama(dramaId) {
  return request({ url: `/dramas/${dramaId}/like`, method: 'DELETE' })
}

function favoriteDrama(dramaId) {
  return request({ url: `/dramas/${dramaId}/favorite`, method: 'POST' })
}

function unfavoriteDrama(dramaId) {
  return request({ url: `/dramas/${dramaId}/favorite`, method: 'DELETE' })
}

function getDramaComments(dramaId) {
  return request({ url: `/dramas/${dramaId}/comments` })
}

function postDramaComment(dramaId, content, clientCommentId) {
  return request({ url: `/dramas/${dramaId}/comments`, method: 'POST', data: { content, clientCommentId } })
}

function getMySocial() {
  return request({ url: '/users/me/social' })
}

function migrateLocalSocial(data) {
  return request({ url: '/users/me/migration', method: 'POST', data })
}

module.exports = {
  favoriteDrama,
  getDramaComments,
  getDramaSocial,
  getMySocial,
  likeDrama,
  migrateLocalSocial,
  postDramaComment,
  unfavoriteDrama,
  unlikeDrama
}
