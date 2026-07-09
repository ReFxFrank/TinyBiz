import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Every deploy replaces the hashed JS chunks, so a tab opened before the
// deploy fails to lazy-load pages on click (a blank screen until refresh).
// Vite signals that failure — reload once to pick up the new build. The
// timestamp guard prevents a reload loop if the network itself is down.
window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem('tb-chunk-reload') || 0)
  if (Date.now() - last < 15_000) return
  sessionStorage.setItem('tb-chunk-reload', String(Date.now()))
  event.preventDefault()
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
