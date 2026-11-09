import { describe, expect, it } from 'vitest';
import { computeHomography, DEFAULT_QUAD, estimateQuadAspect, mapHomography } from './perspective';

describe('perspective homography solver', () => {
  it('maps target rectangle corners back to source quad corners', () => {
    const srcQuad: [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
    ] = [
      { x: 20, y: 30 },
      { x: 420, y: 40 },
      { x: 430, y: 240 },
      { x: 10, y: 230 },
    ];
    const h = computeHomography(400, 200, srcQuad);

    const p0 = mapHomography(h, 0, 0);
    const p1 = mapHomography(h, 400, 0);
    const p2 = mapHomography(h, 400, 200);
    const p3 = mapHomography(h, 0, 200);

    expect(p0.x).toBeCloseTo(20, 4);
    expect(p0.y).toBeCloseTo(30, 4);
    expect(p1.x).toBeCloseTo(420, 4);
    expect(p1.y).toBeCloseTo(40, 4);
    expect(p2.x).toBeCloseTo(430, 4);
    expect(p2.y).toBeCloseTo(240, 4);
    expect(p3.x).toBeCloseTo(10, 4);
    expect(p3.y).toBeCloseTo(230, 4);
  });

  it('estimates ticket aspect ratio in millimeters', () => {
    const size = estimateQuadAspect(DEFAULT_QUAD, 1000, 500);
    expect(size.h).toBe(70);
    expect(size.w).toBeGreaterThan(140);
    expect(size.w).toBeLessThan(180);
  });
});
