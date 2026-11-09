import { describe, expect, it } from 'vitest';
import { idleTilt, orientationToTilt, pointerToTilt } from './input/tilt';
import { dprFor, FpsMonitor, lowerTier, tierFromGpu } from './quality/quality';
import { hashString, seededRandom, textureSize } from './templates/draw';
import { formatValue, parseLocalDateTime } from './templates/format';
import { SAMPLE_TICKETS, TEMPLATES } from './templates/presets';
import {
  FLY_DURATION,
  RESTING_POSE,
  shouldTear,
  startFly,
  stepFly,
  stubPoseForDrag,
  TEAR_THRESHOLD_MM,
} from './wear/tear';

describe('format', () => {
  it('parses local date time without timezone shifts', () => {
    expect(parseLocalDateTime('2026-11-09T18:30')).toEqual({
      y: 2026,
      m: 11,
      d: 9,
      hh: 18,
      mm: 30,
    });
    expect(parseLocalDateTime('2026-11-09')).toEqual({ y: 2026, m: 11, d: 9 });
    expect(parseLocalDateTime('11/9')).toBeNull();
  });

  it('formats dates for each template style', () => {
    const v = '2026-11-09T09:05';
    expect(formatValue(v, 'date.dot')).toBe('2026.11.09');
    expect(formatValue(v, 'date.jp')).toBe('2026年11月9日');
    expect(formatValue(v, 'date.jr')).toBe('11月 9日');
    expect(formatValue(v, 'date.iata')).toBe('09NOV');
    expect(formatValue(v, 'weekday.en')).toBe('MON');
    expect(formatValue(v, 'weekday.jp')).toBe('(月)');
    expect(formatValue(v, 'time')).toBe('09:05');
  });

  it('returns empty time when only a date is known, and passes through unparseable values', () => {
    expect(formatValue('2026-11-09', 'time')).toBe('');
    expect(formatValue('TBA', 'date.dot')).toBe('TBA');
    expect(formatValue('anything', undefined)).toBe('anything');
  });
});

describe('templates', () => {
  it('keeps every region inside the ticket and the stub inside the width', () => {
    for (const tpl of Object.values(TEMPLATES)) {
      if (tpl.stub) {
        expect(tpl.stub.at).toBeGreaterThan(0);
        expect(tpl.stub.at).toBeLessThan(tpl.size.w);
      }
      for (const r of tpl.regions) {
        if (r.kind === 'line') continue;
        expect(r.x, `${tpl.id} ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(0);
        expect(r.x).toBeLessThanOrEqual(tpl.size.w);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeLessThanOrEqual(tpl.size.h);
        if ('w' in r && r.w !== undefined && r.kind !== 'text')
          expect(r.x + r.w).toBeLessThanOrEqual(tpl.size.w + 0.01);
        if ('h' in r && r.h !== undefined) expect(r.y + r.h).toBeLessThanOrEqual(tpl.size.h + 0.01);
      }
    }
  });

  it('has a template for every sample ticket', () => {
    for (const t of SAMPLE_TICKETS) expect(TEMPLATES[t.templateId]).toBeDefined();
  });

  it('computes texture size from the long edge', () => {
    expect(textureSize({ w: 180, h: 70 }, 2048)).toEqual({
      width: 2048,
      height: 796,
      pxPerMm: 2048 / 180,
    });
    expect(textureSize({ w: 57.5, h: 85 }, 1000).height).toBe(1000);
  });

  it('generates deterministic pseudo random barcodes', () => {
    const a = seededRandom(hashString('abc'));
    const b = seededRandom(hashString('abc'));
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});

describe('tilt input', () => {
  const rect = { left: 0, top: 0, width: 200, height: 100 };
  it('maps pointer to [-1, 1] with y up', () => {
    expect(pointerToTilt(100, 50, rect)).toEqual({ x: 0, y: -0 });
    expect(pointerToTilt(200, 0, rect)).toEqual({ x: 1, y: 1 });
    expect(pointerToTilt(-50, 500, rect)).toEqual({ x: -1, y: -1 });
  });

  it('maps device orientation relative to the baseline and clamps', () => {
    const base = { beta: 40, gamma: 0 };
    expect(orientationToTilt(40, 10, base)).toEqual({ x: 0.5, y: -0 });
    expect(orientationToTilt(80, -90, base)).toEqual({ x: -1, y: -1 });
  });

  it('keeps idle wobble within range', () => {
    for (let t = 0; t < 60; t += 0.37) {
      const v = idleTilt(t);
      expect(Math.abs(v.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(v.y)).toBeLessThanOrEqual(1);
    }
  });
});

describe('quality', () => {
  it('chooses tiers from GPU benchmarks', () => {
    expect(tierFromGpu({ gpuTier: 3, webgl: true, reducedMotion: false })).toBe('high');
    expect(tierFromGpu({ gpuTier: 1, webgl: true, reducedMotion: false })).toBe('mid');
    expect(tierFromGpu({ gpuTier: 0, webgl: true, reducedMotion: false })).toBe('low');
    expect(tierFromGpu({ gpuTier: null, webgl: true, reducedMotion: false })).toBe('mid');
    expect(tierFromGpu({ gpuTier: 3, webgl: false, reducedMotion: false })).toBe('low');
    expect(tierFromGpu({ gpuTier: 3, webgl: true, reducedMotion: true })).toBe('low');
  });

  it('caps device pixel ratio per tier', () => {
    expect(dprFor('high', 3)).toBe(2);
    expect(dprFor('mid', 3)).toBe(1.5);
    expect(dprFor('mid', 1)).toBe(1);
    expect(lowerTier('high')).toBe('mid');
    expect(lowerTier('mid')).toBe('low');
  });

  it('downgrades only after warmup and a full measurement window', () => {
    const m = new FpsMonitor(2, 1);
    const run = (fps: number, seconds: number, tier: 'high' | 'mid') => {
      let result = null;
      for (let t = 0; t < seconds; t += 1 / fps) result = m.tick(1 / fps, tier) ?? result;
      return result;
    };
    expect(run(20, 0.9, 'high')).toBeNull(); // 预热期间不判断
    expect(run(60, 2.2, 'high')).toBeNull();
    expect(run(45, 2.2, 'high')).toBe('mid');
    expect(run(20, 2.2, 'mid')).toBe('low');
  });
});

describe('tear', () => {
  it('starts at rest and moves further the more you drag', () => {
    expect(stubPoseForDrag(0)).toEqual(RESTING_POSE);
    expect(stubPoseForDrag(-10)).toEqual(RESTING_POSE);
    const a = stubPoseForDrag(5);
    const b = stubPoseForDrag(12);
    expect(b.offsetX).toBeGreaterThan(a.offsetX);
    expect(b.curl).toBeGreaterThan(a.curl);
    expect(stubPoseForDrag(100)).toEqual(stubPoseForDrag(TEAR_THRESHOLD_MM));
  });

  it('tears at the threshold', () => {
    expect(shouldTear(TEAR_THRESHOLD_MM - 0.1)).toBe(false);
    expect(shouldTear(TEAR_THRESHOLD_MM)).toBe(true);
  });

  it('flies away, falls, and fades out by the end of the animation', () => {
    let s = startFly(stubPoseForDrag(TEAR_THRESHOLD_MM), 300);
    const x0 = s.x;
    let maxY = s.y;
    while (s.age < FLY_DURATION) {
      s = stepFly(s, 1 / 60);
      maxY = Math.max(maxY, s.y);
    }
    expect(s.x).toBeGreaterThan(x0);
    expect(s.y).toBeLessThan(maxY);
    expect(s.opacity).toBe(0);
  });
});
