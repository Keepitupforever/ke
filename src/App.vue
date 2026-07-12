<template>
  <div v-if="store.state.loading" class="app-loading">
    <div class="app-loading-icon">💕</div>
    <div class="app-loading-title">仅你我可见</div>
    <div class="app-spinner" />
  </div>

  <template v-else>
    <router-view />

    <nav v-if="showTabBar" class="tab-bar">
      <router-link to="/feed" class="tab-item" :class="{ active: isFeed }">
        <span class="tab-icon">{{ isFeed ? '💕' : '🤍' }}</span>
        <span class="tab-label">朋友圈</span>
      </router-link>
      <router-link to="/pet" class="tab-item" :class="{ active: isPet }">
        <span class="tab-icon">🐾</span>
        <span class="tab-label">宠物</span>
      </router-link>
      <router-link to="/profile" class="tab-item" :class="{ active: isProfile }">
        <span class="tab-icon">👤</span>
        <span class="tab-label">我的</span>
      </router-link>
    </nav>
  </template>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { store } from './store'

const route = useRoute()
const isFeed = computed(() => route.name === 'feed')
const isPet = computed(() => route.name === 'pet')
const isProfile = computed(() => route.name === 'profile')
const showTabBar = computed(() => store.isAuthenticated.value && (isFeed.value || isPet.value || isProfile.value))

onMounted(() => store.loadSession())
</script>

<style>
.app-loading {
  min-height: 100vh;
  background: linear-gradient(135deg, #FF6B8A, #FF8E9E, #FFB3C1);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.app-loading-icon { font-size: 50px; }
.app-loading-title { font-size: 24px; font-weight: 700; color: #fff; margin-top: 12px; }
.app-spinner {
  width: 32px; height: 32px; margin-top: 20px;
  border: 3px solid rgba(255,255,255,0.3); border-top-color: #fff;
  border-radius: 50%; animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.app { max-width: 500px; margin: 0 auto; position: relative; min-height: 100vh; background: var(--bg); }

.tab-bar {
  position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
  width: 100%; max-width: 500px;
  display: flex; background: var(--surface); border-top: 1px solid var(--border);
  padding: 6px 0; z-index: 100;
}
.tab-item {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 6px 0; border: none; background: none; cursor: pointer;
  color: var(--text-tertiary); font-size: 14px; text-decoration: none;
}
.tab-item.active { color: var(--primary); }
.tab-icon { font-size: 20px; }
.tab-label { font-size: 10px; font-weight: 500; }
</style>
