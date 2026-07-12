<template>
  <div
    class="feed-page"
    ref="feedEl"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
  >
    <div class="feed-refresh" :style="{ height: pullDistance + 'px' }">
      <span class="feed-refresh-icon" :class="{ spinning: refreshing }">
        {{ refreshing ? '🔄' : '↓' }}
      </span>
      <span>{{ refreshing ? '刷新中...' : pullDistance > 50 ? '松手刷新' : '下拉刷新' }}</span>
    </div>

    <div class="together-banner">
      <div class="together-label">💞 我们已经在一起</div>
      <div class="together-main">{{ togetherText }}</div>
      <div class="together-sub">
        自 {{ sinceLabel }} 起 · 已携手 {{ together.totalDays }} 天 {{ pad(together.h) }}:{{ pad(together.m) }}:{{ pad(together.s) }}
      </div>
    </div>

    <div class="feed-header">
      <div>
        <div class="feed-header-title">我们的朋友圈</div>
        <div class="feed-header-count">{{ store.state.posts.length }} 条动态</div>
      </div>
      <div class="feed-header-actions">
        <button class="feed-create-btn" @click="goCreate">＋ 发表</button>
        <button class="feed-refresh-btn" :class="{ spinning: refreshing }" @click="doRefresh" :disabled="refreshing">
          🔄
        </button>
      </div>
    </div>

    <div v-if="store.state.posts.length === 0" class="feed-empty">
      <div class="feed-empty-icon">📝</div>
      <div class="feed-empty-title">还没有动态</div>
      <div class="feed-empty-hint">点击下方按钮发布第一条吧</div>
    </div>

    <div v-else class="feed-list">
      <PostCard
        v-for="post in store.state.posts"
        :key="post.id"
        :post="post"
        :current-user-id="store.state.user?.id"
        @refresh="store.loadPosts"
        @like="store.toggleLike"
        @delete="store.deletePost"
        @comment="onComment"
        @delete-comment="onDeleteComment"
      />
    </div>

    <button class="feed-fab" @click="goCreate">+</button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { store } from '../store'
import * as api from '../service'
import PostCard from '../components/PostCard.vue'

const router = useRouter()
const feedEl = ref(null)

// ---------- 在一起时间（自 2026-07-05 起，实时刷新） ----------
const SINCE = new Date(api.TOGETHER_SINCE)
const sinceLabel = api.TOGETHER_SINCE.slice(0, 10)
const together = ref(computeTogether())

function pad(n) {
  return String(n).padStart(2, '0')
}
function computeTogether() {
  const now = new Date()
  const diffMs = Math.max(0, now - SINCE)
  const totalSeconds = Math.floor(diffMs / 1000)
  // 算上第一天：在一起天数 = 已过整天数 + 1
  const totalDays = Math.floor(totalSeconds / 86400) + 1
  let years = now.getFullYear() - SINCE.getFullYear()
  let months = now.getMonth() - SINCE.getMonth()
  let days = now.getDate() - SINCE.getDate()
  if (days < 0) {
    months--
    const prev = new Date(now.getFullYear(), now.getMonth(), 0)
    days += prev.getDate()
  }
  if (months < 0) {
    years--
    months += 12
  }
  // 算上第一天：日期部分 +1，并处理跨月进位
  days += 1
  const daysInSinceMonth = new Date(SINCE.getFullYear(), SINCE.getMonth() + 1, 0).getDate()
  if (days > daysInSinceMonth) {
    days -= daysInSinceMonth
    months += 1
    if (months > 11) {
      months -= 12
      years += 1
    }
  }
  const h = Math.floor((totalSeconds % 86400) / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return { years, months, days, h, m, s, totalDays }
}
const togetherText = computed(() => {
  const { years, months, days } = together.value
  if (years > 0) return `${years} 年 ${months} 个月 ${days} 天`
  if (months > 0) return `${months} 个月 ${days} 天`
  return `${days} 天`
})
let ticker = null

const refreshing = ref(false)
const pullDistance = ref(0)
let startY = 0

function onTouchStart(e) {
  if ((window.scrollY || 0) <= 0 && !refreshing.value) startY = e.touches[0].clientY
  else startY = 0
}
function onTouchMove(e) {
  if (!startY || refreshing.value) return
  if ((window.scrollY || 0) > 0) return
  const d = e.touches[0].clientY - startY
  if (d > 0) pullDistance.value = Math.min(d, 80)
}
function onTouchEnd() {
  if (pullDistance.value > 50) doRefresh()
  pullDistance.value = 0
  startY = 0
}

async function doRefresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await store.loadPosts()
  } finally {
    refreshing.value = false
  }
}

