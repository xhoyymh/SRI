const assert = require('assert')
const {
  ACTION_SPEED_BOOST_AUTO_HIDE_MS,
  ACTION_SPEED_BOOST_RATE,
  ACTION_SPEED_BOOST_SHOW_AT,
  normalizeActionSpeedBoostConfig,
  shouldShowActionSpeedBoost,
  createActionSpeedBoostState
} = require('./action-speed-boost')

assert.strictEqual(ACTION_SPEED_BOOST_SHOW_AT, 6)
assert.strictEqual(ACTION_SPEED_BOOST_RATE, 2)
assert.strictEqual(ACTION_SPEED_BOOST_AUTO_HIDE_MS, 2000)

assert.deepStrictEqual(normalizeActionSpeedBoostConfig({
  showAt: 4,
  rate: 1.5,
  label: '冲刺',
  autoHideMs: 1200,
  dismissible: false
}), {
  showAt: 4,
  rate: 1.5,
  label: '冲刺',
  autoHideMs: 1200,
  dismissible: false,
  pauseUntilClick: false
})

assert.deepStrictEqual(normalizeActionSpeedBoostConfig(null), {
  showAt: 6,
  rate: 2,
  label: '加速追捕',
  autoHideMs: 2000,
  dismissible: true,
  pauseUntilClick: false
})

assert.deepStrictEqual(createActionSpeedBoostState(), {
  show: false,
  offered: false,
  boosted: false
})

assert.strictEqual(shouldShowActionSpeedBoost(5.9, { offered: false, boosted: false }), false)
assert.strictEqual(shouldShowActionSpeedBoost(6, { offered: false, boosted: false }), true)
assert.strictEqual(shouldShowActionSpeedBoost(4, { offered: false, boosted: false }, { showAt: 4 }), true)
assert.strictEqual(shouldShowActionSpeedBoost(8, { offered: true, boosted: false }), false)
assert.strictEqual(shouldShowActionSpeedBoost(8, { offered: false, boosted: true }), false)

console.log('action speed boost ok')
