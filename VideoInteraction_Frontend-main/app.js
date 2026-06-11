// app.js - 应用入口
// 确保 deviceId 首次启动时生成
const { getDeviceId } = require('./utils/device')

App({
  onLaunch() {
    // 首次启动时初始化 deviceId
    getDeviceId()
    console.log('App launched, deviceId:', getDeviceId())
  }
})
