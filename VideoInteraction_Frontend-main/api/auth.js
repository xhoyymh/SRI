const { request } = require('./request')

function register(username, password) {
  return request({ url: '/auth/register', method: 'POST', data: { username, password } })
}

function login(username, password) {
  return request({ url: '/auth/login', method: 'POST', data: { username, password } })
}

function logout() {
  return request({ url: '/auth/logout', method: 'POST' })
}

function me() {
  return request({ url: '/auth/me' })
}

module.exports = { login, logout, me, register }
