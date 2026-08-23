import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { installMojibakeRepair } from './lib/repairMojibake'
import './styles.css'
import './import-mobile.css'
// PWA pronto mas desativado: quando instalar vite-plugin-pwa, descomente:
// import { initPwaPlaceholder } from './pwa'; initPwaPlaceholder()

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>,
)

installMojibakeRepair()
