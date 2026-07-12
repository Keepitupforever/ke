<template>
  <div class="pet-page">
    <div class="pet-header">
      <div class="pet-coin">
        <span class="pet-coin-emoji">🪙</span>
        <span class="pet-coin-num">{{ store.state.wallet.coins }}</span>
        <span class="pet-coin-label">粮食币</span>
      </div>
      <div class="pet-header-title">我们的宠物</div>
    </div>

    <!-- 宠物切换条 -->
    <div v-if="store.state.petLoaded && hasPet" class="pet-tabs">
      <button
        v-for="p in pets"
        :key="p.id"
        class="pet-tab"
        :class="{ active: activePet && p.id === activePet.id }"
        @click="selectPet(p.id)"
      >
        <span class="pet-tab-emoji">{{ petTypeOf(p).emoji }}</span>
        <span class="pet-tab-name">{{ p.name }}</span>
        <span class="pet-tab-del" title="送走" @click.stop="confirmDelete(p)">×</span>
      </button>
      <button class="pet-tab add" title="再领养一只" @click="adopting = true">＋</button>
    </div>

    <!-- 领养 / 再加一只 -->
    <div v-if="showAdoptPanel" class="adopt-card">
      <div class="adopt-title">{{ hasPet ? '再领养一只小可爱吧 🐾' : '还没有宠物，选一只带回家吧 🏡' }}</div>
      <div class="adopt-list">
        <button
          v-for="t in PET_TYPES"
          :key="t.id"
          class="adopt-item"
          :class="{ active: selectedType === t.id }"
          @click="selectedType = t.id"
        >
          <span class="adopt-emoji">{{ t.emoji }}</span>
          <span class="adopt-name">{{ t.name }}</span>
        </button>
      </div>
      <input v-model="petName" class="adopt-input" maxlength="12" placeholder="给TA起个名字（可留空）" />
      <button class="adopt-btn" :disabled="!selectedType" @click="doAdopt">领养 {{ selectedType ? petTypeLabel : '' }}</button>
      <div v-if="hasPet" class="adopt-cancel" @click="adopting = false">取消</div>
      <div class="adopt-tip">每天登录、发动态、点赞、评论都能赚粮食币，用来兑换粮食喂养TA～</div>
    </div>

    <!-- 宠物主页 -->
    <template v-else-if="activePet">
      <div class="pet-stage">
        <div class="pet-avatar" :class="petMoodClass">
          <span class="pet-emoji">{{ petEmoji }}</span>
          <span class="pet-shadow" />
        </div>
        <div class="pet-name">{{ activePet.name }}</div>
        <div class="pet-type">{{ petTypeName }} · 已陪伴 {{ adoptedDays }} 天</div>
        <div class="pet-status" :class="statusClass">{{ petStatusText }}</div>
      </div>

      <!-- 生命体征 -->
      <div class="vitals-card">
        <div class="card-title">生命体征</div>
        <div v-for="v in VITALS" :key="v.key" class="vital-row">
          <span class="vital-emoji">{{ v.emoji }}</span>
          <span class="vital-label">{{ v.label }}</span>
          <div class="vital-bar">
            <div class="vital-fill" :class="vitalColor(activePet[v.key])" :style="{ width: clampPct(activePet[v.key]) }" />
          </div>
          <span class="vital-num">{{ Math.round(activePet[v.key]) }}</span>
        </div>
      </div>

      <!-- 照顾 -->
      <div class="care-card">
        <div class="card-title">照顾 TA</div>
        <button class="water-btn" @click="doWater">
          💧 喂水（免费）
        </button>
        <div class="feed-title">喂粮食（用库存）</div>
        <div class="feed-list">
          <button
            v-for="f in FOODS"
            :key="f.id"
            class="feed-item"
            :disabled="(store.state.wallet.inventory[f.id] || 0) <= 0"
            @click="doFeed(f.id)"
          >
            <span class="feed-emoji">{{ f.emoji }}</span>
            <span class="feed-name">{{ f.name }}</span>
            <span class="feed-count">×{{ store.state.wallet.inventory[f.id] || 0 }}</span>
            <span v-if="f.preferred === activePet.type" class="feed-fav">最爱</span>
          </button>
        </div>
        <div v-if="noFood" class="feed-empty">库存空空，去下面的商店兑换粮食吧～</div>
      </div>

      <!-- 粮食商店 -->
      <div class="shop-card">
        <div class="card-title">粮食商店（用粮食币兑换）</div>
        <div class="shop-list">
          <div v-for="f in FOODS" :key="f.id" class="shop-item">
            <span class="shop-emoji">{{ f.emoji }}</span>
            <div class="shop-info">
              <div class="shop-name">
                {{ f.name }}
                <span v-if="f.preferred" class="shop-pref">{{ petTypeName }}最爱</span>
              </div>
              <div class="shop-desc">饱食 +{{ f.satiety }}<template v-if="f.preferred === activePet.type">（偏好×1.5）</template> · 心情 +{{ f.mood }}</div>
            </div>
            <button
              class="shop-buy"
              :disabled="store.state.wallet.coins < f.cost"
              @click="doBuy(f.id)"
            >
              🪙 {{ f.cost }}
            </button>
          </div>
        </div>
      </div>

      <div class="pet-foot-tip">发动态 +{{ COIN_RULES.post }} · 点赞 +{{ COIN_RULES.like }} · 评论 +{{ COIN_RULES.comment }} 粮食币 / 每天登录 +{{ COIN_RULES.daily }}</div>
    </template>

    <div v-else class="pet-loading">加载中…</div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { store } from '../store'
