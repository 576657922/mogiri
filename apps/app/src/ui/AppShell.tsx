import type { TicketType } from '@mogiri/shared';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../data';
import { type SupportedLocale, setAppLocale } from '../i18n';
import { playDetentClick, playPaperFlip } from '../platform';
import { GlobalTicketStageHost } from './GlobalTicketStageHost';
import { useUiStore } from './store';

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

const LOCALE_ORDER: { code: SupportedLocale; short: string }[] = [
  { code: 'zh-CN', short: '中' },
  { code: 'ja', short: '日' },
  { code: 'en', short: 'EN' },
];

export function ticketTypeCode(type: string): string {
  return TYPE_CODES[type as TicketType] ?? 'MSC';
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const sfxEnabled = useUiStore((s) => s.sfxEnabled);
  const setSfxEnabled = useUiStore((s) => s.setSfxEnabled);

  const activeCount = useLiveQuery(
    () => db.tickets.where('status').equals('active').count(),
    [],
    0,
  );

  const isHome = pathname === '/';
  const isScan = pathname.startsWith('/scan');
  const isNew = pathname === '/t/new/edit';
  const isRecapOrMap = pathname.startsWith('/recap') || pathname === '/map';
  const isSettings = pathname === '/settings';

  const handleCycleLocale = () => {
    const idx = LOCALE_ORDER.findIndex((l) => l.code === i18n.language);
    const next = LOCALE_ORDER[(idx + 1) % LOCALE_ORDER.length] ?? LOCALE_ORDER[0];
    if (next) {
      setAppLocale(next.code);
      playDetentClick(0.8);
    }
  };

  const currentLocaleShort =
    LOCALE_ORDER.find((l) => l.code === i18n.language)?.short ??
    i18n.language.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-dvh flex flex-col text-fg pb-32">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-fg focus:text-bg-raised focus:px-4 focus:py-2 focus:rounded-full focus:text-xs"
      >
        {t('app.skip')}
      </a>

      {/* 顶部博朗仪器式三栏铭牌栏（左：品牌模切印记与馆藏计数器 · 中：语境切换 · 右：棘轮声效与多语切换） */}
      <header className="relative z-30 pt-4 sm:pt-5 pb-2 px-4 sm:px-8">
        <div className="mx-auto max-w-[1160px] flex items-center justify-between gap-3 select-none">
          {/* 左：模切半券徽标 + 双声部字标 */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              onClick={() => playPaperFlip()}
              className="group inline-flex items-center gap-2.5 hover:opacity-85 transition-opacity"
            >
              {/* 微缩模切票根金属铭牌 */}
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center w-7 h-5 rounded-[4px] bg-fg text-bg-raised shadow-[0_2px_4px_rgba(0,0,0,0.16)] relative overflow-hidden shrink-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent mr-1.5" />
                <span className="h-3.5 w-px border-l border-dashed border-white/40" />
              </span>

              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-[18px] sm:text-[19.5px] font-semibold tracking-[-0.035em] text-fg">
                  Hanken
                </span>
                <span className="font-editorial text-[16px] sm:text-[17px] font-medium text-muted">
                  半券
                </span>
              </span>
            </Link>

            <span
              aria-hidden="true"
              className="hidden md:inline-block h-3.5 w-px bg-black/12 mx-0.5"
            />
            <span className="hidden md:inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.06em] uppercase text-muted tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600/80" />
              <span>
                {String(activeCount).padStart(2, '0')} · {t('app.offline')}
              </span>
            </span>
          </div>

          {/* 中：当处于年鉴或足迹页时浮现二级精密拨片 */}
          {isRecapOrMap && (
            <div className="inline-flex items-center rounded-full bg-black/[0.055] p-0.5 border border-line">
              <Link
                to="/recap/$year"
                params={{ year: '2026' }}
                onClick={() => playDetentClick(0.8)}
                className={`relative h-7 px-3.5 rounded-full text-[12px] font-medium flex items-center transition-colors ${
                  pathname.startsWith('/recap') ? 'text-fg' : 'text-muted hover:text-fg'
                }`}
              >
                {pathname.startsWith('/recap') && (
                  <motion.span
                    layoutId="recap-atlas-seg"
                    className="absolute inset-0 rounded-full bg-bg-raised shadow-[0_1px_2px_rgba(0,0,0,0.09)]"
                    transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                  />
                )}
                <span className="relative">{t('nav.recap')}</span>
              </Link>
              <Link
                to="/map"
                onClick={() => playDetentClick(0.8)}
                className={`relative h-7 px-3.5 rounded-full text-[12px] font-medium flex items-center transition-colors ${
                  pathname === '/map' ? 'text-fg' : 'text-muted hover:text-fg'
                }`}
              >
                {pathname === '/map' && (
                  <motion.span
                    layoutId="recap-atlas-seg"
                    className="absolute inset-0 rounded-full bg-bg-raised shadow-[0_1px_2px_rgba(0,0,0,0.09)]"
                    transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                  />
                )}
                <span className="relative">{t('nav.atlas')}</span>
              </Link>
            </div>
          )}

          {/* 右：棘轮声效微拨钮 + 语言循环键 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                const next = !sfxEnabled;
                setSfxEnabled(next);
                if (next) playDetentClick(1);
              }}
              aria-label={sfxEnabled ? t('app.sfxOn') : t('app.sfxOff')}
              title={sfxEnabled ? t('app.sfxOn') : t('app.sfxOff')}
              className={`h-7 px-2.5 rounded-full border text-[11px] font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                sfxEnabled
                  ? 'bg-bg-raised/85 border-line text-fg shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                  : 'bg-transparent border-line text-faint hover:text-muted'
              }`}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="3" y1="6" x2="3" y2="10" />
                <line x1="6.5" y1="3.5" x2="6.5" y2="12.5" />
                <line x1="10" y1="5.5" x2="10" y2="10.5" />
                <line x1="13.5" y1="7" x2="13.5" y2="9" />
                {!sfxEnabled && <line x1="2" y1="14" x2="14" y2="2" stroke="#d64c35" />}
              </svg>
              <span className="hidden sm:inline">{sfxEnabled ? 'SFX' : 'MUTE'}</span>
            </button>

            <button
              type="button"
              onClick={handleCycleLocale}
              aria-label={t('nav.language')}
              title={t('nav.language')}
              className="h-7 min-w-[34px] px-2.5 rounded-full bg-bg-raised/85 border border-line hover:border-line-strong text-[11px] font-mono font-semibold text-fg shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all cursor-pointer"
            >
              {currentLocaleShort}
            </button>
          </div>
        </div>
      </header>

      {/* 主画布区域 */}
      <main id="main-content" className="flex-1 min-w-0 flex flex-col">
        {children ?? <Outlet />}
      </main>

      {/* 底部悬浮磨砂胶囊控制坞（弹簧滑块指示器 + 博朗朱红微光点） */}
      <nav
        aria-label="Primary Dock"
        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 frosted-dock rounded-full px-2.5 py-1.5 flex items-center gap-1.5 select-none"
      >
        {/* 1. 票夹叠卡（Home Rolodex，已处于首页时点击可快速切换叠卡/总览） */}
        <DockLink
          to="/"
          active={isHome}
          label={t('nav.archive')}
          onClick={() => {
            playDetentClick(0.9);
            if (isHome) {
              window.dispatchEvent(new CustomEvent('mogiri:toggle-home-view'));
            }
          }}
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
        </DockLink>

        {/* 2. 光学扫描台（Scan） */}
        <DockLink
          to="/scan"
          active={isScan}
          label={t('nav.scan')}
          onClick={() => playDetentClick(0.9)}
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
        </DockLink>

        {/* 3. 手工压印新票根（New Stub） */}
        <DockLink
          to="/t/new/edit"
          active={isNew}
          label={t('nav.new')}
          onClick={() => playDetentClick(0.9)}
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
        </DockLink>

        {/* 竖向发丝分隔线 */}
        <span aria-hidden="true" className="h-5 w-px bg-black/14 mx-0.5" />

        {/* 4. 年鉴与足迹（Recap & Atlas） */}
        <Link
          to="/recap/$year"
          params={{ year: '2026' }}
          onClick={() => playDetentClick(0.9)}
          aria-label={t('nav.recap')}
          title={`${t('nav.recap')} / ${t('nav.atlas')}`}
          className={`relative h-10 px-3 rounded-full flex items-center gap-1.5 transition-colors ${
            isRecapOrMap ? 'text-fg' : 'text-muted hover:text-fg hover:bg-black/[0.045]'
          }`}
        >
          {isRecapOrMap && (
            <motion.span
              layoutId="dock-active-pill"
              className="absolute inset-0 rounded-full bg-bg-raised shadow-[0_2px_6px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.9)]"
              transition={{ type: 'spring', stiffness: 460, damping: 34 }}
            />
          )}
          <span className="relative flex items-center gap-1.5">
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
            <span className="hidden sm:inline text-[12px] font-medium">{t('nav.recap')}</span>
          </span>
          {isRecapOrMap && (
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent"
            />
          )}
        </Link>

        {/* 5. 系统设置（Settings） */}
        <DockLink
          to="/settings"
          active={isSettings}
          label={t('nav.settings')}
          onClick={() => playDetentClick(0.9)}
          compact
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
        </DockLink>
      </nav>

      {/* 全局唯一 WebGL Canvas 宿主 */}
      <GlobalTicketStageHost />
    </div>
  );
}

function DockLink({
  to,
  active,
  label,
  onClick,
  compact = false,
  children,
}: {
  to: '/' | '/scan' | '/t/new/edit' | '/settings';
  active: boolean;
  label: string;
  onClick?: () => void;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`relative h-10 ${compact ? 'w-10 justify-center' : 'px-3'} rounded-full flex items-center gap-1.5 transition-colors ${
        active ? 'text-fg' : 'text-muted hover:text-fg hover:bg-black/[0.045]'
      }`}
    >
      {active && (
        <motion.span
          layoutId="dock-active-pill"
          className="absolute inset-0 rounded-full bg-bg-raised shadow-[0_2px_6px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.9)]"
          transition={{ type: 'spring', stiffness: 460, damping: 34 }}
        />
      )}
      <span className="relative flex items-center gap-1.5">
        {children}
        {!compact && <span className="hidden sm:inline text-[12px] font-medium">{label}</span>}
      </span>
      {active && (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent"
        />
      )}
    </Link>
  );
}
