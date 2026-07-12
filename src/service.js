// 数据访问层。
// 默认走 localStorage 演示模式（开箱即用，无需后端）；
// 当配置了 import.meta.env.VITE_API_BASE 时，自动切换为真实后端模式。

const API_BASE = import.meta.env.VITE_API_BASE || ''
export const apiMode = !!API_BASE

const TOKEN_KEY = 'moments_token'
const SESSION_KEY = 'moments_session'
const POSTS_KEY = 'moments_posts'
const LIKES_KEY = 'moments_likes'
const COMMENTS_KEY = 'moments_comments'

const DEMO_ACCOUNTS = [
  { id: 'me', name: '刘业磊', email: 'me@us.com' },
  { id: 'wife', name: '任可', email: 'wife@us.com' },
]
const ACCOUNT_NAMES = { me: '刘业磊', wife: '任可' }

// ---------- localStorage 工具（演示模式）----------
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}
function uid() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
function nowISO() {
  return new Date().toISOString()
}

// ---------- 真实后端请求封装 ----------
async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {}
  let payload
  if (body) {
    if (body instanceof FormData) payload = body
    else {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }
  }
  const token = localStorage.getItem(TOKEN_KEY)
  if (auth && token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(API_BASE + path, { method, headers, body: payload })
  let data = {}
  try {
    data = await res.json()
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg = data?.error?.message || `请求失败 (${res.status})`
    throw new Error(msg)
  }
  return data
}

// ---------- 演示模式：对象构造 ----------
function buildComment(c) {
  return {
    ...c,
    profiles: { id: c.user_id, display_name: ACCOUNT_NAMES[c.user_id] || '用户', avatar_url: null },
  }
}
function buildPost(p) {
  const likes = read(LIKES_KEY, [])
  const comments = read(COMMENTS_KEY, [])
  return {
    ...p,
    profiles: { id: p.user_id, display_name: ACCOUNT_NAMES[p.user_id] || '用户', avatar_url: null },
    likes: likes.filter((l) => l.post_id === p.id).map((l) => ({ id: l.id, user_id: l.user_id })),
    comments: comments
      .filter((c) => c.post_id === p.id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(buildComment),
  }
}

// ================= 鉴权 =================
export function getSession() {
  if (apiMode) return null
  return read(SESSION_KEY, null)
}

export async function login(userId) {
  if (apiMode) {
    const data = await request('/auth/login', { method: 'POST', body: { userId }, auth: false })
    if (data?.token) localStorage.setItem(TOKEN_KEY, data.token)
    return { data }
  }
  const account = DEMO_ACCOUNTS.find((a) => a.id === userId)
  if (account) write(SESSION_KEY, { user: { id: account.id, name: account.name, email: account.email } })
  return { data: { user: account } }
}

export async function me(token) {
  if (!apiMode) return { data: null }
  try {
    const data = await request('/auth/me', { auth: true })
    return { data: data.user }
  } catch {
    return { data: null }
  }
}

export async function logout(token) {
  if (apiMode) {
    try {
      await request('/auth/logout', { method: 'POST', auth: true })
    } catch {
      /* ignore */
    }
    localStorage.removeItem(TOKEN_KEY)
    return
  }
  localStorage.removeItem(SESSION_KEY)
}

// ================= 动态 =================
export async function getPosts() {
  if (apiMode) {
    const data = await request('/posts')
    return data.posts || []
  }
  const posts = read(POSTS_KEY, [])
  return posts
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(buildPost)
}

export async function createPost(userId, content, images = []) {
  if (apiMode) {
    await request('/posts', { method: 'POST', body: { content, images } })
    return { error: null }
  }
  const posts = read(POSTS_KEY, [])
  posts.push({ id: uid(), user_id: userId, content, images, created_at: nowISO() })
  write(POSTS_KEY, posts)
  return { error: null }
}

export async function deletePost(postId) {
  if (apiMode) {
    await request('/posts/' + postId, { method: 'DELETE' })
    return { error: null }
  }
  let posts = read(POSTS_KEY, [])
  posts = posts.filter((p) => p.id !== postId)
  write(POSTS_KEY, posts)
  let likes = read(LIKES_KEY, [])
  likes = likes.filter((l) => l.post_id !== postId)
  write(LIKES_KEY, likes)
  return { error: null }
}

export async function clearPosts() {
  if (apiMode) {
    await request('/posts', { method: 'DELETE' })
    return { error: null }
  }
  localStorage.removeItem(POSTS_KEY)
  localStorage.removeItem(LIKES_KEY)
  localStorage.removeItem(COMMENTS_KEY)
  return { error: null }
}

// ================= 点赞 =================
export async function toggleLike(postId, userId, isLiked) {
  if (apiMode) {
    await request(`/posts/${postId}/like`, { method: 'POST' })
    return { error: null }
  }
  const likes = read(LIKES_KEY, [])
  if (isLiked) {
    const next = likes.filter((l) => !(l.post_id === postId && l.user_id === userId))
    write(LIKES_KEY, next)
  } else {
    likes.push({ id: uid(), post_id: postId, user_id: userId })
    write(LIKES_KEY, likes)
  }
  return { error: null }
}

// ================= 评论 =================
export async function createComment(postId, userId, content) {
  if (apiMode) {
    await request(`/posts/${postId}/comments`, { method: 'POST', body: { content } })
    return { error: null }
  }
  const comments = read(COMMENTS_KEY, [])
  comments.push({ id: uid(), post_id: postId, user_id: userId, content, created_at: nowISO() })
  write(COMMENTS_KEY, comments)
  return { error: null }
}

export async function deleteComment(commentId) {
  if (apiMode) {
    await request(`/posts/comments/${commentId}`, { method: 'DELETE' })
    return { error: null }
  }
  let comments = read(COMMENTS_KEY, [])
  comments = comments.filter((c) => c.id !== commentId)
  write(COMMENTS_KEY, comments)
  return { error: null }
}

// ================= 图片上传 =================
export async function uploadImage(file) {
  if (apiMode) {
    try {
      const fd = new FormData()
      fd.append('file', file)
      const data = await request('/upload', { method: 'POST', body: fd, auth: true })
      return { data: data.url, error: null }
    } catch (e) {
      return { data: null, error: { message: e.message || '上传失败' } }
    }
  }
  // 演示模式：用 canvas 压缩后转 base64 存本地
  try {
    const dataUrl = await compressImage(file, 1024, 0.8)
    return { data: dataUrl, error: null }
  } catch (e) {
    return { data: null, error: { message: '图片处理失败' } }
  }
}

// 用 canvas 将图片缩放到最大边 maxSize，并转 JPEG，显著减小体积
function compressImage(file, maxSize = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width)
          width = maxSize
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height)
          height = maxSize
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => reject(new Error('图片解码失败'))
      img.src = reader.result
    }
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}
