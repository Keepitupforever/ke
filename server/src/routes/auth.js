import { Router } from 'express'
import crypto from 'crypto'
import db, { hashToken } from '../db.js'
import { authMiddleware } from '../auth.js'

const router = Router()

// 两个固定账号的登录口令（仅两人使用的小世界场景，明文存放于此）
const ACCOUNT_PASSWORDS = {
  me: 'kkll20010128', // 刘业磊
  wife: 'kkll19991224', // 任可
}

// 登录：选择身份 + 输入对应口令
router.post('/login', (req, res) => {
  const { userId, password } = req.body || {}
  if (!userId) return res.status(400).json({ error: { message: '缺少 userId' } })

  const user = db.users.find((u) => u.id === userId)
  if (!user) return res.status(404).json({ error: { message: '用户不存在' } })

  if (!password || password !== ACCOUNT_PASSWORDS[userId]) {
    return res.status(401).json({ error: { message: '口令错误' } })
  }

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
