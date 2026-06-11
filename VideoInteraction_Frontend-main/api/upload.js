// upload.js: video upload and RAG analysis task API.
const { request } = require('./request')
const { USE_MOCK } = require('../utils/config')

const COS_BUCKET = 'short-drama-1308237976'
const COS_REGION = 'ap-guangzhou'
const COS_SLICE_SIZE = 5 * 1024 * 1024
const SDK_UPLOAD_THRESHOLD = 50 * 1024 * 1024
const POST_UPLOAD_TIMEOUT = 60 * 60 * 1000
let cosClient = null
let cosConstructor = null
let lastCosAuthError = ''

function createUploadBatch(data) {
  return request({ url: '/uploads/batches', method: 'POST', data })
}

function completeUploadBatch(batchId, assetIds, extra = {}) {
  return request({
    url: `/uploads/batches/${batchId}/complete`,
    method: 'POST',
    data: Object.assign({ assetIds }, extra || {})
  })
}

function getUploadAsset(assetId) {
  return request({ url: `/uploads/assets/${assetId}` })
}

function deleteUploadAsset(assetId) {
  return request({ url: `/uploads/assets/${assetId}`, method: 'DELETE' })
}

function getCosAuthorization(options) {
  return request({ url: '/uploads/cos/authorization', method: 'POST', data: options })
}

async function uploadAssetToCos(uploadInfo, filePath, contentType, onProgress, options = {}) {
  if (USE_MOCK || uploadInfo.mock || uploadInfo.uploadUrl === 'mock://cos-upload') {
    return mockUpload(onProgress).then(() => uploadInfo)
  }
  if (!uploadInfo || (!uploadInfo.assetId && !uploadInfo.objectKey)) {
    return Promise.reject(new Error('缺少上传资产标识'))
  }
  if (String(uploadInfo.uploadMethod || '').toUpperCase() === 'SKIP') {
    return Promise.resolve(uploadInfo)
  }
  const target = uploadInfo.uploadMethod || uploadInfo.uploadUrl ? uploadInfo : await getUploadAsset(uploadInfo.assetId)
  if (String(target.uploadMethod || '').toUpperCase() === 'COS_SDK') {
    return uploadAssetByCosSdk(target, filePath, contentType, withUploadStage('分片上传', onProgress))
  }
  if (String(target.uploadMethod || '').toUpperCase() !== 'POST') {
    return Promise.reject(new Error(`当前上传方式不支持：${target.uploadMethod || 'EMPTY'}`))
  }
  if (!target.uploadUrl || target.uploadUrl.indexOf('cos.') < 0) {
    return Promise.reject(new Error('后端没有返回 COS 表单上传地址'))
  }
  const fileSize = Number(options.fileSize || target.fileSize) || 0
  if (shouldUseSdkUpload(target, fileSize)) {
    return uploadAssetByCosSdk(target, filePath, contentType, withUploadStage('分片上传', onProgress))
  }
  try {
    return await postCosObject(target, filePath, contentType, withUploadStage('直传', onProgress))
  } catch (err) {
    if (isRecoverableUploadError(err) && target.objectKey) {
      console.warn('COS 表单直传连接中断，改用分片上传重试', err)
      return uploadAssetByCosSdk(target, filePath, contentType, withUploadStage('分片重试', onProgress))
    }
    throw err
  }
}

function uploadAssetByCosSdk(target, filePath, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const bucket = target.bucket || COS_BUCKET
    const region = target.region || COS_REGION
    if (!target.objectKey) {
      reject(new Error('后端没有返回 COS objectKey'))
      return
    }
    preflightCosAuthorization(target, contentType)
      .then(() => {
        getCosClient().uploadFile({
      Bucket: bucket,
      Region: region,
      Key: target.objectKey,
      FilePath: filePath,
      SliceSize: COS_SLICE_SIZE,
      ChunkSize: COS_SLICE_SIZE,
      AsyncLimit: 3,
      Headers: contentType ? { 'Content-Type': contentType } : {},
      onProgress(info) {
        if (onProgress) {
          const loaded = Number(info && info.loaded) || 0
          const total = Number(info && info.total) || 0
          const percent = Number(info && info.percent)
          onProgress({
            progress: total > 0 ? Math.round((Number.isFinite(percent) ? percent : loaded / total) * 100) : 0,
            totalBytesSent: loaded,
            totalBytesExpectedToSend: total,
            speed: Number(info && info.speed) || 0
          })
        }
      }
        }, (err) => {
          if (err) {
            reject(new Error(`COS 分片上传失败：${lastCosAuthError || cosErrorText(err)}`))
            return
          }
          if (onProgress) {
            onProgress({ progress: 100, totalBytesSent: 0, totalBytesExpectedToSend: 0 })
          }
          resolve(target)
        })
      })
      .catch((err) => reject(err))
  })
}

