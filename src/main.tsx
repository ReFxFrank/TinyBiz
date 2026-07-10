import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Stale-deploy chunk failures are handled by lazyReload in App.tsx. Do NOT
// add a vite:preloadError listener that calls preventDefault() here — that
// makes Vite RESOLVE the failed import as `undefined`, which crashes React
// lazy ("reading 'default'") and unmounted the whole app into a black page.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
