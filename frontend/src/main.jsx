import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Apply saved theme before first paint (default: dark)
document.documentElement.setAttribute('data-theme', localStorage.getItem('app_theme') || 'dark')

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
