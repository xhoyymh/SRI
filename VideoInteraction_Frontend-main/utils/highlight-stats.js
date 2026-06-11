const authStore = require('./auth-store')

const sessionStore = {}

function readStore() {
  return sessionStore
}

function writeStore() {
  // readStore returns the live in-memory object, so the mutation is already applied.
}

function highlightKey(highlightId, scope) {
  const base = String(highlightId || '')
  return scope ? `${base}::${scope}` : base
}

function currentUsername() {
  const user = authStore.getCurrentUser()
  return (user && user.username) || '游客'
}

function ensureHighlight(data, highlightId, scope) {
  const key = highlightKey(highlightId, scope)
  data[key] = data[key] || { users: {} }
  data[key].users = data[key].users || {}
  return data[key]
}

function reset(highlightId, scope) {
  if (!scope) return
  const data = readStore()
  data[highlightKey(highlightId, scope)] = { users: {} }
  writeStore(data)
}

function recordClick(highlightId, optionCode, scope) {
  const username = currentUsername()
  const data = readStore()
  const bucket = ensureHighlight(data, highlightId, scope)
  const user = bucket.users[username] || { total: 0, options: {} }
  user.total += 1
  user.options = user.options || {}
  user.options[optionCode] = (user.options[optionCode] || 0) + 1
  bucket.users[username] = user
  writeStore(data)
  return {
    currentCount: getOptionCountFromBucket(bucket, optionCode),
    summary: buildSummaryFromBucket(bucket)
  }
}

function getOptionCount(highlightId, optionCode, scope) {
  const data = readStore()
  const bucket = data[highlightKey(highlightId, scope)]
  return getOptionCountFromBucket(bucket, optionCode)
}

function getOptionCountFromBucket(bucket, optionCode) {
  if (!bucket || !bucket.users) return 0
  return Object.values(bucket.users).reduce((sum, user) => {
    const options = user.options || {}
    return sum + (Number(options[optionCode]) || 0)
  }, 0)
}

function getSummary(highlightId, scope) {
  const data = readStore()
  return buildSummaryFromBucket(data[highlightKey(highlightId, scope)])
}

function buildSummaryFromBucket(bucket) {
  const users = bucket && bucket.users ? bucket.users : {}
  const ranked = Object.keys(users)
    .map((name) => ({ name, total: Number(users[name].total) || 0 }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total)
  return {
    userCount: ranked.length,
    topUsers: ranked.slice(0, 2)
  }
}

function summaryText(highlightId, scope) {
  const summary = getSummary(highlightId, scope)
  if (!summary.userCount) return '已有 0 位用户点击高光弹幕'
  const top = summary.topUsers[0]
  return `已有 ${summary.userCount} 位用户点击高光弹幕${top ? `，最多点击 ${top.total}次` : ''}`
}

module.exports = {
  getOptionCount,
  getSummary,
  recordClick,
  reset,
  summaryText
}
