import { renderThumbnailDataUrl } from '@mogiri/renderer';
import { TICKET_TYPES, type TicketType } from '@mogiri/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type TicketRecord } from '../../data';
import { filterTickets, formatEventDateDisplay, toTicketSpec } from '../../domain';
import { btnClass, RatingDots, ticketTypeCode, useUiStore } from '../../ui';

const MONTH_ABBR = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

/**
 * Concept C 后方层叠票根的工业卡纸配色（由近及远：象牙白、朱红、粉青、钴蓝、暖橙黄、石墨黑、顶层米白）
 */
const STACK_DEPTH_THEMES = [
  {
    rim: '#f1f1ec',
    body: '#f1f1ec',
    ink: '#141413',
  },
  {
    rim: '#d64c35',
    body: '#e2dfd3',
    ink: '#141413',
  },
  {
    rim: '#90bcc8',
    body: '#a4cdd7',
    ink: '#141413',
  },
  {
    rim: '#3671ae',
    body: '#447eb9',
    ink: '#f4f4f0',
  },
  {
    rim: '#de7d2c',
    body: '#dfcf76',
    ink: '#141413',
  },
  {
    rim: '#222220',
    body: '#dcd79e',
    ink: '#141413',
  },
  {
    rim: '#ecebe5',
    body: '#ecebe5',
    ink: '#141413',
  },
] as const;

/**
 * 生成稳定的伪随机一维条码竖线宽度序列与数字串
 */
