const root = typeof globalThis !== 'undefined'
  ? globalThis
  : (typeof global !== 'undefined' ? global : {})

if (typeof root.window === 'undefined') {
  root.window = root
}

try {
  module.exports = require('./vendor/cos-wx-sdk-v5.min')
} catch (localErr) {
  module.exports = require('cos-wx-sdk-v5')
}
