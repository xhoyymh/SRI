const http = require('http')
const https = require('https')
const { URL } = require('url')

const DEFAULT_BACKEND_BASE_URL = 'http://106.55.249.9:8080/api/v1'
const BACKEND_BASE_URL = (process.env.BACKEND_BASE_URL || DEFAULT_BACKEND_BASE_URL).replace(/\/+$/, '')
const METHODS_WITH_QUERY = new Set(['GET', 'DELETE'])
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

exports.main = async (event) => {
  const path = normalizePath(event && event.url)
  const method = normalizeMethod(event && event.method)
  const data = normalizeData(event && event.data)

  if (!path) {
    return { code: 400, message: 'apiProxy requires a relative url such as /episodes/1' }
  }
  if (!ALLOWED_METHODS.has(method)) {
    return { code: 405, message: `Unsupported method: ${method}` }
  }

  try {
    return await proxyRequest(path, method, data)
  } catch (err) {
    return {
      code: 502,
      message: `apiProxy backend request failed: ${err.message || err}`,
      data: null
    }
  }
}

function normalizePath(raw) {
  const path = String(raw || '').trim()
  if (!path || !path.startsWith('/') || path.startsWith('//') || /^https?:\/\//i.test(path)) {
    return ''
  }
  return path
}

function normalizeMethod(raw) {
  return String(raw || 'GET').toUpperCase()
}

function normalizeData(raw) {
  return raw && typeof raw === 'object' ? raw : {}
}

function proxyRequest(path, method, data) {
  const target = new URL(BACKEND_BASE_URL + path)
  let body = null
  if (METHODS_WITH_QUERY.has(method)) {
    appendQuery(target, data)
  } else {
    body = JSON.stringify(data || {})
  }

  const client = target.protocol === 'https:' ? https : http
  const headers = {
    'Content-Type': 'application/json'
  }
  if (body) {
    headers['Content-Length'] = Buffer.byteLength(body)
  }

  return new Promise((resolve, reject) => {
    const req = client.request(
      target,
      {
        method,
        headers,
        timeout: 60000
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          const parsed = parseJson(text)
          if (parsed) {
            resolve(parsed)
            return
          }
          resolve({
            code: res.statusCode >= 200 && res.statusCode < 300 ? 0 : res.statusCode,
            message: text || res.statusMessage || 'Backend response is empty',
            data: null
          })
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error('backend request timeout')))
    req.on('error', reject)
    if (body) {
      req.write(body)
    }
    req.end()
  })
}

function appendQuery(target, data) {
  Object.keys(data || {}).forEach((key) => {
    const value = data[key]
    if (value === undefined || value === null || value === '') return
    target.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
  })
}

function parseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (err) {
    return null
  }
}
