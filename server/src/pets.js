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
function ensurePets() {
  if (!Array.isArray(db.pets)) db.pets = []
  // 兼容旧版单宠物
  if (db.pet && !db.pets.find((p) => p.id === db.pet.id)) {
    db.pets.push(db.pet)
    delete db.pet
    db.persist()
  }
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
  ensurePets()
  db.pets.forEach((p) => applyDecay(p, Date.now()))
  db.persist()
  return { wallet: db.wallet, pets: db.pets }
}

export function adoptPet(type, name) {
  ensureWallet()
  ensurePets()
  if (!PET_TYPES.includes(type)) fail('未知的宠物类型')
  const pet = {
    id: db.uid(),
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
  db.pets.push(pet)
  db.persist()
  return { wallet: db.wallet, pets: db.pets, pet }
}

export function feedPet(foodId, petId) {
  ensureWallet()
  ensurePets()
  const pet = db.pets.find((p) => p.id === petId)
  if (!pet) fail('宠物不存在')
  const inv = db.wallet.inventory
  if (!inv[foodId] || inv[foodId] <= 0) fail('该粮食库存不足，先去兑换吧')
  const food = FOODS.find((f) => f.id === foodId)
  if (!food) fail('未知粮食')
  applyDecay(pet, Date.now())
  let satiety = food.satiety
  let mood = food.mood
  // 投其所好：偏好粮食效果翻倍并额外加分
  if (food.preferred === pet.type) {
    satiety *= 1.5
    mood += 4
  }
  pet.satiety = clamp(pet.satiety + satiety)
  pet.mood = clamp(pet.mood + mood)
  if (pet.health < 40) pet.health = clamp(pet.health + 3)
  inv[foodId] -= 1
  db.persist()
  return { wallet: db.wallet, pets: db.pets }
}

export function waterPet(petId) {
  ensureWallet()
  ensurePets()
  const pet = db.pets.find((p) => p.id === petId)
  if (!pet) fail('宠物不存在')
  applyDecay(pet, Date.now())
  pet.water = clamp(pet.water + 35)
  pet.lastWateredAt = new Date().toISOString()
  db.persist()
  return { wallet: db.wallet, pets: db.pets }
}

// 删除宠物（不可逆）
export function deletePet(petId) {
  ensureWallet()
  ensurePets()
  if (!db.pets.find((p) => p.id === petId)) fail('宠物不存在', 404)
  db.pets = db.pets.filter((p) => p.id !== petId)
  db.persist()
  return { wallet: db.wallet, pets: db.pets }
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