function buildBarcodeSpec(seed: string): {
  hBars: { x: number; w: number }[];
  vBars: { y: number; h: number }[];
  digits: string;
  stubDigits: string;
} {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hBars: { x: number; w: number }[] = [];
  const vBars: { y: number; h: number }[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let digits = '';
  let stubDigits = '';
  for (let i = 0; i < 34; i++) {
    h ^= i * 37;
    h = Math.imul(h, 16777619);
    const u = (h >>> 0) % 10;
    const w = (u % 3) + 1;
    if (cursorX <= 136) {
      hBars.push({ x: cursorX, w: w * 0.95 });
    }
    cursorX += w + (i % 2 === 0 ? 1.6 : 2.2);

    if (cursorY <= 206) {
      vBars.push({ y: cursorY, h: w * 1.2 });
    }
    cursorY += w * 1.45 + (i % 3 === 0 ? 2.6 : 1.8);

    if (i < 11) digits += String(u);
    if (i >= 11 && i < 22) stubDigits += String(u);
  }
  return { hBars, vBars, digits, stubDigits };
}

/**
 * 生成模切齿孔票根的 SVG 路径（540 × 268 画幅）：
 * - 左右两侧细密撕口锯齿
 * - 左侧中央半圆拇指缺口
 * - x=412 处上下半圆副券撕口缺口
 */
function buildTicketClipPath(): string {
  const W = 540;
  const H = 268;
  const stubX = 412;
  const stubR = 7.5;
  const leftNotchY = H / 2;
  const leftNotchR = 12;

  const parts: string[] = [];
  parts.push('M 3 0');
  parts.push(`L ${stubX - stubR} 0`);
  parts.push(`A ${stubR} ${stubR} 0 0 0 ${stubX + stubR} 0`);
  parts.push(`L ${W - 3} 0`);

  // 右侧细锯齿边缘
  const teeth = 22;
  const stepY = H / teeth;
  for (let i = 0; i < teeth; i++) {
    const yMid = i * stepY + stepY * 0.5;
    const yEnd = (i + 1) * stepY;
    parts.push(`L ${W} ${yMid.toFixed(1)} L ${W - 3} ${yEnd.toFixed(1)}`);
  }

  // 底边 + 副券下缺口
  parts.push(`L ${stubX + stubR} ${H}`);
  parts.push(`A ${stubR} ${stubR} 0 0 0 ${stubX - stubR} ${H}`);
  parts.push(`L 3 ${H}`);

  // 左侧细锯齿边缘 + 中央半圆缺口
  for (let i = teeth - 1; i >= 0; i--) {
    const yStart = (i + 1) * stepY;
    const yMid = i * stepY + stepY * 0.5;
    const yEnd = i * stepY;

    if (yStart > leftNotchY - leftNotchR && yEnd < leftNotchY + leftNotchR) {
      if (yStart >= leftNotchY + leftNotchR) {
        parts.push(`L 3 ${(leftNotchY + leftNotchR).toFixed(1)}`);
        parts.push(`A ${leftNotchR} ${leftNotchR} 0 0 0 3 ${(leftNotchY - leftNotchR).toFixed(1)}`);
      }
      continue;
    }
    parts.push(`L 0 ${yMid.toFixed(1)} L 3 ${yEnd.toFixed(1)}`);
  }

  parts.push('Z');
  return parts.join(' ');
}

const TICKET_CLIP_PATH = buildTicketClipPath();

/**
 * 模切活版印刷实体票根组件（Concept C 核心视觉载体）
 */
function DieCutTicketCard({
  ticket,
  depth,
  catalogNo,
  language,
  typeLabel,
}: {
  ticket: TicketRecord;
  depth: number;
  catalogNo: string;
  language: string;
  typeLabel: string;
}) {
  const theme =
    STACK_DEPTH_THEMES[Math.min(depth, STACK_DEPTH_THEMES.length - 1)] ?? STACK_DEPTH_THEMES[0];
  const barcode = useMemo(() => buildBarcodeSpec(ticket.id), [ticket.id]);

  const priceDisplay =
    ticket.priceAmount !== undefined
      ? ticket.priceCurrency === 'USD'
        ? `$${ticket.priceAmount.toLocaleString()}`
        : ticket.priceCurrency === 'CNY'
          ? `¥${ticket.priceAmount.toLocaleString()}`
          : `¥${ticket.priceAmount.toLocaleString()}`
      : 'ADMIT ONE';

  const uid = `tk-${ticket.id.slice(0, 8)}-d${depth}`;
  const backMaskId = `tk-back-${ticket.id.slice(0, 8)}-d${depth}`;

  return (
    <svg
      viewBox="0 0 540 268"
      className="w-full h-auto block select-none overflow-visible"
      aria-label={depth === 0 ? ticket.title : undefined}
    >
      <title>{ticket.title}</title>
      <defs>
        <clipPath id={uid}>
          <path d={TICKET_CLIP_PATH} />
        </clipPath>
        {depth > 0 && (
          <clipPath id={backMaskId}>
            <rect x="0" y="0" width="540" height="64" />
          </clipPath>
        )}
      </defs>

      <g clipPath={depth > 0 ? `url(#${backMaskId})` : undefined}>
        <g clipPath={`url(#${uid})`}>
          {/* 外层色框（后方层叠票根露出醒目的博朗五色边框） */}
          <rect x="0" y="0" width="540" height="268" fill={theme.rim} />

          {/* 内层卡纸 */}
          {depth > 0 && depth < 6 ? (
            <rect x="6.5" y="5.5" width="527" height="257" rx="1.5" fill={theme.body} />
          ) : (
            <rect x="0" y="0" width="540" height="268" fill={theme.body} />
          )}

          {/* 顶部微高光 */}
          <line
            x1="0"
            y1="0.75"
            x2="540"
            y2="0.75"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth="1.5"
          />

          {/* 副券纵向圆孔齿孔线 (x = 412) */}
          <line
            x1="412"
            y1="14"
            x2="412"
            y2="254"
            stroke={depth > 0 ? 'rgba(20,20,19,0.32)' : 'rgba(20,20,19,0.42)'}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray="1.5 6.5"
          />

          {/* 票头左侧品牌名与右侧票价（后方叠卡在顶部露出一半文字，1:1 复刻 Concept C） */}
          <text
            x="30"
            y={depth === 0 ? 38 : 31.5}
            fill={theme.ink}
            fontSize={depth === 0 ? 21 : 21}
            fontWeight="700"
            letterSpacing="-0.03em"
            fontFamily="Inter Variable, PingFang SC, Hiragino Sans, sans-serif"
          >
            Hanken 半券
          </text>

          <text
            x="388"
            y={depth === 0 ? 35 : 30.5}
            textAnchor="end"
            fill={theme.ink}
            fontSize="12.5"
            fontWeight="500"
            fontFamily="JetBrains Mono Variable, monospace"
            opacity="0.88"
          >
            {priceDisplay}
          </text>

          {/* 正面主票根完整版面细节 */}
          {depth === 0 && (
            <>
              {/* 票种小标 */}
              <text
                x="30"
                y="82"
                fill="#383834"
                fontSize="10.5"
                fontWeight="600"
                letterSpacing="0.06em"
                fontFamily="Inter Variable, sans-serif"
              >
                {ticket.type.toUpperCase()} · {typeLabel}
              </text>

              {/* 活动主标题 */}
              <text
                x="30"
                y="112"
                fill="#141413"
                fontSize="25"
                fontWeight="700"
                letterSpacing="-0.03em"
                fontFamily="Inter Variable, PingFang SC, Hiragino Sans, sans-serif"
              >
                {ticket.title.length > 22 ? `${ticket.title.slice(0, 22)}…` : ticket.title}
              </text>

              {/* 三行活动副信息 */}
              <text
                x="30"
                y="134"
                fill="#383834"
                fontSize="11.5"
                fontWeight="500"
                fontFamily="Inter Variable, PingFang SC, Hiragino Sans, sans-serif"
              >
                {ticket.subtitle || ticket.venueName || ' archival specimen'}
              </text>
              <text
                x="30"
                y="151"
                fill="#383834"
                fontSize="11.5"
                fontWeight="500"
                fontFamily="Inter Variable, PingFang SC, Hiragino Sans, sans-serif"
              >
                {[ticket.venueName, ticket.city, ticket.seat].filter(Boolean).join(' · ') || '—'}
              </text>
              <text
                x="30"
                y="168"
                fill="#383834"
                fontSize="11.5"
                fontWeight="500"
                fontFamily="Inter Variable, PingFang SC, Hiragino Sans, sans-serif"
              >
                {formatEventDateDisplay(ticket.eventAt, language)}
              </text>

              {/* 左下角横向一维条码 */}
              <g transform="translate(30, 194)">
                {barcode.hBars.map((bar) => (
                  <rect
                    key={`hb-${bar.x.toFixed(2)}`}
                    x={bar.x}
                    y={0}
                    width={bar.w}
                    height={34}
                    fill="#181816"
                  />
                ))}
                <text
                  x="68"
                  y="45"
                  textAnchor="middle"
                  fill="#2c2c28"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono Variable, monospace"
                  letterSpacing="0.06em"
                >
                  {barcode.digits}
                </text>
              </g>

              {/* 主券右下角档案号与状态 */}
              <text
                x="388"
                y="239"
                textAnchor="end"
                fill={ticket.wear.torn ? '#d94832' : '#2c2c28'}
                fontSize="11"
                fontWeight="600"
                fontFamily="JetBrains Mono Variable, monospace"
              >
                {ticket.wear.torn ? `TORN · #${catalogNo}` : `BK #${catalogNo}`}
              </text>

              {/* 右侧副券纵向条码 */}
              <g transform="translate(442, 30)">
                {barcode.vBars.map((bar) => (
                  <rect
                    key={`vb-${bar.y.toFixed(2)}`}
                    x={0}
                    y={bar.y}
                    width={42}
                    height={bar.h}
                    fill="#181816"
                  />
                ))}
                <text
                  x="52"
                  y="104"
                  textAnchor="middle"
                  transform="rotate(-90 52 104)"
                  fill="#2c2c28"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono Variable, monospace"
                  letterSpacing="0.08em"
                >
                  {barcode.stubDigits}
                </text>
              </g>
            </>
          )}
        </g>
      </g>
    </svg>
  );
}

/**
 * 原彩缩略图卡片（供总览网格模式使用）
 */
function TicketGraphicThumb({ ticket }: { ticket: TicketRecord }) {
  const thumb = useMemo(() => {
    if (ticket.thumbDataUrl) return ticket.thumbDataUrl;
    try {
      return renderThumbnailDataUrl(toTicketSpec(ticket), 640);
    } catch {
      return '';
    }
  }, [ticket]);

  useEffect(() => {
    if (!ticket.thumbDataUrl && thumb) {
      void db.tickets.update(ticket.id, { thumbDataUrl: thumb });
    }
  }, [ticket.id, ticket.thumbDataUrl, thumb]);

  if (!thumb) return null;
  return (
    <img
      src={thumb}
      alt={ticket.title}
      draggable={false}
      className="w-full h-auto max-h-[200px] object-contain stub-shadow select-none"
    />
  );
}

export function TimelineView() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const timelineView = useUiStore((s) => s.timelineView);
  const setTimelineView = useUiStore((s) => s.setTimelineView);

  const [typeFilter, setTypeFilter] = useState<TicketType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [wheelTicks, setWheelTicks] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showFilterBar, setShowFilterBar] = useState(false);

  const dragStartRef = useRef<{ y: number; t: number; moved: boolean } | null>(null);
  const wheelLockRef = useRef<number>(0);

  const allActive = useLiveQuery(
    () => db.tickets.where('status').equals('active').toArray(),
    [],
    [] as TicketRecord[],
  );

  // 按时间倒序排列
  const sortedActive = useMemo(
    () => [...allActive].sort((a, b) => b.eventAt.localeCompare(a.eventAt)),
    [allActive],
  );

  const filtered = useMemo(
    () =>
      filterTickets(sortedActive, {
        type: typeFilter,
        year: 'all',
        tag: 'all',
        query,
      }),
    [sortedActive, typeFilter, query],
  );

  const total = filtered.length;
  const safeIndex = total === 0 ? 0 : ((activeIndex % total) + total) % total;
  const activeTicket = filtered[safeIndex] ?? null;

  const stepBy = useCallback(
    (delta: number) => {
      if (total <= 1) return;
      setActiveIndex((prev) => (((prev + delta) % total) + total) % total);
      setWheelTicks((prev) => prev + delta);
    },
    [total],
  );

  // 响应底部 Dock 再次点击首页图标切换 3D 叠卡 / 总览网格
  useEffect(() => {
    const onToggleView = () => {
      setTimelineView(timelineView === 'stack' ? 'grid' : 'stack');
    };
    window.addEventListener('mogiri:toggle-home-view', onToggleView);
    return () => window.removeEventListener('mogiri:toggle-home-view', onToggleView);
  }, [timelineView, setTimelineView]);

  // 键盘上下/左右方向键翻动叠卡
  useEffect(() => {
    if (timelineView !== 'stack') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        stepBy(1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        stepBy(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [timelineView, stepBy]);

  // 鼠标滚轮 / 触控板顺滑翻动卡槽
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (total <= 1) return;
    const now = performance.now();
    if (now - wheelLockRef.current < 190) return;
    const primary = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(primary) < 12) return;
    wheelLockRef.current = now;
    stepBy(primary > 0 ? 1 : -1);
  };

  // 上下拖拽手势（同时支持在叠卡与右侧金属滚轮上拖拽）
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (total <= 1) return;
    dragStartRef.current = { y: e.clientY, t: performance.now(), moved: false };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const dy = e.clientY - start.y;
    if (Math.abs(dy) > 5) start.moved = true;
    setDragY(dy);
  };

  const handlePointerEnd = () => {
    const start = dragStartRef.current;
    if (!start) return;
    const dt = Math.max(16, performance.now() - start.t);
    const velocity = dragY / dt;
    if (dragY > 38 || velocity > 0.28) {
      stepBy(1);
    } else if (dragY < -38 || velocity < -0.28) {
      stepBy(-1);
    }
    dragStartRef.current = null;
    setDragY(0);
    setIsDragging(false);
  };

  // 生成纵向叠卡序列（前排 1 张 + 后方 6 层景深叠卡：5 色工业边框 + 顶层米白卡）
  const visibleStack = useMemo(() => {
    if (total === 0) return [];
    const maxLayers = 7;
    const layers: { depth: number; ticket: TicketRecord; itemIndex: number }[] = [];
    for (let d = maxLayers - 1; d >= 0; d--) {
      const idx = (safeIndex + d) % total;
      const tk = filtered[idx];
      if (tk) {
        layers.push({ depth: d, ticket: tk, itemIndex: idx });
      }
    }
    return layers;
  }, [filtered, safeIndex, total]);

  // 右侧刻度尺的 4 个月份标签（自上而下 AUG · SEP · OCT · NOV，红线居中介于 SEP 与 OCT 之间）
  const dialMonths = useMemo(() => {
    const activeMonthNum = activeTicket ? Number(activeTicket.eventAt.slice(5, 7)) || 10 : 10;
    const m0 = MONTH_ABBR[(activeMonthNum - 1 + 12) % 12] ?? 'OCT';
    const mPrev1 = MONTH_ABBR[(activeMonthNum - 2 + 12) % 12] ?? 'SEP';
    const mPrev2 = MONTH_ABBR[(activeMonthNum - 3 + 12) % 12] ?? 'AUG';
    const mNext1 = MONTH_ABBR[activeMonthNum % 12] ?? 'NOV';
    return [
      { label: mPrev2, step: 2, y: 44, opacity: 0.34, weight: 600 },
      { label: mPrev1, step: 1, y: 106, opacity: 0.68, weight: 700 },
      { label: m0, step: 0, y: 170, opacity: 0.92, weight: 700 },
      { label: mNext1, step: -1, y: 232, opacity: 0.28, weight: 500 },
    ];
  }, [activeTicket]);

  const hasActiveFilters = typeFilter !== 'all' || query.trim() !== '';

  return (
    <div
      onWheel={timelineView === 'stack' ? handleWheel : undefined}
      className="flex-1 flex flex-col justify-between px-4 sm:px-8 relative select-none overflow-hidden"
    >
      {/* 总览网格模式下浮现的轻量筛选胶囊栏 */}
      <AnimatePresence>
        {(timelineView === 'grid' || showFilterBar) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mx-auto mt-2 z-20 frosted-dock rounded-full px-3 py-1.5 flex flex-wrap items-center justify-center gap-1.5"
          >
            <button
              type="button"
              onClick={() => {
                setTypeFilter('all');
                setActiveIndex(0);
              }}
              className={`h-7 rounded-full px-3 text-[12px] font-medium transition-colors cursor-pointer ${
                typeFilter === 'all' ? 'bg-fg text-bg-raised' : 'text-muted hover:text-fg'
              }`}
            >
              {t('types.all')}
            </button>
            {TICKET_TYPES.map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={() => {
                  setTypeFilter(tp);
                  setActiveIndex(0);
                }}
                className={`h-7 rounded-full px-3 text-[12px] font-medium transition-colors cursor-pointer ${
                  typeFilter === tp ? 'bg-fg text-bg-raised' : 'text-muted hover:text-fg'
                }`}
              >
                {t(`types.${tp}`)}
              </button>
            ))}
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              placeholder={t('home.searchPlaceholder')}
              aria-label={t('home.searchPlaceholder')}
              className="h-7 w-32 rounded-full bg-black/[0.05] px-3 text-[12px] text-fg placeholder:text-muted focus:bg-bg-raised focus:outline-none"
            />
            {timelineView === 'grid' && (
              <button
                type="button"
                onClick={() => {
                  setTimelineView('stack');
                  setShowFilterBar(false);
                }}
                className="h-7 rounded-full bg-black/[0.06] hover:bg-black/[0.12] px-3 text-[12px] font-medium text-fg transition-colors cursor-pointer"
              >
                {t('home.viewTable')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {total === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="text-[18px] font-semibold text-fg">
            {hasActiveFilters ? t('home.emptyFiltered') : t('home.emptyTitle')}
          </div>
          <p className="text-[13px] text-muted max-w-sm">{t('home.emptyHint')}</p>
          <div className="pt-1">
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('all');
                  setQuery('');
                  setActiveIndex(0);
                }}
                className={btnClass('outline')}
              >
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
        /* Concept C 主舞台：中央 3D 纵向景深叠卡 + 右侧博朗机械滚轮刻度尺 */
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          className="flex-1 flex items-center justify-center py-4 touch-none"
        >
          <div className="relative flex items-center justify-center w-full max-w-[940px]">
            {/* 中央纵向 Z 轴景深卡槽 */}
            <div className="relative w-full max-w-[540px] h-[350px] sm:h-[420px] flex items-end justify-center pb-2">
              {visibleStack.map(({ depth, ticket, itemIndex }) => {
                const isFront = depth === 0;
                const scale = 1 - depth * 0.042;
                let stepSum = 0;
                for (let k = 1; k <= depth; k++) {
                  stepSum += 8.65 * (1 - k * 0.042);
                }
                const yPercent = -stepSum + (isFront && isDragging ? dragY * 0.12 : 0);
                const catalogNo = String(total - itemIndex).padStart(3, '0');

                return (
                  <motion.div
                    key={`${ticket.id}-d${depth}`}
                    data-ticket-id={isFront ? ticket.id : undefined}
                    initial={false}
                    animate={{
                      y: `${yPercent}%`,
                      scale,
                      opacity: depth > 6 ? 0 : 1,
                    }}
                    transition={
                      isDragging
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 330, damping: 30, mass: 0.82 }
                    }
                    style={{
                      zIndex: 20 - depth,
                      transformOrigin: '50% 0%',
                    }}
                    onClick={() => {
                      if (dragStartRef.current?.moved) return;
                      if (isFront) {
                        void navigate({ to: '/t/$id', params: { id: ticket.id } });
                      } else {
                        stepBy(depth);
                      }
                    }}
                    className={`absolute bottom-2 w-full cursor-pointer ${
                      isFront
                        ? 'rolodex-shadow'
                        : 'drop-shadow-[0_-2px_5px_rgba(0,0,0,0.10)] hover:brightness-[1.02] transition-all'
                    }`}
                  >
                    <DieCutTicketCard
                      ticket={ticket}
                      depth={depth}
                      catalogNo={catalogNo}
                      language={i18n.language}
                      typeLabel={t(`types.${ticket.type}`)}
                    />
                  </motion.div>
                );
              })}
            </div>

            {/* 右侧：博朗机械滚花转轮 + 蚀刻毫米尺 + 纵向月份刻度 + 朱红指针线（Concept C 1:1 复刻） */}
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              className="hidden sm:flex items-center ml-12 lg:ml-16 relative py-4 cursor-ns-resize select-none"
              title="Scroll or drag thumbwheel to flip tickets"
            >
              {/* 精密 SVG 毫米刻度尺 + 纵向旋转月份 + 朱红水平指针线 */}
              <svg
                width="62"
                height="276"
                viewBox="0 0 62 276"
                className="block overflow-visible"
                aria-hidden="true"
              >
                {/* 65 条精密水平毫米刻度线（上下两端渐隐） */}
                {Array.from({ length: 65 }).map((_, idx) => {
                  const y = 10 + idx * 4;
                  const isMajor = idx % 4 === 0;
                  const edgeFade = Math.min(1, Math.min(idx + 1, 65 - idx) / 7);
                  return (
                    <line
                      key={`ruler-tick-${y}`}
                      x1={isMajor ? 11 : 16}
                      y1={y}
                      x2={22}
                      y2={y}
                      stroke="#191918"
                      strokeWidth={isMajor ? '1.1' : '0.85'}
                      strokeOpacity={(isMajor ? 0.38 : 0.22) * edgeFade}
                    />
                  );
                })}

                {/* 纵向旋转月份标签（AUG · SEP · OCT · NOV） */}
                {dialMonths.map((m) => (
                  // biome-ignore lint/a11y/noStaticElementInteractions: 刻度盘鼠标辅助点击跳转（键盘已由全局方向键监听处理）
                  <g
                    key={`dial-svg-${m.step}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (m.step !== 0) stepBy(m.step);
                    }}
                    className="cursor-pointer"
                  >
                    <text
                      x="38"
                      y={m.y}
                      transform={`rotate(-90 38 ${m.y})`}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#191918"
                      fillOpacity={m.opacity}
                      fontSize="15.5"
                      fontWeight={m.weight}
                      letterSpacing="0.08em"
                      fontFamily="Inter Variable, sans-serif"
                    >
                      {m.label}
                    </text>
                  </g>
                ))}

                {/* 月份之间的三枚圆点分隔符 */}
                <circle cx="38" cy="75" r="1.4" fill="#191918" fillOpacity="0.35" />
                <circle cx="38" cy="138" r="1.5" fill="#191918" fillOpacity="0.85" />
                <circle cx="38" cy="201" r="1.4" fill="#191918" fillOpacity="0.35" />

                {/* 贯穿刻度尺与中心点的朱红机械指针线（精准指向金属滚轮正中央 y=138） */}
                <line x1="0" y1="138" x2="62" y2="138" stroke="#d64c35" strokeWidth="1.5" />
              </svg>

              {/* 机械滚轮凹槽与金属滚花转轮（与 y=138 垂直居中对齐） */}
              <div className="w-[13px] h-[168px] rounded-full wheel-trough flex items-center justify-center relative -ml-[1px]">
                <div
                  style={{
                    backgroundPositionY: `${wheelTicks * 7 + (isDragging ? dragY * 0.4 : 0)}px, 0px`,
                  }}
                  className="w-[10.5px] h-[94px] rounded-[4px] knurled-wheel transition-[background-position] duration-150"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 总览网格模式 */
        <div className="max-w-[1160px] w-full mx-auto pt-4 pb-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 overflow-y-auto">
          {filtered.map((ticket) => (
            <Link
              key={ticket.id}
              to="/t/$id"
              params={{ id: ticket.id }}
              className="group rounded-[20px] bg-bg-raised border border-line p-5 flex flex-col justify-between gap-4 hover:border-line-strong transition-all"
            >
              <div className="rounded-xl bg-bg-subtle/60 p-4 flex items-center justify-center min-h-[170px]">
                <TicketGraphicThumb ticket={ticket} />
              </div>

              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-muted">
                    {ticket.eventAt.slice(0, 10).replace(/-/g, '.')} · {ticketTypeCode(ticket.type)}
                  </div>
                  <h3 className="text-[15.5px] font-semibold text-fg truncate mt-0.5">
                    {ticket.title}
                  </h3>
                </div>
                {ticket.rating !== undefined && <RatingDots value={ticket.rating} />}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
