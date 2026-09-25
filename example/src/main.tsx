import { StrictMode as ReactStrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'

const root = document.getElementById('root')
if (root === null) throw new Error('no #root')

// The app decides whether to wrap itself in StrictMode, so the toggle can exercise it.
createRoot(root).render(
  <ReactStrictMode>
    <App />
  </ReactStrictMode>
)
