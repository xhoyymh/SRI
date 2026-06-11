function isActionInteractionLocked(action, inMandatoryActionVideo) {
  return !!(action && action.show) || !!inMandatoryActionVideo
}

module.exports = { isActionInteractionLocked }
