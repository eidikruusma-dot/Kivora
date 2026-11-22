import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { installPromptStore, type BeforeInstallPromptEvent } from './lib/installPromptStore';
// Sets window.__KIVORA_BUILD__ as a side effect — temporary build/version
// marker, see buildInfo.ts.
import './lib/buildInfo';

// ── Production maintenance mode ────────────────────────────────────────────────
//
// A single build-time toggle, off by default: set VITE_MAINTENANCE_MODE=true
// on exactly one Render service's environment (never commit it as "true" —
// this just adds the *capability*, safely inert until a deploy's own env
// vars turn it on). When on, `./App` (and therefore Firebase auth/Firestore
// init, React Router, and every real app route including /login and
// /register) is never imported at all — not hidden, never evaluated — so a
// visitor hitting any URL only ever gets MaintenancePage. Both branches
// below use a dynamic import() specifically so the unused one is never
// fetched/executed at runtime, regardless of what's physically present in
// the built bundle.
const MAINTENANCE_MODE = import.meta.env.VITE_MAINTENANCE_MODE === 'true'

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
// very first load. Skipped during maintenance mode so a returning visitor's
// browser doesn't register/refresh a service worker for a page that isn't
// the real app.
if (!MAINTENANCE_MODE && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch(() => {}) // non-critical
  })
}

const root = createRoot(document.getElementById('root')!)

if (MAINTENANCE_MODE) {
  import('./views/MaintenancePage.tsx').then(({ default: MaintenancePage }) => {
    root.render(
      <StrictMode>
        <MaintenancePage />
      </StrictMode>
    )
  })
} else {
  import('./App.tsx').then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  })
}
