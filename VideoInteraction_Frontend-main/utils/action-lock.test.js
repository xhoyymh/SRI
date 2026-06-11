const assert = require('assert')
const { isActionInteractionLocked } = require('./action-lock')

assert.strictEqual(isActionInteractionLocked({ show: true }, false), true)
assert.strictEqual(isActionInteractionLocked({ show: false }, true), true)
assert.strictEqual(isActionInteractionLocked(null, true), true)
assert.strictEqual(isActionInteractionLocked({ show: false }, false), false)
assert.strictEqual(isActionInteractionLocked(null, false), false)

console.log('action interaction lock ok')