import { PET_TYPES, FOODS, COIN_RULES, VITALS } from '../service'

const selectedType = ref('rabbit')
const petName = ref('')
const adopting = ref(false)
const selectedId = ref(null)

const pets = computed(() => store.state.pets || [])
const hasPet = computed(() => pets.value.length > 0)
const showAdoptPanel = computed(() => {
  if (!store.state.petLoaded) return false
  return !hasPet.value || adopting.value
})

watch(() => store.state.activePetId, (id) => {
  if (id) selectedId.value = id
})
watch(
  () => store.state.pets,
  (list) => {
    if (!list.find((p) => p.id === selectedId.value)) selectedId.value = list[0]?.id || null
  },
  { immediate: true }
)

const activePet = computed(() => pets.value.find((p) => p.id === selectedId.value) || pets.value[0] || null)

function petTypeOf(p) {
  return PET_TYPES.find((t) => t.id === p?.type) || {}
}
const petType = computed(() => petTypeOf(activePet.value))
const petEmoji = computed(() => petType.value?.emoji || '🐾')
const petTypeName = computed(() => petType.value?.name || '宠物')
const petTypeLabel = computed(() => PET_TYPES.find((t) => t.id === selectedType.value)?.name || '')

const adoptedDays = computed(() => {
  const since = activePet.value?.adoptedAt
  if (!since) return 0
  const days = Math.floor((Date.now() - new Date(since).getTime()) / 86400000) + 1
  return days
})

const noFood = computed(() => FOODS.every((f) => (store.state.wallet.inventory[f.id] || 0) <= 0))

function clampPct(v) {
  return Math.max(0, Math.min(100, v || 0)) + '%'
}
function vitalColor(v) {
  if (v >= 50) return 'good'
  if (v >= 20) return 'warn'
  return 'bad'
}

// 宠物情绪：根据生命体征给出状态文案与动画
const petStatusText = computed(() => {
  const p = activePet.value
  if (!p) return ''
  if (p.health < 30) return '身体不太舒服，多喂点东西吧 🤒'
  if (p.satiety < 20) return '肚子饿瘪了，想吃东西 🥺'
  if (p.water < 20) return '好渴呀，快喂点水 💧'
  if (p.mood < 30) return '有点不开心，陪陪TA吧 😢'
  if (p.mood >= 80 && p.health >= 70) return '状态超棒，开心得蹦蹦跳跳！🥰'
  return '一切都挺好，悠闲地待着～'
})
const statusClass = computed(() => {
  const p = activePet.value
  if (!p) return ''
  if (p.health < 30 || p.satiety < 20 || p.water < 20) return 'bad'
  if (p.mood < 30) return 'warn'
  return 'good'
})
const petMoodClass = computed(() => {
  const p = activePet.value
  if (!p) return ''
  if (p.mood >= 70 && p.health >= 50) return 'happy'
  if (p.health < 30 || p.satiety < 20 || p.water < 20) return 'sad'
  return ''
})

function selectPet(id) {
  selectedId.value = id
}

async function doAdopt() {
  if (!selectedType.value) return
  try {
    await store.adoptPet(selectedType.value, petName.value)
    adopting.value = false
    petName.value = ''
  } catch (e) {
    alert(e?.message || '领养失败')
  }
}
async function doWater() {
  if (!activePet.value) return
  try {
    await store.waterPet(activePet.value.id)
  } catch (e) {
    alert(e?.message || '喂水失败')
  }
}
async function doFeed(foodId) {
  if (!activePet.value) return
  try {
    await store.feedPet(foodId, activePet.value.id)
  } catch (e) {
    alert(e?.message || '喂食失败')
  }
}
async function doBuy(foodId) {
  try {
    await store.buyFood(foodId, 1)
  } catch (e) {
    alert(e?.message || '兑换失败')
  }
}
function confirmDelete(p) {
  if (confirm(`确定要把「${p.name}」送走吗？此操作不可恢复。`)) {
    store.deletePet(p.id).catch((e) => alert(e?.message || '删除失败'))
  }
}

