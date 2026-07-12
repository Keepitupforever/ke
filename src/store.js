import { reactive, computed, readonly } from 'vue'
import * as api from './service'

// 默认的两个账号：我 / 我老婆
const ACCOUNTS = [
  { id: 'me', name: '刘业磊', email: 'me@us.com' },
  { id: 'wife', name: '任可', email: 'wife@us.com' },
]

const TOKEN_KEY = 'moments_token'
const THEME_KEY = 'moments_theme'

const state = reactive({
  user: null, // { id, name, email }
  profile: null, // { id, name, avatar_url }
  loading: true,
  posts: [],
  theme: 'auto', // auto | light | dark
})

// ---------- 主题 ----------
const media = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : null

function applyTheme() {
  const t = state.theme || 'auto'
  const dark = t === 'dark' || (t === 'auto' && media?.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

function setTheme(value) {
  state.theme = value
  localStorage.setItem(THEME_KEY, value)
  applyTheme()
}

if (media) {
  media.addEventListener('change', () => {
    if (state.theme === 'auto') applyTheme()
  })
}

// ---------- 会话 ----------
function setUser(user, token) {
  state.user = { id: user.id, name: user.name, email: user.email }
  state.profile = { id: user.id, name: user.name, avatar_url: null }
  if (token) localStorage.setItem(TOKEN_KEY, token)
}

function loadSession() {
  const theme = localStorage.getItem(THEME_KEY) || 'auto'
  state.theme = theme
  applyTheme()

  if (api.apiMode) {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      state.loading = false
      return
    }
    api
      .me(token)
      .then(({ data: user }) => {
        if (user) setUser(user, token)
      })
      .catch(() => {
        // token 失效：清除本地无效 token，下次启动直接进入登录态
        localStorage.removeItem(TOKEN_KEY)
      })
      .finally(() => {
        state.loading = false
      })
  } else {
    const session = api.getSession()
    if (session) setUser(session.user)
    state.loading = false
  }
}

async function loginAs(accountId) {
  const account = ACCOUNTS.find((a) => a.id === accountId)
  if (!account) return
  if (api.apiMode) {
    const { data } = await api.login(account.id)
    if (data?.token && data?.user) setUser(data.user, data.token)
  } else {
    api.login(account.id)
    setUser(account)
  }
}

function logout() {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) api.logout(token).catch(() => {})
  localStorage.removeItem(TOKEN_KEY)
  state.user = null
  state.profile = null
  state.posts = []
}

async function loadPosts() {
  state.posts = await api.getPosts()
}

async function createPost(content, images = []) {
  if (!state.user) return { error: { message: '未登录' } }
  try {
    const { error } = await api.createPost(state.user.id, content, images)
    if (error) return { error }
    await loadPosts()
    return { error: null }
  } catch (e) {
    return { error: { message: '发布失败：' + (e?.message || '') } }
  }
}

async function deletePost(postId) {
  await api.deletePost(postId)
  await loadPosts()
}

async function deleteComment(commentId) {
  await api.deleteComment(commentId)
  await loadPosts()
}

async function clearPosts() {
  await api.clearPosts()
  await loadPosts()
}

async function toggleLike(post) {
  if (!state.user) return
  const liked = post.likes.some((l) => l.user_id === state.user.id)
  await api.toggleLike(post.id, state.user.id, liked)
  await loadPosts()
}

async function addComment(post, content) {
  if (!state.user) return
  const text = (content || '').trim()
  if (!text) return
  await api.createComment(post.id, state.user.id, text)
  await loadPosts()
}

export const store = {
  state: readonly(state),
  accounts: ACCOUNTS,
  isAuthenticated: computed(() => !!state.user),
  loadSession,
  loginAs,
  logout,
  loadPosts,
  createPost,
  deletePost,
  deleteComment,
  clearPosts,
  toggleLike,
  addComment,
  setTheme,
  applyTheme,
}
