const assert = require('assert')
const { getBigImage, getEmotionIcon } = require('./icon-assets')

assert.strictEqual(getEmotionIcon('cool', 'https://picsum.photos/seed/cool/80'), '/icon/shaung.png')
assert.strictEqual(getEmotionIcon('famous_scene', 'https://picsum.photos/seed/scene/80'), '/icon/mingchangmian.png')
assert.strictEqual(getEmotionIcon('funny'), '/icon/xiao.png')
assert.strictEqual(getEmotionIcon('sweet'), '/icon/sweet.png')
assert.strictEqual(getEmotionIcon('new_option', 'https://example.com/new.png'), 'https://example.com/new.png')
assert.strictEqual(getEmotionIcon('new_option'), '')

assert.strictEqual(getBigImage('cool'), '/icon/bigshuang.png')
assert.strictEqual(getBigImage('famous_scene'), '/icon/bigming.png')
assert.strictEqual(getBigImage('funny'), '/icon/bigxiao.png')
assert.strictEqual(getBigImage('sweet'), '/icon/bigsweet.png')
assert.strictEqual(getBigImage('new_option'), '')

console.log('icon asset mapping ok')