onMounted(() => {
  store.loadPosts()
  ticker = setInterval(() => {
    together.value = computeTogether()
  }, 1000)
})
onUnmounted(() => {
  if (ticker) clearInterval(ticker)
})
function goCreate() { router.push('/create') }
function onComment({ post, content }) { store.addComment(post, content) }
async function onDeleteComment(commentId) { await store.deleteComment(commentId) }
</script>

<style scoped>
.feed-page { min-height: 100vh; min-height: 100dvh; padding-bottom: 80px; background: var(--bg); }
.feed-refresh {
  overflow: hidden;
  display: flex; align-items: flex-end; justify-content: center; gap: 6px;
  font-size: 12px; color: var(--text-tertiary); background: var(--bg);
  transition: height 0.2s;
}
.feed-refresh span { padding-bottom: 6px; }
.feed-refresh-icon { display: inline-block; }
.feed-refresh-icon.spinning { animation: spin 0.7s linear infinite; }

.feed-header {
  background: linear-gradient(135deg, #FF6B8A, #FF8E9E);
  padding: 50px 20px 18px; border-radius: 0 0 20px 20px;
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; justify-content: space-between;
}
.feed-header-title { font-size: 22px; font-weight: 700; color: #fff; }
.feed-header-count { font-size: 13px; color: rgba(255,255,255,0.7); margin-top: 2px; }
.feed-header-actions { display: flex; align-items: center; gap: 8px; }
.feed-create-btn {
  border: none; background: rgba(255,255,255,0.95); color: #FF4770;
  height: 36px; padding: 0 14px; border-radius: 18px; font-size: 14px; font-weight: 600;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
.feed-create-btn:active { transform: scale(0.96); }
.feed-refresh-btn {
  border: none; background: rgba(255,255,255,0.2); color: #fff;
  width: 36px; height: 36px; border-radius: 18px; font-size: 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.feed-refresh-btn.spinning { animation: spin 0.7s linear infinite; }
.feed-refresh-btn:disabled { opacity: 0.7; }

.feed-list { padding: 16px; display: flex; flex-direction: column; gap: 12px; }

.feed-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 80px 40px; text-align: center;
}
.feed-empty-icon { font-size: 60px; margin-bottom: 16px; }
.feed-empty-title { font-size: 20px; font-weight: 600; color: var(--text); margin-bottom: 8px; }
.feed-empty-hint { font-size: 14px; color: var(--text-tertiary); }

.feed-fab {
  position: fixed; right: 20px; bottom: 84px;
  width: 56px; height: 56px; border-radius: 28px; border: none;
  background: linear-gradient(135deg, #FF6B8A, #FF4770);
  color: #fff; font-size: 28px; cursor: pointer;
  box-shadow: 0 6px 20px rgba(255,107,138,0.35);
  display: flex; align-items: center; justify-content: center;
  z-index: 20; transition: transform 0.15s;
}
.feed-fab:active { transform: scale(0.92); }
.feed-fab span { margin-top: -2px; }

.together-banner {
  background: linear-gradient(135deg, #FF8E9E, #FFB3C1);
  padding: 22px 20px 18px; text-align: center; color: #fff;
}
.together-label { font-size: 14px; opacity: 0.9; }
.together-main {
  font-size: 24px; font-weight: 700; margin-top: 6px; letter-spacing: 0.5px;
  text-shadow: 0 1px 4px rgba(0,0,0,0.12);
}
.together-sub { font-size: 13px; opacity: 0.85; margin-top: 6px; font-variant-numeric: tabular-nums; }

@keyframes spin { to { transform: rotate(360deg); } }
</style>
