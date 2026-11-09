import { type CSSProperties, useEffect, useState } from 'react';
import { detectQuality, lowerTier } from './quality/quality';
import { TicketCanvas } from './TicketCanvas';
import { TicketFallback } from './TicketFallback';
import { TicketView, type TicketViewProps } from './TicketView';
import type { QualityTier } from './types';

export type TicketStageProps = Omit<TicketViewProps, 'quality' | 'onQualityDrop'> & {
  /** 不传则自动检测（detect-gpu + 运行时帧率） */
  quality?: QualityTier;
  /** detect-gpu 跑分数据的自托管地址 */
  benchmarksURL?: string;
  onQualityChange?: (tier: QualityTier) => void;
  className?: string;
  style?: CSSProperties;
};

/**
 * 高层组件：自动选择 WebGL 或 CSS 降级。
 * 适合演示页和简单场景；App 里为了只保留一个 WebGL 上下文，
 * 应该自己挂载全局的 <TicketCanvas>，再在里面切换 <TicketView>。
 */
export function TicketStage({
  quality: forced,
  benchmarksURL,
  onQualityChange,
  className,
  style,
  ...view
}: TicketStageProps) {
  const [quality, setQuality] = useState<QualityTier | null>(forced ?? null);

  useEffect(() => {
    if (forced) {
      setQuality(forced);
      return;
    }
    let cancelled = false;
    detectQuality(benchmarksURL ? { benchmarksURL } : {}).then((tier) => {
      if (!cancelled) setQuality(tier);
    });
    return () => {
      cancelled = true;
    };
  }, [forced, benchmarksURL]);

  useEffect(() => {
    if (quality) onQualityChange?.(quality);
  }, [quality, onQualityChange]);

  if (!quality) return <div className={className} style={style} />;
  if (quality === 'low') {
    return (
      <TicketFallback
        spec={view.spec}
        flipped={view.flipped ?? false}
        className={className}
        style={style ?? {}}
      />
    );
  }
  return (
    <TicketCanvas quality={quality} className={className} style={style ?? {}}>
      <TicketView
        {...view}
        quality={quality}
        onQualityDrop={forced ? undefined : () => setQuality((q) => (q ? lowerTier(q) : q))}
      />
    </TicketCanvas>
  );
}
