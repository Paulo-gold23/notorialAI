import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import './styles/globals.css'

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    integrations: [
      new Sentry.BrowserTracing(),
    ],
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Scrub PII from request headers
      if (event.request?.headers) {
        delete event.request.headers['Authorization'];
        delete event.request.headers['Cookie'];
      }
      // Scrub PII from breadcrumbs (URLs with tokens, emails)
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(bc => {
          if (bc.data?.url) {
            bc.data.url = bc.data.url.replace(/token=[^&]+/gi, 'token=[REDACTED]');
          }
          return bc;
        });
      }
      return event;
    },
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
