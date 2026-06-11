const EMOTION_ICON = {
  cool: '/icon/shaung.png',
  famous_scene: '/icon/mingchangmian.png',
  funny: '/icon/xiao.png',
  sweet: '/icon/sweet.png'
}

const BIG_IMAGE = {
  cool: '/icon/bigshuang.png',
  famous_scene: '/icon/bigming.png',
  funny: '/icon/bigxiao.png',
  sweet: '/icon/bigsweet.png'
}

function getEmotionIcon(optionCode, fallbackIcon = '') {
  return EMOTION_ICON[optionCode] || fallbackIcon || ''
}

function getBigImage(optionCode) {
  return BIG_IMAGE[optionCode] || ''
}

module.exports = { getBigImage, getEmotionIcon }
