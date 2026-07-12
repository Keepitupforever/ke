<template>
  <div class="auth-wrapper">
    <div class="auth-card">
      <div class="auth-logo-box">
        <div class="auth-logo">💕</div>
        <div class="auth-name">仅你我可见</div>
        <div class="auth-sub">属于我们的小世界</div>
      </div>

      <div class="auth-tip">选择一个身份，输入口令进入</div>

      <div class="account-list">
        <button
          v-for="acc in store.accounts"
          :key="acc.id"
          class="account-item"
          :class="{ active: selected === acc.id }"
          :disabled="!!loadingId || !!selected"
          @click="select(acc.id)"
        >
          <div class="account-avatar">{{ acc.name.charAt(0) }}</div>
          <div class="account-name">{{ acc.name }}</div>
          <span class="account-arrow">{{ selected === acc.id ? '🔒' : '›' }}</span>
        </button>
      </div>

      <div v-if="selected" class="pwd-box">
        <div class="pwd-title">
          以 <b>{{ selectedName }}</b> 的身份进入
        </div>
        <input
          ref="pwdInput"
          v-model="password"
          class="pwd-input"
          type="password"
          placeholder="请输入口令"
          :disabled="!!loadingId"
          @keyup.enter="enter"
        />
        <div v-if="error" class="pwd-error">{{ error }}</div>
        <div class="pwd-actions">
          <button class="pwd-back" :disabled="!!loadingId" @click="reset">返回</button>
          <button class="pwd-submit" :disabled="!!loadingId || !password" @click="enter">
            {{ loadingId ? '进入中…' : '进入' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { store } from '../store'

const router = useRouter()
const selected = ref(null)
const password = ref('')
const error = ref('')
const loadingId = ref(null)
const pwdInput = ref(null)

const selectedName = computed(() => store.accounts.find((a) => a.id === selected.value)?.name || '')

function select(id) {
  selected.value = id
  password.value = ''
  error.value = ''
  nextTick(() => pwdInput.value?.focus())
}
function reset() {
  selected.value = null
  password.value = ''
  error.value = ''
}

async function enter() {
  if (loadingId.value || !selected.value || !password.value) return
  loadingId.value = selected.value
  error.value = ''
  try {
    await store.loginAs(selected.value, password.value)
    router.push('/feed')
  } catch (e) {
    error.value = e?.message || '登录失败'
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
  background: var(--surface-2); border: 2px solid transparent; border-radius: 14px;
  padding: 14px 16px; cursor: pointer; text-align: left;
  transition: background 0.15s, opacity 0.15s, border-color 0.15s;
}
.account-item:active { background: var(--primary-soft); }
.account-item:disabled { opacity: 0.5; cursor: default; }
.account-item.active { border-color: var(--primary); background: var(--primary-soft); }
.account-avatar {
  width: 44px; height: 44px; border-radius: 22px; flex-shrink: 0;
  background: linear-gradient(135deg, #FF6B8A, #FF8E9E);
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 18px; font-weight: 600;
}
.account-name { font-size: 16px; font-weight: 600; color: var(--text); flex: 1; }
.account-arrow { color: var(--text-tertiary); font-size: 22px; }

.pwd-box {
  margin-top: 18px; padding: 16px; border-radius: 14px;
  background: var(--surface-2); display: flex; flex-direction: column; gap: 10px;
}
.pwd-title { font-size: 14px; color: var(--text-secondary); }
.pwd-input {
  width: 100%; box-sizing: border-box; height: 42px; padding: 0 14px;
  border: 1px solid var(--border); border-radius: 10px;
  background: var(--surface); color: var(--text); font-size: 15px; outline: none;
}
.pwd-input:focus { border-color: var(--primary); }
.pwd-error { font-size: 13px; color: #e5484d; }
.pwd-actions { display: flex; gap: 10px; }
.pwd-back, .pwd-submit {
  flex: 1; height: 42px; border-radius: 10px; font-size: 15px; font-weight: 600;
  cursor: pointer; border: none;
}
.pwd-back { background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); }
.pwd-submit { background: linear-gradient(135deg, #FF6B8A, #FF4770); color: #fff; }
.pwd-submit:disabled { opacity: 0.6; cursor: default; }
.pwd-back:active, .pwd-submit:active { transform: scale(0.98); }
</style>
