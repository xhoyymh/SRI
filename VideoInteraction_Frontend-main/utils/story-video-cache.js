const MAX_CACHE_ITEMS = 6
const PREFETCH_TIMEOUT_MS = 18000

const cache = {}
const pending = {}
const order = []
const ENABLE_FULL_VIDEO_PREFETCH = false

function videoUrlFromStory(story) {
  if (!story || story.contentType !== 'VIDEO') return ''
  return String(story.contentUrl || '').trim()
}

function cacheKey(story, url) {
  const gid = story && story.generationId
  return gid ? `gid:${gid}` : `url:${url}`
}

function isLocalPath(url) {
  return /^wxfile:\/\//i.test(url) || /^http:\/\/tmp\//i.test(url) || /^file:\/\//i.test(url)
}

function prefetch(story) {
  if (!ENABLE_FULL_VIDEO_PREFETCH) return Promise.resolve('')
  const url = videoUrlFromStory(story)
  if (!url || isLocalPath(url)) return Promise.resolve(url)
  if (typeof wx === 'undefined' || !wx.downloadFile) return Promise.resolve('')
  const key = cacheKey(story, url)
  if (cache[key] && cache[key].path) return Promise.resolve(cache[key].path)
  if (pending[key]) return pending[key]

  pending[key] = new Promise((resolve) => {
    wx.downloadFile({
      url,
      timeout: PREFETCH_TIMEOUT_MS,
      success(res) {
        const status = Number(res && res.statusCode) || 0
        const path = String((res && res.tempFilePath) || '').trim()
        if (status >= 200 && status < 300 && path) {
          remember(key, path, url)
          resolve(path)
          return
        }
        resolve('')
      },
      fail() {
        resolve('')
      },
      complete() {
        delete pending[key]
      }
    })
  })
  return pending[key]
}

function playableUrl(story) {
  const url = videoUrlFromStory(story)
  if (!url) return ''
  const key = cacheKey(story, url)
  return (cache[key] && cache[key].path) || url
}

async function withPlayableVideoUrl(story, waitMs = 0) {
  if (!ENABLE_FULL_VIDEO_PREFETCH) return story
  if (!story || story.contentType !== 'VIDEO') return story
  const url = videoUrlFromStory(story)
  if (!url) return story
  const cachedUrl = playableUrl(story)
  if (cachedUrl && cachedUrl !== url) return Object.assign({}, story, { contentUrl: cachedUrl, originalContentUrl: url })
  if (waitMs <= 0) return story
  const path = await waitFor(prefetch(story), waitMs)
  return path ? Object.assign({}, story, { contentUrl: path, originalContentUrl: url }) : story
}

function remember(key, path, sourceUrl) {
  cache[key] = { path, sourceUrl, updatedAt: Date.now() }
  const existing = order.indexOf(key)
  if (existing >= 0) order.splice(existing, 1)
  order.push(key)
  while (order.length > MAX_CACHE_ITEMS) {
    const stale = order.shift()
    if (stale) delete cache[stale]
  }
}

function waitFor(promise, waitMs) {
  return new Promise((resolve) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      resolve('')
    }, waitMs)
    promise.then((value) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(value || '')
    }).catch(() => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve('')
    })
  })
}

function clear() {
  Object.keys(cache).forEach((key) => delete cache[key])
  Object.keys(pending).forEach((key) => delete pending[key])
  order.splice(0, order.length)
}

module.exports = { prefetch, playableUrl, withPlayableVideoUrl, clear }
