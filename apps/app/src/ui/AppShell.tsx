import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { BarChart3, Camera, Globe, MapPin, PlusCircle, Settings, Ticket } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, type SupportedLocale, setAppLocale } from '../i18n';
import { GlobalTicketStageHost } from './GlobalTicketStageHost';

const TYPE_ICONS: Record<string, string> = {
  flight: '✈️',
  train: '🚄',
  movie: '🎬',
  concert: '🎤',
  theater: '🎭',
  sports: '⚽',
  exhibition: '🖼',
  other: '🎟',
};

export function ticketTypeEmoji(type: string): string {
  return TYPE_ICONS[type] ?? '🎟';
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const navItems = [
    { to: '/', label: t('nav.timeline'), icon: Ticket, active: pathname === '/' },
    {
      to: '/scan',
      label: t('nav.scan'),
      icon: Camera,
      active: pathname.startsWith('/scan'),
    },
    {
      to: '/t/new/edit',
      label: t('nav.newTicket'),
      icon: PlusCircle,
      active: pathname === '/t/new/edit',
    },
    {
      to: '/recap/2026',
      label: t('nav.recap'),
      icon: BarChart3,
      active: pathname.startsWith('/recap'),
    },
    { to: '/map', label: t('nav.map'), icon: MapPin, active: pathname === '/map' },
    {
      to: '/settings',
      label: t('nav.settings'),
      icon: Settings,
      active: pathname === '/settings',
    },
  ];

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col pb-20 md:pb-6">
      <header className="sticky top-0 z-30 border-b border-stone-800/80 bg-stone-950/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-15 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 group">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400/20 via-indigo-500/20 to-rose-500/20 border border-amber-400/40 flex items-center justify-center text-lg shadow-inner">
              🎟
            </span>
            <div>
              <div className="font-bold tracking-tight text-stone-100 group-hover:text-amber-300 transition-colors leading-none">
                {t('app.name')}
              </div>
              <div className="text-[11px] text-stone-400 mt-0.5 hidden sm:block">
                {t('app.tagline')}
              </div>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                    item.active
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-stone-400 hover:text-stone-100 hover:bg-stone-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {t('app.offlineBadge')}
            </span>
            <div className="flex items-center gap-1 bg-stone-900 border border-stone-800 rounded-lg px-2 py-1">
              <Globe className="w-3.5 h-3.5 text-stone-400" />
              <select
                aria-label="Language"
                value={i18n.language}
                onChange={(e) => setAppLocale(e.target.value as SupportedLocale)}
                className="bg-transparent text-xs text-stone-200 focus:outline-none cursor-pointer"
              >
                {SUPPORTED_LOCALES.map((loc) => (
                  <option key={loc.code} value={loc.code} className="bg-stone-900 text-stone-100">
                    {loc.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children ?? <Outlet />}</main>

      {/* 移动端底部导航栏 */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-stone-800 bg-stone-950/95 backdrop-blur-md">
        <div className="grid grid-cols-6 h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  item.active ? 'text-amber-300' : 'text-stone-400'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="truncate max-w-full px-1">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* 全局唯一 WebGL Canvas 宿主 */}
      <GlobalTicketStageHost />
    </div>
  );
}
