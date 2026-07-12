import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '..', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })
const SECRET_FILE = path.join(DATA_DIR, '.secret')

// 与 db.js 同源的密钥：优先环境变量 APP_SECRET，其次持久化的 .secret
function loadKey() {
  if (process.env.APP_SECRET) {
    const k = Buffer.from(process.env.APP_SECRET, 'hex')
    if (k.length === 32) return k
  }
  try {
    const k = Buffer.from(fs.readFileSync(SECRET_FILE, 'utf8').trim(), 'hex')
    if (k.length === 32) return k
  } catch {}
  const k = crypto.randomBytes(32)
  fs.writeFileSync(SECRET_FILE, k.toString('hex'))
  return k
}

export const KEY = loadKey()

// 二进制加密：输出 iv(12) + authTag(16) + ciphertext 的二进制拼接，直接落盘
export function encryptBuffer(buf) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const enc = Buffer.concat([cipher.update(buf), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc])
}

export function decryptBuffer(buf) {
  // 二进制格式固定为 iv(12) + authTag(16) + ciphertext，至少 28 字节
  if (!Buffer.isBuffer(buf) || buf.length < 28) {
    throw new Error('密文长度不合法，可能不是加密文件')
  }
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()])
}
