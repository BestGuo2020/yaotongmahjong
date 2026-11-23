import { createApp } from 'vue'
import { createStartupScreen } from './startup/startupScreen'

const startupScreen = createStartupScreen()

void import('./App.vue').then(({ default: App }) => {
  createApp(App, { startupScreen }).mount('#app')
}).catch((error) => {
  console.error('游戏界面加载失败', error)
  startupScreen.fail('游戏界面加载失败，请重试。', () => window.location.reload())
})
