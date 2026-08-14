import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installPromptStore, type BeforeInstallPromptEvent } from './lib/installPromptStore';

// ── Capture beforeinstallprompt BEFORE React renders ──────────────────────────
//
// Android Chrome fires this event very early — often before React has mounted
// and useEffect has registered a listener. Capturing it here at the module level
// guarantees the event is never missed, regardless of render timing.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installPromptStore.setPrompt(e as BeforeInstallPromptEvent)
})

// Track successful installs
window.addEventListener('appinstalled', () => {
  installPromptStore.setInstalled()
})

// ── Service Worker ────────────────────────────────────────────────────────────
//
// Registered before React renders so Chrome can evaluate PWA criteria on the
// very first load.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch(() => {}) // non-critical
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
