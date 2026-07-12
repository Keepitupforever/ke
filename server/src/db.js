import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import initSqlJs from 'sql.js'
import { KEY, encryptBuffer, decryptBuffer } from './crypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 生产库默认在 server/data；测试时通过 KE_DATA_DIR 指向独立目录，永不触碰生产库
const DATA_DIR = process.env.KE_DATA_DIR
  ? path.resolve(process.env.KE_DATA_DIR)
  : path.resolve(__dirname, '..', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const DB_FILE = path.join(DATA_DIR, 'db.sqlite.enc') // 加密后的 SQLite 数据库（新格式）
const LEGACY_ENC = path.join(DATA_DIR, 'db.json.enc') // 旧：加密 JSON（迁移来源，保留作备份）
const LEGACY_PLAIN = path.join(DATA_DIR, 'db.json') // 更旧：明文 JSON

// 会话 token 只存哈希（不可逆），即使数据文件泄露也无法还原出可用 token
export function hashToken(t) {
  return crypto.createHash('sha256').update(t).digest('hex')
}

// ---------- 初始化 sql.js（纯 WASM，无原生依赖，随包内置 wasm） ----------
const WASM_FILE = path.resolve(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(WASM_FILE) })

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT, email TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY, user_id TEXT, content TEXT, created_at TEXT, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS post_images (
  id TEXT PRIMARY KEY, post_id TEXT, url TEXT, sort_order INTEGER
);
CREATE TABLE IF NOT EXISTS likes (
  id TEXT PRIMARY KEY, post_id TEXT, user_id TEXT, created_at TEXT, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, post_id TEXT, user_id TEXT, content TEXT, created_at TEXT, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS pets (
  id TEXT PRIMARY KEY, type TEXT, name TEXT,
  satiety REAL, water REAL, mood REAL, health REAL,
  adoptedAt TEXT, lastDecayAt TEXT, lastWateredAt TEXT
);
CREATE TABLE IF NOT EXISTS rewarded_likes (
  key TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS wallet (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  coins INTEGER,
  inv_carrot INTEGER, inv_bone INTEGER, inv_fish INTEGER, inv_kibble INTEGER,
  lastDailyDate TEXT
);
`

// ---------- 内存工作集：路由层直接读写这些数组/对象（接口保持不变） ----------
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

// 去掉值为 null/undefined 的字段，避免把空的 deleted_at 等写进对象
function compact(obj) {
  for (const k of Object.keys(obj)) {
    if (obj[k] === null || obj[k] === undefined) delete obj[k]
  }
  return obj
}

function readAll(sqldb, table) {
  const rows = []
  const stmt = sqldb.prepare(`SELECT * FROM ${table}`)
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

// 从一个已打开的 SQLite 数据库把数据装载进内存工作集
function loadFromSqlite(sqldb) {
  db.users = readAll(sqldb, 'users')
  db.sessions = readAll(sqldb, 'sessions')
  db.posts = readAll(sqldb, 'posts').map(compact)
  db.post_images = readAll(sqldb, 'post_images')
  db.likes = readAll(sqldb, 'likes').map(compact)
  db.comments = readAll(sqldb, 'comments').map(compact)
  db.pets = readAll(sqldb, 'pets').map((p) => compact({ ...p }))
  db.rewardedLikes = readAll(sqldb, 'rewarded_likes').map((r) => r.key)
  const w = readAll(sqldb, 'wallet')[0]
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

// 兼容旧格式：把一份 JSON 结构（数组集合）装载进内存工作集
function loadFromJson(parsed) {
  const arr = (v) => (Array.isArray(v) ? v : [])
  db.users = arr(parsed.users)
  db.sessions = arr(parsed.sessions)
  db.posts = arr(parsed.posts)
  db.post_images = arr(parsed.post_images)
  db.likes = arr(parsed.likes)
  db.comments = arr(parsed.comments)
  db.pets = arr(parsed.pets)
  db.rewardedLikes = arr(parsed.rewardedLikes)
  db.wallet = parsed.wallet && typeof parsed.wallet === 'object' ? parsed.wallet : null
  // 兼容更旧的单宠物字段
  if (parsed.pet && typeof parsed.pet === 'object') {
    if (!db.pets.find((p) => p.id === parsed.pet.id)) db.pets.push(parsed.pet)
  }
}

// 旧的加密 JSON 解密（历史格式："iv:tag:ciphertext" 三段 base64 拼接，明文为 JSON）
function decryptLegacyJson(str) {
  const [ivB64, tagB64, encB64] = str.split(':')
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const dec = Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()])
  return JSON.parse(dec.toString('utf8'))
}

function load() {
  // 1) 优先读取新的加密 SQLite 库
  if (fs.existsSync(DB_FILE)) {
    try {
      const bytes = decryptBuffer(fs.readFileSync(DB_FILE))
      const sqldb = new SQL.Database(bytes)
      loadFromSqlite(sqldb)
      sqldb.close()
      return
    } catch (e) {
      console.error('[db] 读取加密 SQLite 失败，保留原文件不覆盖:', e.message)
      return // 绝不在读取失败时覆盖，避免数据丢失
    }
  }

  // 2) 迁移：旧的加密 JSON（db.json.enc）→ SQLite，原文件保留作备份
  if (fs.existsSync(LEGACY_ENC)) {
    try {
      const parsed = decryptLegacyJson(fs.readFileSync(LEGACY_ENC, 'utf8'))
      loadFromJson(parsed)
      persist() // 写出新的 SQLite 库
      try {
        fs.copyFileSync(LEGACY_ENC, LEGACY_ENC + '.bak')
      } catch {}
      console.log('[db] 已从旧加密 JSON 迁移到 SQLite（原文件保留为 .bak 备份）')
      return
    } catch (e) {
      console.error('[db] 迁移旧加密 JSON 失败:', e.message)
    }
  }

  // 3) 迁移：更旧的明文 JSON（db.json）→ SQLite，并哈希化旧 session token
  if (fs.existsSync(LEGACY_PLAIN)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(LEGACY_PLAIN, 'utf8'))
      const isHashed = (t) => /^[0-9a-f]{64}$/.test(t)
      if (Array.isArray(parsed.sessions)) {
        for (const s of parsed.sessions) {
          if (s.token && !isHashed(s.token)) s.token = hashToken(s.token)
        }
      }
      loadFromJson(parsed)
      persist()
      console.log('[db] 已从旧明文 JSON 迁移到 SQLite')
    } catch (e) {
      console.error('[db] 迁移旧明文 JSON 失败:', e.message)
    }
  }
}

// 把当前内存工作集完整写入一个全新的 SQLite 库，再加密落盘（原子写）
function persist() {
  const sqldb = new SQL.Database()
  sqldb.run(SCHEMA)
  sqldb.run('BEGIN')
  try {
    const insUser = sqldb.prepare('INSERT INTO users (id,name,email,created_at) VALUES (?,?,?,?)')
    for (const u of db.users) insUser.run([u.id, u.name ?? null, u.email ?? null, u.created_at ?? null])
    insUser.free()

    const insSession = sqldb.prepare('INSERT INTO sessions (token,user_id,created_at) VALUES (?,?,?)')
    for (const s of db.sessions) insSession.run([s.token, s.user_id ?? null, s.created_at ?? null])
    insSession.free()

    const insPost = sqldb.prepare('INSERT INTO posts (id,user_id,content,created_at,deleted_at) VALUES (?,?,?,?,?)')
    for (const p of db.posts) insPost.run([p.id, p.user_id ?? null, p.content ?? null, p.created_at ?? null, p.deleted_at ?? null])
    insPost.free()

    const insImg = sqldb.prepare('INSERT INTO post_images (id,post_id,url,sort_order) VALUES (?,?,?,?)')
    for (const i of db.post_images) insImg.run([i.id, i.post_id ?? null, i.url ?? null, i.sort_order ?? 0])
    insImg.free()

    const insLike = sqldb.prepare('INSERT INTO likes (id,post_id,user_id,created_at,deleted_at) VALUES (?,?,?,?,?)')
    for (const l of db.likes) insLike.run([l.id, l.post_id ?? null, l.user_id ?? null, l.created_at ?? null, l.deleted_at ?? null])
    insLike.free()

    const insComment = sqldb.prepare('INSERT INTO comments (id,post_id,user_id,content,created_at,deleted_at) VALUES (?,?,?,?,?,?)')
    for (const c of db.comments) insComment.run([c.id, c.post_id ?? null, c.user_id ?? null, c.content ?? null, c.created_at ?? null, c.deleted_at ?? null])
    insComment.free()

    const insPet = sqldb.prepare('INSERT INTO pets (id,type,name,satiety,water,mood,health,adoptedAt,lastDecayAt,lastWateredAt) VALUES (?,?,?,?,?,?,?,?,?,?)')
    for (const p of db.pets) {
      insPet.run([
        p.id, p.type ?? null, p.name ?? null,
        p.satiety ?? null, p.water ?? null, p.mood ?? null, p.health ?? null,
        p.adoptedAt ?? null, p.lastDecayAt ?? null, p.lastWateredAt ?? null,
      ])
    }
    insPet.free()

    const insReward = sqldb.prepare('INSERT OR IGNORE INTO rewarded_likes (key) VALUES (?)')
    for (const k of db.rewardedLikes) insReward.run([k])
    insReward.free()

    if (db.wallet && typeof db.wallet === 'object') {
      const inv = db.wallet.inventory || {}
      sqldb.run(
        'INSERT INTO wallet (id,coins,inv_carrot,inv_bone,inv_fish,inv_kibble,lastDailyDate) VALUES (1,?,?,?,?,?,?)',
        [
          db.wallet.coins || 0,
          inv.carrot || 0, inv.bone || 0, inv.fish || 0, inv.kibble || 0,
          db.wallet.lastDailyDate || null,
        ]
      )
    }

    sqldb.run('COMMIT')
    const bytes = Buffer.from(sqldb.export())
    sqldb.close()

    const tmp = DB_FILE + '.tmp'
    fs.writeFileSync(tmp, encryptBuffer(bytes))
    fs.renameSync(tmp, DB_FILE)
  } catch (e) {
    try { sqldb.close() } catch {}
    throw e
  }
}

// 先加载，再挂上方法
load()
db.persist = persist
db.uid = () => crypto.randomUUID()
export default db

// 种子数据：固定的两个账号（我 / 我老婆）
const SEED_USERS = [
  { id: 'me', name: '刘业磊', email: 'me@us.com' },
  { id: 'wife', name: '任可', email: 'wife@us.com' },
]
let seeded = false
for (const u of SEED_USERS) {
  if (!db.users.find((x) => x.id === u.id)) {
    db.users.push({ ...u, created_at: new Date().toISOString() })
    seeded = true
  }
}
if (seeded) db.persist()
