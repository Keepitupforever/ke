import { Router } from 'express'
import crypto from 'crypto'
import db, { hashToken } from '../db.js'
import { authMiddleware } from '../auth.js'

const router = Router()

// 登录：选择身份即可（无密码，符合"仅两人"的小世界场景）
router.post('/login', (req, res) => {
  const { userId } = req.body || {}
  if (!userId) return res.status(400).json({ error: { message: '缺少 userId' } })

  const user = db.users.find((u) => u.id === userId)
  if (!user) return res.status(404).json({ error: { message: '用户不存在' } })

  const token = crypto.randomBytes(24).toString('hex')
  db.sessions.push({ token: hashToken(token), user_id: user.id, created_at: new Date().toISOString() })
  db.persist()
  res.json({ token, user })
})

// 获取当前登录用户
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user })
})

// 退出登录
router.post('/logout', authMiddleware, (req, res) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (token) db.sessions = db.sessions.filter((s) => s.token !== hashToken(token))
  db.persist()
  res.json({ ok: true })
})

export default router
