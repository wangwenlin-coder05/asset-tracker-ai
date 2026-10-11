import { createApp } from 'vue'
import './style.css'
import AuthGate from './AuthGate.vue'
import { installAuthTransport } from './auth'

installAuthTransport()
createApp(AuthGate).mount('#app')
