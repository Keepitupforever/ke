<template>
  <div class="create-page">
    <div class="create-header">
      <button class="create-cancel" @click="goBack">取消</button>
      <div class="create-title">发布动态</div>
      <button
        class="create-post-btn"
        :class="{ disabled: (!content.trim() && images.length === 0) || posting }"
        :disabled="posting || (!content.trim() && images.length === 0)"
        @click="handlePost"
      >
        {{ posting ? '发布中...' : '发布' }}
      </button>
    </div>

    <textarea
      v-model="content"
      class="create-textarea"
      placeholder="记录今天想分享的..."
      maxlength="2000"
    />

    <div v-if="images.length > 0" class="create-grid">
      <div v-for="(img, i) in images" :key="i" class="create-img-wrap">
        <img :src="img.preview" alt="" class="create-img" />
        <button class="create-img-remove" @click="removeImage(i)">✕</button>
      </div>
    </div>

    <div class="create-toolbar">
      <button class="create-tool" @click="pickImages"><span>🖼️</span> 选择图片</button>
      <span class="create-count">{{ content.length }}/2000</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { store } from '../store'
import { uploadImage } from '../service'

const router = useRouter()
const MAX_IMAGES = 9

const content = ref('')
const images = ref([])
const posting = ref(false)

function pickImages() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.onchange = (e) => {
    const files = Array.from(e.target.files).slice(0, MAX_IMAGES - images.value.length)
    const newImgs = files.map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    images.value = [...images.value, ...newImgs].slice(0, MAX_IMAGES)
  }
  input.click()
}

function removeImage(index) {
  URL.revokeObjectURL(images.value[index].preview)
  images.value.splice(index, 1)
}

function goBack() { router.push('/feed') }

async function handlePost() {
  if (!content.value.trim() && images.value.length === 0) return
  posting.value = true
  try {
    const urls = []
    for (const img of images.value) {
      const { data: url, error } = await uploadImage(img.file)
      if (error) { alert('图片上传失败: ' + error.message); posting.value = false; return }
      urls.push(url)
    }
    const { error } = await store.createPost(content.value.trim(), urls)
    if (error) { alert('发布失败: ' + error.message); return }
    // 发布成功，释放预览占用的内存
    images.value.forEach(img => URL.revokeObjectURL(img.preview))
    router.push('/feed')
  } catch {
    alert('发布失败，请重试')
  } finally {
    posting.value = false
  }
}
</script>

<style scoped>
.create-page { min-height: 100vh; background: var(--surface); }
.create-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 50px 16px 14px; border-bottom: 1px solid var(--border);
  background: var(--surface); position: sticky; top: 0; z-index: 10;
}
.create-cancel { border: none; background: none; font-size: 16px; color: var(--text-secondary); cursor: pointer; }
.create-title { font-size: 17px; font-weight: 600; }
.create-post-btn {
  padding: 8px 20px; border: none; border-radius: 20px;
  background: linear-gradient(135deg, #FF6B8A, #FF4770);
  color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
}
.create-post-btn.disabled { background: var(--primary-soft); color: var(--on-primary-disabled); }

.create-textarea {
  width: 100%; min-height: 140px; padding: 20px; border: none;
  font-size: 16px; line-height: 1.6; resize: none; color: var(--text);
  background: var(--surface);
}
.create-textarea::placeholder { color: var(--text-tertiary); }

.create-grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 16px 16px; }
.create-img-wrap { position: relative; width: calc(33.33% - 6px); aspect-ratio: 1; border-radius: 8px; overflow: hidden; }
.create-img { width: 100%; height: 100%; object-fit: cover; }
.create-img-remove {
  position: absolute; top: 4px; right: 4px;
  width: 22px; height: 22px; border-radius: 11px; border: none;
  background: rgba(0,0,0,0.5); color: #fff; font-size: 12px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}

.create-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px; border-top: 1px solid var(--border);
  position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
  width: 100%; max-width: 500px; background: var(--surface); z-index: 10;
}
.create-tool {
  border: none; background: var(--surface-2); padding: 8px 16px;
  border-radius: 20px; font-size: 14px; color: var(--text-secondary); cursor: pointer;
  display: flex; align-items: center; gap: 4px;
}
.create-count { font-size: 12px; color: var(--text-tertiary); }
</style>