let ticker = null
onMounted(() => {
  store.loadPet()
  ticker = setInterval(() => store.loadPet(), 30000)
})
onUnmounted(() => {
  if (ticker) clearInterval(ticker)
})
</script>

<style scoped>
.pet-page { min-height: 100vh; min-height: 100dvh; padding-bottom: calc(80px + var(--safe-bottom)); background: var(--bg); }

.pet-header {
  background: linear-gradient(135deg, #FFB36B, #FF8E9E);
  padding: calc(24px + var(--safe-top)) var(--sp-4) 18px;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  display: flex; align-items: center; justify-content: space-between;
}
.pet-header-title { font-size: var(--fs-xl); font-weight: 700; color: #fff; }
.pet-coin {
  display: flex; align-items: center; gap: 4px;
  background: rgba(255,255,255,0.25); padding: 6px 12px; border-radius: 999px;
}
.pet-coin-emoji { font-size: 16px; }
.pet-coin-num { font-size: var(--fs-lg); font-weight: 700; color: #fff; font-variant-numeric: tabular-nums; }
.pet-coin-label { font-size: var(--fs-sm); color: rgba(255,255,255,0.85); }

.card-title { font-size: var(--fs-base); font-weight: 600; color: var(--text-secondary); margin-bottom: 12px; }

/* 宠物切换条 */
.pet-tabs { display: flex; gap: 8px; overflow-x: auto; padding: 12px var(--sp-4); background: var(--bg); scrollbar-width: thin; }
.pet-tab {
  flex: 0 0 auto; display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 999px; border: 1.5px solid var(--border);
  background: var(--surface); cursor: pointer; transition: all 0.15s; position: relative;
}
.pet-tab.active { border-color: var(--primary); background: var(--primary-soft); }
.pet-tab-emoji { font-size: 22px; }
.pet-tab-name { font-size: var(--fs-sm); color: var(--text); font-weight: 500; max-width: 84px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pet-tab-del {
  margin-left: 2px; width: 18px; height: 18px; border-radius: 50%; line-height: 16px; text-align: center;
  background: rgba(0,0,0,0.08); color: var(--text-tertiary); font-size: 15px; font-weight: 700; flex: 0 0 auto;
}
.pet-tab-del:hover { background: rgba(229,72,77,0.18); color: #e5484d; }
.pet-tab.add { font-size: 20px; font-weight: 700; color: var(--primary); padding: 6px 14px; }

/* 领养 */
.adopt-card { margin: var(--sp-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--sp-5); }
.adopt-title { font-size: var(--fs-md); font-weight: 600; color: var(--text); margin-bottom: 14px; text-align: center; }
.adopt-list { display: flex; gap: 10px; margin-bottom: 14px; }
.adopt-item {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 14px 6px; border: 2px solid var(--border); border-radius: var(--radius); background: var(--surface-2);
  cursor: pointer; transition: all 0.15s;
}
.adopt-item.active { border-color: var(--primary); background: var(--primary-soft); }
.adopt-emoji { font-size: 36px; }
.adopt-name { font-size: var(--fs-sm); color: var(--text); font-weight: 500; }
.adopt-input {
  width: 100%; box-sizing: border-box; height: 42px; padding: 0 14px; margin-bottom: 12px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); color: var(--text); font-size: 15px; outline: none;
}
.adopt-input:focus { border-color: var(--primary); }
.adopt-btn {
  width: 100%; height: 46px; border: none; border-radius: 12px; cursor: pointer;
  background: linear-gradient(135deg, #FF6B8A, #FF4770); color: #fff; font-size: var(--fs-md); font-weight: 600;
}
.adopt-btn:disabled { opacity: 0.6; }
.adopt-btn:active { transform: scale(0.98); }
.adopt-cancel { text-align: center; margin-top: 10px; font-size: var(--fs-sm); color: var(--text-tertiary); cursor: pointer; }
.adopt-tip { margin-top: 12px; font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.6; text-align: center; }

/* 宠物舞台 */
.pet-stage { text-align: center; padding: 28px 20px 10px; }
.pet-avatar { position: relative; display: inline-block; animation: bob 2.4s ease-in-out infinite; }
.pet-avatar.happy { animation: bounce 0.9s ease-in-out infinite; }
.pet-avatar.sad { animation: sway 3s ease-in-out infinite; }
.pet-emoji { font-size: 88px; display: inline-block; filter: drop-shadow(0 8px 12px rgba(0,0,0,0.12)); }
.pet-shadow {
  position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%);
  width: 64px; height: 10px; border-radius: 50%; background: rgba(0,0,0,0.12); filter: blur(2px);
}
.pet-name { font-size: var(--fs-xl); font-weight: 700; color: var(--text); margin-top: 14px; }
.pet-type { font-size: var(--fs-sm); color: var(--text-tertiary); margin-top: 4px; }
.pet-status { display: inline-block; margin-top: 10px; padding: 6px 14px; border-radius: 999px; font-size: var(--fs-sm); font-weight: 500; }
.pet-status.good { background: rgba(76,175,80,0.12); color: #2e9e4f; }
.pet-status.warn { background: rgba(255,167,38,0.14); color: #d98300; }
.pet-status.bad { background: rgba(229,72,77,0.12); color: #e5484d; }

/* 卡片 */
.vitals-card, .care-card, .shop-card {
  margin: var(--sp-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--sp-5);
}

.vital-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.vital-row:last-child { margin-bottom: 0; }
.vital-emoji { font-size: 18px; width: 22px; text-align: center; }
.vital-label { font-size: var(--fs-sm); color: var(--text-secondary); width: 36px; }
.vital-bar { flex: 1; height: 10px; background: var(--surface-2); border-radius: 999px; overflow: hidden; }
.vital-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease; }
.vital-fill.good { background: linear-gradient(90deg, #6ddf8e, #2e9e4f); }
.vital-fill.warn { background: linear-gradient(90deg, #ffd36b, #ffa727); }
.vital-fill.bad { background: linear-gradient(90deg, #ff8a8a, #e5484d); }
.vital-num { font-size: var(--fs-sm); color: var(--text-secondary); width: 28px; text-align: right; font-variant-numeric: tabular-nums; }

.water-btn {
  width: 100%; height: 46px; border: none; border-radius: 12px; cursor: pointer; margin-bottom: 16px;
  background: linear-gradient(135deg, #5BC8FF, #4A90E2); color: #fff; font-size: var(--fs-md); font-weight: 600;
}
.water-btn:active { transform: scale(0.98); }
.feed-title { font-size: var(--fs-sm); color: var(--text-secondary); margin-bottom: 10px; }
.feed-list { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.feed-item {
  display: flex; align-items: center; gap: 6px; padding: 12px 10px; border-radius: 12px; cursor: pointer;
  border: 1px solid var(--border); background: var(--surface-2); position: relative; transition: background 0.15s;
}
.feed-item:disabled { opacity: 0.45; cursor: not-allowed; }
.feed-item:not(:disabled):active { background: var(--primary-soft); }
.feed-emoji { font-size: 22px; }
.feed-name { font-size: var(--fs-sm); color: var(--text); font-weight: 500; }
.feed-count { font-size: var(--fs-sm); color: var(--text-tertiary); margin-left: auto; }
.feed-fav { position: absolute; top: -6px; right: -6px; font-size: 10px; background: #ffd36b; color: #7a4b00; padding: 1px 6px; border-radius: 999px; font-weight: 600; }
.feed-empty { margin-top: 12px; font-size: var(--fs-sm); color: var(--text-tertiary); text-align: center; }

.shop-list { display: flex; flex-direction: column; gap: 10px; }
.shop-item { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 12px; background: var(--surface-2); }
.shop-emoji { font-size: 28px; }
.shop-info { flex: 1; }
.shop-name { font-size: var(--fs-base); font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 6px; }
.shop-pref { font-size: 10px; background: var(--primary-soft); color: var(--primary); padding: 1px 6px; border-radius: 999px; font-weight: 500; }
.shop-desc { font-size: var(--fs-sm); color: var(--text-tertiary); margin-top: 2px; }
.shop-buy {
  border: none; border-radius: 999px; padding: 8px 14px; cursor: pointer; font-size: var(--fs-sm); font-weight: 600;
  background: linear-gradient(135deg, #FFB36B, #FF8E9E); color: #fff;
}
.shop-buy:disabled { opacity: 0.5; }
.shop-buy:active { transform: scale(0.96); }

.pet-foot-tip { text-align: center; font-size: var(--fs-sm); color: var(--text-tertiary); padding: 6px 24px 20px; line-height: 1.6; }
.pet-loading { text-align: center; padding: 60px; color: var(--text-tertiary); }

@keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes bounce { 0%,100% { transform: translateY(0) scale(1); } 30% { transform: translateY(-18px) scale(1.04); } 60% { transform: translateY(0) scale(0.96); } }
@keyframes sway { 0%,100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
</style>
