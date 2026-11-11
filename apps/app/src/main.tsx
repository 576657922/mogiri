import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/noto-serif-sc/500.css';
import '@fontsource/noto-serif-jp/500.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
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

/** 启动后台任务：GPU 档位检测、清理超过 30 天的回收站票据、首次注入示例票根 */
async function bootstrap() {
  try {
    void useUiStore.getState().initQualityDetection();
    await purgeExpiredDeletedTickets();
    await ensureSeedTickets();
  } catch (err) {
    console.error('BOOTSTRAP_ERROR:', err);
  } finally {
    useUiStore.getState().setBootstrapped(true);
  }
}

void bootstrap();
