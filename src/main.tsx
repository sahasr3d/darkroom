import './index.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/space-mono/700.css'
import '@fontsource/share-tech-mono/400.css'
import '@fontsource/caveat/500.css'
import '@fontsource/permanent-marker/400.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { registerServiceWorker } from './app/serviceWorker'
import { ErrorBoundary } from './ui/ErrorBoundary'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

registerServiceWorker()
