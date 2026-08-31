import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { installMojibakeRepair } from './lib/repairMojibake'
import { initPwaPlaceholder } from './pwa'
import { initializeThemeSync } from './theme'
import './styles.css'
import './import-mobile.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>,
)

initPwaPlaceholder()
initializeThemeSync()
installMojibakeRepair()
