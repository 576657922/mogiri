import type { TicketType } from '@mogiri/shared';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobalTicketStageHost } from './GlobalTicketStageHost';

const TYPE_CODES: Record<TicketType, string> = {
  flight: 'FLT',
  train: 'TRN',
  movie: 'CIN',
  concert: 'LIV',
  theater: 'STG',
  sports: 'SPT',
  exhibition: 'EXH',
  other: 'MSC',
};

export function ticketTypeCode(type: string): string {
  return TYPE_CODES[type as TicketType] ?? 'MSC';
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isHome = pathname === '/';
  const isScan = pathname.startsWith('/scan');
  const isNew = pathname === '/t/new/edit';
  const isRecapOrMap = pathname.startsWith('/recap') || pathname === '/map';
  const isSettings = pathname === '/settings';

  return (
    <div className="min-h-dvh flex flex-col text-fg pb-24">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-fg focus:text-bg-raised focus:px-4 focus:py-2 focus:rounded-full focus:text-xs"
      >
        {t('app.skip')}
      </a>

      {/* 顶部极简居中标题（紧凑光学留白，让视觉重心聚焦于中央票叠） */}
      <header className="relative z-30 pt-5 sm:pt-6 pb-1 px-6 flex items-center justify-center select-none">
        <Link
          to="/"
          className="text-[21px] sm:text-[23px] font-semibold tracking-[-0.03em] text-fg hover:opacity-80 transition-opacity"
        >
          Hanken {t('app.name')}
        </Link>
      </header>

      {/* 统计与足迹二级切换胶囊（当处于回顾或地图页时浮现） */}
      {isRecapOrMap && (
        <div className="flex justify-center pt-1 pb-2">
          <div className="inline-flex items-center rounded-full bg-black/[0.05] p-0.5 border border-line">
            <Link
              to="/recap/$year"
              params={{ year: '2026' }}
              className={`h-7 px-3.5 rounded-full text-[12px] font-medium flex items-center transition-all ${
                pathname.startsWith('/recap')
                  ? 'bg-bg-raised text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                  : 'text-muted hover:text-fg'
              }`}
            >
              {t('nav.recap')}
            </Link>
            <Link
              to="/map"
              className={`h-7 px-3.5 rounded-full text-[12px] font-medium flex items-center transition-all ${
                pathname === '/map'
                  ? 'bg-bg-raised text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                  : 'text-muted hover:text-fg'
              }`}
            >
              {t('nav.atlas')}
            </Link>
          </div>
        </div>
      )}

      {/* 主画布区域 */}
      <main id="main-content" className="flex-1 min-w-0 flex flex-col">
        {children ?? <Outlet />}
      </main>

      {/* 底部悬浮磨砂胶囊控制坞（Concept C 1:1 复刻） */}
      <nav
        aria-label="Primary Dock"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 frosted-dock rounded-full px-2.5 py-2 flex items-center gap-2 select-none"
      >
        {/* 1. 票夹叠卡（Home Rolodex，再次点击可切换总览网格） */}
        <Link
          to="/"
          onClick={() => {
            if (isHome) {
              window.dispatchEvent(new CustomEvent('mogiri:toggle-home-view'));
            }
          }}
          aria-label={t('nav.archive')}
          title={t('nav.archive')}
          className={`h-10 w-10 rounded-full flex items-center justify-center transition-all ${
            isHome
              ? 'bg-black/[0.12] text-fg shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]'
              : 'text-muted hover:text-fg hover:bg-black/[0.05]'
          }`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 7h14" />
            <path d="M3.5 10.5h17v8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-8Z" />
            <line x1="15.5" y1="10.5" x2="15.5" y2="20" strokeDasharray="1.5 2.5" />
          </svg>
        </Link>

        {/* 2. 扫描取景（Scan） */}
        <Link
          to="/scan"
          aria-label={t('nav.scan')}
          title={t('nav.scan')}
          className={`h-10 w-10 rounded-full flex items-center justify-center transition-all ${
            isScan
              ? 'bg-black/[0.12] text-fg shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]'
              : 'text-muted hover:text-fg hover:bg-black/[0.05]'
          }`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 8V6a2 2 0 0 1 2-2h2" />
            <path d="M4 16v2a2 2 0 0 0 2 2h2" />
            <path d="M16 4h2a2 2 0 0 1 2 2v2" />
            <path d="M16 20h2a2 2 0 0 0 2-2v-2" />
            <circle cx="12" cy="12" r="2.2" />
          </svg>
        </Link>

        {/* 3. 新建票根（New Stub） */}
        <Link
          to="/t/new/edit"
          aria-label={t('nav.new')}
          title={t('nav.new')}
          className={`h-10 w-10 rounded-full flex items-center justify-center transition-all ${
            isNew
              ? 'bg-black/[0.12] text-fg shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]'
              : 'text-muted hover:text-fg hover:bg-black/[0.05]'
          }`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="6" x2="12" y2="18" />
            <line x1="6" y1="12" x2="18" y2="12" />
          </svg>
        </Link>

        {/* 竖向发丝分隔线 */}
        <span aria-hidden="true" className="h-5 w-px bg-black/14 mx-0.5" />

        {/* 4. 统计与足迹（Recap & Atlas） */}
        <Link
          to="/recap/$year"
          params={{ year: '2026' }}
          aria-label={t('nav.recap')}
          title={`${t('nav.recap')} / ${t('nav.atlas')}`}
          className={`h-10 w-10 rounded-full flex items-center justify-center transition-all ${
            isRecapOrMap
              ? 'bg-black/[0.12] text-fg shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]'
              : 'text-muted hover:text-fg hover:bg-black/[0.05]'
          }`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="6" y1="19" x2="6" y2="13" />
            <line x1="12" y1="19" x2="12" y2="6" />
            <line x1="18" y1="19" x2="18" y2="10" />
          </svg>
        </Link>

        {/* 5. 偏好与信息（Settings） */}
        <Link
          to="/settings"
          aria-label={t('nav.settings')}
          title={t('nav.settings')}
          className={`h-10 w-10 rounded-full flex items-center justify-center transition-all ${
            isSettings
              ? 'bg-black/[0.12] text-fg shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)]'
              : 'text-muted hover:text-fg hover:bg-black/[0.05]'
          }`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="4" y1="8" x2="20" y2="8" />
            <line x1="4" y1="16" x2="20" y2="16" />
            <circle cx="9" cy="8" r="2" fill="var(--bg-raised)" />
            <circle cx="15" cy="16" r="2" fill="var(--bg-raised)" />
          </svg>
        </Link>
      </nav>

      {/* 全局唯一 WebGL Canvas 宿主 */}
      <GlobalTicketStageHost />
    </div>
  );
}
