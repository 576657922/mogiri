import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Compass, MapPin, Navigation } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type TicketRecord } from '../../data';

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

/**
 * 把经纬度映射到 SVG 视口（聚焦东亚与全球自适应投影）。
 */
function projectLngLat(
  lng: number,
  lat: number,
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number },
): { x: number; y: number } {
  const pad = 12;
  const spanLng = Math.max(8, bounds.maxLng - bounds.minLng);
  const spanLat = Math.max(6, bounds.maxLat - bounds.minLat);
  const x = pad + ((lng - bounds.minLng) / spanLng) * (100 - pad * 2);
  const y = 100 - pad - ((lat - bounds.minLat) / spanLat) * (100 - pad * 2);
  return {
    x: Math.max(6, Math.min(94, x)),
    y: Math.max(8, Math.min(92, y)),
  };
}

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
    for (const tk of tickets) {
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
    return Array.from(map.values()).sort((a, b) => b.tickets.length - a.tickets.length);
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
      minLng: minLng - 2.5,
      maxLng: maxLng + 2.5,
      minLat: minLat - 2,
      maxLat: maxLat + 2,
    };
  }, [geoClusters]);

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-xl font-bold text-stone-100 flex items-center gap-2">
          <Compass className="h-5 w-5 text-amber-400" />
          {t('map.title')}
        </h1>
        <p className="text-xs text-stone-400 mt-1">{t('map.subtitle')}</p>
      </div>

      {/* 交互式足迹坐标雷达图 */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-800 bg-gradient-to-b from-stone-900 via-stone-950 to-stone-900 p-4">
        <svg viewBox="0 0 100 54" className="w-full h-64 sm:h-80 select-none">
          <title>{t('map.title')}</title>
          {/* 经纬网格线 */}
          {[15, 30, 45, 60, 75, 85].map((x) => (
            <line
              key={`vx-${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={54}
              stroke="rgba(120,113,108,0.14)"
              strokeWidth="0.2"
              strokeDasharray="1,1"
            />
          ))}
          {[10, 22, 34, 46].map((y) => (
            <line
              key={`hy-${y}`}
              x1={0}
              y1={y}
              x2={100}
              y2={y}
              stroke="rgba(120,113,108,0.14)"
              strokeWidth="0.2"
              strokeDasharray="1,1"
            />
          ))}

          {/* 航线 / 轨迹连线 */}
          {geoClusters.length > 1 &&
            geoClusters.slice(0, -1).map((curr, idx) => {
              const next = geoClusters[idx + 1];
              if (!next) return null;
              const p1 = projectLngLat(curr.lng, curr.lat, bounds);
              const p2 = projectLngLat(next.lng, next.lat, bounds);
              return (
                <line
                  key={`line-${curr.key}-${next.key}`}
                  x1={p1.x}
                  y1={p1.y * 0.54}
                  x2={p2.x}
                  y2={p2.y * 0.54}
                  stroke="rgba(251,191,36,0.35)"
                  strokeWidth="0.35"
                  strokeDasharray="1.2,0.8"
                />
              );
            })}

          {/* 坐标点亮标记 */}
          {geoClusters.map((c) => {
            const pt = projectLngLat(c.lng, c.lat, bounds);
            const cy = pt.y * 0.54;
            const active = selectedKey === c.key;
            return (
              <g key={c.key}>
                <circle cx={pt.x} cy={cy} r={active ? 3.2 : 2.2} fill="rgba(251,191,36,0.22)" />
                <circle
                  cx={pt.x}
                  cy={cy}
                  r={active ? 1.3 : 0.95}
                  fill="#fbbf24"
                  stroke="#0c0a09"
                  strokeWidth="0.3"
                />
                <text
                  x={pt.x}
                  y={cy - 1.8}
                  textAnchor="middle"
                  fill={active ? '#fde68a' : '#d6d3d1'}
                  fontSize="2.2"
                  fontWeight="600"
                >
                  {c.city || c.name} ({c.tickets.length})
                </text>
              </g>
            );
          })}
        </svg>

        {geoClusters.length === 0 && (
          <p className="text-center text-xs text-stone-500 py-4">{t('map.noCoordsHint')}</p>
        )}
      </div>

      {/* 场馆与城市足迹列表 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {clusters.map((cluster) => {
          const isSelected = selectedKey === cluster.key;
          return (
            <div
              key={cluster.key}
              className={`rounded-2xl border p-4 space-y-2.5 transition ${
                isSelected
                  ? 'border-amber-500/60 bg-amber-500/10'
                  : 'border-stone-800/80 bg-stone-900/40 hover:border-stone-700'
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedKey(isSelected ? null : cluster.key)}
                className="w-full flex items-start justify-between gap-2 text-left"
              >
                <div>
                  <h3 className="text-sm font-semibold text-stone-100 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    {cluster.name}
                  </h3>
                  <div className="text-xs text-stone-400 mt-0.5 flex items-center gap-2">
                    {cluster.city && <span>{cluster.city}</span>}
                    {cluster.country && <span className="font-mono">{cluster.country}</span>}
                    {cluster.lat !== undefined && cluster.lng !== undefined && (
                      <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-stone-500">
                        <Navigation className="h-2.5 w-2.5" />
                        {cluster.lat.toFixed(2)}, {cluster.lng.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
                <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-mono text-amber-300 shrink-0">
                  {t('map.ticketsAtPlace', { count: cluster.tickets.length })}
                </span>
              </button>

              <div className="space-y-1 pt-1 border-t border-stone-800/70">
                {cluster.tickets.map((tk) => (
                  <Link
                    key={tk.id}
                    to="/t/$id"
                    params={{ id: tk.id }}
                    className="flex items-center justify-between rounded-lg px-2 py-1 text-xs text-stone-300 hover:bg-stone-800/70 hover:text-amber-300"
                  >
                    <span className="truncate">{tk.title}</span>
                    <span className="font-mono text-[11px] text-stone-500 shrink-0 ml-2">
                      {tk.eventAt.slice(0, 10)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
