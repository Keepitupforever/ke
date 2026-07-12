// 独立的 SQLite 数据库服务进程（原生 better-sqlite3）
// 通过 Unix domain socket 提供 load / persist RPC，web 应用作为客户端连接它。
// 数据库文件仍为 AES-256-GCM 加密的 SQLite（与历史 db.sqlite.enc 兼容），
// 因为 SQLite 文件格式在 sql.js 与原生 better-sqlite3 之间完全通用。

import fs from 'fs'
import path from 'path'
import net from 'net'
import Database from 'better-sqlite3'
import { KEY, encryptBuffer, decryptBuffer } from './crypto.js'

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const DATA_DIR = process.env.KE_DATA_DIR
  ? path.resolve(process.env.KE_DATA_DIR)
  : path.resolve(__dirname, '..', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const SOCK = process.env.DB_SOCK || path.join(DATA_DIR, 'db.sock')
const DB_FILE = path.join(DATA_DIR, 'db.sqlite.enc')

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

let DB

function openDb() {
  if (fs.existsSync(DB_FILE)) {
    // 迁移安全网：首次启动时把旧（sql.js 生成的）加密库留一份备份
    const legacyBak = DB_FILE + '.from-sqljs.bak'
    if (!fs.existsSync(legacyBak)) {
      try { fs.copyFileSync(DB_FILE, legacyBak) } catch {}
    }
    const buf = decryptBuffer(fs.readFileSync(DB_FILE))
    DB = new Database(buf) // 从解密后的 buffer 在内存中打开（SQLite 格式通用）
  } else {
    DB = new Database(':memory:')
    persistFile() // 立即落盘一个空库，保证文件存在
  }
  DB.exec(SCHEMA)
}

function persistFile() {
  const buf = DB.serialize() // 导出完整数据库为 buffer
  const tmp = DB_FILE + '.tmp'
  fs.writeFileSync(tmp, encryptBuffer(buf))
  fs.renameSync(tmp, DB_FILE)
}

function loadAll() {
  const tables = ['users', 'sessions', 'posts', 'post_images', 'likes', 'comments', 'pets', 'rewarded_likes', 'wallet']
  const data = {}
  for (const t of tables) data[t] = DB.prepare(`SELECT * FROM ${t}`).all()
  return data
}

// 用 web 端发来的内存快照整体覆盖数据库（数据量小，简单可靠）
function applySnapshot(snap) {
  DB.exec('BEGIN')
  try {
    const ins = (table, cols, rows) => {
      DB.prepare(`DELETE FROM ${table}`).run()
      const stmt = DB.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      for (const row of rows || []) stmt.run(cols.map((c) => (row[c] === undefined ? null : row[c])))
    }
    ins('users', ['id', 'name', 'email', 'created_at'], snap.users)
    ins('sessions', ['token', 'user_id', 'created_at'], snap.sessions)
    ins('posts', ['id', 'user_id', 'content', 'created_at', 'deleted_at'], snap.posts)
    ins('post_images', ['id', 'post_id', 'url', 'sort_order'], snap.post_images)
    ins('likes', ['id', 'post_id', 'user_id', 'created_at', 'deleted_at'], snap.likes)
    ins('comments', ['id', 'post_id', 'user_id', 'content', 'created_at', 'deleted_at'], snap.comments)
    ins('pets', ['id', 'type', 'name', 'satiety', 'water', 'mood', 'health', 'adoptedAt', 'lastDecayAt', 'lastWateredAt'], snap.pets)

    DB.prepare('DELETE FROM rewarded_likes').run()
    const rstmt = DB.prepare('INSERT OR IGNORE INTO rewarded_likes (key) VALUES (?)')
    for (const k of snap.rewardedLikes || []) rstmt.run(k)

    DB.prepare('DELETE FROM wallet').run()
    if (snap.wallet && typeof snap.wallet === 'object') {
      const inv = snap.wallet.inventory || {}
      DB.prepare(
        'INSERT INTO wallet (id,coins,inv_carrot,inv_bone,inv_fish,inv_kibble,lastDailyDate) VALUES (1,?,?,?,?,?,?)'
      ).run([
        snap.wallet.coins || 0,
        inv.carrot || 0, inv.bone || 0, inv.fish || 0, inv.kibble || 0,
        snap.wallet.lastDailyDate || null,
      ])
    }
    DB.exec('COMMIT')
    persistFile()
  } catch (e) {
    try { DB.exec('ROLLBACK') } catch {}
    throw e
  }
}

function send(socket, obj) {
  socket.write(JSON.stringify(obj) + '\n')
}

const server = net.createServer((socket) => {
  let buf = ''
  socket.on('data', (chunk) => {
    buf += chunk.toString()
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 1)
      if (!line.trim()) continue
      let req
      try { req = JSON.parse(line) } catch { send(socket, { ok: false, error: 'bad-json' }); continue }
      try {
        if (req.op === 'ping') send(socket, { ok: true })
        else if (req.op === 'load') send(socket, { ok: true, data: loadAll() })
        else if (req.op === 'persist') { applySnapshot(req.snapshot); send(socket, { ok: true }) }
        else send(socket, { ok: false, error: 'unknown-op' })
      } catch (e) {
        send(socket, { ok: false, error: e.message })
      }
    }
  })
  socket.on('error', () => {})
})

// 清理可能残留的 socket 文件（上一次崩溃）
if (fs.existsSync(SOCK)) {
  try { fs.unlinkSync(SOCK) } catch {}
}

openDb()
server.listen(SOCK, () => {
  console.log(`[db-server] SQLite 服务已启动，监听 ${SOCK}`)
})
