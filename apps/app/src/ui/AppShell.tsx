import type { TicketType } from '@mogiri/shared';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../data';
import { SUPPORTED_LOCALES, type SupportedLocale, setAppLocale } from '../i18n';
import { GlobalTicketStageHost } from './GlobalTicketStageHost';
import { btnClass } from './primitives';

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
  const { t, i18n } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const activeCount = useLiveQuery(
    async () => await db.tickets.where('status').equals('active').count(),
    [],
    0,
  );

  const navItems = [
    {
      to: '/',
      label: t('nav.archive'),
      badge: activeCount > 0 ? String(activeCount) : undefined,
      active: pathname === '/' || (pathname.startsWith('/t/') && pathname !== '/t/new/edit'),
    },
    {
      to: '/scan',
      label: t('nav.scan'),
      active: pathname.startsWith('/scan'),
    },
    {
      to: '/recap/2026',
      label: t('nav.recap'),
      active: pathname.startsWith('/recap'),
    },
    {
      to: '/map',
      label: t('nav.atlas'),
      active: pathname === '/map',
    },
    {
      to: '/settings',
      label: t('nav.settings'),
      active: pathname === '/settings',
    },
  ];

  return (
    <div className="min-h-dvh flex flex-col md:flex-row bg-bg text-fg pb-16 md:pb-0">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-fg focus:text-bg-raised focus:px-4 focus:py-2 focus:rounded-full focus:text-xs"
      >
        {t('app.skip')}
      </a>

      {/* 桌面端左侧极简导览栏（recent.design 风格） */}
      <aside className="hidden md:flex md:w-[216px] md:shrink-0 md:flex-col md:justify-between md:sticky md:top-0 md:h-dvh px-5 py-5 select-none border-r border-line bg-bg">
        <div className="space-y-8">
          {/* 顶部几何半券标志 + 新建胶囊按钮 */}
          <div className="flex items-center justify-between gap-2">
            <Link
              to="/"
              aria-label={t('app.name')}
              className="inline-flex items-center gap-2.5 group"
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 32 32"
                fill="none"
                aria-hidden="true"
                className="text-fg transition-transform duration-300 group-hover:scale-105"
              >
                <path
                  d="M2 5C2 3.34315 3.34315 2 5 2H27C28.6569 2 30 3.34315 30 5V12.5C27.5147 12.5 25.5 14.5147 25.5 17C25.5 19.4853 27.5147 21.5 30 21.5V27C30 28.6569 28.6569 30 27 30H5C3.34315 30 2 28.6569 2 27V21.5C4.48528 21.5 6.5 19.4853 6.5 17C6.5 14.5147 4.48528 12.5 2 12.5V5Z"
                  fill="currentColor"
                />
                <circle cx="21" cy="17" r="1.4" fill="var(--bg)" />
                <circle cx="21" cy="11.5" r="1.4" fill="var(--bg)" />
                <circle cx="21" cy="22.5" r="1.4" fill="var(--bg)" />
              </svg>
              <span className="text-[15px] font-semibold tracking-[-0.02em] text-fg">
                {t('app.name')}
              </span>
            </Link>

            <Link to="/t/new/edit" className={btnClass('outline', 'h-7 px-3 text-[12px]')}>
              + {t('nav.new')}
            </Link>
          </div>

          {/* 主导航列表 */}
          <nav aria-label="Primary" className="space-y-1">
            <div className="px-2 pb-1.5 text-[11px] font-medium text-faint">{t('app.tagline')}</div>
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-[13.5px] transition-colors ${
                  item.active ? 'font-semibold text-fg' : 'font-normal text-muted hover:text-fg'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <span>{item.label}</span>
                  {item.active && (
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-fg inline-block"
                    />
                  )}
                </span>
                {item.badge && (
                  <span className="font-mono text-[11px] text-faint">{item.badge}</span>
                )}
              </Link>
            ))}
          </nav>
        </div>

        {/* 底部本机状态与多语言胶囊 */}
        <div className="space-y-3 pt-4 border-t border-line">
          <div className="text-[11.5px] text-muted leading-relaxed px-1">{t('app.offline')}</div>

          <fieldset
            aria-label={t('nav.language')}
            className="inline-flex items-center rounded-full bg-bg-subtle p-0.5 m-0 border-0 w-full justify-between"
          >
            {SUPPORTED_LOCALES.map((loc) => {
              const active = i18n.language === loc.code;
              return (
                <button
                  key={loc.code}
                  type="button"
                  onClick={() => setAppLocale(loc.code as SupportedLocale)}
                  className={`flex-1 h-6 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                    active
                      ? 'bg-bg-raised text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                      : 'text-muted hover:text-fg'
                  }`}
                  title={loc.label}
                >
                  {loc.short}
                </button>
              );
            })}
          </fieldset>
        </div>
      </aside>

      {/* 移动端顶栏 */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-13 border-b border-line bg-bg/90 backdrop-blur-md">
        <Link to="/" className="inline-flex items-center gap-2">
          <svg
            width="22"
            height="22"
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden="true"
            className="text-fg"
          >
            <path
              d="M2 5C2 3.34315 3.34315 2 5 2H27C28.6569 2 30 3.34315 30 5V12.5C27.5147 12.5 25.5 14.5147 25.5 17C25.5 19.4853 27.5147 21.5 30 21.5V27C30 28.6569 28.6569 30 27 30H5C3.34315 30 2 28.6569 2 27V21.5C4.48528 21.5 6.5 19.4853 6.5 17C6.5 14.5147 4.48528 12.5 2 12.5V5Z"
              fill="currentColor"
            />
          </svg>
          <span className="text-[15px] font-semibold tracking-[-0.02em]">{t('app.name')}</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link to="/t/new/edit" className={btnClass('outline', 'h-7 px-3 text-[12px]')}>
            + {t('nav.new')}
          </Link>
        </div>
      </header>

      {/* 主画布区域 */}
      <main id="main-content" className="flex-1 min-w-0 flex flex-col">
        {children ?? <Outlet />}
      </main>

      {/* 移动端底部胶囊导航 */}
      <nav
        aria-label="Mobile Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-bg-raised/95 backdrop-blur-md"
      >
        <div className="grid grid-cols-5 h-13">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center gap-1 text-[11.5px] transition-colors ${
                item.active ? 'text-fg font-semibold' : 'text-muted'
              }`}
            >
              <span>{item.label}</span>
              <span
                className={`h-1 w-1 rounded-full ${item.active ? 'bg-fg' : 'bg-transparent'}`}
              />
            </Link>
          ))}
        </div>
      </nav>

      {/* 全局唯一 WebGL Canvas 宿主 */}
      <GlobalTicketStageHost />
    </div>
  );
}
