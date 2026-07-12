// db 客户端：内存数组接口保持不变（路由层零改动），
// 数据实际由独立的 db-server 进程持有（原生 better-sqlite3 + 加密 SQLite）。
// 启动时通过 Unix socket 从 db-server 拉取全量数据；写操作经队列异步持久化到 db-server。

import path from 'path'
import net from 'net'
import crypto from 'crypto'

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const DATA_DIR = process.env.KE_DATA_DIR
  ? path.resolve(process.env.KE_DATA_DIR)
  : path.resolve(__dirname, '..', 'data')
const SOCK = process.env.DB_SOCK || path.join(DATA_DIR, 'db.sock')

// 会话 token 只存哈希（不可逆），即使数据文件泄露也无法还原出可用 token
export function hashToken(t) {
  return crypto.createHash('sha256').update(t).digest('hex')
}

const db = {
  users: [],
  posts: [],
  post_images: [],
  likes: [],
  comments: [],
  sessions: [],
  pets: [],
  wallet: null,
  rewardedLikes: [],
}

function compact(obj) {
  for (const k of Object.keys(obj)) {
    if (obj[k] === null || obj[k] === undefined) delete obj[k]
  }
  return obj
}

function applyLoaded(data) {
  db.users = data.users || []
  db.sessions = data.sessions || []
  db.posts = (data.posts || []).map(compact)
  db.post_images = data.post_images || []
  db.likes = (data.likes || []).map(compact)
  db.comments = (data.comments || []).map(compact)
  db.pets = (data.pets || []).map((p) => compact({ ...p }))
  db.rewardedLikes = (data.rewarded_likes || []).map((r) => r.key)
  const w = (data.wallet || [])[0]
  db.wallet = w
    ? {
        coins: w.coins || 0,
        inventory: {
          carrot: w.inv_carrot || 0,
          bone: w.inv_bone || 0,
          fish: w.inv_fish || 0,
          kibble: w.inv_kibble || 0,
        },
        lastDailyDate: w.lastDailyDate || null,
      }
    : null
}

function rpc(req) {
  return new Promise((resolve, reject) => {
    const s = net.connect(SOCK)
    let buf = ''
    let done = false
    s.on('connect', () => s.write(JSON.stringify(req) + '\n'))
    s.on('data', (d) => {
      buf += d.toString()
      const i = buf.indexOf('\n')
      if (i >= 0 && !done) {
        done = true
        try { resolve(JSON.parse(buf.slice(0, i))) } catch (e) { reject(e) }
        s.end()
      }
    })
    s.on('error', (e) => reject(e))
    s.on('close', () => { if (!done) reject(new Error('db-server 未响应（是否已启动？）')) })
  })
}

// 顶层 await：启动时从独立 DB 进程加载全部数据（带重试，容忍 web 先于 db-server 启动）
async function loadWithRetry(attempts = 20) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await rpc({ op: 'load' })
      if (r.ok) return r
      lastErr = new Error('db-server load 失败: ' + r.error)
    } catch (e) {
      lastErr = e
    }
    await new Promise((res) => setTimeout(res, 300))
  }
  throw lastErr
}
const loaded = await loadWithRetry()
applyLoaded(loaded.data)
console.log(`[db] 已从 db-server 加载: users=${db.users.length} posts=${db.posts.length} pets=${db.pets.length} likes=${db.likes.length}`)

// persist：把内存快照经队列串行发给 db-server（fire-and-forget，不阻塞路由）
let queue = Promise.resolve()
function persist() {
  const snapshot = JSON.parse(JSON.stringify({
    users: db.users,
    sessions: db.sessions,
    posts: db.posts,
    post_images: db.post_images,
    likes: db.likes,
    comments: db.comments,
    pets: db.pets,
    rewardedLikes: db.rewardedLikes,
    wallet: db.wallet,
  }))
  queue = queue.then(() => rpc({ op: 'persist', snapshot })).catch((e) => console.error('[db] persist 错误:', e.message))
  return queue
}

// 对外暴露给路由层（它们通过 db.persist() / db.hashToken() 调用）
// 生成唯一 ID（路由层通过 db.uid() 调用）
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}
db.uid = uid

db.persist = persist
db.hashToken = hashToken

// 优雅退出时确保所有待持久化都落盘
export function flush() { return queue }

export default db
