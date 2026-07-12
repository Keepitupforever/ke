import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/feed' },
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
  { path: '/feed', name: 'feed', component: () => import('./views/FeedView.vue'), meta: { auth: true } },
  { path: '/create', name: 'create', component: () => import('./views/CreateView.vue'), meta: { auth: true } },
  { path: '/profile', name: 'profile', component: () => import('./views/ProfileView.vue'), meta: { auth: true } },
  { path: '/pet', name: 'pet', component: () => import('./views/PetView.vue'), meta: { auth: true } },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

import { store } from './store'

router.beforeEach((to) => {
  if (to.meta.auth && !store.isAuthenticated.value) {
    return { name: 'login' }
  }
  if (to.name === 'login' && store.isAuthenticated.value) {
    return { name: 'feed' }
  }
})

export default router
