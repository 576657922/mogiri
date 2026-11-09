import { Canvas } from '@react-three/fiber';
import type { CSSProperties, ReactNode } from 'react';
import * as THREE from 'three';
import { dprFor } from './quality/quality';
import type { QualityTier } from './types';

export type TicketCanvasProps = {
  quality: Exclude<QualityTier, 'low'>;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * 全局唯一的 WebGL Canvas。
 * iOS 对 WebGL 上下文数量有上限，App 里应该只挂载一个 TicketCanvas，
 * 在详情页之间切换的是里面的 <TicketView>（见 02-architecture §5.5）。
 */
export function TicketCanvas({ quality, children, className, style }: TicketCanvasProps) {
  const dpr = dprFor(quality, typeof window === 'undefined' ? 1 : window.devicePixelRatio);
  return (
    <Canvas
      className={className}
      style={{ touchAction: 'none', ...style }}
      dpr={dpr}
      camera={{ fov: 30, position: [0, 0, 6], near: 0.1, far: 50 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.0;
        gl.setClearColor(0x000000, 0);
      }}
    >
      {children}
    </Canvas>
  );
}
