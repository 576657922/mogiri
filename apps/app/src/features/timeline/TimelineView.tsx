import { renderThumbnailDataUrl } from '@mogiri/renderer';
import { TICKET_TYPES, type TicketType } from '@mogiri/shared';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
 * 语义化博朗/瑞士档案工业色系：按票种（TicketType）赋予每张票根恒定的专属顶栏色彩身份
 * - 演出 concert：博朗信号朱红（Vermilion）
 * - 列车 train：JR 新干线磁气钴蓝（Cobalt Blue）
 * - 机票 flight：航空琥珀金（Aviation Amber）
 * - 电影 movie：胶片粉青（35mm Cine Teal）
 * - 戏剧 theater：包豪斯炭黑与帝国暖金（Charcoal & Buff）
 * - 展览 exhibition：美术馆青瓷灰（Celadon）
 * - 赛事 sports：赛场墨绿（Racing Green）
 * - 其他 other：档案暖石（Archival Stone）
 */
const TICKET_TYPE_THEMES: Record<
  TicketType,
  {
    rim: string;
    tabBg: string;
    tabInk: string;
    subInk: string;
  }
> = {
  concert: {
    rim: '#d64c35',
    tabBg: '#e7dfd3',
    tabInk: '#141413',
    subInk: '#4a463f',
  },
  train: {
    rim: '#28609c',
    tabBg: '#3973b2',
    tabInk: '#f7f7f3',
    subInk: 'rgba(247,247,243,0.82)',
  },
  flight: {
    rim: '#d67824',
    tabBg: '#e1cf76',
    tabInk: '#141413',
    subInk: '#474126',
  },
  movie: {
    rim: '#699fb0',
    tabBg: '#9ac5d2',
    tabInk: '#141413',
    subInk: '#2c464f',
  },
  theater: {
    rim: '#222220',
    tabBg: '#dcd69c',
    tabInk: '#141413',
    subInk: '#45432e',
  },
  exhibition: {
    rim: '#566658',
    tabBg: '#cbd5cc',
    tabInk: '#141413',
    subInk: '#384239',
  },
  sports: {
    rim: '#266348',
    tabBg: '#b7d4c5',
    tabInk: '#141413',
    subInk: '#254737',
  },
  other: {
    rim: '#7d7970',
    tabBg: '#e2dfd7',
    tabInk: '#141413',
    subInk: '#4a4842',
  },
};

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

    if (cursorY <= 194) {
      vBars.push({ y: cursorY, h: w * 1.2 });
    }
    cursorY += w * 1.45 + (i % 3 === 0 ? 2.5 : 1.75);

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
  const leftNotchR = 11.5;

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
 * 计算任意连续景深 relDepth (-1..6) 的三维光学投影姿态（纯数学函数，供 60fps 直接 DOM 引擎调用）：
 * - relDepth >= 0：沿透视递减阶梯排布（每层露出顶部 26px 档案索引标签）
 * - relDepth < 0：前排票根保持 100% 实体不透明卡纸质感沿垂直中轴滑落，清晰显露后卡标题，仅在末段柔和消隐
 */
function computeCardStagePose(relDepth: number): {
  yPx: number;
  scale: number;
  opacity: number;
} {
  if (relDepth < 0) {
    const p = Math.max(0, Math.min(1, -relDepth));
    const yPx = (1 - (1 - p) ** 1.85) * 144;
    const scale = 1 + Math.sin(p * Math.PI) * 0.015 - p * 0.01;
    const opacity = p <= 0.62 ? 1 : 0.5 * (1 + Math.cos(Math.PI * Math.min(1, (p - 0.62) / 0.38)));
    return { yPx, scale, opacity };
  }

  const effectiveDepth = Math.max(0, relDepth);
  const scale = 1 - effectiveDepth * 0.04;
  const whole = Math.floor(effectiveDepth);
  const frac = effectiveDepth - whole;
  let stepSumPx = 0;
  for (let k = 1; k <= whole; k++) {
    stepSumPx += 25.5 * (1 - k * 0.04);
  }
  if (frac > 0) {
    stepSumPx += frac * 25.5 * (1 - (whole + 1) * 0.04);
  }
  const farFade = effectiveDepth > 6 ? Math.max(0, 1 - (effectiveDepth - 6)) : 1;
  return { yPx: -stepSumPx, scale, opacity: farFade };
}

/**
 * 模切活版印刷实体票根组件（React.memo 静态化：滚动动画期间零重绘，完全由外层 GPU 图层合成位移）
 * - 顶部 y=0..32 为按票种（TicketType）着色的档案索引耳标（完整显示「序号 · 日期 · 标题」与「票种 · 票价」，后方叠放时绝不裁切文字）
 * - 主体 y=32..268 为 350g 棉浆象牙白活版纸面（含暖调纸感渐变、内凹压印边框与十字套准线）
 */
