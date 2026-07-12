<template>
  <div class="post-card">
    <div class="post-header">
      <div class="post-user">
        <div class="post-avatar">{{ initial }}</div>
        <div>
          <div class="post-username">{{ displayName }}</div>
          <div class="post-time">{{ formattedTime }}</div>
        </div>
      </div>
      <button v-if="isOwner" class="post-more" @click="toggleMenu">···</button>
    </div>

    <!-- 更多操作菜单 -->
    <template v-if="showMenu">
      <div class="menu-mask" @click="showMenu = false"></div>
      <div class="post-menu">
        <button class="menu-item danger" @click="askDelete">删除动态</button>
      </div>
    </template>

    <div v-if="post.content" class="post-content">{{ post.content }}</div>

    <div
      v-if="imgCount > 0"
      class="post-images"
      :class="`cols-${imgCount <= 1 ? 1 : imgCount <= 4 ? 2 : 3}`"
    >
      <img
        v-for="(url, i) in post.images"
        :key="i"
        :src="url"
        alt=""
        class="post-img"
        loading="lazy"
        @click="openPreview(i)"
      />
    </div>

    <div class="post-actions">
      <button class="post-action" :class="{ liked: isLiked }" @click="onLike">
        <span class="like-icon" :class="{ animate: animating }">{{ isLiked ? '❤️' : '🤍' }}</span>
        <span>{{ post.likes?.length > 0 ? post.likes.length : '赞' }}</span>
      </button>
      <button class="post-action" :class="{ active: showComments }" @click="showComments = !showComments">
        <span>💬</span> {{ post.comments?.length > 0 ? post.comments.length : '评论' }}
      </button>
    </div>

    <div v-if="showComments" class="post-comments">
      <div v-if="post.comments?.length" class="comment-list">
        <div v-for="c in post.comments" :key="c.id" class="comment-item">
          <span class="comment-name">{{ c.profiles?.display_name || '用户' }}：</span>
          <span class="comment-text">{{ c.content }}</span>
          <button v-if="c.user_id === currentUserId" class="comment-del" @click="$emit('delete-comment', c.id)">×</button>
        </div>
      </div>
      <div v-else class="comment-empty">还没有评论，快来抢沙发～</div>

      <div class="comment-input">
        <input
          v-model="commentText"
          type="text"
          placeholder="说点什么…"
          maxlength="200"
          @keyup.enter="submitComment"
        />
        <button class="comment-send" :disabled="!commentText.trim()" @click="submitComment">发送</button>
      </div>
    </div>

    <!-- 图片大图预览 + 详情 -->
    <div v-if="previewIndex !== null" class="lightbox" @click="closePreview">
      <button class="lb-close" @click.stop="closePreview">×</button>

      <div class="lb-stage" @click.stop>
        <img
          v-if="!imgError"
          :src="post.images[previewIndex]"
          class="lightbox-img"
          @error="imgError = true"
        />
        <div v-else class="lb-fallback">图片加载失败 😢</div>

        <button v-if="imgCount > 1" class="lb-nav lb-prev" @click.stop="prevImg">‹</button>
        <button v-if="imgCount > 1" class="lb-nav lb-next" @click.stop="nextImg">›</button>
        <div v-if="imgCount > 1" class="lb-count">{{ previewIndex + 1 }} / {{ imgCount }}</div>
      </div>

      <div class="lb-detail" @click.stop>
        <div class="lb-detail-title">照片详情</div>
        <div class="lb-detail-head">
          <div class="lb-avatar">{{ initial }}</div>
          <div>
            <div class="lb-name">{{ displayName }}</div>
            <div class="lb-time">{{ formattedTime }}</div>
          </div>
        </div>
        <div v-if="post.content" class="lb-caption">{{ post.content }}</div>
        <div class="lb-meta">
          <span>❤️ {{ post.likes?.length || 0 }}</span>
          <span>💬 {{ post.comments?.length || 0 }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

const props = defineProps({
  post: { type: Object, required: true },
  currentUserId: { type: String, default: null },
})
const emit = defineEmits(['refresh', 'like', 'delete', 'comment', 'delete-comment'])

const animating = ref(false)
const showComments = ref(false)
const commentText = ref('')
const previewIndex = ref(null)
const imgError = ref(false)
const showMenu = ref(false)

function toggleMenu() {
  showMenu.value = !showMenu.value
}
function askDelete() {
  showMenu.value = false
  if (window.confirm('确定要删除这条动态吗？此操作不可恢复。')) {
    emit('delete', props.post.id)
  }
}

const isOwner = computed(() => props.post.user_id === props.currentUserId)
const isLiked = computed(() => props.post.likes?.some((l) => l.user_id === props.currentUserId) ?? false)
const displayName = computed(() => props.post.profiles?.display_name || '用户')
const initial = computed(() => displayName.value.charAt(0)?.toUpperCase() || '?')
const imgCount = computed(() => props.post.images?.length ?? 0)

const formattedTime = computed(() => {
  try {
    return format(new Date(props.post.created_at), 'MM月dd日 HH:mm', { locale: zhCN })
  } catch {
    return '刚刚'
  }
})

function onLike() {
  animating.value = true
  setTimeout(() => (animating.value = false), 300)
  emit('like', props.post)
}

function submitComment() {
  const text = commentText.value.trim()
  if (!text) return
  emit('comment', { post: props.post, content: text })
  commentText.value = ''
}

function openPreview(i) {
  previewIndex.value = i
  imgError.value = false
}
function closePreview() {
  previewIndex.value = null
}
function prevImg() {
  if (imgCount.value > 1) {
    previewIndex.value = (previewIndex.value - 1 + imgCount.value) % imgCount.value
    imgError.value = false
  }
}
function nextImg() {
  if (imgCount.value > 1) {
    previewIndex.value = (previewIndex.value + 1) % imgCount.value
    imgError.value = false
  }
}
</script>

<style scoped>
.post-card { position: relative; background: var(--surface); border-radius: 16px; padding: 16px; box-shadow: var(--shadow-sm); }
.post-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.post-user { display: flex; align-items: center; gap: 10px; }
.post-avatar {
  width: 40px; height: 40px; border-radius: 20px;
  background: linear-gradient(135deg, #FF6B8A, #FF8E9E);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 16px; font-weight: 600; flex-shrink: 0;
}
.post-username { font-size: 15px; font-weight: 600; color: var(--text); }
.post-time { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
.post-more {
  border: none; background: none; font-size: 18px; color: var(--text-tertiary);
  cursor: pointer; padding: 4px 8px; letter-spacing: 1px;
}
.menu-mask { position: fixed; inset: 0; z-index: 900; }
.post-menu {
  position: absolute; top: 46px; right: 12px; z-index: 901;
  background: var(--surface); border-radius: 10px; box-shadow: var(--shadow-md);
  overflow: hidden; min-width: 124px;
}
.menu-item {
  display: block; width: 100%; text-align: left; border: none; background: none;
  padding: 12px 16px; font-size: 14px; color: var(--text); cursor: pointer;
}
.menu-item.danger { color: #FF4770; }
.menu-item:hover { background: var(--surface-hover); }
.post-content { font-size: 15px; line-height: 1.6; color: var(--text); margin-bottom: 12px; white-space: pre-wrap; word-break: break-word; }

.post-images { display: grid; gap: 4px; margin-bottom: 8px; border-radius: 8px; overflow: hidden; }
.post-images.cols-1 { grid-template-columns: 1fr; }
.post-images.cols-2 { grid-template-columns: 1fr 1fr; }
.post-images.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
.post-img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; background: var(--surface-2); cursor: zoom-in; }
.post-images.cols-1 .post-img { aspect-ratio: auto; max-height: 360px; object-fit: contain; }

.post-actions {
  display: flex; align-items: center; gap: 4px;
  border-top: 1px solid var(--border); padding-top: 10px; margin-top: 4px;
}
.post-action {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 10px; border: none; background: none;
  font-size: 13px; color: var(--text-tertiary); cursor: pointer; border-radius: 8px; transition: background 0.15s;
}
.post-action:hover { background: var(--surface-hover); }
.post-action.liked { color: #FF6B8A; }
.post-action.active { color: #FF6B8A; }

.like-icon { display: inline-block; transition: transform 0.2s; }
.like-icon.animate { transform: scale(1.4); }

.post-comments { border-top: 1px solid var(--border); padding-top: 10px; margin-top: 4px; }
.comment-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.comment-item {
  display: flex; align-items: flex-start; gap: 4px;
  font-size: 14px; line-height: 1.5; color: var(--text);
  background: var(--surface-2); padding: 8px 10px; border-radius: 10px;
}
.comment-name { color: #FF6B8A; font-weight: 600; flex-shrink: 0; }
.comment-text { word-break: break-word; }
.comment-del {
  margin-left: auto; border: none; background: none; color: var(--text-tertiary);
  font-size: 16px; cursor: pointer; line-height: 1; padding: 0 2px; flex-shrink: 0;
}
.comment-del:hover { color: #FF6B8A; }
.comment-empty { font-size: 13px; color: var(--text-tertiary); padding: 4px 2px 10px; }
.comment-input { display: flex; gap: 8px; }
.comment-input input {
  flex: 1; border: 1px solid var(--border); background: var(--surface-2); border-radius: 18px;
  padding: 8px 14px; font-size: 14px; outline: none; color: var(--text);
}
.comment-input input:focus { border-color: var(--primary-light); }
.comment-send {
  border: none; border-radius: 18px; padding: 0 16px;
  background: linear-gradient(135deg, #FF6B8A, #FF4770); color: #fff;
  font-size: 14px; cursor: pointer;
}
.comment-send:disabled { opacity: 0.45; cursor: not-allowed; }

/* 大图预览 + 详情 */
.lightbox {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.92);
  display: flex; flex-direction: column;
  padding: 16px;
}
.lb-stage {
  flex: 1; min-height: 0; width: 100%;
  display: flex; align-items: center; justify-content: center;
  position: relative;
}
.lightbox-img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 6px; }
.lb-fallback { color: #fff; font-size: 15px; opacity: 0.85; text-align: center; }
.lb-nav {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 44px; height: 44px; border-radius: 22px; border: none;
  background: rgba(255,255,255,0.15); color: #fff; font-size: 28px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.lb-prev { left: 4px; }
.lb-next { right: 4px; }
.lb-close {
  position: absolute; top: 16px; right: 16px; z-index: 1001;
  width: 38px; height: 38px; border-radius: 19px; border: none;
  background: rgba(255,255,255,0.15); color: #fff; font-size: 22px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.lb-count {
  position: absolute; top: 18px; left: 50%; transform: translateX(-50%);
  color: #fff; font-size: 14px; background: rgba(0,0,0,0.4);
  padding: 4px 12px; border-radius: 14px;
}
.lb-detail {
  flex-shrink: 0; margin-top: 12px;
  background: rgba(255,255,255,0.06); border-radius: 14px;
  padding: 14px 16px; color: #fff;
  max-height: 38vh; overflow-y: auto;
}
.lb-detail-title {
  font-size: 13px; color: rgba(255,255,255,0.6);
  letter-spacing: 1px; margin-bottom: 10px;
}
.lb-detail-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.lb-avatar {
  width: 36px; height: 36px; border-radius: 18px;
  background: linear-gradient(135deg, #FF6B8A, #FF8E9E);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 15px; font-weight: 600; flex-shrink: 0;
}
.lb-name { font-size: 15px; font-weight: 600; }
.lb-time { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 2px; }
.lb-caption {
  font-size: 14px; line-height: 1.6; color: #fff;
  white-space: pre-wrap; word-break: break-word; margin-bottom: 8px;
}
.lb-meta { display: flex; gap: 16px; font-size: 13px; color: rgba(255,255,255,0.8); }
</style>
