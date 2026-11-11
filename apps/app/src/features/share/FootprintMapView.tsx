import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type TicketRecord } from '../../data';
import { computeJourneyDistanceKm } from '../../domain';
import { playDetentClick, playPaperFlip } from '../../platform';
import { Container, getTicketTypeTheme, Label, Reveal } from '../../ui';

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
  const padX = 24;
  const padY = 14;
  const width = 160;
  const height = 74;
  const spanLng = Math.max(8, bounds.maxLng - bounds.minLng);
  const spanLat = Math.max(6, bounds.maxLat - bounds.minLat);
  const x = padX + ((lng - bounds.minLng) / spanLng) * (width - padX * 2);
  const y = height - padY - ((lat - bounds.minLat) / spanLat) * (height - padY * 2);
  return {
    x: Math.max(18, Math.min(width - 24, x)),
    y: Math.max(13, Math.min(height - 13, y)),
  };
}

function formatCoord(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns} · ${Math.abs(lng).toFixed(2)}°${ew}`;
}

const GRID_X = [26, 53, 80, 107, 134] as const;
const GRID_Y = [15, 29, 45, 59] as const;
const RADAR_RINGS = [12, 23, 34] as const;

export const FootprintMapView: React.FC = () => {
  const { t } = useTranslation();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const tickets = useLiveQuery(
    async () => await db.tickets.where('status').equals('active').toArray(),
    [],
    [],
  );

  const sortedTickets = useMemo(
    () => [...tickets].sort((a, b) => a.eventAt.localeCompare(b.eventAt)),
    [tickets],
  );

  const totalDistanceKm = useMemo(() => {
    const chronoGeo = sortedTickets
      .filter(
        (tk): tk is TicketRecord & { lat: number; lng: number } =>
          typeof tk.lat === 'number' && typeof tk.lng === 'number',
      )
      .map((tk) => ({ lat: tk.lat, lng: tk.lng }));
    return computeJourneyDistanceKm(chronoGeo);
  }, [sortedTickets]);

  const clusters = useMemo<PlaceCluster[]>(() => {
    const map = new Map<string, PlaceCluster>();
    for (const tk of sortedTickets) {
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
  }, [sortedTickets]);

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
      {/* 顶部大地足迹测绘报头 */}
      <Reveal className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <Label index="ATLAS">{t('atlas.eyebrow')}</Label>
          <h1 className="font-editorial text-[26px] sm:text-[32px] leading-[1.12] tracking-[-0.02em] text-fg">
            {t('atlas.title')}
          </h1>
          <p className="text-[13px] text-muted">{t('atlas.lead')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="archival-card rounded-full px-3.5 py-1.5 font-mono tabular-nums text-[12px] font-medium text-fg">
            {t('atlas.places', { count: clusters.length })}
          </span>
          {totalDistanceKm > 0 && (
            <span className="rounded-full bg-fg text-bg-raised px-3.5 py-1.5 font-mono tabular-nums text-[12px] font-medium shadow-xs">
              {t('atlas.distanceKm', { km: totalDistanceKm.toLocaleString('en-US') })}
            </span>
          )}
        </div>
      </Reveal>

      {/* 大地测绘雷达暗房卡片 */}
      <div className="archival-card rounded-[24px] p-3 sm:p-4">
        <div className="stage-obsidian relative rounded-[18px] p-4 sm:p-6 overflow-hidden text-white">
          {/* 顶部经纬仪遥测栏 */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 mb-2 border-b border-white/10 text-[10.5px] font-mono tabular-nums text-white/60">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span>GEODETIC PLOTTER · WGS84</span>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <span>
                {t('atlas.lat')} {bounds.minLat.toFixed(1)}° — {bounds.maxLat.toFixed(1)}°N
              </span>
              <span>
                {t('atlas.lng')} {bounds.minLng.toFixed(1)}° — {bounds.maxLng.toFixed(1)}°E
              </span>
            </div>
          </div>

          <div className="relative w-full aspect-[160/74]">
            <svg viewBox="0 0 160 74" className="w-full h-full select-none block">
              <title>{t('atlas.title')}</title>

              {/* 同心大地测距环 */}
              {RADAR_RINGS.map((r) => (
                <circle
                  key={`ring-${r}`}
                  cx={80}
                  cy={37}
                  r={r}
                  fill="none"
                  stroke="rgba(255,255,255,0.055)"
                  strokeWidth="0.22"
                  strokeDasharray="1.2,1.2"
                />
              ))}

              {/* 经纬网格线 */}
              {GRID_X.map((x) => (
                <line
                  key={`vx-${x}`}
                  x1={x}
                  y1={5}
                  x2={x}
                  y2={69}
                  stroke="rgba(255,255,255,0.065)"
                  strokeWidth="0.2"
                  strokeDasharray="0.9,1.3"
                />
              ))}
              {GRID_Y.map((y) => (
                <line
                  key={`hy-${y}`}
                  x1={6}
                  y1={y}
                  x2={154}
                  y2={y}
                  stroke="rgba(255,255,255,0.065)"
                  strokeWidth="0.2"
                  strokeDasharray="0.9,1.3"
                />
              ))}

              {/* 十字准星刻度 */}
              {GRID_X.map((x) =>
                GRID_Y.map((y) => (
                  <g key={`cross-${x}-${y}`} stroke="rgba(255,255,255,0.18)" strokeWidth="0.2">
                    <line x1={x - 0.8} y1={y} x2={x + 0.8} y2={y} />
                    <line x1={x} y1={y - 0.8} x2={x} y2={y + 0.8} />
                  </g>
                )),
              )}

              {/* 左上罗盘方向标 */}
              <g transform="translate(13, 12)">
                <circle
                  cx={0}
                  cy={0}
                  r={3.8}
                  fill="rgba(255,255,255,0.03)"
                  stroke="rgba(255,255,255,0.22)"
                  strokeWidth="0.22"
                />
                <polygon points="0,-3.1 0.9,0.8 0,0.2 -0.9,0.8" fill="#e8553a" />
                <text
                  x={0}
                  y={-4.6}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.65)"
                  fontSize="1.9"
                  fontFamily="JetBrains Mono Variable, monospace"
                >
                  N
                </text>
              </g>

              {/* 航迹弧线（底层辉光 + 顶层动态行进虚线） */}
              {mapNodes.length > 1 &&
                mapNodes.slice(0, -1).map((curr, idx) => {
                  const next = mapNodes[idx + 1];
                  if (!next) return null;
                  const midX = (curr.x + next.x) / 2;
                  const midY = (curr.y + next.y) / 2 - 7;
                  const d = `M ${curr.x} ${curr.y} Q ${midX} ${midY} ${next.x} ${next.y}`;
                  return (
                    <g key={`arc-${curr.id}-${next.id}`}>
                      <path d={d} fill="none" stroke="rgba(232, 85, 58, 0.22)" strokeWidth="1.1" />
                      <path
                        d={d}
                        fill="none"
                        stroke="#e8553a"
                        strokeWidth="0.42"
                        strokeDasharray="1.6,1.2"
                        className="animate-dash-march"
                      />
                    </g>
                  );
                })}

              {/* 城市信标节点图形 */}
              {mapNodes.map((node, idx) => {
                const active = selectedKey !== null && node.clusterKeys.includes(selectedKey);
                const flipLeft = node.x > 114;
                const textX = flipLeft ? node.x - 5.2 : node.x + 5.2;
                const anchor = flipLeft ? 'end' : 'start';

                return (
                  <g key={node.id}>
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={active ? 6.2 : 4.2}
                      fill={active ? 'rgba(232,85,58,0.24)' : 'rgba(232,85,58,0.12)'}
                      stroke="#e8553a"
                      strokeWidth={active ? '0.42' : '0.28'}
                    />
                    <circle cx={node.x} cy={node.y} r={active ? 1.8 : 1.35} fill="#ff6448" />
                    <circle cx={node.x} cy={node.y} r={0.55} fill="#ffffff" />

                    <text
                      x={textX}
                      y={node.y - 0.5}
                      textAnchor={anchor}
                      fill="#f7f6f2"
                      fontSize="2.55"
                      fontFamily="Inter Variable, sans-serif"
                      fontWeight="600"
                    >
                      {String(idx + 1).padStart(2, '0')} · {node.label} ({node.ticketCount})
                    </text>
                    <text
                      x={textX}
                      y={node.y + 2.2}
                      textAnchor={anchor}
                      fill="rgba(255,255,255,0.58)"
                      fontSize="1.75"
                      fontFamily="JetBrains Mono Variable, monospace"
                    >
                      {formatCoord(node.lat, node.lng)}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* 无障碍语义按钮热区覆盖层 */}
            {mapNodes.map((node) => {
              const active = selectedKey !== null && node.clusterKeys.includes(selectedKey);
              const firstKey = node.clusterKeys[0] ?? null;
              return (
                <button
                  key={`hit-${node.id}`}
                  type="button"
                  aria-label={node.label}
                  aria-pressed={active}
                  onClick={() => {
                    playDetentClick();
                    setSelectedKey(active ? null : firstKey);
                  }}
                  style={{
                    left: `${(node.x / 160) * 100}%`,
                    top: `${(node.y / 74) * 100}%`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full cursor-pointer focus-visible:ring-2 focus-visible:ring-accent"
                />
              );
            })}
          </div>

          {geoClusters.length === 0 && (
            <p className="text-center text-sm text-white/65 py-6">{t('atlas.noCoords')}</p>
          )}
        </div>
      </div>

      {/* 场馆与车站坐标档案卡网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clusters.map((cluster, idx) => {
          const isSelected = selectedKey === cluster.key;
          return (
            <div
              key={cluster.key}
              className={`archival-card rounded-[20px] p-5 flex flex-col justify-between gap-4 transition-all ${
                isSelected ? 'ring-2 ring-accent shadow-md' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  playDetentClick();
                  setSelectedKey(isSelected ? null : cluster.key);
                }}
                className="text-left block w-full cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-mono tabular-nums text-[10.5px] text-faint">
                      WAYPOINT #{String(idx + 1).padStart(2, '0')}
                    </div>
                    <h3 className="text-[16px] font-semibold tracking-[-0.015em] text-fg truncate">
                      {cluster.name}
                    </h3>
                  </div>
                  <span className="rounded-full bg-bg-subtle px-2.5 py-0.5 font-mono tabular-nums text-[11px] font-medium text-muted shrink-0">
                    {t('atlas.stubsAt', { count: cluster.tickets.length })}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                  {cluster.city && <span>{cluster.city}</span>}
                  {cluster.lat !== undefined && cluster.lng !== undefined && (
                    <span className="font-mono tabular-nums text-[11px] text-faint">
                      {formatCoord(cluster.lat, cluster.lng)}
                    </span>
                  )}
                </div>
              </button>

              <ul className="divide-y divide-line border-t border-dashed border-line pt-1">
                {cluster.tickets.map((tk) => {
                  const theme = getTicketTypeTheme(tk.type);
                  return (
                    <li key={tk.id}>
                      <Link
                        to="/t/$id"
                        params={{ id: tk.id }}
                        onClick={() => playPaperFlip()}
                        className="py-2 flex items-center justify-between gap-3 text-[13px] text-fg hover:text-accent transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ background: theme.rim }}
                          />
                          <span className="truncate font-medium">{tk.title}</span>
                        </div>
                        <span className="font-mono tabular-nums text-[11px] text-muted shrink-0">
                          {tk.eventAt.slice(0, 10).replace(/-/g, '.')}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </Container>
  );
};