const DieCutTicketCard = memo(function DieCutTicketCard({
  ticket,
  catalogNo,
  language,
  typeLabel,
}: {
  ticket: TicketRecord;
  catalogNo: string;
  language: string;
  typeLabel: string;
}) {
  const theme = TICKET_TYPE_THEMES[ticket.type] ?? TICKET_TYPE_THEMES.other;
  const barcode = useMemo(() => buildBarcodeSpec(ticket.id), [ticket.id]);

  const priceDisplay =
    ticket.priceAmount !== undefined
      ? ticket.priceCurrency === 'USD'
        ? `$${ticket.priceAmount.toLocaleString()}`
        : ticket.priceCurrency === 'CNY'
          ? `¥${ticket.priceAmount.toLocaleString()}`
          : `¥${ticket.priceAmount.toLocaleString()}`
      : 'ADMIT ONE';

  const shortDate = ticket.eventAt.slice(0, 10).replace(/-/g, '.');
  const tabTitle = ticket.title.length > 20 ? `${ticket.title.slice(0, 20)}…` : ticket.title;
  const clipId = `tk-clip-${ticket.id}`;
  const paperGradId = `tk-paper-${ticket.id}`;

  return (
    <svg
      viewBox="0 0 540 268"
      className="w-full h-auto block select-none overflow-visible"
      aria-label={ticket.title}
    >
      <title>{ticket.title}</title>
      <defs>
        <clipPath id={clipId}>
          <path d={TICKET_CLIP_PATH} />
        </clipPath>
        <linearGradient id={paperGradId} x1="0" y1="0" x2="0.15" y2="1">
          <stop offset="0%" stopColor="#f5f4ef" />
          <stop offset="55%" stopColor="#f1f0ea" />
          <stop offset="100%" stopColor="#eae8e0" />
        </linearGradient>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {/* 底层 350g 象牙白活版棉纸 */}
        <rect x="0" y="0" width="540" height="268" fill={`url(#${paperGradId})`} />

        {/* 顶部 32px 档案索引耳标（按票种语义着色，后方叠卡露出顶部 26px 时完整呈现档案摘要，前移落位时自然作为主卡顶栏） */}
        <rect x="0" y="0" width="540" height="32" fill={theme.tabBg} />
        {/* 顶部 3.5px 饱和原色模切封边 */}
        <rect x="0" y="0" width="540" height="3.5" fill={theme.rim} />
        {/* 左右两侧顶栏包边角 */}
        <rect x="0" y="0" width="5" height="32" fill={theme.rim} />
        <rect x="535" y="0" width="5" height="32" fill={theme.rim} />

        {/* 顶栏与象牙白纸面之间的活版压痕分隔线 */}
        <line x1="0" y1="32" x2="540" y2="32" stroke="rgba(20,20,19,0.14)" strokeWidth="1" />
        <line x1="0" y1="33" x2="540" y2="33" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />

        {/* 顶部微高光 */}
        <line
          x1="0"
          y1="0.75"
          x2="540"
          y2="0.75"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1.2"
        />

        {/* 档案索引耳标文字（垂直居中于 y=19.5，在后方叠卡露出区 100% 完整可读，序号日期与标题之间留有清晰瑞士网格间距） */}
        <text
          x="22"
          y="20"
          fill={theme.subInk}
          fontSize="10.5"
          fontWeight="600"
          fontFamily="JetBrains Mono Variable, monospace"
          letterSpacing="0.02em"
        >
          {catalogNo} · {shortDate}
        </text>
        <line
          x1="131"
          y1="9"
          x2="131"
          y2="23"
          stroke={theme.subInk}
          strokeOpacity="0.32"
          strokeWidth="1"
        />
        <text
          x="140"
          y="20"
          fill={theme.tabInk}
          fontSize="12"
          fontWeight="700"
          letterSpacing="-0.01em"
          fontFamily="Inter Variable, PingFang SC, Hiragino Sans, sans-serif"
        >
          {tabTitle}
        </text>
        <text
          x="394"
          y="20"
          textAnchor="end"
          fill={theme.tabInk}
          fontSize="11"
          fontWeight="600"
          fontFamily="JetBrains Mono Variable, monospace"
        >
          {ticketTypeCode(ticket.type)} · {priceDisplay}
        </text>
        <text
          x="476"
          y="20"
          textAnchor="middle"
          fill={theme.subInk}
          fontSize="10"
          fontWeight="600"
          fontFamily="JetBrains Mono Variable, monospace"
          letterSpacing="0.05em"
        >
          BK #{catalogNo}
        </text>

        {/* 主券活版压印内框线（Letterpress Deboss Frame）与四角微套准十字 */}
        <rect
          x="18"
          y="44"
          width="376"
          height="208"
          rx="2"
          fill="none"
          stroke="rgba(20,20,19,0.075)"
          strokeWidth="1"
        />
        <path
          d="M 24 50 h 5 M 26.5 47.5 v 5 M 383 50 h 5 M 385.5 47.5 v 5 M 24 246 h 5 M 26.5 243.5 v 5 M 383 246 h 5 M 385.5 243.5 v 5"
          stroke="rgba(20,20,19,0.18)"
          strokeWidth="0.8"
        />

        {/* 副券纵向圆孔齿孔线 (x = 412) */}
        <line
          x1="412"
          y1="14"
          x2="412"
          y2="254"
          stroke="rgba(20,20,19,0.38)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="1.5 6.5"
        />

        {/* 票面左上角分类与场馆小标 */}
        <circle cx="34" cy="65" r="3" fill={theme.rim} />
        <text
          x="43"
          y="68.5"
          fill="#383834"
          fontSize="10.5"
          fontWeight="600"
          letterSpacing="0.06em"
          fontFamily="Inter Variable, PingFang SC, Hiragino Sans, sans-serif"
        >
          {ticket.type.toUpperCase()} · {typeLabel}
          {ticket.city ? ` — ${ticket.city}` : ''}
        </text>

        {/* 右上角 Hanken 半券活版暗印章 */}
        <text
          x="382"
          y="68.5"
          textAnchor="end"
          fill="#78766e"
          fontSize="10"
          fontWeight="600"
          letterSpacing="0.04em"
          fontFamily="JetBrains Mono Variable, monospace"
        >
          HANKEN 半券
        </text>

        {/* 活动主标题 */}
        <text
          x="30"
          y="102"
          fill="#141413"
          fontSize="24.5"
          fontWeight="700"
          letterSpacing="-0.03em"
          fontFamily="Inter Variable, PingFang SC, Hiragino Sans, sans-serif"
        >
          {ticket.title.length > 22 ? `${ticket.title.slice(0, 22)}…` : ticket.title}
        </text>

        {/* 三行活动副信息 */}
        <text
          x="30"
          y="126"
          fill="#30302c"
          fontSize="11.5"
          fontWeight="500"
          fontFamily="Inter Variable, PingFang SC, Hiragino Sans, sans-serif"
        >
          {ticket.subtitle || ticket.venueName || 'Archival Specimen'}
        </text>
        <text
          x="30"
          y="144"
          fill="#454540"
          fontSize="11.5"
          fontWeight="500"
          fontFamily="Inter Variable, PingFang SC, Hiragino Sans, sans-serif"
        >
          {[ticket.venueName, ticket.seat].filter(Boolean).join(' · ') || '—'}
        </text>
        <text
          x="30"
          y="162"
          fill="#454540"
          fontSize="11.5"
          fontWeight="500"
          fontFamily="JetBrains Mono Variable, PingFang SC, Hiragino Sans, sans-serif"
        >
          {formatEventDateDisplay(ticket.eventAt, language)}
        </text>

        {/* 左下角横向一维条码 */}
        <g transform="translate(30, 188)">
          {barcode.hBars.map((bar) => (
            <rect
              key={`hb-${bar.x.toFixed(2)}`}
              x={bar.x}
              y={0}
              width={bar.w}
              height={32}
              fill="#181816"
            />
          ))}
          <text
            x="68"
            y="43"
            textAnchor="middle"
            fill="#383833"
            fontSize="9.5"
            fontFamily="JetBrains Mono Variable, monospace"
            letterSpacing="0.06em"
          >
            {barcode.digits}
          </text>
        </g>

        {/* 主券右下角：显式 3D 检视印章外观（视觉引导明确，配合外层 Link 锚点） */}
        <g transform="translate(284, 198)">
          <rect
            x="0"
            y="0"
            width="98"
            height="32"
            rx="16"
            fill="rgba(20,20,19,0.045)"
            stroke="rgba(20,20,19,0.18)"
            strokeWidth="1"
          />
          <text
            x="49"
            y="19.5"
            textAnchor="middle"
            fill="#191918"
            fontSize="10.5"
            fontWeight="600"
            fontFamily="JetBrains Mono Variable, PingFang SC, sans-serif"
            letterSpacing="0.02em"
          >
            3D 检视 ↗
          </text>
        </g>

        {/* 右侧副券纵向条码 */}
        <g transform="translate(442, 46)">
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
            y="98"
            textAnchor="middle"
            transform="rotate(-90 52 98)"
            fill="#2c2c28"
            fontSize="9.5"
            fontFamily="JetBrains Mono Variable, monospace"
            letterSpacing="0.08em"
          >
            {barcode.stubDigits}
          </text>
        </g>
      </g>
    </svg>
  );
});

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
  const timelineView = useUiStore((s) => s.timelineView);
  const setTimelineView = useUiStore((s) => s.setTimelineView);

  const [typeFilter, setTypeFilter] = useState<TicketType | 'all'>('all');
  const [query, setQuery] = useState('');
  // React 状态仅在整数索引切换时更新一次（用于顶部仪表读数），60fps 动画完全绕过 React 直接写 DOM
  const [activeIndex, setActiveIndex] = useState(0);
  const [showFilterBar, setShowFilterBar] = useState(false);

  const posRef = useRef(0);
  const velRef = useRef(0);
  const targetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const activeIndexRef = useRef(0);

  // 直接 DOM 引用集合（60fps 帧循环内零 React 调和开销）
  const cardElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const rulerTicksGroupRef = useRef<SVGGElement | null>(null);
  const monthDrumGroupRef = useRef<SVGGElement | null>(null);
  const knurledWheelRef = useRef<HTMLDivElement | null>(null);

  const dragStartRef = useRef<{
    y: number;
    t: number;
    startPos: number;
    lastY: number;
    lastT: number;
    velPxPerMs: number;
    moved: boolean;
  } | null>(null);
  const wheelSnapTimerRef = useRef<number | null>(null);
  const lastDiscreteWheelRef = useRef<number>(0);

  const allActive = useLiveQuery(
    () => db.tickets.where('status').equals('active').toArray(),
    [],
    [] as TicketRecord[],
  );

  // 按时间倒序排列（最新活动在前排 index=0，向后依次为更早的归档票根）
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
  const clampedActiveIndex = total === 0 ? 0 : Math.max(0, Math.min(total - 1, activeIndex));
  const activeTicket = filtered[clampedActiveIndex] ?? null;

  /**
   * 60fps 直接 DOM 合成器更新：只写 style.transform / opacity / SVG transform，耗时 < 0.1ms
   */
  const applyRolodexFrame = useCallback(
    (pos: number) => {
      const maxIndex = Math.max(0, total - 1);
      const nearest = Math.max(0, Math.min(maxIndex, Math.round(pos)));

      if (nearest !== activeIndexRef.current) {
        activeIndexRef.current = nearest;
        setActiveIndex(nearest);
      }

      for (const [slotIdx, el] of cardElsRef.current.entries()) {
        const relDepth = slotIdx - pos;
        if (relDepth <= -0.995 || relDepth >= 6.95) {
          el.style.visibility = 'hidden';
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          el.removeAttribute('data-ticket-id');
          el.removeAttribute('data-slot-depth');
          continue;
        }
        const { yPx, scale, opacity } = computeCardStagePose(relDepth);
        const zOrder = Math.round((20 - relDepth) * 10);
        const isFrontCard = slotIdx === nearest;

        el.style.visibility = opacity <= 0.005 ? 'hidden' : 'visible';
        el.style.zIndex = String(zOrder);
        el.style.transform = `translate3d(0px, ${yPx.toFixed(2)}px, 0px) scale(${scale.toFixed(4)})`;
        el.style.opacity = String(Number(opacity.toFixed(4)));
        el.style.pointerEvents = relDepth < -0.05 ? 'none' : 'auto';

        if (isFrontCard) {
          const tkId = el.getAttribute('data-card-id');
          if (tkId) el.setAttribute('data-ticket-id', tkId);
        } else {
          el.removeAttribute('data-ticket-id');
        }
        el.setAttribute('data-slot-depth', String(Math.round(relDepth)));
      }

      // 联动右侧毫米尺（单次修改 <g> transform，避免逐根修改 65 条 <line>）
      if (rulerTicksGroupRef.current) {
        const phaseY = (((pos * 24) % 16) + 16) % 16;
        rulerTicksGroupRef.current.setAttribute('transform', `translate(0, ${phaseY.toFixed(2)})`);
      }

      // 联动右侧标准日历月份转鼓（DEC · NOV · OCT · SEP · AUG...，当前票所属月份精准对准 y=138 朱红指针线）
      if (monthDrumGroupRef.current && filtered.length > 0) {
        const clampedPos = Math.max(0, Math.min(maxIndex, pos));
        const lowIdx = Math.floor(clampedPos);
        const highIdx = Math.min(maxIndex, lowIdx + 1);
        const frac = clampedPos - lowIdx;
        const lowMonth = Number(filtered[lowIdx]?.eventAt.slice(5, 7)) || 11;
        const highMonth = Number(filtered[highIdx]?.eventAt.slice(5, 7)) || lowMonth;
        const lowStep = 12 - lowMonth;
        const highStep = 12 - highMonth;
        const interpStep = lowStep + (highStep - lowStep) * frac;
        const drumY = 138 - interpStep * 56;
        monthDrumGroupRef.current.setAttribute('transform', `translate(0, ${drumY.toFixed(2)})`);
      }

      // 联动金属滚花转轮纹理相位
      if (knurledWheelRef.current) {
        knurledWheelRef.current.style.backgroundPositionY = `${(pos * 28).toFixed(2)}px, 0px`;
      }
    },
    [total, filtered],
  );

  const startSpringLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    lastFrameTimeRef.current = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.032, Math.max(0.004, (now - lastFrameTimeRef.current) / 1000));
      lastFrameTimeRef.current = now;

      // 临界阻尼弹簧参数（stiffness=160, damping=25.2，快速顺滑且无多余震荡）
      const stiffness = 160;
      const damping = 25.2;
      const displacement = posRef.current - targetRef.current;
      const accel = -stiffness * displacement - damping * velRef.current;

      velRef.current += accel * dt;
      posRef.current += velRef.current * dt;

      if (
        Math.abs(targetRef.current - posRef.current) < 0.0008 &&
        Math.abs(velRef.current) < 0.002
      ) {
        posRef.current = targetRef.current;
        velRef.current = 0;
        applyRolodexFrame(posRef.current);
        rafRef.current = null;
        return;
      }

      applyRolodexFrame(posRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [applyRolodexFrame]);

  // 初始挂载或列表变化时同步一次 DOM 姿态
  useEffect(() => {
    applyRolodexFrame(posRef.current);
  }, [applyRolodexFrame]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (wheelSnapTimerRef.current !== null) {
        window.clearTimeout(wheelSnapTimerRef.current);
      }
    };
  }, []);

  const resetCursor = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    posRef.current = 0;
    velRef.current = 0;
    targetRef.current = 0;
    activeIndexRef.current = 0;
    setActiveIndex(0);
    applyRolodexFrame(0);
  }, [applyRolodexFrame]);

  const jumpToIndex = useCallback(
    (nextIdx: number) => {
      if (total <= 1) return;
      const clamped = Math.max(0, Math.min(total - 1, nextIdx));
      targetRef.current = clamped;
      startSpringLoop();
    },
    [total, startSpringLoop],
  );

  const stepBy = useCallback(
    (delta: number) => {
      if (total <= 1 || delta === 0) return;
      const currentTarget = Math.round(targetRef.current);
      const rawNext = currentTarget + delta;
      // 有限档案盒逻辑：抵达末尾后若继续点击翻页，平滑归位至首张（0），绝不在同一画面重复渲染同一张票
      const nextTarget =
        rawNext > total - 1 ? 0 : rawNext < 0 ? 0 : Math.max(0, Math.min(total - 1, rawNext));
      targetRef.current = nextTarget;
      startSpringLoop();
    },
    [total, startSpringLoop],
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

  // 触控板与滚轮：支持连续增量累积 + 停顿后自动吸附至最近整数卡槽，消除惯性尾巴误翻
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (total <= 1) return;
    const primary = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(primary) < 2) return;

    const now = performance.now();
    const isDiscreteMouseWheel =
      Math.abs(primary) >= 48 && now - lastDiscreteWheelRef.current > 220;

    if (isDiscreteMouseWheel) {
      lastDiscreteWheelRef.current = now;
      const next = Math.max(
        0,
        Math.min(total - 1, Math.round(targetRef.current) + (primary > 0 ? 1 : -1)),
      );
      targetRef.current = next;
      startSpringLoop();
      return;
    }

    // 连续触控板滚动：按比例推进 target 并加边界橡皮筋阻尼，手势停止 130ms 后自动吸附至最近整数卡槽
    const maxIdx = total - 1;
    const deltaCursor = primary * 0.0038;
    const rawTarget = targetRef.current + deltaCursor;
    const dampedTarget =
      rawTarget < 0
        ? Math.max(-0.28, rawTarget * 0.28)
        : rawTarget > maxIdx
          ? Math.min(maxIdx + 0.28, maxIdx + (rawTarget - maxIdx) * 0.28)
          : rawTarget;

    targetRef.current = dampedTarget;
    startSpringLoop();

    if (wheelSnapTimerRef.current !== null) {
      window.clearTimeout(wheelSnapTimerRef.current);
    }
    wheelSnapTimerRef.current = window.setTimeout(() => {
      targetRef.current = Math.max(0, Math.min(maxIdx, Math.round(targetRef.current)));
      startSpringLoop();
    }, 130);
  };

  // 上下拖拽手势（1:1 直接驱动 DOM，含首尾橡皮筋阻尼，松手后将动量移交弹簧引擎吸附）
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (total <= 1) return;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const now = performance.now();
    dragStartRef.current = {
      y: e.clientY,
      t: now,
      startPos: posRef.current,
      lastY: e.clientY,
      lastT: now,
      velPxPerMs: 0,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    const now = performance.now();
    const dy = e.clientY - start.y;
    if (Math.abs(dy) > 5) start.moved = true;

    const dt = Math.max(4, now - start.lastT);
    start.velPxPerMs = (e.clientY - start.lastY) / dt;
    start.lastY = e.clientY;
    start.lastT = now;

    const maxIdx = Math.max(0, total - 1);
    const rawPos = start.startPos + dy / 148;
    const dampedPos =
      rawPos < 0 ? rawPos * 0.28 : rawPos > maxIdx ? maxIdx + (rawPos - maxIdx) * 0.28 : rawPos;

    posRef.current = dampedPos;
    targetRef.current = dampedPos;
    velRef.current = 0;
    applyRolodexFrame(dampedPos);
  };

  const handlePointerEnd = () => {
    const start = dragStartRef.current;
    if (!start) return;
    dragStartRef.current = null;

    const maxIdx = Math.max(0, total - 1);
    if (!start.moved) {
      targetRef.current = Math.max(0, Math.min(maxIdx, Math.round(posRef.current)));
      startSpringLoop();
      return;
    }

    const cursorVel = (start.velPxPerMs * 1000) / 148;
    velRef.current = cursorVel;
    const projected = posRef.current + cursorVel * 0.14;
    const baseRound = Math.round(start.startPos);
    const diff = projected - baseRound;

    let nextTarget = baseRound;
    if (diff > 0.2) {
      nextTarget = baseRound + Math.max(1, Math.round(diff));
    } else if (diff < -0.2) {
      nextTarget = baseRound + Math.min(-1, Math.round(diff));
    }
    targetRef.current = Math.max(0, Math.min(maxIdx, nextTarget));
    startSpringLoop();
  };

  // 有限不重复叠卡列表（按从远到近排序挂载，确保每张真实票根只出现一次）
  const stackItems = useMemo(() => {
    const items: { slotIndex: number; ticket: TicketRecord; catalogNo: string }[] = [];
    for (let i = total - 1; i >= 0; i--) {
      const tk = filtered[i];
      if (tk) {
        items.push({
          slotIndex: i,
          ticket: tk,
          catalogNo: String(total - i).padStart(3, '0'),
        });
      }
    }
    return items;
  }, [filtered, total]);

  const activeTheme = activeTicket
    ? (TICKET_TYPE_THEMES[activeTicket.type] ?? TICKET_TYPE_THEMES.other)
    : TICKET_TYPE_THEMES.concert;
  const activeMonthNum = activeTicket ? Number(activeTicket.eventAt.slice(5, 7)) || 11 : 11;
  const hasActiveFilters = typeFilter !== 'all' || query.trim() !== '';

  return (
    <div
      onWheel={timelineView === 'stack' ? handleWheel : undefined}
      className="flex-1 flex flex-col justify-between px-4 sm:px-8 relative select-none overflow-visible"
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
                resetCursor();
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
                  resetCursor();
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
                resetCursor();
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
                  resetCursor();
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
        /* Concept C 主舞台：上方博朗精密仪表读数条 + 中央有限景深叠卡 + 右侧啮合机械滚轮 */
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          className="flex-1 flex flex-col items-center justify-center pb-6 pt-1 touch-none"
        >
          {/* 顶部博朗仪器式档案读数栏（填补上方视觉留白，并在移动端与桌面端同步提供精准位置、月份与微调拨钮） */}
          {activeTicket && (
            <div className="w-full max-w-[540px] mb-4 sm:mb-5 px-1 flex items-center justify-between gap-2 text-[11px] font-mono text-muted z-30 whitespace-nowrap">
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: activeTheme.rim }}
                />
                <span className="font-semibold text-fg tracking-wider">
                  {String(clampedActiveIndex + 1).padStart(2, '0')} /{' '}
                  {String(total).padStart(2, '0')}
                </span>
                <span className="text-black/20">·</span>
                <span className="font-sans font-medium text-fg/85">
                  {t(`types.${activeTicket.type}`)}
                </span>
              </div>

              {/* 中央可点击机械刻度槽（每张票对应一根精密游标刻度，红针指示当前前排票根） */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/[0.04] shrink-0">
                {filtered.map((tk, idx) => {
                  const isCurrent = idx === clampedActiveIndex;
                  return (
                    <button
                      key={`gauge-${tk.id}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        jumpToIndex(idx);
                      }}
                      aria-label={`${idx + 1}: ${tk.title}`}
                      className="p-0.5 cursor-pointer flex items-center"
                    >
                      <span
                        className={`block rounded-full transition-all duration-200 ${
                          isCurrent
                            ? 'w-4 h-1.5 bg-[#d64c35]'
                            : 'w-1.5 h-1.5 bg-black/22 hover:bg-black/45'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>

              {/* 右侧日期/月份读数与上下微调拨钮（移动端显示月份缩写补齐右侧转轮信息，桌面端显示完整日期） */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="sm:hidden tracking-wider font-semibold text-fg/80 mr-0.5">
                  {MONTH_ABBR[activeMonthNum - 1] ?? 'NOV'}
                </span>
                <span className="hidden sm:inline tracking-tight text-fg/80 mr-1">
                  {activeTicket.eventAt.slice(0, 10).replace(/-/g, '.')}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    stepBy(-1);
                  }}
                  aria-label={t('home.prevStub')}
                  className="w-6 h-6 rounded-full bg-black/[0.045] hover:bg-black/[0.10] text-fg flex items-center justify-center text-[11px] transition-colors cursor-pointer"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    stepBy(1);
                  }}
                  aria-label={t('home.nextStub')}
                  className="w-6 h-6 rounded-full bg-black/[0.045] hover:bg-black/[0.10] text-fg flex items-center justify-center text-[11px] transition-colors cursor-pointer"
                >
                  ↓
                </button>
              </div>
            </div>
          )}

          <div className="relative z-30 flex items-center justify-center w-full max-w-[940px]">
            {/* 中央纵向景深卡槽（纯 GPU 合成层：零 filter 重绘，丝滑满帧 60fps） */}
            <div className="relative w-full max-w-[540px] h-[340px] sm:h-[372px] flex items-end justify-center pb-1">
              {stackItems.map(({ slotIndex, ticket, catalogNo }) => {
                const initialRelDepth = slotIndex - posRef.current;
                const initialPose = computeCardStagePose(initialRelDepth);
                const initialZ = Math.round((20 - initialRelDepth) * 10);
                const isInitialFront = slotIndex === clampedActiveIndex;

                return (
                  // biome-ignore lint/a11y/noStaticElementInteractions: 全局方向键与顶部仪表按钮已支持无障碍翻页与跳转
                  // biome-ignore lint/a11y/useKeyWithClickEvents: 全局键盘方向键已监听翻票
                  <div
                    key={ticket.id}
                    ref={(el) => {
                      if (el) {
                        cardElsRef.current.set(slotIndex, el);
                      } else {
                        cardElsRef.current.delete(slotIndex);
                      }
                    }}
                    data-card-id={ticket.id}
                    data-ticket-id={isInitialFront ? ticket.id : undefined}
                    data-slot-depth={Math.round(initialRelDepth)}
                    style={{
                      zIndex: initialZ,
                      transformOrigin: '50% 0%',
                      transform: `translate3d(0px, ${initialPose.yPx.toFixed(2)}px, 0px) scale(${initialPose.scale.toFixed(4)})`,
                      opacity: Number(initialPose.opacity.toFixed(4)),
                      willChange: 'transform, opacity',
                    }}
                    onClick={() => {
                      if (dragStartRef.current?.moved) return;
                      const currentNearest = Math.round(posRef.current);
                      if (slotIndex === currentNearest) {
                        stepBy(1);
                      } else if (slotIndex > currentNearest) {
                        jumpToIndex(slotIndex);
                      }
                    }}
                    className="absolute bottom-1 w-full cursor-pointer"
                  >
                    {/* 静态 GPU 九宫格阴影底衬（替代高开销的 SVG drop-shadow 滤镜，满帧 0ms 合成） */}
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-[5px] top-[5px] bottom-[3px] rounded-[5px] pointer-events-none"
                      style={{
                        boxShadow:
                          '0 20px 30px -6px rgba(18, 17, 15, 0.16), 0 4px 10px -2px rgba(18, 17, 15, 0.08), 0 -2px 6px rgba(18, 17, 15, 0.08)',
                      }}
                    />

                    <DieCutTicketCard
                      ticket={ticket}
                      catalogNo={catalogNo}
                      language={i18n.language}
                      typeLabel={t(`types.${ticket.type}`)}
                    />

                    {/* 票面右下角显式「3D 检视 ↗」印章热区：点击直达 3D 实体检视舞台 */}
                    <Link
                      to="/t/$id"
                      params={{ id: ticket.id }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`${t('home.openStub')} ${ticket.title}`}
                      title={t('home.openStub')}
                      className="absolute right-[24.5%] bottom-[8.5%] w-[19.5%] h-[13.5%] rounded-full hover:bg-black/[0.04] transition-colors"
                    />
                  </div>
                );
              })}
            </div>

            {/* 右侧：博朗机械滚花转轮 + 蚀刻毫米尺 + 连续月份转鼓 + 朱红指针线 */}
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              className="hidden sm:flex items-center ml-12 lg:ml-16 relative py-2 cursor-ns-resize select-none"
              title="Scroll or drag thumbwheel to flip tickets"
            >
              <svg
                width="62"
                height="276"
                viewBox="0 0 62 276"
                className="block overflow-visible"
                aria-hidden="true"
              >
                <defs>
                  {/* 上下两端平滑渐隐遮罩：让毫米刻度尺与月份转鼓在滚动时仅需单次修改 <g> transform */}
                  <linearGradient id="rolodex-dial-fade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="white" stopOpacity="0" />
                    <stop offset="14%" stopColor="white" stopOpacity="1" />
                    <stop offset="86%" stopColor="white" stopOpacity="1" />
                    <stop offset="100%" stopColor="white" stopOpacity="0" />
                  </linearGradient>
                  <mask id="rolodex-dial-mask">
                    <rect x="0" y="6" width="62" height="264" fill="url(#rolodex-dial-fade)" />
                  </mask>
                </defs>

                <g mask="url(#rolodex-dial-mask)">
                  {/* 72 条静态水平毫米刻度线（通过父级 <g> transform 实现 60fps 零开销滚动） */}
                  <g ref={rulerTicksGroupRef} transform="translate(0, 0)">
                    {Array.from({ length: 72 }).map((_, idx) => {
                      const y = -10 + idx * 4;
                      const isMajor = idx % 4 === 0;
                      return (
                        <line
                          key={`ruler-tick-${y}`}
                          x1={isMajor ? 11 : 16}
                          y1={y}
                          x2={22}
                          y2={y}
                          stroke="#191918"
                          strokeWidth={isMajor ? '1.1' : '0.85'}
                          strokeOpacity={isMajor ? 0.38 : 0.22}
                        />
                      );
                    })}
                  </g>

                  {/* 标准 12 月份连续日历转鼓（DEC · NOV · OCT · SEP · AUG...，当前票所属月份精准对准 y=138 朱红指针线，绝不重复显示同名月份） */}
                  <g ref={monthDrumGroupRef} transform="translate(0, 82)">
                    {Array.from({ length: 12 }).map((_, stepIdx) => {
                      const monthNum = 12 - stepIdx;
                      const mLabel = MONTH_ABBR[monthNum - 1] ?? 'NOV';
                      const yPos = stepIdx * 56;
                      const isCurrentMonth = monthNum === activeMonthNum;
                      return (
                        // biome-ignore lint/a11y/noStaticElementInteractions: 刻度盘鼠标辅助点击跳转
                        <g
                          key={`drum-month-${mLabel}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const matchIdx = filtered.findIndex(
                              (tk) => (Number(tk.eventAt.slice(5, 7)) || 11) <= monthNum,
                            );
                            jumpToIndex(matchIdx >= 0 ? matchIdx : filtered.length - 1);
                          }}
                          className="cursor-pointer"
                        >
                          <text
                            x="38"
                            y={yPos}
                            transform={`rotate(-90 38 ${yPos})`}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="#191918"
                            fillOpacity={isCurrentMonth ? 0.94 : 0.4}
                            fontSize="14.5"
                            fontWeight={isCurrentMonth ? 700 : 600}
                            letterSpacing="0.08em"
                            fontFamily="Inter Variable, sans-serif"
                          >
                            {mLabel}
                          </text>
                          {stepIdx < 11 && (
                            <circle
                              cx="38"
                              cy={yPos + 28}
                              r="1.35"
                              fill="#191918"
                              fillOpacity="0.32"
                            />
                          )}
                        </g>
                      );
                    })}
                  </g>
                </g>

                {/* 贯穿刻度尺与中心点的朱红机械指针线（精准指向金属滚轮正中央 y=138） */}
                <line x1="0" y1="138" x2="62" y2="138" stroke="#d64c35" strokeWidth="1.5" />
              </svg>

              {/* 机械滚轮凹槽与金属滚花转轮 */}
              <div className="w-[13px] h-[168px] rounded-full wheel-trough flex items-center justify-center relative -ml-[1px]">
                <div
                  ref={knurledWheelRef}
                  style={{ backgroundPositionY: '0px, 0px' }}
                  className="w-[10.5px] h-[94px] rounded-[4px] knurled-wheel"
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
