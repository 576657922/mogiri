import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type TicketRecord } from '../../data';
import { Container, Label, MaskLine, Reveal, SectionHead, ticketTypeCode } from '../../ui';

type PlaceCluster = {
  key: string;
  name: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  tickets: TicketRecord[];
};

type GeoCluster = PlaceCluster & {
  lat: number;
  lng: number;
};

type MapNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  lat: number;
  lng: number;
  ticketCount: number;
  clusterKeys: string[];
};

/**
 * 把经纬度映射到 SVG 视口（160 × 76 画幅，自适应边界留白）。
 */
function projectLngLat(
  lng: number,
  lat: number,
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number },
): { x: number; y: number } {
  const padX = 20;
  const padY = 14;
  const width = 160;
  const height = 76;
  const spanLng = Math.max(8, bounds.maxLng - bounds.minLng);
  const spanLat = Math.max(6, bounds.maxLat - bounds.minLat);
  const x = padX + ((lng - bounds.minLng) / spanLng) * (width - padX * 2);
  const y = height - padY - ((lat - bounds.minLat) / spanLat) * (height - padY * 2);
  return {
    x: Math.max(14, Math.min(width - 24, x)),
    y: Math.max(12, Math.min(height - 12, y)),
  };
}

function formatCoord(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns} · ${Math.abs(lng).toFixed(2)}°${ew}`;
}

const GRID_X = [24, 52, 80, 108, 136] as const;
const GRID_Y = [16, 30, 44, 58] as const;

export const FootprintMapView: React.FC = () => {
  const { t } = useTranslation();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const tickets = useLiveQuery(
    async () => await db.tickets.where('status').equals('active').toArray(),
    [],
    [],
  );

  const clusters = useMemo<PlaceCluster[]>(() => {
    const map = new Map<string, PlaceCluster>();
    const sorted = [...tickets].sort((a, b) => a.eventAt.localeCompare(b.eventAt));
    for (const tk of sorted) {
      const label = tk.venueName || tk.city;
      if (!label) continue;
      const key = `${label}::${tk.city ?? ''}`;
      const existing = map.get(key);
      if (existing) {
        existing.tickets.push(tk);
        if (existing.lat === undefined && tk.lat !== undefined) existing.lat = tk.lat;
        if (existing.lng === undefined && tk.lng !== undefined) existing.lng = tk.lng;
      } else {
        map.set(key, {
          key,
          name: label,
          ...(tk.city ? { city: tk.city } : {}),
          ...(tk.country ? { country: tk.country } : {}),
          ...(tk.lat !== undefined ? { lat: tk.lat } : {}),
          ...(tk.lng !== undefined ? { lng: tk.lng } : {}),
          tickets: [tk],
        });
      }
    }
    return Array.from(map.values());
  }, [tickets]);

  const geoClusters = useMemo<GeoCluster[]>(
    () =>
      clusters.filter(
        (c): c is GeoCluster => typeof c.lat === 'number' && typeof c.lng === 'number',
      ),
    [clusters],
  );

  const bounds = useMemo(() => {
    if (geoClusters.length === 0) {
      return { minLng: 120, maxLng: 145, minLat: 28, maxLat: 45 };
    }
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const c of geoClusters) {
      minLng = Math.min(minLng, c.lng);
      maxLng = Math.max(maxLng, c.lng);
      minLat = Math.min(minLat, c.lat);
      maxLat = Math.max(maxLat, c.lat);
    }
    return {
      minLng: minLng - 3.5,
      maxLng: maxLng + 3.5,
      minLat: minLat - 2.5,
      maxLat: maxLat + 2.5,
    };
  }, [geoClusters]);

  /**
   * 合并视口距离过近的同城坐标点，避免地图文字重叠，同时保留完整时间轨迹。
   */
  const mapNodes = useMemo<MapNode[]>(() => {
    const nodes: MapNode[] = [];
    for (const c of geoClusters) {
      const pt = projectLngLat(c.lng, c.lat, bounds);
      const near = nodes.find((n) => Math.hypot(n.x - pt.x, n.y - pt.y) < 9);
      if (near) {
        near.ticketCount += c.tickets.length;
        near.clusterKeys.push(c.key);
      } else {
        nodes.push({
          id: c.key,
          label: c.city || c.name,
          x: pt.x,
          y: pt.y,
          lat: c.lat,
          lng: c.lng,
          ticketCount: c.tickets.length,
          clusterKeys: [c.key],
        });
      }
    }
    return nodes;
  }, [geoClusters, bounds]);

  return (
    <Container className="py-10 sm:py-16 space-y-14">
      {/* 刊头 */}
      <header className="border-b border-line pb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-4 max-w-3xl">
          <Label index="05">{t('atlas.eyebrow')}</Label>
          <h1 className="display text-[36px] sm:text-[54px] lg:text-[64px]">
            <MaskLine>{t('atlas.title')}</MaskLine>
          </h1>
          <p className="text-[15px] text-muted max-w-xl">{t('atlas.lead')}</p>
        </div>

        <div className="label text-fg">{t('atlas.places', { count: clusters.length })}</div>
      </header>

      {/* 经纬测绘地图版面 */}
      <Reveal>
        <div className="cropmarks relative border border-line bg-bg-raised p-4 sm:p-8">
          {/* 四角测绘读数 */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-line text-[11px] font-mono uppercase tracking-[0.14em] text-muted">
            <span>
              {t('atlas.lat')} {bounds.minLat.toFixed(1)}° — {bounds.maxLat.toFixed(1)}°N
            </span>
            <span>
              {t('atlas.lng')} {bounds.minLng.toFixed(1)}° — {bounds.maxLng.toFixed(1)}°E
            </span>
          </div>

          <svg
            viewBox="0 0 160 76"
            className="w-full h-[240px] sm:h-[360px] lg:h-[420px] select-none block"
          >
            <title>{t('atlas.title')}</title>

            {/* 经纬网格虚线 */}
            {GRID_X.map((x) => (
              <line
                key={`vx-${x}`}
                x1={x}
                y1={6}
                x2={x}
                y2={70}
                stroke="rgba(23,21,18,0.09)"
                strokeWidth="0.2"
                strokeDasharray="0.9,1.2"
              />
            ))}
            {GRID_Y.map((y) => (
              <line
                key={`hy-${y}`}
                x1={8}
                y1={y}
                x2={152}
                y2={y}
                stroke="rgba(23,21,18,0.09)"
                strokeWidth="0.2"
                strokeDasharray="0.9,1.2"
              />
            ))}

            {/* 测绘十字准星 */}
            {GRID_X.map((x) =>
              GRID_Y.map((y) => (
                <g key={`cross-${x}-${y}`} stroke="rgba(23,21,18,0.22)" strokeWidth="0.22">
                  <line x1={x - 0.9} y1={y} x2={x + 0.9} y2={y} />
                  <line x1={x} y1={y - 0.9} x2={x} y2={y + 0.9} />
                </g>
              )),
            )}

            {/* 城市间大圆航线弧线 */}
            {mapNodes.length > 1 &&
              mapNodes.slice(0, -1).map((curr, idx) => {
                const next = mapNodes[idx + 1];
                if (!next) return null;
                const midX = (curr.x + next.x) / 2;
                const midY = (curr.y + next.y) / 2 - 6;
                return (
                  <path
                    key={`arc-${curr.id}-${next.id}`}
                    d={`M ${curr.x} ${curr.y} Q ${midX} ${midY} ${next.x} ${next.y}`}
                    fill="none"
                    stroke="rgba(23,21,18,0.55)"
                    strokeWidth="0.38"
                    strokeDasharray="1.4,1"
                  />
                );
              })}

            {/* 聚合后的城市坐标点与朱红印章 */}
            {mapNodes.map((node, idx) => {
              const active = selectedKey !== null && node.clusterKeys.includes(selectedKey);
              return (
                <g key={node.id}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={active ? 5.2 : 3.8}
                    fill="rgba(224,64,42,0.08)"
                    stroke="#e0402a"
                    strokeWidth="0.28"
                    opacity={active ? 0.95 : 0.55}
                  />
                  <circle cx={node.x} cy={node.y} r={active ? 1.6 : 1.25} fill="#e0402a" />
                  <text
                    x={node.x + 5.2}
                    y={node.y - 0.6}
                    fill="#171512"
                    fontSize="2.5"
                    fontFamily="JetBrains Mono Variable, monospace"
                    fontWeight="500"
                  >
                    {String(idx + 1).padStart(2, '0')} · {node.label} ×{node.ticketCount}
                  </text>
                  <text
                    x={node.x + 5.2}
                    y={node.y + 2.2}
                    fill="#6e675d"
                    fontSize="1.85"
                    fontFamily="JetBrains Mono Variable, monospace"
                  >
                    {formatCoord(node.lat, node.lng)}
                  </text>
                </g>
              );
            })}
          </svg>

          {geoClusters.length === 0 && (
            <p className="text-center text-sm text-muted py-6">{t('atlas.noCoords')}</p>
          )}
        </div>
      </Reveal>

      {/* 地点索引目录 */}
      <section className="space-y-6">
        <SectionHead
          index="01"
          title={t('atlas.eyebrow')}
          aside={<span className="label">{t('atlas.places', { count: clusters.length })}</span>}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-t border-l border-line">
          {clusters.map((cluster, idx) => {
            const isSelected = selectedKey === cluster.key;
            return (
              <div
                key={cluster.key}
                className={`border-r border-b border-line p-6 flex flex-col justify-between gap-5 transition-colors ${
                  isSelected ? 'bg-bg-raised' : 'hover:bg-bg-raised/60'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
                      No.{String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="label">
                      {t('atlas.stubsAt', { count: cluster.tickets.length })}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedKey(isSelected ? null : cluster.key)}
                    className="text-left group block w-full"
                  >
                    <h3 className="display text-[24px] group-hover:text-accent transition-colors">
                      {cluster.name}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-muted">
                      {cluster.city && <span>{cluster.city}</span>}
                      {cluster.country && <span className="font-mono">{cluster.country}</span>}
                      {cluster.lat !== undefined && cluster.lng !== undefined && (
                        <span className="font-mono text-[11px] text-faint">
                          {formatCoord(cluster.lat, cluster.lng)}
                        </span>
                      )}
                    </div>
                  </button>
                </div>

                <ul className="divide-y divide-line border-t border-line pt-1">
                  {cluster.tickets.map((tk) => (
                    <li key={tk.id}>
                      <Link
                        to="/t/$id"
                        params={{ id: tk.id }}
                        className="py-2 flex items-baseline justify-between gap-3 text-[13px] text-fg hover:text-accent transition-colors"
                      >
                        <span className="flex items-baseline gap-2 min-w-0">
                          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint shrink-0">
                            {ticketTypeCode(tk.type)}
                          </span>
                          <span className="truncate">{tk.title}</span>
                        </span>
                        <span className="font-mono text-[11px] text-muted shrink-0">
                          {tk.eventAt.slice(0, 10)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </Container>
  );
};
