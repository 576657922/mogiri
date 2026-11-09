import { TicketCanvas, TicketFallback, TicketView } from '@mogiri/renderer';
import { useEffect, useState } from 'react';
import { useUiStore } from './store';

/**
 * 全局唯一的 WebGL 渲染宿主（见 02-architecture §5.5）：
 * 整个 App 生命周期只保留一个 <TicketCanvas>，避免 iOS Safari WebGL 上下文超限与显存泄漏。
 * 当进入详情页时，通过测量 #mogiri-stage-slot 的屏幕位置，把全局 Canvas 对齐到槽位上；
 * 离开详情页时隐藏但保持挂载。
 */
export function GlobalTicketStageHost() {
  const activeStage = useUiStore((s) => s.activeStage);
  const resolvedQuality = useUiStore((s) => s.resolvedQuality);
  const downgradeQuality = useUiStore((s) => s.downgradeQuality);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!activeStage) {
      setRect(null);
      return;
    }

    const updateRect = () => {
      const slot = document.getElementById('mogiri-stage-slot');
      if (!slot) {
        setRect(null);
        return;
      }
      const r = slot.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    updateRect();
    const raf = requestAnimationFrame(updateRect);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [activeStage]);

  const visible = Boolean(activeStage && rect && rect.width > 10 && rect.height > 10);

  if (resolvedQuality === 'low') {
    if (!visible || !activeStage || !rect) return null;
    return (
      <div
        style={{
          position: 'fixed',
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          zIndex: 20,
        }}
      >
        <TicketFallback spec={activeStage.spec} flipped={activeStage.flipped} />
      </div>
    );
  }

  return (
    <div
      aria-hidden={!visible}
      style={{
        position: 'fixed',
        top: rect?.top ?? 0,
        left: rect?.left ?? 0,
        width: rect?.width ?? 320,
        height: rect?.height ?? 220,
        zIndex: visible ? 20 : -1,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        borderRadius: '1rem',
        overflow: 'hidden',
      }}
    >
      <TicketCanvas quality={resolvedQuality} style={{ width: '100%', height: '100%' }}>
        {activeStage && (
          <TicketView
            spec={activeStage.spec}
            quality={resolvedQuality}
            flipped={activeStage.flipped}
            onQualityDrop={downgradeQuality}
            {...(activeStage.onTear ? { onTear: activeStage.onTear } : {})}
          />
        )}
      </TicketCanvas>
    </div>
  );
}
