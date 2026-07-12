import { Router } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { authMiddleware } from '../auth.js'
import { encryptBuffer } from '../crypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('仅支持图片文件'))
  },
})

const router = Router()

router.post('/', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: { message: '未收到文件' } })
  const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg'
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
  const dest = path.join(UPLOAD_DIR, filename)
  try {
    // 确保目录存在（目录被删/未建时自愈），否则 writeFileSync 会抛 ENOENT
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    // 加密后落盘，磁盘上不再有明文图片
    fs.writeFileSync(dest, encryptBuffer(req.file.buffer))
  } catch (e) {
    console.error('[upload] 保存图片失败:', e)
    return res.status(500).json({ error: { message: '保存图片失败: ' + (e.code || e.message) } })
  }
  res.json({ url: `/uploads/${filename}` })
})

// 错误处理（文件过大 / 类型不符）
router.use((err, req, res, next) => {
  if (err) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `图片过大，请上传小于 ${MAX_FILE_SIZE / 1024 / 1024}MB 的图片`
      : (err.message || '上传失败')
    return res.status(400).json({ error: { message } })
  }
  next()
})

export default router
