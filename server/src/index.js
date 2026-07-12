import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import './db.js'
import authRoutes from './routes/auth.js'
import postRoutes from './routes/posts.js'
import uploadRoutes from './routes/upload.js'
import petRoutes from './routes/pets.js'
import { decryptBuffer } from './crypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 生产上传目录默认 server/uploads；测试时通过 KE_UPLOAD_DIR 指向独立目录，与生产隔离
const UPLOAD_DIR = process.env.KE_UPLOAD_DIR
  ? path.resolve(process.env.KE_UPLOAD_DIR)
  : path.resolve(__dirname, '..', 'uploads')
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '5mb' }))

// 加密图片的读取/解密服务（替代原来的静态明文服务）
const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
}
app.get('/uploads/:name', (req, res) => {
  const name = path.basename(req.params.name)
  if (!name) return res.status(400).end()
  const fp = path.join(UPLOAD_DIR, name)
  if (!fs.existsSync(fp)) return res.status(404).end()
  try {
    const raw = fs.readFileSync(fp)
    let out
    try {
      out = decryptBuffer(raw)
    } catch {
      out = raw // 兼容迁移前保留的明文图片
    }
    const ext = path.extname(name).toLowerCase()
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.send(out)
  } catch {
    res.status(500).end()
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/posts', postRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/pets', petRoutes)

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`moments-server 已启动: http://localhost:${PORT}`)
})
