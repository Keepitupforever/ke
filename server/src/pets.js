// 宠物 & 粮食币 业务逻辑（共享给路由与动态/点赞/评论加币使用）
import db from './db.js'

export const PET_TYPES = ['rabbit', 'penguin', 'dog']
export const FOODS = [
  { id: 'carrot', cost: 5, satiety: 22, mood: 6, preferred: 'rabbit' },
  { id: 'bone', cost: 8, satiety: 32, mood: 10, preferred: 'dog' },
  { id: 'fish', cost: 6, satiety: 26, mood: 8, preferred: 'penguin' },
  { id: 'kibble', cost: 4, satiety: 16, mood: 3, preferred: null },
]
export const COIN_RULES = { daily: 10, post: 5, like: 1, comment: 2 }

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v))
}
function defaultWallet() {
  return {
    coins: 0,
    inventory: { carrot: 0, bone: 0, fish: 0, kibble: 0 },
    lastDailyDate: null,
  }
}
function ensureWallet() {
  if (!db.wallet || typeof db.wallet !== 'object') db.wallet = defaultWallet()
  if (!db.wallet.inventory) db.wallet.inventory = defaultWallet().inventory
  if (typeof db.wallet.coins !== 'number') db.wallet.coins = 0
  if (typeof db.wallet.lastDailyDate !== 'string') db.wallet.lastDailyDate = null
}
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fail(message, status = 400) {
  const e = new Error(message)
  e.status = status
  throw e
}

// 根据真实经过时间线性衰减生命体征（按小时）
export function applyDecay(pet, nowMs) {
  const last = pet.lastDecayAt ? new Date(pet.lastDecayAt).getTime() : nowMs
  const hours = Math.max(0, (nowMs - last) / 3600000)
  if (hours <= 0) return
  pet.satiety = clamp(pet.satiety - 3 * hours)
  pet.water = clamp(pet.water - 4 * hours)
  pet.mood = clamp(pet.mood - 2 * hours)
  const low = pet.satiety < 15 || pet.water < 15
  pet.health = clamp(pet.health + (low ? -2 : 1) * hours)
  pet.lastDecayAt = new Date(nowMs).toISOString()
}

export function getPetState() {
  ensureWallet()
  if (db.pet) applyDecay(db.pet, Date.now())
  db.persist()
  return { wallet: db.wallet, pet: db.pet }
}

export function adoptPet(type, name) {
  ensureWallet()
  if (db.pet) fail('已经养了宠物啦')
  if (!PET_TYPES.includes(type)) fail('未知的宠物类型')
  db.pet = {
    type,
    name: (name || '').trim() || '宝贝',
    satiety: 80,
    water: 80,
    mood: 80,
    health: 80,
    adoptedAt: new Date().toISOString(),
    lastDecayAt: new Date().toISOString(),
    lastWateredAt: null,
  }
  db.persist()
  return { wallet: db.wallet, pet: db.pet }
}

export function feedPet(foodId) {
  ensureWallet()
  if (!db.pet) fail('还没有宠物')
  const inv = db.wallet.inventory
  if (!inv[foodId] || inv[foodId] <= 0) fail('该粮食库存不足，先去兑换吧')
  const food = FOODS.find((f) => f.id === foodId)
  if (!food) fail('未知粮食')
  applyDecay(db.pet, Date.now())
  let satiety = food.satiety
  let mood = food.mood
  // 投其所好：偏好粮食效果翻倍并额外加分
  if (food.preferred === db.pet.type) {
    satiety *= 1.5
    mood += 4
  }
  db.pet.satiety = clamp(db.pet.satiety + satiety)
  db.pet.mood = clamp(db.pet.mood + mood)
  if (db.pet.health < 40) db.pet.health = clamp(db.pet.health + 3)
  inv[foodId] -= 1
  db.persist()
  return { wallet: db.wallet, pet: db.pet }
}

export function waterPet() {
  ensureWallet()
  if (!db.pet) fail('还没有宠物')
  applyDecay(db.pet, Date.now())
  db.pet.water = clamp(db.pet.water + 35)
  db.pet.lastWateredAt = new Date().toISOString()
  db.persist()
  return { wallet: db.wallet, pet: db.pet }
}

export function buyFood(foodId, qty = 1) {
  ensureWallet()
  const food = FOODS.find((f) => f.id === foodId)
  if (!food) fail('未知粮食')
  const q = Math.max(1, Math.floor(qty) || 1)
  const cost = food.cost * q
  if (db.wallet.coins < cost) fail('粮食币不足')
  db.wallet.coins -= cost
  db.wallet.inventory[foodId] = (db.wallet.inventory[foodId] || 0) + q
  db.persist()
  return { wallet: db.wallet, pet: db.pet }
}

export function claimDaily() {
  ensureWallet()
  const today = todayStr()
  if (db.wallet.lastDailyDate === today) return { wallet: db.wallet, claimed: false }
  db.wallet.coins += COIN_RULES.daily
  db.wallet.lastDailyDate = today
  db.persist()
  return { wallet: db.wallet, claimed: true, amount: COIN_RULES.daily }
}

// 由动态 / 点赞 / 评论 调用，发放粮食币
export function awardCoins(reason) {
  const amount = COIN_RULES[reason]
  if (!amount) return
  ensureWallet()
  db.wallet.coins += amount
  db.persist()
}
