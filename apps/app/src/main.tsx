import { RouterProvider } from '@tanstack/react-router';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { purgeExpiredDeletedTickets } from './data';
import { ensureSeedTickets } from './domain';
import './i18n';
import { router } from './routes/router';
import './styles.css';
import { useUiStore } from './ui';

async function bootstrap() {
  // 初始化 GPU 档位检测、清理超过 30 天的回收站票据、按需注入首次演示票根
  void useUiStore.getState().initQualityDetection();
  await purgeExpiredDeletedTickets();
  await ensureSeedTickets();

  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('#root element not found');

  createRoot(rootEl).render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
}

void bootstrap();
