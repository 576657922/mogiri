import { renderThumbnailDataUrl } from '@mogiri/renderer';
import { TICKET_TYPES, type TicketType } from '@mogiri/shared';
import { Link } from '@tanstack/react-router';
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
function buildTicketClipPath(hideLeftNotchForBack = false): string {
  const W = 540;
  const H = 268;
  const stubX = 412;
  const stubR = 7.5;
  const leftNotchY = H / 2;
  const leftNotchR = hideLeftNotchForBack ? 26 : 12;

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

const TICKET_CLIP_PATH = buildTicketClipPath(false);
const TICKET_BACK_CLIP_PATH = buildTicketClipPath(true);

/**
 * 线性插值两个十六进制颜色（#rrggbb）
 */
function lerpHexColor(hexA: string, hexB: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const a = Number.parseInt(hexA.slice(1), 16);
  const b = Number.parseInt(hexB.slice(1), 16);
  const rA = (a >> 16) & 255;
  const gA = (a >> 8) & 255;
  const bA = a & 255;
  const rB = (b >> 16) & 255;
  const gB = (b >> 8) & 255;
  const bB = b & 255;
  const r = Math.round(rA + (rB - rA) * clamped);
  const g = Math.round(gA + (gB - gA) * clamped);
  const bl = Math.round(bA + (bB - bA) * clamped);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

/**
 * 根据卡片固定槽位 slotKey 与连续景深 relDepth 计算当前卡纸的边框色、内衬色、油墨色与色框厚度：
 * - 每张卡片在后方叠卡区（relDepth >= 0.45）始终保有自身专属的博朗工业原色，向前递进时色彩随实体卡片一同前移，绝不发生互补色混浊
 * - 当卡片贴近前排落位区（0 < relDepth < 0.45）时，其彩色模切包边与中性象牙白（#f1f1ec）平滑融合，落位（relDepth <= 0）即成为无框纯象牙白活版主卡
 */
function computeContinuousTheme(
  slotKey: number,
  relDepth: number,
): {
  rim: string;
  body: string;
  ink: string;
  rimInsetX: number;
  rimInsetY: number;
  headerY: number;
  priceY: number;
  lowerSheetOpacity: number;
} {
  const frontTheme = STACK_DEPTH_THEMES[0];
  if (relDepth <= 0.001) {
    return {
      rim: frontTheme.rim,
      body: frontTheme.body,
      ink: frontTheme.ink,
      rimInsetX: 0,
      rimInsetY: 0,
      headerY: 38,
      priceY: 35,
      lowerSheetOpacity: 0,
    };
  }

  // 后方 6 种博朗工业色循环分配给每个固定卡槽（slotKey = 1..6 对应 STACK_DEPTH_THEMES[1..6]）
  const backPaletteCount = STACK_DEPTH_THEMES.length - 1;
  const paletteIdx =
    ((((slotKey - 1) % backPaletteCount) + backPaletteCount) % backPaletteCount) + 1;
  const cardTheme = STACK_DEPTH_THEMES[paletteIdx] ?? STACK_DEPTH_THEMES[1];

  if (relDepth < 1) {
    // 1.0 -> 0.38 保持自身鲜明工业色顶栏；0.38 -> 0.0 与纯象牙白平滑过渡至无框主卡
    const colorT = Math.max(0, Math.min(1, relDepth / 0.38));
    const smoothColorT = colorT * colorT * (3 - 2 * colorT);
    const geomT = Math.max(0, Math.min(1, relDepth));
    return {
      rim: lerpHexColor(frontTheme.rim, cardTheme.rim, smoothColorT),
      body: lerpHexColor(frontTheme.body, cardTheme.body, smoothColorT),
      ink: lerpHexColor(frontTheme.ink, cardTheme.ink, smoothColorT),
      rimInsetX: 6.5 * smoothColorT,
      rimInsetY: 5.5 * smoothColorT,
      headerY: 38 - 6.5 * geomT,
      priceY: 35 - 4.5 * geomT,
      lowerSheetOpacity: smoothColorT,
    };
  }

  const lowerSheetOpacity =
    relDepth <= 1.15 ? 1 : Math.max(0, Math.min(1, 1 - (relDepth - 1.15) / 0.55));

  return {
    rim: cardTheme.rim,
    body: cardTheme.body,
    ink: cardTheme.ink,
    rimInsetX: 6.5,
    rimInsetY: 5.5,
    headerY: 31.5,
    priceY: 30.5,
    lowerSheetOpacity,
  };
}

/**
 * 计算任意连续景深 relDepth (-1..6) 的三维光学投影姿态：
 * - relDepth >= 0：沿透视递减阶梯排布
 * - relDepth < 0：前排票根保持 100% 实体不透明卡纸质感沿垂直中轴滑落，清晰显露后卡标题，仅在末段净空区柔和消隐
 */
function computeCardStagePose(relDepth: number): {
  yPx: number;
  scale: number;
  opacity: number;
  blurPx: number;
} {
  if (relDepth < 0) {
    const p = Math.max(0, Math.min(1, -relDepth));
    // 对称垂直滑落轨迹：p=0.43 时下滑约 84px，恰好完整露出后方下一张票根的顶栏与主标题
    const yPx = (1 - (1 - p) ** 1.85) * 142;
    // 抽离瞬间微幅浮起（+1.6%），呈现厚卡纸脱离卡槽的实体层次感
    const scale = 1 + Math.sin(p * Math.PI) * 0.016 - p * 0.01;
    // 前 62% 行程保持 100% 不透明实体卡纸（绝不产生半透明叠字重影），末段 38% 平滑消融
    const opacity = p <= 0.62 ? 1 : 0.5 * (1 + Math.cos(Math.PI * Math.min(1, (p - 0.62) / 0.38)));
    const blurPx = p <= 0.68 ? 0 : ((p - 0.68) / 0.32) ** 1.3 * 3.2;
    return { yPx, scale, opacity, blurPx };
  }

  const effectiveDepth = Math.max(0, relDepth);
  const scale = 1 - effectiveDepth * 0.042;
  const whole = Math.floor(effectiveDepth);
  const frac = effectiveDepth - whole;
  let stepSumPx = 0;
  for (let k = 1; k <= whole; k++) {
    stepSumPx += 23.2 * (1 - k * 0.042);
  }
  if (frac > 0) {
    stepSumPx += frac * 23.2 * (1 - (whole + 1) * 0.042);
  }
  const farFade = effectiveDepth > 6 ? Math.max(0, 1 - (effectiveDepth - 6)) : 1;
  return { yPx: -stepSumPx, scale, opacity: farFade, blurPx: 0 };
}

/**
 * 模切活版印刷实体票根组件（Concept C 核心视觉载体）
 * 由连续景深 relDepth 实时驱动色彩蜕变与版面显露
 */
function DieCutTicketCard({
  ticket,
  relDepth,
  slotKey,
  catalogNo,
  language,
  typeLabel,
}: {
  ticket: TicketRecord;
  relDepth: number;
  slotKey: number;
  catalogNo: string;
  language: string;
  typeLabel: string;
}) {
  const theme = computeContinuousTheme(slotKey, relDepth);
  const barcode = useMemo(() => buildBarcodeSpec(ticket.id), [ticket.id]);

  const priceDisplay =
    ticket.priceAmount !== undefined
      ? ticket.priceCurrency === 'USD'
        ? `$${ticket.priceAmount.toLocaleString()}`
        : ticket.priceCurrency === 'CNY'
          ? `¥${ticket.priceAmount.toLocaleString()}`
          : `¥${ticket.priceAmount.toLocaleString()}`
      : 'ADMIT ONE';

  const uid = `tk-slot-${slotKey}`;
  const isFrontShape = relDepth < 0.45;
  const showFullTypography = relDepth < 1.85;
  const typographyOpacity =
    relDepth <= 1.0 ? 1 : Math.max(0, Math.min(1, 1 - (relDepth - 1.0) / 0.75));
  const lowerSheetOpacity = theme.lowerSheetOpacity;

  return (
    <svg
      viewBox="0 0 540 268"
      className="w-full h-auto block select-none overflow-visible"
      aria-label={isFrontShape ? ticket.title : undefined}
    >
      <title>{ticket.title}</title>
      <defs>
        <clipPath id={uid}>
          <path d={isFrontShape ? TICKET_CLIP_PATH : TICKET_BACK_CLIP_PATH} />
        </clipPath>
      </defs>

      <g clipPath={`url(#${uid})`}>
        {/* 外层工业色框（随 relDepth 连续插值，抵达前排时平滑融化为象牙白） */}
        <rect x="0" y="0" width="540" height="268" fill={theme.rim} />

        {/* 内层卡纸 */}
        <rect
          x={theme.rimInsetX}
          y={theme.rimInsetY}
          width={540 - theme.rimInsetX * 2}
          height={268 - theme.rimInsetY * 2}
          rx="1.5"
          fill={theme.body}
        />

        {/* 紧邻主卡的后方叠卡下半部铺设象牙白活版纸面，当前卡滑落时直接显露下方完整票面 */}
        {lowerSheetOpacity > 0.01 && (
          <rect
            x={theme.rimInsetX}
            y="46"
            width={540 - theme.rimInsetX * 2}
            height={268 - 46 - theme.rimInsetY}
            rx="1"
            fill="#f1f1ec"
            opacity={lowerSheetOpacity}
          />
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
          stroke={isFrontShape ? 'rgba(20,20,19,0.42)' : 'rgba(20,20,19,0.32)'}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray="1.5 6.5"
        />

        {/* 票头左侧品牌名与右侧票价（后方叠卡在顶部露出一半文字，推进至前排时平滑落位） */}
        <text
          x="30"
          y={theme.headerY}
          fill={theme.ink}
          fontSize="21"
          fontWeight="700"
          letterSpacing="-0.03em"
          fontFamily="Inter Variable, PingFang SC, Hiragino Sans, sans-serif"
        >
          Hanken 半券
        </text>

        <text
          x="388"
          y={theme.priceY}
          textAnchor="end"
          fill={theme.ink}
          fontSize="12.5"
          fontWeight="500"
          fontFamily="JetBrains Mono Variable, monospace"
          opacity="0.88"
        >
          {priceDisplay}
        </text>

        {/* 完整活版印刷票面 */}
        {showFullTypography && (
          <g opacity={typographyOpacity}>
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
              {ticket.subtitle || ticket.venueName || 'Archival Specimen'}
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
          </g>
        )}
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
  const timelineView = useUiStore((s) => s.timelineView);
  const setTimelineView = useUiStore((s) => s.setTimelineView);

  const [typeFilter, setTypeFilter] = useState<TicketType | 'all'>('all');
  const [query, setQuery] = useState('');
  // 连续浮点物理游标 animatedCursor：由临界阻尼弹簧引擎（或拖拽手势）驱动，联动 7 层叠卡、毫米刻度尺与金属滚花转轮
  const [animatedCursor, setAnimatedCursor] = useState(0);
  const [showFilterBar, setShowFilterBar] = useState(false);

  const posRef = useRef(0);
  const velRef = useRef(0);
  const targetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  const dragStartRef = useRef<{
    y: number;
    t: number;
    startCursor: number;
    lastY: number;
    lastT: number;
    velPxPerMs: number;
    moved: boolean;
  } | null>(null);
  const wheelLockRef = useRef<number>(0);

  const startSpringLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    lastFrameTimeRef.current = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.032, Math.max(0.004, (now - lastFrameTimeRef.current) / 1000));
      lastFrameTimeRef.current = now;

      // 临界阻尼弹簧参数（stiffness=152, damping=24.2，无多余震荡回弹，如徕卡对焦环般顺滑落位）
      const stiffness = 152;
      const damping = 24.2;
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
        setAnimatedCursor(posRef.current);
        rafRef.current = null;
        return;
      }

      setAnimatedCursor(posRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
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
    setAnimatedCursor(0);
  }, []);

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
  const nearestCursor = Math.round(animatedCursor);
  const safeIndex = total === 0 ? 0 : ((nearestCursor % total) + total) % total;
  const activeTicket = filtered[safeIndex] ?? null;

  const stepBy = useCallback(
    (delta: number) => {
      if (total <= 1 || delta === 0) return;
      targetRef.current = Math.round(targetRef.current) + delta;
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

  // 鼠标滚轮 / 触控板顺滑翻动卡槽
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (total <= 1) return;
    const now = performance.now();
    if (now - wheelLockRef.current < 210) return;
    const primary = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(primary) < 10) return;
    wheelLockRef.current = now;
    stepBy(primary > 0 ? 1 : -1);
  };

  // 上下拖拽手势（1:1 实时跟手驱动 animatedCursor，松手后将动量无缝移交弹簧引擎归位）
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
      startCursor: posRef.current,
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

    // 向下拖动 150px 对应完整抽离 1 张票根
    const nextPos = start.startCursor + dy / 150;
    posRef.current = nextPos;
    targetRef.current = nextPos;
    velRef.current = 0;
    setAnimatedCursor(nextPos);
  };

  const handlePointerEnd = () => {
    const start = dragStartRef.current;
    if (!start) return;
    dragStartRef.current = null;

    if (!start.moved) {
      targetRef.current = Math.round(posRef.current);
      startSpringLoop();
      return;
    }

    const cursorVel = (start.velPxPerMs * 1000) / 150;
    velRef.current = cursorVel;
    const projected = posRef.current + cursorVel * 0.14;
    const baseRound = Math.round(start.startCursor);
    const diff = projected - baseRound;

    if (diff > 0.22) {
      targetRef.current = baseRound + Math.max(1, Math.round(diff));
    } else if (diff < -0.22) {
      targetRef.current = baseRound + Math.min(-1, Math.round(diff));
    } else {
      targetRef.current = baseRound;
    }
    startSpringLoop();
  };

  // 生成围绕当前浮点游标 animatedCursor 的连续虚拟槽位序列（relDepth 覆盖 -1..6）
  const baseFloor = Math.floor(animatedCursor);
  const visibleStack = useMemo(() => {
    if (total === 0) return [];
    const layers: {
      slotKey: number;
      ticket: TicketRecord;
      itemIndex: number;
    }[] = [];
    for (let offset = 7; offset >= -1; offset--) {
      const slotKey = baseFloor + offset;
      const idx = ((slotKey % total) + total) % total;
      const tk = filtered[idx];
      if (tk) {
        layers.push({ slotKey, ticket: tk, itemIndex: idx });
      }
    }
    return layers;
  }, [filtered, baseFloor, total]);

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

  // 滚轮与月份刻度盘的连续微位移相位
  const cursorFrac = animatedCursor - nearestCursor;
  const rulerPhasePx = (((animatedCursor * 16) % 16) + 16) % 16;
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
        /* Concept C 主舞台：中央 3D 纵向景深叠卡 + 右侧博朗机械滚轮刻度尺（底部保持纯粹负空间） */
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          className="flex-1 flex flex-col items-center justify-center py-4 touch-none"
        >
          <div className="relative z-30 flex items-center justify-center w-full max-w-[940px]">
            {/* 中央纵向景深卡槽（由连续浮点游标 animatedCursor 直接同步驱动每一层的位移、缩放、色彩蜕变与景深柔焦） */}
            <div className="relative w-full max-w-[540px] h-[350px] sm:h-[420px] flex items-end justify-center pb-2">
              {visibleStack.map(({ slotKey, ticket, itemIndex }) => {
                const relDepth = slotKey - animatedCursor;
                if (relDepth <= -0.995 || relDepth >= 6.95) return null;

                const isFrontActive = Math.abs(relDepth) < 0.45;
                const isPeeling = relDepth < -0.005;
                const catalogNo = String(total - itemIndex).padStart(3, '0');
                const { yPx, scale, opacity, blurPx } = computeCardStagePose(relDepth);
                const zOrder = Math.round((7 - relDepth) * 10);

                return (
                  // biome-ignore lint/a11y/noStaticElementInteractions: 全局键盘上下/左右方向键已绑定翻票，此处为卡片表面点击与拖拽手势容器
                  // biome-ignore lint/a11y/useKeyWithClickEvents: 全局键盘上下/左右方向键已绑定翻票
                  <div
                    key={`slot-${slotKey}`}
                    data-ticket-id={isFrontActive ? ticket.id : undefined}
                    data-slot-depth={Math.round(relDepth)}
                    style={{
                      zIndex: zOrder,
                      transformOrigin: '50% 0%',
                      transform: `translate3d(0px, ${yPx.toFixed(2)}px, 0px) scale(${scale.toFixed(4)})`,
                      opacity: Number(opacity.toFixed(4)),
                      filter: isPeeling
                        ? `drop-shadow(0 -3px 7px rgba(18, 17, 15, 0.11)) drop-shadow(0 24px 30px rgba(18, 17, 15, 0.16))${
                            blurPx > 0.08 ? ` blur(${blurPx.toFixed(2)}px)` : ''
                          }`
                        : undefined,
                      pointerEvents: isPeeling ? 'none' : 'auto',
                      willChange: 'transform, opacity, filter',
                    }}
                    onClick={() => {
                      if (dragStartRef.current?.moved || isPeeling) return;
                      const roundedDepth = Math.round(relDepth);
                      stepBy(roundedDepth <= 0 ? 1 : roundedDepth);
                    }}
                    className={`absolute bottom-2 w-full cursor-pointer ${
                      isPeeling
                        ? ''
                        : relDepth <= 0.35
                          ? 'rolodex-shadow'
                          : 'drop-shadow-[0_-2px_5px_rgba(0,0,0,0.10)] hover:brightness-[1.015]'
                    }`}
                  >
                    <DieCutTicketCard
                      ticket={ticket}
                      relDepth={relDepth}
                      slotKey={slotKey}
                      catalogNo={catalogNo}
                      language={i18n.language}
                      typeLabel={t(`types.${ticket.type}`)}
                    />

                    {/* 前排主卡右下角档案号检视入口：点击进入 3D 实体检视舞台，不遮挡整卡翻页手势 */}
                    {isFrontActive && (
                      <Link
                        to="/t/$id"
                        params={{ id: ticket.id }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`${t('home.openStub')} ${ticket.title}`}
                        title={t('home.openStub')}
                        className="absolute right-[26%] bottom-[5%] w-[19%] h-[14%] rounded-md hover:bg-black/[0.04] transition-colors"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* 右侧：博朗机械滚花转轮 + 蚀刻毫米尺 + 纵向月份刻度 + 朱红指针线（与 animatedCursor 1:1 机械啮合） */}
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
                {/* 65 条精密水平毫米刻度线（随滚轮连续传动，上下两端光学渐隐） */}
                {Array.from({ length: 65 }).map((_, idx) => {
                  const baseTickY = 10 + idx * 4;
                  const shiftedY = 10 + ((((baseTickY - 10 + rulerPhasePx) % 256) + 256) % 256);
                  const isMajor = idx % 4 === 0;
                  const distFromEdge = Math.min(shiftedY - 10, 266 - shiftedY);
                  const edgeFade = Math.max(0, Math.min(1, distFromEdge / 28));
                  return (
                    <line
                      key={`ruler-tick-${baseTickY}`}
                      x1={isMajor ? 11 : 16}
                      y1={shiftedY}
                      x2={22}
                      y2={shiftedY}
                      stroke="#191918"
                      strokeWidth={isMajor ? '1.1' : '0.85'}
                      strokeOpacity={(isMajor ? 0.38 : 0.22) * edgeFade}
                    />
                  );
                })}

                {/* 纵向旋转月份标签（AUG · SEP · OCT · NOV，随弹簧相位连续滚动） */}
                <g transform={`translate(0, ${(-cursorFrac * 38).toFixed(2)})`}>
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
                </g>

                {/* 贯穿刻度尺与中心点的朱红机械指针线（精准指向金属滚轮正中央 y=138） */}
                <line x1="0" y1="138" x2="62" y2="138" stroke="#d64c35" strokeWidth="1.5" />
              </svg>

              {/* 机械滚轮凹槽与金属滚花转轮（与 y=138 垂直居中对齐，60fps 实时啮合滚动） */}
              <div className="w-[13px] h-[168px] rounded-full wheel-trough flex items-center justify-center relative -ml-[1px]">
                <div
                  style={{
                    backgroundPositionY: `${(animatedCursor * 28).toFixed(2)}px, 0px`,
                  }}
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
