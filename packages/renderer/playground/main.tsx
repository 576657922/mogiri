import { button, Leva, useControls } from 'leva';
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MATERIAL_PRESETS,
  type MaterialName,
  type QualityTier,
  requestMotionPermission,
  SAMPLE_TICKETS,
  type TicketSpec,
  TicketStage,
} from '../src';

/**
 * 渲染器演示页（pnpm dev:renderer）。
 * URL 参数可以用于截图：?ticket=1&tiltX=0.4&tiltY=0.2&quality=high&flipped=1&ui=0
 */
const params = new URLSearchParams(location.search);
const shotMode = params.get('ui') === '0';
const num = (key: string) => (params.has(key) ? Number(params.get(key)) : undefined);

const MATERIALS = Object.keys(MATERIAL_PRESETS) as MaterialName[];

function App() {
  const initialIndex = num('ticket') ?? 0;
  const [torn, setTorn] = useState<Record<string, boolean>>({});
  const [punches, setPunches] = useState<Record<string, { x: number; y: number }[]>>({});

  const { ticket } = useControls({
    ticket: {
      value: initialIndex,
      options: Object.fromEntries(SAMPLE_TICKETS.map((t, i) => [t.fields.title ?? t.id, i])),
    },
  });
  const base = SAMPLE_TICKETS[ticket] ?? SAMPLE_TICKETS[0];
  if (!base) throw new Error('No sample tickets');

  const view = useControls(
    'View',
    {
      quality: {
        value: (params.get('quality') as QualityTier | 'auto' | null) ?? 'auto',
        options: ['auto', 'high', 'mid', 'low'],
      },
      flipped: params.get('flipped') === '1',
      fixedTilt: params.has('tiltX') || params.has('tiltY'),
      tiltX: { value: num('tiltX') ?? 0.3, min: -1, max: 1, step: 0.01 },
      tiltY: { value: num('tiltY') ?? 0.2, min: -1, max: 1, step: 0.01 },
    },
    { collapsed: false },
  );

  const look = useControls(
    'Material',
    {
      material: { value: base.material, options: MATERIALS },
      age: { value: base.wear.age, min: 0, max: 1, step: 0.01 },
      roughness: {
        value: MATERIAL_PRESETS[base.material].roughness,
        min: 0.05,
        max: 1,
        step: 0.01,
      },
      fiber: { value: MATERIAL_PRESETS[base.material].fiber, min: 0, max: 2, step: 0.01 },
      foil: { value: 1, min: 0, max: 1.5, step: 0.01 },
    },
    [ticket],
  );

  useControls(
    'Wear',
    {
      'reset stub': button(() => setTorn((t) => ({ ...t, [base.id]: false }))),
      'punch hole': button(() =>
        setPunches((p) => ({
          ...p,
          [base.id]: [
            ...(p[base.id] ?? []),
            { x: 8 + Math.random() * 40, y: 6 + Math.random() * 20 },
          ],
        })),
      ),
      'clear punches': button(() => setPunches((p) => ({ ...p, [base.id]: [] }))),
      'enable gyro (iOS)': button(() => {
        void requestMotionPermission();
      }),
    },
    [base.id],
  );

  const spec: TicketSpec = useMemo(
    () => ({
      ...base,
      material: look.material,
      wear: {
        ...base.wear,
        age: look.age,
        torn: torn[base.id] ?? false,
        punches: punches[base.id] ?? [],
      },
    }),
    [base, look.material, look.age, torn, punches],
  );

  const overrides = useMemo(
    () => ({ roughness: look.roughness, fiber: look.fiber, foil: look.foil }),
    [look.roughness, look.fiber, look.foil],
  );

  return (
    <>
      <Leva hidden={shotMode} collapsed={window.innerWidth < 600} />
      <TicketStage
        key={`${view.quality}`}
        spec={spec}
        {...(view.quality === 'auto' ? {} : { quality: view.quality as QualityTier })}
        flipped={view.flipped}
        tilt={view.fixedTilt ? { x: view.tiltX, y: view.tiltY } : null}
        materialOverrides={overrides}
        onTear={() => setTorn((t) => ({ ...t, [base.id]: true }))}
        style={{ position: 'fixed', inset: 0 }}
      />
      {!shotMode && (
        <div
          style={{
            position: 'fixed',
            left: 16,
            bottom: 14,
            fontSize: 12,
            opacity: 0.6,
            pointerEvents: 'none',
          }}
        >
          移动鼠标 / 倾斜手机查看光泽 · 向右拖动副券把它撕下
        </div>
      )}
    </>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
