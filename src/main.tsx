import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initNativeMobile } from './utils/haptics'

// Inicializar ajustes nativos mobile se estiver no Android/iOS
initNativeMobile();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