function preflightCosAuthorization(target, contentType) {
  const bucket = target.bucket || COS_BUCKET
  const region = target.region || COS_REGION
  const host = `${bucket}.cos.${region}.myqcloud.com`
  return getCosAuthorization({
    Bucket: bucket,
    Region: region,
    Method: 'PUT',
    Key: target.objectKey,
    Pathname: `/${target.objectKey}`,
    Query: {},
    Headers: contentType ? { Host: host, 'Content-Type': contentType } : { Host: host },
    ForceSignHost: true
  }).then((data) => {
    const auth = extractAuthorization(data)
    if (!auth) {
      throw new Error('COS 签名接口没有返回 authorization')
    }
    return auth
  }).catch((err) => {
    throw new Error(`COS 签名失败：${cosErrorText(err)}`)
  })
}

function getCosClient() {
  if (cosClient) return cosClient
  const COS = getCosConstructor()
  cosClient = new COS({
    SimpleUploadMethod: 'putObject',
    ChunkParallelLimit: 3,
    ChunkRetryTimes: 3,
    SliceSize: COS_SLICE_SIZE,
    ChunkSize: COS_SLICE_SIZE,
    getAuthorization(options, callback) {
      getCosAuthorization(options)
        .then((data) => {
          const auth = extractAuthorization(data)
          if (!auth) {
            lastCosAuthError = 'COS 签名接口没有返回 authorization'
            callback({ Authorization: '' })
            return
          }
          lastCosAuthError = ''
          callback({ Authorization: auth })
        })
        .catch((err) => {
          lastCosAuthError = `COS 签名失败：${cosErrorText(err)}`
          console.error('获取 COS 签名失败', err)
          callback({ Authorization: '' })
        })
    }
  })
  return cosClient
}

function extractAuthorization(data) {
  return data && (data.authorization || data.Authorization || (data.data && (data.data.authorization || data.data.Authorization)))
}

function getCosConstructor() {
  if (cosConstructor) return cosConstructor
  try {
    cosConstructor = require('../utils/cos-wx')
  } catch (err) {
    throw new Error(`COS SDK 加载失败，请在微信开发者工具执行“工具 -> 构建 npm”：${cosErrorText(err)}`)
  }
  if (!cosConstructor) {
    throw new Error('COS SDK 加载失败，请在微信开发者工具执行“工具 -> 构建 npm”')
  }
  return cosConstructor
}

function postCosObject(target, filePath, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = Object.assign({}, target.formData || {})
    const uploadTask = wx.uploadFile({
      url: target.uploadUrl,
      filePath,
      name: 'file',
      formData,
      timeout: POST_UPLOAD_TIMEOUT,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (onProgress) {
            onProgress({
              progress: 100,
              totalBytesSent: res.totalBytesSent || 0,
              totalBytesExpectedToSend: res.totalBytesExpectedToSend || 0
            })
          }
          resolve(target)
        } else {
          reject(new Error(`COS 上传失败：HTTP ${res.statusCode}${uploadErrorText(res.data)}`))
        }
      },
      fail: reject
    })
    if (uploadTask && uploadTask.onProgressUpdate && onProgress) {
      uploadTask.onProgressUpdate((progress) => onProgress(progress))
    }
  })
}

function shouldUseSdkUpload(target, fileSize) {
  return !!(target && target.objectKey && fileSize >= SDK_UPLOAD_THRESHOLD)
}

function isRecoverableUploadError(err) {
  const text = cosErrorText(err).toLowerCase()
  return text.includes('econnreset')
    || text.includes('timeout')
    || text.includes('socket')
    || text.includes('connection')
    || text.includes('write fail')
}

function withUploadStage(stage, onProgress) {
  return (progress) => {
    if (onProgress) onProgress(Object.assign({}, progress || {}, { stage }))
  }
}

function uploadErrorText(raw) {
  if (!raw) return ''
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
  return text ? `：${text.slice(0, 120)}` : ''
}

function cosErrorText(err) {
  if (!err) return '未知错误'
  if (err.message) return String(err.message).slice(0, 120)
  if (err.error) return String(err.error).slice(0, 120)
  return JSON.stringify(err).slice(0, 120)
}

function mockUpload(onProgress) {
  return new Promise((resolve) => {
    let progress = 0
    const timer = setInterval(() => {
      progress += 25
      if (onProgress) {
        onProgress({
          progress: Math.min(progress, 100),
          totalBytesSent: progress,
          totalBytesExpectedToSend: 100
        })
      }
      if (progress >= 100) {
        clearInterval(timer)
        resolve({})
      }
    }, 120)
  })
}

module.exports = { createUploadBatch, completeUploadBatch, getUploadAsset, deleteUploadAsset, uploadAssetToCos, getCosAuthorization }
