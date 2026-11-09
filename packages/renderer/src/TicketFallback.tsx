import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { clamp, pointerToTilt } from './input/tilt';
import { prefersReducedMotion } from './quality/quality';
import { drawBack, drawFace } from './templates/draw';
import { getTemplate } from './templates/presets';
import type { TicketSpec } from './types';

export type TicketFallbackProps = {
  spec: TicketSpec;
  flipped?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * T1 降级：不用 WebGL。静态票面图 + CSS 3D 倾斜 + 渐变模拟光泽。
 * 「减弱动态效果」开启时不跟随指针倾斜。见 02-architecture §5.5。
 */
export function TicketFallback({ spec, flipped = false, className, style }: TicketFallbackProps) {
  const tpl = getTemplate(spec.templateId);
  const size = spec.sizeMm ?? tpl.size;
  const fieldsKey = JSON.stringify(spec.fields);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 用序列化后的 key 判断内容是否变化
  const images = useMemo(() => {
    const face = drawFace(tpl, spec, 1200);
    const back = drawBack(tpl, spec, 800);
    return {
      face: face.albedo.toDataURL('image/webp', 0.9),
      back: back?.toDataURL('image/webp', 0.9) ?? null,
    };
  }, [tpl, spec.id, spec.faceImage, spec.backImage, fieldsKey]);

  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const reduced = useMemo(() => prefersReducedMotion(), []);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const onMove = (e: PointerEvent) =>
      setTilt(pointerToTilt(e.clientX, e.clientY, el.getBoundingClientRect()));
    const onLeave = () => setTilt({ x: 0, y: 0 });
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [reduced]);

  const rx = clamp(tilt.y * 12, -12, 12);
  const ry = clamp(tilt.x * 12, -12, 12) + (flipped ? 180 : 0);
  const radius = `${(tpl.cornerRadius / size.w) * 100}% / ${(tpl.cornerRadius / size.h) * 100}%`;
  const faceStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: radius,
    backfaceVisibility: 'hidden',
    backgroundSize: 'cover',
    boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
    overflow: 'hidden',
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{
        perspective: '1200px',
        display: 'grid',
        placeItems: 'center',
        width: '100%',
        height: '100%',
        ...style,
      }}
      role="img"
      aria-label={spec.fields.title ?? spec.id}
    >
      <div
        style={{
          position: 'relative',
          width: '86%',
          aspectRatio: `${size.w} / ${size.h}`,
          transformStyle: 'preserve-3d',
          transform: `rotateX(${rx}deg) rotateY(${ry}deg)`,
          transition: reduced ? 'none' : 'transform 120ms ease-out',
        }}
      >
        <div style={{ ...faceStyle, backgroundImage: `url(${images.face})` }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(${115 + tilt.x * 25}deg, transparent 30%, rgba(255,255,255,0.28) 48%, transparent 62%)`,
              mixBlendMode: 'soft-light',
            }}
          />
        </div>
        <div
          style={{
            ...faceStyle,
            transform: 'rotateY(180deg)',
            backgroundColor: '#2b2622',
            ...(images.back ? { backgroundImage: `url(${images.back})` } : {}),
          }}
        />
      </div>
    </div>
  );
}
