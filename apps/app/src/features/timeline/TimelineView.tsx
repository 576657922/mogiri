import { renderThumbnailDataUrl } from '@mogiri/renderer';
import { TICKET_TYPES, type TicketType } from '@mogiri/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type TicketRecord } from '../../data';
import { filterTickets, formatEventDateDisplay, getYearMonthKey, toTicketSpec } from '../../domain';
import { btnClass, RatingDots, Segmented, stubTilt, useUiStore } from '../../ui';

/**
 * 票根缩略图组件（支持光标悬浮 3D 微倾角与动态高光层）
 */
function TicketStubVisual({
  ticket,
  interactiveTilt = false,
  className = '',
}: {
  ticket: TicketRecord;
  interactiveTilt?: boolean;
  className?: string;
}) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, hovering: false });

  const thumb = useMemo(() => {
    if (ticket.thumbDataUrl) return ticket.thumbDataUrl;
    try {
      return renderThumbnailDataUrl(toTicketSpec(ticket), 720);
    } catch {
      return '';
    }
  }, [ticket]);

  useEffect(() => {
    if (!ticket.thumbDataUrl && thumb) {
      void db.tickets.update(ticket.id, { thumbDataUrl: thumb });
    }
  }, [ticket.id, ticket.thumbDataUrl, thumb]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactiveTilt) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height);
    setTilt({
      rx: (0.5 - ny) * 11,
      ry: (nx - 0.5) * 14,
      gx: nx * 100,
      gy: ny * 100,
      hovering: true,
    });
  };

  const handlePointerLeave = () => {
    if (!interactiveTilt) return;
    setTilt({ rx: 0, ry: 0, gx: 50, gy: 50, hovering: false });
  };

  if (!thumb) {
    return (
      <div className="aspect-[18/7] w-full rounded-xl bg-bg-subtle flex items-center justify-center font-mono text-xs text-muted">
        {ticket.title}
      </div>
    );
  }

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        perspective: '1100px',
      }}
      className={`relative select-none ${className}`}
    >
      <div
        style={{
          transform: interactiveTilt
            ? `rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg) scale(${tilt.hovering ? 1.015 : 1})`
            : undefined,
          transition: tilt.hovering
            ? 'transform 120ms cubic-bezier(0.16, 1, 0.3, 1)'
            : 'transform 520ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="relative"
      >
        <img
          src={thumb}
          alt={ticket.title}
          draggable={false}
          className="w-full h-auto max-h-[260px] sm:max-h-[300px] object-contain stub-shadow select-none pointer-events-none"
        />

        {interactiveTilt && (
          <div
            aria-hidden="true"
            style={{
              opacity: tilt.hovering ? 0.28 : 0,
              background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.85), transparent 58%)`,
            }}
            className="pointer-events-none absolute inset-0 rounded-xl mix-blend-overlay transition-opacity duration-300"
          />
        )}
      </div>
    </div>
  );
}

export function TimelineView() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const timelineView = useUiStore((s) => s.timelineView);
  const setTimelineView = useUiStore((s) => s.setTimelineView);

  const [typeFilter, setTypeFilter] = useState<TicketType | 'all'>('all');
  const [yearFilter, setYearFilter] = useState<number | 'all'>('all');
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef<{ x: number; t: number; moved: boolean } | null>(null);
  const wheelLockRef = useRef<number>(0);

  const allActive = useLiveQuery(
    () =>
      db.tickets
        .where('status')
        .equals('status' in db.tickets ? 'active' : 'active')
        .toArray(),
    [],
    [] as TicketRecord[],
  );

  // 按时间倒序排列（最新在最前）
  const sortedActive = useMemo(
    () => [...allActive].sort((a, b) => b.eventAt.localeCompare(a.eventAt)),
    [allActive],
  );

  const availableYears = useMemo(() => {
    const s = new Set<number>();
    for (const tk of sortedActive) {
      s.add(getYearMonthKey(tk.eventAt).year);
    }
    return Array.from(s).sort((a, b) => b - a);
  }, [sortedActive]);

  const countsByType = useMemo(() => {
    const map: Partial<Record<TicketType, number>> = {};
    for (const tk of sortedActive) {
      map[tk.type] = (map[tk.type] ?? 0) + 1;
    }
    return map;
  }, [sortedActive]);

  const filtered = useMemo(
    () =>
      filterTickets(sortedActive, {
        type: typeFilter,
        year: yearFilter,
        tag: 'all',
        query,
      }),
    [sortedActive, typeFilter, yearFilter, query],
  );

  // 当筛选结果变化时，确保 activeIndex 不越界
  const safeIndex =
    filtered.length === 0 ? 0 : Math.min(Math.max(0, activeIndex), filtered.length - 1);
  const activeTicket = filtered[safeIndex] ?? null;

  const stepBy = useCallback(
    (delta: number) => {
      if (filtered.length === 0) return;
      setActiveIndex((prev) => {
        const base = Math.min(Math.max(0, prev), filtered.length - 1);
        return Math.min(Math.max(0, base + delta), filtered.length - 1);
      });
    },
    [filtered.length],
  );

  // 键盘左右方向键切换票根
  useEffect(() => {
    if (timelineView !== 'stack') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepBy(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepBy(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [timelineView, stepBy]);

  // 触控板双指滑动 / 鼠标滚轮顺滑翻票
  const handleStageWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (filtered.length <= 1) return;
    const now = performance.now();
    if (now - wheelLockRef.current < 210) return;
    const primaryDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(primaryDelta) < 14) return;
    wheelLockRef.current = now;
    stepBy(primaryDelta > 0 ? 1 : -1);
  };

  // 指针拖拽手势
  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (filtered.length <= 1) return;
    dragStartRef.current = { x: e.clientX, t: performance.now(), moved: false };
    setIsDragging(true);
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) > 6) start.moved = true;
    setDragX(dx);
  };

  const handleStagePointerEnd = () => {
    const start = dragStartRef.current;
    if (!start) return;
    const dt = Math.max(16, performance.now() - start.t);
    const velocity = dragX / dt;
    if (dragX < -55 || velocity < -0.35) {
      stepBy(1);
    } else if (dragX > 55 || velocity > 0.35) {
      stepBy(-1);
    }
    dragStartRef.current = null;
    setDragX(0);
    setIsDragging(false);
  };

  const hasActiveFilters = typeFilter !== 'all' || yearFilter !== 'all' || query.trim() !== '';

  const resetFilters = () => {
    setTypeFilter('all');
    setYearFilter('all');
    setQuery('');
    setActiveIndex(0);
  };

  return (
    <div className="flex-1 flex flex-col px-5 sm:px-8 py-5 sm:py-6 max-w-[1400px] w-full mx-auto">
      {/* 1. 顶部极简标题与筛选胶囊栏（recent.design 风格） */}
      <header className="space-y-4 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-[19px] font-semibold tracking-[-0.02em] text-fg">
              {t('nav.archive')}
            </h1>
            <span className="text-[13.5px] text-muted hidden sm:inline">{t('home.heroLead')}</span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* 搜索胶囊 */}
            <div className="relative flex items-center">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="absolute left-3 text-faint pointer-events-none"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                placeholder={t('home.searchPlaceholder')}
                aria-label={t('home.searchPlaceholder')}
                className="h-8 w-36 sm:w-48 rounded-full bg-bg-subtle pl-8 pr-3.5 text-[12.5px] text-fg placeholder:text-faint focus:bg-bg-raised focus:outline-none focus:ring-2 focus:ring-black/10 transition-all"
              />
            </div>

            {/* 滑动 / 网格切换 */}
            <Segmented
              value={timelineView}
              onChange={(v) => setTimelineView(v)}
              ariaLabel="View mode"
              options={[
                { value: 'stack', label: t('home.viewTable') },
                { value: 'grid', label: t('home.viewIndex') },
              ]}
            />
          </div>
        </div>

        {/* 分类胶囊条 */}
        <div className="flex items-center justify-between gap-4 overflow-x-auto no-scrollbar pb-1">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setTypeFilter('all');
                setActiveIndex(0);
              }}
              className={`h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors cursor-pointer ${
                typeFilter === 'all'
                  ? 'bg-fg text-bg-raised'
                  : 'bg-bg-subtle text-muted hover:text-fg hover:bg-[#e8e8e5]'
              }`}
            >
              {t('types.all')}
            </button>

            {TICKET_TYPES.map((tp) => {
              const count = countsByType[tp] ?? 0;
              if (count === 0 && typeFilter !== tp) return null;
              const active = typeFilter === tp;
              return (
                <button
                  key={tp}
                  type="button"
                  onClick={() => {
                    setTypeFilter(tp);
                    setActiveIndex(0);
                  }}
                  className={`h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-fg text-bg-raised'
                      : 'bg-bg-subtle text-muted hover:text-fg hover:bg-[#e8e8e5]'
                  }`}
                >
                  {t(`types.${tp}`)}
                </button>
              );
            })}
          </div>

          {availableYears.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={yearFilter}
                onChange={(e) => {
                  setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value));
                  setActiveIndex(0);
                }}
                aria-label={t('home.yearAll')}
                className="h-8 rounded-full bg-bg-subtle px-3 text-[12.5px] font-medium text-muted hover:text-fg cursor-pointer border-0 focus:outline-none"
              >
                <option value="all">{t('home.yearAll')}</option>
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      {/* 2. 主体区域 */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="text-[20px] font-semibold tracking-[-0.02em] text-fg">
            {hasActiveFilters ? t('home.emptyFiltered') : t('home.emptyTitle')}
          </div>
          <p className="text-[13.5px] text-muted max-w-sm">{t('home.emptyHint')}</p>
          <div className="pt-1">
            {hasActiveFilters ? (
              <button type="button" onClick={resetFilters} className={btnClass('outline')}>
                {t('home.clearFilters')}
              </button>
            ) : (
              <Link to="/t/new/edit" className={btnClass('solid')}>
                + {t('home.emptyCta')}
              </Link>
            )}
          </div>
        </div>
      ) : timelineView === 'stack' ? (
        /* 视图 A：顺滑水平滑动检视画廊（Coverflow + 底部刻度转盘） */
        <div
          onWheel={handleStageWheel}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerEnd}
          onPointerCancel={handleStagePointerEnd}
          className="flex-1 flex flex-col justify-between py-4 sm:py-6 overflow-hidden select-none touch-pan-y"
        >
          {/* 中央滑动轨道（两侧渐隐遮罩 + 无重叠呼吸间距） */}
          <div
            style={{
              maskImage:
                'linear-gradient(to right, transparent 0%, black 7%, black 93%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to right, transparent 0%, black 7%, black 93%, transparent 100%)',
            }}
            className="relative flex-1 flex items-center justify-center min-h-[290px] sm:min-h-[360px]"
          >
            {/* 票根卡片序列（基于相对偏移的弹簧动画） */}
            <div className="relative w-full h-full flex items-center justify-center">
              {filtered.map((ticket, idx) => {
                const offset = idx - safeIndex;
                if (Math.abs(offset) > 2) return null;
                const isCenter = offset === 0;
                const baseShiftPct = offset * 106;

                return (
                  <motion.div
                    key={ticket.id}
                    initial={false}
                    animate={{
                      x: `calc(${baseShiftPct}% + ${isDragging ? dragX : 0}px)`,
                      scale: isCenter ? 1 : Math.abs(offset) === 1 ? 0.84 : 0.72,
                      opacity: isCenter ? 1 : Math.abs(offset) === 1 ? 0.42 : 0.12,
                      rotateZ: isCenter ? 0 : offset * 1.5,
                      y: isCenter ? 0 : Math.abs(offset) * 10,
                    }}
                    transition={
                      isDragging
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 290, damping: 32, mass: 0.85 }
                    }
                    style={{
                      zIndex: 10 - Math.abs(offset),
                    }}
                    onClick={() => {
                      if (dragStartRef.current?.moved) return;
                      if (isCenter) {
                        void navigate({ to: '/t/$id', params: { id: ticket.id } });
                      } else {
                        setActiveIndex(idx);
                      }
                    }}
                    className="absolute w-[84%] max-w-[560px] cursor-pointer"
                  >
                    <TicketStubVisual ticket={ticket} interactiveTilt={isCenter} />
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* 当前票根说明与底部刻度尺转盘（参考 recent.design 刻度表交互） */}
          {activeTicket && (
            <div className="shrink-0 flex flex-col items-center gap-6 pt-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTicket.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22 }}
                  className="text-center space-y-2 max-w-xl px-4"
                >
                  <div className="inline-flex flex-wrap items-center justify-center gap-2 text-[12px] font-mono text-muted">
                    <span>{formatEventDateDisplay(activeTicket.eventAt, i18n.language)}</span>
                    {activeTicket.venueName && (
                      <>
                        <span>·</span>
                        <span>{activeTicket.venueName}</span>
                      </>
                    )}
                    {activeTicket.seat && (
                      <>
                        <span>·</span>
                        <span>{activeTicket.seat}</span>
                      </>
                    )}
                    {activeTicket.wear.torn && (
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-accent">
                        {t('home.torn')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-3">
                    <Link
                      to="/t/$id"
                      params={{ id: activeTicket.id }}
                      className="group inline-flex items-center gap-2 text-[22px] sm:text-[26px] font-semibold tracking-[-0.025em] text-fg hover:opacity-75 transition-opacity"
                    >
                      <span>{activeTicket.title}</span>
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-bg-subtle text-[13px] text-muted group-hover:bg-fg group-hover:text-bg-raised transition-colors">
                        ↗
                      </span>
                    </Link>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* 精密刻度尺控制器（Tick-Mark Dial + 左右微调步进器） */}
              <div className="flex flex-col items-center gap-2.5 w-full max-w-md">
                {/* 顶部悬浮黑色胶囊读数 */}
                <div className="inline-flex items-center gap-2 rounded-full bg-fg px-3 py-1 text-[11px] font-mono font-medium text-bg-raised shadow-sm">
                  <span>
                    {String(safeIndex + 1).padStart(2, '0')} /{' '}
                    {String(filtered.length).padStart(2, '0')}
                  </span>
                  <span className="opacity-40">·</span>
                  <span>{activeTicket.eventAt.slice(0, 10).replace(/-/g, '.')}</span>
                </div>

                {/* 刻度线阵列与左右翻票按钮 */}
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    aria-label="Previous ticket"
                    disabled={safeIndex === 0}
                    onClick={() => stepBy(-1)}
                    className="h-7 w-7 rounded-full bg-bg-subtle text-muted hover:text-fg hover:bg-[#e8e8e5] flex items-center justify-center text-xs transition-all disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
                  >
                    ←
                  </button>

                  <div
                    role="tablist"
                    aria-label="Ticket timeline scrubber"
                    className="flex items-center justify-center gap-1.5 py-1 px-2"
                  >
                    {filtered.map((tk, idx) => {
                      const active = idx === safeIndex;
                      return (
                        <div key={tk.id} className="flex items-center gap-1.5">
                          {idx > 0 && (
                            <>
                              <span className="h-2 w-[1.5px] rounded-full bg-black/10" />
                              <span className="h-2.5 w-[1.5px] rounded-full bg-black/10" />
                              <span className="h-2 w-[1.5px] rounded-full bg-black/10" />
                            </>
                          )}
                          <button
                            type="button"
                            role="tab"
                            aria-selected={active}
                            aria-label={tk.title}
                            onClick={() => setActiveIndex(idx)}
                            className="group py-2 px-1 cursor-pointer flex items-center justify-center"
                          >
                            <span
                              className={`rounded-full transition-all duration-300 ${
                                active
                                  ? 'h-6 w-[2.5px] bg-fg'
                                  : 'h-3.5 w-[2px] bg-black/22 group-hover:h-5 group-hover:bg-black/55'
                              }`}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    aria-label="Next ticket"
                    disabled={safeIndex === filtered.length - 1}
                    onClick={() => stepBy(1)}
                    className="h-7 w-7 rounded-full bg-bg-subtle text-muted hover:text-fg hover:bg-[#e8e8e5] flex items-center justify-center text-xs transition-all disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
                  >
                    →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 视图 B：纯净画廊网格（recent.design 卡片网格风格） */
        <div className="pt-6 pb-12 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((ticket) => {
            const tilt = stubTilt(ticket.id, 1.2);
            return (
              <Link
                key={ticket.id}
                to="/t/$id"
                params={{ id: ticket.id }}
                className="group relative flex flex-col justify-between rounded-[20px] bg-bg-raised border border-line p-5 hover:border-line-strong hover:shadow-[0_12px_32px_rgba(0,0,0,0.05)] transition-all duration-300"
              >
                {/* 柔和内衬展示台 */}
                <div className="rounded-2xl bg-bg-subtle/75 p-5 flex items-center justify-center min-h-[190px] overflow-hidden">
                  <div
                    style={{ transform: `rotate(${tilt}deg)` }}
                    className="w-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-0 group-hover:scale-[1.03]"
                  >
                    <TicketStubVisual ticket={ticket} />
                  </div>
                </div>

                {/* 卡片底栏（左侧标题与日期，右侧 recent.design 圆形外链箭头） */}
                <div className="pt-4 flex items-end justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 text-[11.5px] font-mono text-muted">
                      <span>{ticket.eventAt.slice(0, 10).replace(/-/g, '.')}</span>
                      {ticket.city && (
                        <>
                          <span>·</span>
                          <span>{ticket.city}</span>
                        </>
                      )}
                      {ticket.wear.torn && (
                        <span className="text-accent font-sans font-medium">{t('home.torn')}</span>
                      )}
                    </div>
                    <h3 className="text-[16px] font-semibold tracking-[-0.015em] text-fg truncate">
                      {ticket.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {ticket.rating !== undefined && <RatingDots value={ticket.rating} />}
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-bg-subtle text-[12px] text-muted group-hover:bg-fg group-hover:text-bg-raised transition-colors">
                      ↗
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
