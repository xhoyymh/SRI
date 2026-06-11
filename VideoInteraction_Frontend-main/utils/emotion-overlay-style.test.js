const assert = require('assert')
const fs = require('fs')
const path = require('path')

const rootCss = fs.readFileSync(path.join(__dirname, '../pages/play/index.wxss'), 'utf8')
const miniCss = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/play/index.wxss'), 'utf8')

function assertEmotionWindow(css, label) {
  assert.match(css, /\.emotion-item\s*\{[\s\S]*?width:\s*240rpx;[\s\S]*?overflow:\s*visible;/, `${label} emotion item keeps a wider visible window`)
  assert.match(css, /\.emotion-item--anim\s*\{[\s\S]*?transform:\s*scale\(1\.18\);/, `${label} click scale avoids clipping the count`)
  assert.match(css, /\.emotion-row\s*\{[\s\S]*?width:\s*220rpx;[\s\S]*?height:\s*124rpx;[\s\S]*?overflow:\s*visible;/, `${label} emotion row reserves count space`)
  assert.match(css, /\.emotion-count\s*\{[\s\S]*?min-width:\s*76rpx;[\s\S]*?text-shadow:/, `${label} count has stable readable width`)
}

assertEmotionWindow(rootCss, 'root')
assertEmotionWindow(miniCss, 'miniprogram')

console.log('emotion overlay style ok')
