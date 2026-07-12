import db, { hashToken } from './db.js'

// 鉴权中间件：从 Authorization: Bearer <token> 解析当前用户
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: { message: '未登录' } })

  const session = db.sessions.find((s) => s.token === hashToken(token))
  if (!session) return res.status(401).json({ error: { message: '登录已过期' } })

  const user = db.users.find((u) => u.id === session.user_id)
  if (!user) return res.status(401).json({ error: { message: '用户不存在' } })

  req.user = user
  next()
}
