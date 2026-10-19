import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/cinzel/600.css'
import '@fontsource/cinzel/800.css'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/600.css'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
