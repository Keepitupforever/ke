import { Router } from 'express'
import { authMiddleware } from '../auth.js'
import * as pets from '../pets.js'

const router = Router()

// 统一的同步业务调用 + 错误处理
function handle(fn) {
  return (req, res) => {
    try {
      const data = fn(req)
      res.json(data)
    } catch (e) {
      res.status(e.status || 400).json({ error: { message: e.message || '操作失败' } })
    }
  }
}

router.get('/', authMiddleware, handle(() => pets.getPetState()))
router.post('/adopt', authMiddleware, handle((req) => pets.adoptPet(req.body?.type, req.body?.name)))
router.post('/feed', authMiddleware, handle((req) => pets.feedPet(req.body?.food)))
router.post('/water', authMiddleware, handle(() => pets.waterPet()))
router.post('/buy', authMiddleware, handle((req) => pets.buyFood(req.body?.food, req.body?.qty)))
router.post('/daily', authMiddleware, handle(() => pets.claimDaily()))

export default router
