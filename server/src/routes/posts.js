import { Router } from 'express'
import db from '../db.js'
import { authMiddleware } from '../auth.js'
import { awardCoins } from '../pets.js'

const router = Router()

// 将一行 post 聚合成前端需要的完整结构（含作者、图片、点赞、评论）
function buildPost(post) {
  const author = db.users.find((u) => u.id === post.user_id)
  const images = db.post_images
    .filter((i) => i.post_id === post.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => i.url)
  const likes = db.likes
    .filter((l) => l.post_id === post.id && !l.deleted_at)
    .map((l) => ({ id: l.id, user_id: l.user_id }))
  const comments = db.comments
    .filter((c) => c.post_id === post.id && !c.deleted_at)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((c) => {
      const cu = db.users.find((u) => u.id === c.user_id)
      return {
        ...c,
        profiles: { id: c.user_id, display_name: cu?.name || '用户', avatar_url: null },
      }
    })
  return {
    id: post.id,
    content: post.content,
    created_at: post.created_at,
    user_id: post.user_id,
    images,
    profiles: { id: post.user_id, display_name: author?.name || '用户', avatar_url: null },
    likes,
    comments,
  }
}

function getPost(id, includeDeleted = false) {
  const post = db.posts.find((p) => p.id === id)
  if (post && !includeDeleted && post.deleted_at) return undefined
  return post
}

// 列表（已软删除的动态不返回）
router.get('/', authMiddleware, (req, res) => {
  const posts = [...db.posts]
    .filter((p) => !p.deleted_at)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((p) => buildPost(p))
  res.json({ posts })
})

// 发布
router.post('/', authMiddleware, (req, res) => {
  const { content, images } = req.body || {}
  const text = (content || '').trim()
  const list = Array.isArray(images) ? images.slice(0, 9) : []
  if (!text && list.length === 0) {
    return res.status(400).json({ error: { message: '内容不能为空' } })
  }

  const id = db.uid()
  db.posts.push({ id, user_id: req.user.id, content: text, created_at: new Date().toISOString() })
  list.forEach((url, i) =>
    db.post_images.push({ id: db.uid(), post_id: id, url, sort_order: i })
  )
  db.persist()
  awardCoins('post')
  res.json({ post: buildPost(getPost(id)) })
})

// 清空自己所有的动态（软删除：仅打标记，不真正删除数据）
router.delete('/', authMiddleware, (req, res) => {
  const now = new Date().toISOString()
  db.posts
    .filter((p) => p.user_id === req.user.id && !p.deleted_at)
    .forEach((p) => { p.deleted_at = now })
  db.persist()
  res.json({ ok: true })
})

// 点赞 / 取消点赞
router.post('/:id/like', authMiddleware, (req, res) => {
  const post = getPost(req.params.id)
  if (!post) return res.status(404).json({ error: { message: '动态不存在' } })

  const existing = db.likes.find((l) => l.post_id === req.params.id && l.user_id === req.user.id)
  let liked
  const awardLike = () => {
    // 同一用户对同一动态仅首次点赞发币一次，避免反复点赞/取消刷币
    const key = req.user.id + ':' + req.params.id
    if (!Array.isArray(db.rewardedLikes)) db.rewardedLikes = []
    if (!db.rewardedLikes.includes(key)) {
      db.rewardedLikes.push(key)
      awardCoins('like')
    }
  }
  if (existing && !existing.deleted_at) {
    // 取消赞：软删除（打标记），再赞可恢复
    existing.deleted_at = new Date().toISOString()
    liked = false
  } else if (existing && existing.deleted_at) {
    // 重新点赞：恢复该条点赞记录（不新增），仍只发一次币
    delete existing.deleted_at
    liked = true
    awardLike()
  } else {
    db.likes.push({
      id: db.uid(),
      post_id: req.params.id,
      user_id: req.user.id,
      created_at: new Date().toISOString(),
    })
    liked = true
    awardLike()
  }
  db.persist()

  const likeCount = db.likes.filter((l) => l.post_id === req.params.id && !l.deleted_at).length
  res.json({ liked, likeCount })
})

// 评论
router.post('/:id/comments', authMiddleware, (req, res) => {
  const post = getPost(req.params.id)
  if (!post) return res.status(404).json({ error: { message: '动态不存在' } })

  const content = (req.body?.content || '').trim()
  if (!content) return res.status(400).json({ error: { message: '评论不能为空' } })

  const id = db.uid()
  db.comments.push({
    id,
    post_id: req.params.id,
    user_id: req.user.id,
    content,
    created_at: new Date().toISOString(),
  })
  db.persist()
  awardCoins('comment')

  const c = db.comments.find((x) => x.id === id)
  const cu = db.users.find((u) => u.id === c.user_id)
  res.json({
    comment: {
      ...c,
      profiles: { id: c.user_id, display_name: cu?.name || '用户', avatar_url: null },
    },
  })
})

// 删除评论（仅作者）
router.delete('/comments/:id', authMiddleware, (req, res) => {
  const c = db.comments.find((x) => x.id === req.params.id)
  if (!c) return res.status(404).json({ error: { message: '评论不存在' } })
  if (c.user_id !== req.user.id) {
    return res.status(403).json({ error: { message: '只能删除自己的评论' } })
  }
  c.deleted_at = new Date().toISOString()
  db.persist()
  res.json({ ok: true })
})

// 删除动态（仅作者，软删除：仅打标记，数据保留）
router.delete('/:id', authMiddleware, (req, res) => {
  const post = getPost(req.params.id)
  if (!post) return res.status(404).json({ error: { message: '动态不存在' } })
  if (post.user_id !== req.user.id) {
    return res.status(403).json({ error: { message: '只能删除自己的动态' } })
  }
  post.deleted_at = new Date().toISOString()
  db.persist()
  res.json({ ok: true })
})

export default router
