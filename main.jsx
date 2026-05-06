import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker — autoUpdate means it silently updates in background.
// On next launch the new version is already active (clientsClaim + skipWaiting).
registerSW({
  onNeedRefresh() {
    // Service worker has a new version ready — it will activate on next launch
    // automatically. No need to prompt the user.
  },
  onOfflineReady() {
    // App shell is fully cached — usable without network.
  },
  onRegisteredSW(swUrl, registration) {
    // Periodically check for SW updates (every hour) so long-lived PWA
    // sessions still pick up new versions.
    if (registration) {
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);
    }
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
);
