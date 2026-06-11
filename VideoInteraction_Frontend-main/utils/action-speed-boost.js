const ACTION_SPEED_BOOST_SHOW_AT = 6
const ACTION_SPEED_BOOST_RATE = 2
const ACTION_SPEED_BOOST_AUTO_HIDE_MS = 2000
const ACTION_SPEED_BOOST_LABEL = '加速追捕'

function positiveNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function normalizeActionSpeedBoostConfig(config) {
  const cfg = config || {}
  return {
    showAt: positiveNumber(cfg.showAt, ACTION_SPEED_BOOST_SHOW_AT),
    rate: positiveNumber(cfg.rate, ACTION_SPEED_BOOST_RATE),
    label: cfg.label || ACTION_SPEED_BOOST_LABEL,
    autoHideMs: positiveNumber(cfg.autoHideMs, ACTION_SPEED_BOOST_AUTO_HIDE_MS),
    dismissible: cfg.dismissible !== false,
    pauseUntilClick: cfg.pauseUntilClick === true
  }
}

function createActionSpeedBoostState() {
  return {
    show: false,
    offered: false,
    boosted: false
  }
}

function shouldShowActionSpeedBoost(currentTime, state, config) {
  const cfg = normalizeActionSpeedBoostConfig(config)
  const t = Number(currentTime)
  if (!Number.isFinite(t) || t < cfg.showAt) return false
  if (!state) return true
  return !state.offered && !state.boosted
}

module.exports = {
  ACTION_SPEED_BOOST_AUTO_HIDE_MS,
  ACTION_SPEED_BOOST_LABEL,
  ACTION_SPEED_BOOST_RATE,
  ACTION_SPEED_BOOST_SHOW_AT,
  createActionSpeedBoostState,
  normalizeActionSpeedBoostConfig,
  shouldShowActionSpeedBoost
}
