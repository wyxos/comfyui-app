import { createRouter, createWebHistory, type RouterHistory, type RouteRecordRaw } from 'vue-router'

import HomeView from './views/HomeView.vue'
import GuidelinesView from './views/GuidelinesView.vue'
import AssetsView from './views/AssetsView.vue'
import DownloadsView from './views/DownloadsView.vue'
import JobsView from './views/JobsView.vue'
import LibraryView from './views/LibraryView.vue'
import SettingsView from './views/SettingsView.vue'

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
  },
  {
    path: '/guidelines',
    name: 'guidelines',
    component: GuidelinesView,
  },
  {
    path: '/assets',
    name: 'assets',
    component: AssetsView,
  },
  {
    path: '/downloads',
    name: 'downloads',
    component: DownloadsView,
  },
  {
    path: '/library',
    name: 'library',
    component: LibraryView,
  },
  {
    path: '/jobs',
    name: 'jobs',
    component: JobsView,
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsView,
  },
]

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({
    history,
    routes,
  })
}

export const router = createAppRouter()
