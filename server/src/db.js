import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import { KEY } from './crypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '..', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const DB_FILE = path.join(DATA_DIR, 'db.json.enc') // 加密后的数据存储
const LEGACY_FILE = path.join(DATA_DIR, 'db.json') // 旧明文（迁移后删除）

// 会话 token 只存哈希（不可逆），即使数据文件泄露也无法还原出可用 token
export function hashToken(t) {
  return crypto.createHash('sha256').update(t).digest('hex')
}

// ---------- 加密 / 解密 (AES-256-GCM) ----------
function encrypt(obj) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':')
}
function decrypt(str) {
  const [ivB64, tagB64, encB64] = str.split(':')
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const dec = Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()])
  return JSON.parse(dec.toString('utf8'))
}

// ---------- 内存状态 ----------
const state = { users: [], posts: [], post_images: [], likes: [], comments: [], sessions: [], pets: [], pet: null, wallet: null, rewardedLikes: [] }

function assign(parsed) {
  for (const k of Object.keys(state)) {
    if (Array.isArray(state[k])) {
      if (Array.isArray(parsed[k])) state[k] = parsed[k]
    } else if (parsed[k] !== undefined) {
      // pet / wallet 等非数组字段直接覆盖
      state[k] = parsed[k]
    }
  }
}

function load() {
  // 1) 优先读取加密文件；解密失败仅记录，绝不覆盖（避免旧数据丢失）
  try {
    const parsed = decrypt(fs.readFileSync(DB_FILE, 'utf8'))
    if (parsed && typeof parsed === 'object') {
      assign(parsed)
      return
    }
    console.error('[db] 加密数据格式异常，保留原文件不覆盖')
  } catch (e) {
    console.error('[db] 读取加密数据失败，保留原文件不覆盖:', e.message)
  }
  // 2) 仅当加密文件不存在时，才尝试迁移旧的明文 db.json（并哈希化旧 session token）
  if (fs.existsSync(DB_FILE)) return
  try {
    const parsed = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8'))
    if (Array.isArray(parsed.sessions)) {
      const isHashed = (t) => /^[0-9a-f]{64}$/.test(t)
      for (const s of parsed.sessions) {
        if (s.token && !isHashed(s.token)) s.token = hashToken(s.token)
      }
    }
    assign(parsed)
    persist()
    try { fs.rmSync(LEGACY_FILE) } catch {}
  } catch {}
}

function persist() {
  // 原子写：先写临时文件再 rename，避免写入中途崩溃留下半截文件导致下次解密失败
  const tmp = DB_FILE + '.tmp'
  fs.writeFileSync(tmp, encrypt(state))
  fs.renameSync(tmp, DB_FILE)
}

// 先加载（填充 state），再建立 db 引用，保证二者指向同一批数组对象
load()
const db = { ...state }
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

// 迁移：旧版单宠物数据（pet 对象）并入 pets 数组
if (db.pet) {
  if (!Array.isArray(db.pets)) db.pets = []
  if (!db.pets.find((p) => p.id === db.pet.id)) db.pets.push(db.pet)
  delete db.pet
  db.persist()
}
