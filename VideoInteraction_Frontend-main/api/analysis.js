// analysis.js: RAG 分析任务状态 API
const { request } = require('./request')

function getAnalysisTask(taskId) {
  return request({ url: `/analysis-tasks/${taskId}` })
}

function retryAnalysisTask(taskId) {
  return request({ url: `/analysis-tasks/${taskId}/retry`, method: 'POST' })
}

function getPendingVideos() {
  return request({ url: '/analysis-tasks/pending-videos' })
}

function getActiveTask() {
  return request({ url: '/analysis-tasks/active' })
}

function startAnalysisTask(data) {
  return request({ url: '/analysis-tasks/start', method: 'POST', data })
}

module.exports = {
  getAnalysisTask,
  retryAnalysisTask,
  getPendingVideos,
  getActiveTask,
  startAnalysisTask
}
