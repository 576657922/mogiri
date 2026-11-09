import type { TicketType } from '@mogiri/shared';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, type SupportedLocale, setAppLocale } from '../i18n';
import { GlobalTicketStageHost } from './GlobalTicketStageHost';
import { Container } from './primitives';

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

  // 详情页（/t/$id，排除新建与编辑页）切换为「暗房观赏室」主题
  const isViewingRoom =
    pathname.startsWith('/t/') && pathname !== '/t/new/edit' && !pathname.endsWith('/edit');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('theme-room', isViewingRoom);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isViewingRoom ? '#0e0d0c' : '#ece7de');
    }
  }, [isViewingRoom]);

  const navItems = [
    {
      index: '01',
      to: '/',
      label: t('nav.archive'),
      active: pathname === '/',
    },
    {
      index: '02',
      to: '/scan',
      label: t('nav.scan'),
      active: pathname.startsWith('/scan'),
    },
    {
      index: '03',
      to: '/t/new/edit',
      label: t('nav.new'),
      active: pathname === '/t/new/edit',
    },
    {
      index: '04',
      to: '/recap/2026',
      label: t('nav.recap'),
      active: pathname.startsWith('/recap'),
    },
    {
      index: '05',
      to: '/map',
      label: t('nav.atlas'),
      active: pathname === '/map',
    },
    {
      index: '06',
      to: '/settings',
      label: t('nav.settings'),
      active: pathname === '/settings',
    },
  ];

  const marqueeText = t('home.marquee');

  return (
    <div className="min-h-screen flex flex-col bg-bg text-fg pb-20 md:pb-0">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-fg focus:text-bg focus:px-4 focus:py-2 focus:text-xs"
      >
        {t('app.skip')}
      </a>

      {/* 顶部编辑式刊头 */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
        <Container className="h-16 flex items-center justify-between gap-6">
          <div className="flex items-baseline gap-4">
            <Link to="/" className="group inline-flex items-baseline gap-2.5">
              <span className="display text-[26px] tracking-tight text-fg leading-none">
                {t('app.name')}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted group-hover:text-fg transition-colors">
                {t('app.wordmark')}
              </span>
            </Link>
            <span aria-hidden className="hidden lg:inline-block h-3 w-px bg-line-strong" />
            <span className="hidden lg:inline-block label">{t('app.tagline')}</span>
          </div>

          {/* 桌面端编号导航 */}
          <nav aria-label="Primary" className="hidden md:flex items-center gap-6 lg:gap-8">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                data-active={item.active}
                className={`ulink inline-flex items-baseline gap-1.5 py-1 text-[13px] transition-colors ${
                  item.active ? 'text-fg font-medium' : 'text-muted hover:text-fg'
                }`}
              >
                <span className="font-mono text-[10px] tracking-[0.12em] text-faint">
                  {item.index}
                </span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* 右侧离线状态与语言切换 */}
          <div className="flex items-center gap-4">
            <span className="hidden xl:inline-flex items-center gap-2 label">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span>{t('app.offline')}</span>
            </span>

            <fieldset
              aria-label={t('nav.language')}
              className="inline-flex items-center border border-line rounded-full p-0.5 m-0"
            >
              {SUPPORTED_LOCALES.map((loc) => {
                const active = i18n.language === loc.code;
                return (
                  <button
                    key={loc.code}
                    type="button"
                    onClick={() => setAppLocale(loc.code as SupportedLocale)}
                    className={`h-6 px-2.5 rounded-full font-mono text-[10.5px] tracking-[0.08em] transition-colors ${
                      active ? 'bg-fg text-bg font-medium' : 'text-muted hover:text-fg'
                    }`}
                    title={loc.label}
                  >
                    {loc.short}
                  </button>
                );
              })}
            </fieldset>
          </div>
        </Container>
      </header>

      {/* 正文内容 */}
      <main id="main-content" className="flex-1">
        {children ?? <Outlet />}
      </main>

      {/* 底部版权与票根跑马灯 */}
      <footer className="mt-20 border-t border-line">
        <div className="overflow-hidden border-b border-line py-2.5 select-none">
          <div className="marquee-track">
            {[0, 1, 2, 3].map((idx) => (
              <span
                key={idx}
                className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted px-6"
              >
                {marqueeText}
              </span>
            ))}
          </div>
        </div>
        <Container className="py-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <span className="display text-lg">{t('app.name')}</span>
            <span className="label">HANKEN ARCHIVE · VOL. 2026</span>
          </div>
          <div className="label">{t('app.offline')}</div>
        </Container>
      </footer>

      {/* 移动端底部编号导航 */}
      <nav
        aria-label="Mobile Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-bg/95 backdrop-blur-md"
      >
        <div className="grid grid-cols-6 h-14">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                item.active ? 'text-fg font-medium' : 'text-muted'
              }`}
            >
              <span
                className={`font-mono text-[9.5px] tracking-[0.14em] ${
                  item.active ? 'text-accent' : 'text-faint'
                }`}
              >
                {item.index}
              </span>
              <span className="text-[11px] truncate max-w-full px-1">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* 全局唯一 WebGL Canvas 宿主 */}
      <GlobalTicketStageHost />
    </div>
  );
}
