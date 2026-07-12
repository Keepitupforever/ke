<template>
  <div class="profile-page">
    <div class="profile-header-bg">
      <div class="profile-header-content">
        <div class="profile-avatar">
          <span>{{ initial }}</span>
        </div>
        <div class="profile-name">{{ store.state.profile?.name || '用户' }}</div>
        <div class="profile-email">{{ store.state.user?.email }}</div>
      </div>
    </div>

    <div class="profile-stats">
      <div class="profile-stat">
        <div class="profile-stat-num">{{ store.state.posts.length }}</div>
        <div class="profile-stat-label">动态</div>
      </div>
      <div class="profile-stat-divider" />
      <div class="profile-stat">
        <div class="profile-stat-num">❤️</div>
        <div class="profile-stat-label">收到的赞</div>
      </div>
    </div>

    <div class="profile-section">
      <div class="profile-section-title">身份</div>
      <div class="profile-bio-card">
        当前以「{{ store.state.profile?.name || '用户' }}」的身份浏览仅你我可见
      </div>
    </div>

    <div class="profile-section">
      <div class="profile-section-title">外观</div>
      <div class="theme-switch">
        <button
          v-for="opt in themeOptions"
          :key="opt.value"
          class="theme-option"
          :class="{ active: store.state.theme === opt.value }"
          @click="store.setTheme(opt.value)"
        >
          <span class="theme-icon">{{ opt.icon }}</span>
          <span class="theme-text">{{ opt.label }}</span>
        </button>
      </div>
    </div>

    <div class="profile-section">
      <div class="profile-section-title">设置</div>
      <div class="profile-menu-item" @click="switchAccount">
        <span>🔄</span> 切换身份 <span class="arrow">›</span>
      </div>
      <div class="profile-menu-item" @click="handleClear">
        <span>🧹</span> 清空动态 <span class="arrow">›</span>
      </div>
      <div class="profile-menu-item">
        <span>ℹ️</span> 关于 <span class="arrow">›</span>
      </div>
    </div>

    <button class="profile-logout" @click="handleLogout">退出登录</button>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { store } from '../store'

const router = useRouter()

const initial = computed(() => store.state.profile?.name?.charAt(0)?.toUpperCase() || '?')

const themeOptions = [
  { value: 'auto', icon: '🌗', label: '跟随系统' },
  { value: 'light', icon: '☀️', label: '浅色' },
  { value: 'dark', icon: '🌙', label: '深色' },
]

onMounted(() => store.loadPosts())

function switchAccount() {
  store.logout()
  router.push('/login')
}

async function handleClear() {
  if (confirm('确定清空所有动态和赞吗？（不会退出登录）')) {
    await store.clearPosts()
    alert('已清空动态数据')
  }
}

function handleLogout() {
  if (confirm('确定要退出登录吗？')) {
    store.logout()
    router.push('/login')
  }
}
</script>

<style scoped>
.profile-page { min-height: 100vh; min-height: 100dvh; background: var(--bg); padding-bottom: calc(80px + var(--safe-bottom)); }
.profile-header-bg {
  background: var(--gradient);
  padding: calc(24px + var(--safe-top)) var(--sp-5) 30px; border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}
.profile-header-content { text-align: center; }
.profile-avatar {
  width: 80px; height: 80px; border-radius: var(--radius-pill);
  background: rgba(255,255,255,0.3); border: 3px solid rgba(255,255,255,0.5);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 12px; font-size: 32px; color: #fff; font-weight: 600;
}
.profile-name { font-size: var(--fs-xl); font-weight: 700; color: #fff; margin-bottom: 4px; }
.profile-email { font-size: var(--fs-sm); color: rgba(255,255,255,0.75); }

.profile-stats {
  display: flex; background: var(--surface); margin: -20px var(--sp-4) 0;
  border-radius: var(--radius); padding: var(--sp-5); box-shadow: var(--shadow-md);
  border: 1px solid var(--border);
}
.profile-stat { flex: 1; text-align: center; }
.profile-stat-num { font-size: var(--fs-xl); font-weight: 700; color: var(--text); margin-bottom: 4px; }
.profile-stat-label { font-size: var(--fs-sm); color: var(--text-secondary); }
.profile-stat-divider { width: 1px; background: var(--border); }

.profile-section { padding: 0 var(--sp-4); margin-top: var(--sp-6); }
.profile-section-title { font-size: var(--fs-base); font-weight: 600; color: var(--text-secondary); margin-bottom: var(--sp-2); padding-left: 4px; }

.profile-bio-card {
  background: var(--surface); border-radius: var(--radius); padding: var(--sp-4);
  color: var(--text-secondary); font-size: var(--fs-base); line-height: 1.6;
  border: 1px solid var(--border);
}

.theme-switch {
  display: flex; gap: var(--sp-2); background: var(--surface);
  border-radius: var(--radius); padding: 6px; border: 1px solid var(--border);
}
.theme-option {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 4px; border: none; background: transparent; cursor: pointer;
  border-radius: var(--radius-sm); color: var(--text-secondary);
  transition: background 0.2s, color 0.2s;
}
.theme-option.active { background: var(--primary-soft); color: var(--primary); }
.theme-icon { font-size: var(--fs-lg); }
.theme-text { font-size: var(--fs-sm); font-weight: 500; }

.profile-menu-item {
  display: flex; align-items: center; gap: 12px;
  background: var(--surface); padding: 14px 16px; border-radius: var(--radius);
  margin-bottom: var(--sp-2); font-size: var(--fs-base); color: var(--text); cursor: pointer;
  border: 1px solid var(--border); transition: background 0.15s;
}
.profile-menu-item:hover { background: var(--surface-hover); }
.profile-menu-item .arrow { margin-left: auto; color: var(--text-tertiary); font-size: 20px; }

.profile-logout {
  display: block; margin: 30px auto 0; padding: 14px 60px;
  border: 1px solid var(--primary-light); border-radius: var(--radius-pill);
  background: var(--surface); color: var(--primary); font-size: var(--fs-md); font-weight: 500; cursor: pointer;
  transition: background 0.15s;
}
.profile-logout:active { background: var(--primary-soft); }
</style>
