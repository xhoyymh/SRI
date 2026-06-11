// Shared frontend runtime config.
// Server deployment used by real-device preview and release builds.
const BASE_URL = 'http://106.55.249.9:8080/api/v1'

const USE_MOCK = false

// Android APK prioritizes native video controls for stable pause and seeking.
const FORCE_NATIVE_VIDEO_CONTROLS_ON_ANDROID = true

// Kept for non-native fallback; native controls take priority on Android.
const USE_EXTERNAL_VIDEO_OVERLAY_ON_ANDROID = true

const ENABLE_PLAYBACK_DIAGNOSTICS = true

module.exports = {
  BASE_URL,
  USE_MOCK,
  FORCE_NATIVE_VIDEO_CONTROLS_ON_ANDROID,
  USE_EXTERNAL_VIDEO_OVERLAY_ON_ANDROID,
  ENABLE_PLAYBACK_DIAGNOSTICS
}
