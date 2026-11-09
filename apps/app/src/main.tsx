import { RouterProvider } from '@tanstack/react-router';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { purgeExpiredDeletedTickets } from './data';
import { ensureSeedTickets } from './domain';
import './i18n';
import { router } from './routes/router';
import './styles.css';
import { useUiStore } from './ui';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element not found');

createRoot(rootEl).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);

async function bootstrap() {
  try {
    void useUiStore.getState().initQualityDetection();
    await purgeExpiredDeletedTickets();
    await ensureSeedTickets();
  } catch (err) {
    console.error('BOOTSTRAP_ERROR:', err);
  }
}

void bootstrap();
