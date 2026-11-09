import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type TicketRecord } from '../../data';
import { Container } from '../../ui';

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

function projectLngLat(
  lng: number,
  lat: number,
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number },
): { x: number; y: number } {
  const padX = 22;
  const padY = 14;
  const width = 160;
  const height = 72;
  const spanLng = Math.max(8, bounds.maxLng - bounds.minLng);
  const spanLat = Math.max(6, bounds.maxLat - bounds.minLat);
  const x = padX + ((lng - bounds.minLng) / spanLng) * (width - padX * 2);
  const y = height - padY - ((lat - bounds.minLat) / spanLat) * (height - padY * 2);
  return {
    x: Math.max(14, Math.min(width - 26, x)),
    y: Math.max(12, Math.min(height - 12, y)),
  };
}

function formatCoord(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns} · ${Math.abs(lng).toFixed(2)}°${ew}`;
}

const GRID_X = [24, 52, 80, 108, 136] as const;
const GRID_Y = [14, 28, 42, 56] as const;

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
    <Container className="py-6 sm:py-8 space-y-6">
      {/* 顶部标题区 */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-fg">
            {t('atlas.eyebrow')}
          </h1>
          <span className="text-[13.5px] text-muted">{t('atlas.lead')}</span>
        </div>

        <span className="rounded-full bg-bg-subtle px-3 py-1 text-[12px] font-medium text-fg">
          {t('atlas.places', { count: clusters.length })}
        </span>
      </header>

      {/* 测绘坐标卡片 */}
      <div className="rounded-[20px] bg-bg-raised border border-line p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 mb-3 border-b border-line text-[11px] font-mono text-muted">
          <span>
            {t('atlas.lat')} {bounds.minLat.toFixed(1)}° — {bounds.maxLat.toFixed(1)}°N
          </span>
          <span>
            {t('atlas.lng')} {bounds.minLng.toFixed(1)}° — {bounds.maxLng.toFixed(1)}°E
          </span>
        </div>

        <svg
          viewBox="0 0 160 72"
          className="w-full h-[220px] sm:h-[320px] lg:h-[360px] select-none block"
        >
          <title>{t('atlas.title')}</title>

          {GRID_X.map((x) => (
            <line
              key={`vx-${x}`}
              x1={x}
              y1={6}
              x2={x}
              y2={66}
              stroke="rgba(0,0,0,0.06)"
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
              stroke="rgba(0,0,0,0.06)"
              strokeWidth="0.2"
              strokeDasharray="0.9,1.2"
            />
          ))}

          {GRID_X.map((x) =>
            GRID_Y.map((y) => (
              <g key={`cross-${x}-${y}`} stroke="rgba(0,0,0,0.18)" strokeWidth="0.2">
                <line x1={x - 0.8} y1={y} x2={x + 0.8} y2={y} />
                <line x1={x} y1={y - 0.8} x2={x} y2={y + 0.8} />
              </g>
            )),
          )}

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
                  stroke="rgba(11,11,11,0.45)"
                  strokeWidth="0.35"
                  strokeDasharray="1.3,1"
                />
              );
            })}

          {mapNodes.map((node, idx) => {
            const active = selectedKey !== null && node.clusterKeys.includes(selectedKey);
            return (
              <g key={node.id}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={active ? 4.8 : 3.4}
                  fill="rgba(224,64,42,0.1)"
                  stroke="#e0402a"
                  strokeWidth="0.28"
                />
                <circle cx={node.x} cy={node.y} r={active ? 1.5 : 1.2} fill="#e0402a" />
                <text
                  x={node.x + 4.8}
                  y={node.y - 0.4}
                  fill="#0b0b0b"
                  fontSize="2.4"
                  fontFamily="Inter Variable, sans-serif"
                  fontWeight="600"
                >
                  {String(idx + 1).padStart(2, '0')} · {node.label} ({node.ticketCount})
                </text>
                <text
                  x={node.x + 4.8}
                  y={node.y + 2.2}
                  fill="#6e6e73"
                  fontSize="1.8"
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

      {/* 地点 Bento 卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clusters.map((cluster) => {
          const isSelected = selectedKey === cluster.key;
          return (
            <div
              key={cluster.key}
              className={`rounded-[20px] bg-bg-raised border p-5 flex flex-col justify-between gap-4 transition-all ${
                isSelected ? 'border-fg shadow-sm' : 'border-line hover:border-line-strong'
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedKey(isSelected ? null : cluster.key)}
                className="text-left block w-full cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[16px] font-semibold tracking-[-0.015em] text-fg">
                    {cluster.name}
                  </h3>
                  <span className="rounded-full bg-bg-subtle px-2.5 py-0.5 text-[11px] font-medium text-muted shrink-0">
                    {t('atlas.stubsAt', { count: cluster.tickets.length })}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                  {cluster.city && <span>{cluster.city}</span>}
                  {cluster.lat !== undefined && cluster.lng !== undefined && (
                    <span className="font-mono text-[11px] text-faint">
                      {formatCoord(cluster.lat, cluster.lng)}
                    </span>
                  )}
                </div>
              </button>

              <ul className="divide-y divide-line border-t border-line pt-1">
                {cluster.tickets.map((tk) => (
                  <li key={tk.id}>
                    <Link
                      to="/t/$id"
                      params={{ id: tk.id }}
                      className="py-2 flex items-center justify-between gap-3 text-[13px] text-fg hover:text-accent transition-colors"
                    >
                      <span className="truncate font-medium">{tk.title}</span>
                      <span className="font-mono text-[11px] text-muted shrink-0">
                        {tk.eventAt.slice(0, 10).replace(/-/g, '.')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Container>
  );
};
