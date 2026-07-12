<template>
  <div class="auth-wrapper">
    <div class="auth-card">
      <div class="auth-logo-box">
        <div class="auth-logo">💕</div>
        <div class="auth-name">仅你我可见</div>
        <div class="auth-sub">属于我们的小世界</div>
      </div>

      <div class="auth-tip">选择一个身份进入</div>

      <div class="account-list">
        <button
          v-for="acc in store.accounts"
          :key="acc.id"
          class="account-item"
          :class="{ loading: loadingId === acc.id }"
          :disabled="!!loadingId"
          @click="enter(acc.id)"
        >
          <div class="account-avatar">{{ acc.name.charAt(0) }}</div>
          <div class="account-name">{{ acc.name }}</div>
          <span class="account-arrow">{{ loadingId === acc.id ? '···' : '›' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { store } from '../store'

const router = useRouter()
const loadingId = ref(null)

async function enter(accountId) {
  if (loadingId.value) return
  loadingId.value = accountId
  try {
    await store.loginAs(accountId)
    router.push('/feed')
  } catch (e) {
    alert('登录失败：' + (e?.message || ''))
  } finally {
    loadingId.value = null
  }
}
</script>

<style scoped>
.auth-wrapper {
  min-height: 100vh;
  min-height: 100dvh;
  background: linear-gradient(135deg, #FF6B8A, #FF8E9E, #FFB3C1);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}
.auth-card {
  background: var(--surface); border-radius: 20px; padding: 30px 24px;
  width: 100%; max-width: 380px; box-shadow: var(--shadow-lg);
}
.auth-logo-box { text-align: center; margin-bottom: 22px; }
.auth-logo { font-size: 44px; margin-bottom: 8px; }
.auth-name { font-size: 24px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
.auth-sub { font-size: 14px; color: var(--text-tertiary); }

.auth-tip { text-align: center; font-size: 14px; color: var(--text-secondary); margin-bottom: 16px; }

.account-list { display: flex; flex-direction: column; gap: 12px; }
.account-item {
  display: flex; align-items: center; gap: 14px;
  background: var(--surface-2); border: none; border-radius: 14px;
  padding: 14px 16px; cursor: pointer; text-align: left;
  transition: background 0.15s, opacity 0.15s;
}
.account-item:active { background: var(--primary-soft); }
.account-item:disabled { opacity: 0.6; cursor: default; }
.account-avatar {
  width: 44px; height: 44px; border-radius: 22px; flex-shrink: 0;
  background: linear-gradient(135deg, #FF6B8A, #FF8E9E);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 18px; font-weight: 600;
}
.account-name { font-size: 16px; font-weight: 600; color: var(--text); flex: 1; }
.account-arrow { color: var(--text-tertiary); font-size: 22px; }
</style>
