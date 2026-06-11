const authStore = require('./auth-store')
const socialApi = require('../api/social')

const DATA_KEY = 'svimvp_user_data'

function readAll() {
  const data = wx.getStorageSync(DATA_KEY)
  return data && typeof data === 'object' ? data : {}
}

function writeAll(data) {
  wx.setStorageSync(DATA_KEY, data || {})
}

function currentName() {
  const user = authStore.getCurrentUser()
  return user && user.username
}

function getUserData() {
  const username = currentName()
  if (!username) return null
  const all = readAll()
  all[username] = all[username] || {
    likedDramas: {},
    favoriteDramas: {},
    comments: {},
    progress: {}
  }
  writeAll(all)
  return all[username]
}

function updateUserData(mutator) {
  const username = currentName()
  if (!username) return null
  const all = readAll()
  const data = all[username] || {
    likedDramas: {},
    favoriteDramas: {},
    comments: {},
    progress: {}
  }
  mutator(data)
  all[username] = data
  writeAll(all)
  return data
}

function normalizeDrama(drama) {
  const tags = normalizeTags(drama && drama.tags)
  return {
    dramaId: Number(drama && drama.dramaId),
    title: (drama && drama.title) || '',
    description: (drama && drama.description) || '',
    coverUrl: (drama && drama.coverUrl) || '',
    tags,
    episodeCount: Number(drama && drama.episodeCount) || 0,
    updatedAt: Date.now()
  }
}

function normalizeTags(tags) {
  const source = Array.isArray(tags) ? tags : [tags]
  return source
    .join(' ')
    .split(/[，,、\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function emptySocial(dramaId) {
  return {
    dramaId: Number(dramaId) || 0,
    liked: false,
    favorited: false,
    likeCount: 0,
    favoriteCount: 0,
    commentCount: 0
  }
}

async function getDramaSocial(dramaId) {
  if (!dramaId) return emptySocial(dramaId)
  try {
    return normalizeSocial(await socialApi.getDramaSocial(dramaId), dramaId)
  } catch (e) {
    console.warn('加载短剧社交数据失败', e)
    return emptySocial(dramaId)
  }
}

async function toggleLike(drama) {
  const item = normalizeDrama(drama)
  if (!item.dramaId) return emptySocial(item.dramaId)
  const current = await getDramaSocial(item.dramaId)
  const next = current.liked ? await socialApi.unlikeDrama(item.dramaId) : await socialApi.likeDrama(item.dramaId)
  return normalizeSocial(next, item.dramaId)
}

async function toggleFavorite(drama) {
  const item = normalizeDrama(drama)
  if (!item.dramaId) return emptySocial(item.dramaId)
  const current = await getDramaSocial(item.dramaId)
  const next = current.favorited ? await socialApi.unfavoriteDrama(item.dramaId) : await socialApi.favoriteDrama(item.dramaId)
  return normalizeSocial(next, item.dramaId)
}

async function getComments(dramaId) {
  try {
    const res = await socialApi.getDramaComments(dramaId)
    return (res && res.list) || []
  } catch (e) {
    console.warn('加载短剧评论失败', e)
    return []
  }
}

async function addComment(dramaId, content) {
  const text = String(content || '').trim()
  if (!text) throw new Error('请输入评论内容')
  const clientCommentId = `${Date.now()}_${Math.random().toString(16).slice(2)}`
  await socialApi.postDramaComment(dramaId, text, clientCommentId)
  return getComments(dramaId)
}

function saveProgress(dramaId, episodeId, currentTime) {
  const id = Number(dramaId)
  const ep = Number(episodeId)
  const time = Number(currentTime)
  if (!id || !ep || !Number.isFinite(time)) return
  updateUserData((draft) => {
    draft.progress = draft.progress || {}
    draft.progress[String(id)] = {
      dramaId: id,
      episodeId: ep,
      currentTime: Math.max(0, time),
      updatedAt: Date.now()
    }
  })
}

function getProgress(dramaId) {
  const data = getUserData()
  return data && data.progress ? data.progress[String(dramaId)] || null : null
}

async function listLiked() {
  if (!authStore.isLoggedIn()) return []
  try {
    const res = await socialApi.getMySocial()
    return (res && res.liked) || []
  } catch (e) {
    console.warn('加载点赞列表失败', e)
    return []
  }
}

async function listFavorites() {
  if (!authStore.isLoggedIn()) return []
  try {
    const res = await socialApi.getMySocial()
    return (res && res.favorites) || []
  } catch (e) {
    console.warn('加载收藏列表失败', e)
    return []
  }
}

function normalizeSocial(value, dramaId) {
  const source = value || {}
  return {
    dramaId: Number(source.dramaId || dramaId) || 0,
    liked: !!source.liked,
    favorited: !!source.favorited,
    likeCount: Number(source.likeCount) || 0,
    favoriteCount: Number(source.favoriteCount) || 0,
    commentCount: Number(source.commentCount) || 0
  }
}

module.exports = {
  addComment,
  getComments,
  getDramaSocial,
  getProgress,
  listFavorites,
  listLiked,
  normalizeDrama,
  normalizeTags,
  saveProgress,
  toggleFavorite,
  toggleLike
}
