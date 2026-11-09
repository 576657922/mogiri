import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { easing } from 'maath';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createTiltController, type Tilt, type TiltController } from './input/tilt';
import {
  applyPreset,
  createTicketMaterial,
  type MaterialPreset,
  type TicketShaderMaterial,
} from './materials/ticket-material';
import { FpsMonitor } from './quality/quality';
import { drawBack, drawFace, hashString } from './templates/draw';
import { getTemplate } from './templates/presets';
import type { QualityTier, TicketSpec } from './types';
import {
  FLY_DURATION,
  type FlyState,
  RESTING_POSE,
  type StubPose,
  shouldTear,
  startFly,
  stepFly,
  stubPoseForDrag,
} from './wear/tear';

/** 世界坐标单位：1 = 100mm */
export const MM = 0.01;
/** 纸张厚度（毫米） */
const THICKNESS_MM = 0.3;
/** 最大倾斜角度 */
const MAX_TILT = THREE.MathUtils.degToRad(18);

export type TicketViewProps = {
  spec: TicketSpec;
  quality: Exclude<QualityTier, 'low'>;
  flipped?: boolean;
  /** 允许撕副券 */
  interactive?: boolean;
  /** 副券飞出动画结束后调用。调用方应该把 wear.torn 写成 true 并保存 */
  onTear?: () => void;
  /** 运行时帧率不够，建议降档 */
  onQualityDrop?: (tier: QualityTier) => void;
  /** 固定倾斜（导出视频、截图对比测试时使用）。不传则使用指针 / 陀螺仪 / 空闲摆动 */
  tilt?: Tilt | null;
  /** 演示页调参用 */
  materialOverrides?: Partial<MaterialPreset>;
  /** 票占视口的比例 */
  fit?: number;
  /** 是否显示投影 */
  shadow?: boolean;
  /**
   * 横放还是竖放。auto：竖屏（手机）上把长票旋转 90° 竖着显示，占用更多屏幕。
   * 竖放时副券在上方，向上拖动撕下。
   */
  layout?: 'auto' | 'landscape' | 'portrait';
};

function canvasTexture(
  canvas: HTMLCanvasElement,
  color: boolean,
  anisotropy: number,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function setUniform(
  pair: { front: TicketShaderMaterial; back: TicketShaderMaterial },
  name: string,
  value: number,
) {
  for (const m of [pair.front, pair.back]) {
    const u = m.uniforms[name];
    if (u) u.value = value;
  }
}

function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.filter = 'blur(14px)';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(36, 30, 184, 68, 10);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 单张票的 3D 视图。必须放在 <TicketCanvas> 里 */
export function TicketView({
  spec,
  quality,
  flipped = false,
  interactive = true,
  onTear,
  onQualityDrop,
  tilt,
  materialOverrides,
  fit = 0.86,
  shadow = true,
  layout = 'auto',
}: TicketViewProps) {
  const tpl = getTemplate(spec.templateId);
  const size = spec.sizeMm ?? tpl.size;
  const gl = useThree((s) => s.gl);
  const viewport = useThree((s) => s.viewport);
  const canvasSize = useThree((s) => s.size);

  // ---------- 纹理 ----------
  const punchesKey = JSON.stringify(spec.wear.punches);
  const fieldsKey = JSON.stringify(spec.fields);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 用序列化后的 key 判断内容是否变化
  const textures = useMemo(() => {
    const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    const face = drawFace(tpl, spec, quality === 'high' ? 2048 : 1536);
    const backCanvas = drawBack(tpl, spec);
    return {
      albedo: canvasTexture(face.albedo, true, anisotropy),
      mask: canvasTexture(face.mask, false, anisotropy),
      back: backCanvas ? canvasTexture(backCanvas, true, anisotropy) : null,
    };
  }, [
    tpl,
    spec.id,
    spec.material,
    spec.faceImage,
    spec.backImage,
    fieldsKey,
    punchesKey,
    quality,
    gl,
  ]);

  useEffect(
    () => () => {
      textures.albedo.dispose();
      textures.mask.dispose();
      textures.back?.dispose();
    },
    [textures],
  );

  // ---------- 几何体 ----------
  const stubAt = tpl.stub?.at;
  const geometries = useMemo(() => {
    const w = size.w * MM;
    const h = size.h * MM;
    const t = THICKNESS_MM * MM;
    const make = (offsetX: number) => {
      const front = new THREE.PlaneGeometry(w, h, 48, 1);
      front.translate(offsetX, 0, t / 2);
      const back = new THREE.PlaneGeometry(w, h, 48, 1);
      back.rotateY(Math.PI);
      back.translate(offsetX, 0, -t / 2);
      return { front, back };
    };
    const main = make(0);
    // 副券几何体：原点放在打孔线上，方便绕打孔线旋转和卷曲
    const stubPivotX = stubAt === undefined ? 0 : (stubAt - size.w / 2) * MM;
    const stub = stubAt === undefined ? null : make(-stubPivotX);
    return { main, stub, stubPivotX };
  }, [size.w, size.h, stubAt]);

  useEffect(
    () => () => {
      geometries.main.front.dispose();
      geometries.main.back.dispose();
      geometries.stub?.front.dispose();
      geometries.stub?.back.dispose();
    },
    [geometries],
  );

  // ---------- 材质 ----------
  const torn = spec.wear.torn;
  const [stubGone, setStubGone] = useState(torn);
  useEffect(() => {
    setStubGone(torn);
  }, [torn]);
  const hasStub = stubAt !== undefined;
  const split = hasStub; // 有副券时总是拆成两块，撕口锯齿线互补

  const materials = useMemo(() => {
    const seed = (hashString(spec.id) % 1000) / 10;
    const backMaterial = tpl.back.kind === 'plain' ? tpl.back.material : 'cardstock';
    const blank = textures.back ?? textures.albedo;
    const common = {
      mask: textures.mask,
      sizeMm: size,
      cornerRadius: tpl.cornerRadius,
      quality,
      seed,
      ...(stubAt === undefined ? {} : { tearAtMm: stubAt }),
    };
    const pair = (piece: 'whole' | 'main' | 'stub') => ({
      front: createTicketMaterial({
        ...common,
        albedo: textures.albedo,
        material: spec.material,
        face: 'front',
        piece,
      }),
      back: createTicketMaterial({
        ...common,
        albedo: blank,
        material: backMaterial,
        face: 'back',
        magneticBack: tpl.back.kind === 'magnetic',
        piece,
      }),
    });
    return { main: pair(split ? 'main' : 'whole'), stub: split ? pair('stub') : null };
  }, [textures, size, tpl, spec.id, spec.material, quality, stubAt, split]);

  useEffect(
    () => () => {
      for (const m of [
        materials.main.front,
        materials.main.back,
        materials.stub?.front,
        materials.stub?.back,
      ]) {
        m?.dispose();
      }
    },
    [materials],
  );

  const allMaterials = useMemo<TicketShaderMaterial[]>(
    () =>
      [
        materials.main.front,
        materials.main.back,
        materials.stub?.front,
        materials.stub?.back,
      ].filter((m): m is TicketShaderMaterial => Boolean(m)),
    [materials],
  );

  useEffect(() => {
    for (const m of allMaterials) {
      const u = m.uniforms.uAge;
      if (u) u.value = spec.wear.age;
    }
  }, [allMaterials, spec.wear.age]);

  useEffect(() => {
    if (!materialOverrides) return;
    for (const m of allMaterials) applyPreset(m, materialOverrides);
  }, [allMaterials, materialOverrides]);

  // ---------- 输入 ----------
  const controller = useRef<TiltController | null>(null);
  useEffect(() => {
    controller.current = createTiltController(gl.domElement);
    return () => controller.current?.dispose();
  }, [gl]);

  // ---------- 撕副券 ----------
  const drag = useRef<{
    startX: number;
    mm: number;
    lastX: number;
    lastT: number;
    velocity: number;
  } | null>(null);
  const pose = useRef<StubPose>({ ...RESTING_POSE });
  const fly = useRef<FlyState | null>(null);

  const pxPerMm = () => {
    const tiltScale = fitScale();
    return (canvasSize.width / viewport.width) * tiltScale * MM;
  };
  const portrait =
    layout === 'portrait' || (layout === 'auto' && viewport.aspect < 0.85 && size.w / size.h > 1.2);
  const fitScale = () => {
    const [w, h] = portrait ? [size.h, size.w] : [size.w, size.h];
    return Math.min((viewport.width * fit) / (w * MM), (viewport.height * fit) / (h * MM));
  };
  /** 指针在「副券方向」上的屏幕坐标：横放时向右为正，竖放时向上为正 */
  const dragAxis = (e: ThreeEvent<PointerEvent>) =>
    portrait ? -e.nativeEvent.clientY : e.nativeEvent.clientX;

  const onStubDown = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || stubGone || fly.current || stubAt === undefined || !e.uv) return;
    // 副券网格是整张大小（靠 Shader 丢弃另一半），所以要用 uv 判断是不是真的点在副券上
    const isBack = e.object.userData.face === 'back';
    const u = isBack ? 1 - e.uv.x : e.uv.x;
    if (u < stubAt / size.w) return;
    e.stopPropagation();
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    drag.current = {
      startX: dragAxis(e),
      mm: 0,
      lastX: dragAxis(e),
      lastT: performance.now(),
      velocity: 0,
    };
    controller.current?.setPaused(true);
  };
  const onStubMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    const direction = flipped ? -1 : 1;
    const x = dragAxis(e);
    d.mm = ((x - d.startX) * direction) / pxPerMm();
    d.velocity = (((x - d.lastX) * direction) / pxPerMm() / Math.max(1, now - d.lastT)) * 1000;
    d.lastX = x;
    d.lastT = now;
    pose.current = stubPoseForDrag(d.mm);
    if (shouldTear(d.mm)) {
      fly.current = startFly(pose.current, d.velocity);
      drag.current = null;
      controller.current?.setPaused(false);
    }
  };
  const onStubUp = (e: ThreeEvent<PointerEvent>) => {
    (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
    drag.current = null;
    controller.current?.setPaused(false);
  };

  // ---------- 动画 ----------
  const group = useRef<THREE.Group>(null);
  const stubGroup = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const shadowTex = useMemo(() => (shadow ? shadowTexture() : null), [shadow]);
  useEffect(() => () => shadowTex?.dispose(), [shadowTex]);
  const fps = useRef(new FpsMonitor());

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const time = state.clock.elapsedTime;
    const target = tilt ?? controller.current?.read(time) ?? { x: 0, y: 0 };
    // 旋转都是绕父级（outer）坐标轴。竖放时 outer 转了 90°，屏幕的竖轴对应票的 x 轴
    const flip = flipped ? Math.PI : 0;
    const rx = portrait ? target.x * MAX_TILT : -target.y * MAX_TILT;
    const ry = portrait ? target.y * MAX_TILT : target.x * MAX_TILT;
    easing.damp(g.rotation, 'x', rx, 0.22, dt);
    easing.damp(g.rotation, 'y', ry + flip, 0.3, dt);

    const s = fitScale();
    g.scale.setScalar(s);

    if (shadowRef.current) {
      // 副券撕下后，投影只覆盖主券
      const visible = stubGone && stubAt !== undefined ? stubAt / size.w : 1;
      const widthW = size.w * MM * s;
      const shiftX = ((visible - 1) / 2) * widthW * Math.cos(g.rotation.y);
      shadowRef.current.scale.set(
        widthW * visible * 1.25 * Math.max(0.2, Math.abs(Math.cos(g.rotation.y))),
        size.h * MM * s * 1.6,
        1,
      );
      shadowRef.current.position.set(
        shiftX + g.rotation.y * 0.12 + 0.05,
        -g.rotation.x * 0.12 - 0.08,
        -0.25,
      );
    }

    // 副券
    const sg = stubGroup.current;
    if (sg && materials.stub) {
      if (fly.current) {
        fly.current = stepFly(fly.current, dt);
        const f = fly.current;
        sg.position.set(geometries.stubPivotX + f.x * MM, f.y * MM, f.z * MM);
        sg.rotation.set(0, f.rotY, f.rotZ);
        setUniform(materials.stub, 'uOpacity', f.opacity);
        if (f.age >= FLY_DURATION) {
          fly.current = null;
          setStubGone(true);
          onTear?.();
        }
      } else {
        if (!drag.current) {
          // 松手后弹回
          const p = pose.current;
          const k = Math.min(1, dt * 10);
          pose.current = {
            offsetX: p.offsetX * (1 - k),
            offsetY: p.offsetY * (1 - k),
            rotZ: p.rotZ * (1 - k),
            curl: p.curl * (1 - k),
          };
        }
        const p = pose.current;
        sg.position.set(geometries.stubPivotX + p.offsetX * MM, p.offsetY * MM, 0);
        sg.rotation.set(0, 0, p.rotZ);
        const curl = p.curl / MM;
        setUniform(materials.stub, 'uCurl', curl);
        setUniform(materials.stub, 'uOpacity', 1);
      }
    }

    for (const m of allMaterials) {
      const u = m.uniforms.uTime;
      if (u) u.value = time;
    }

    if (onQualityDrop) {
      const next = fps.current.tick(dt, quality);
      if (next) onQualityDrop(next);
    }
  });

  return (
    <group rotation={[0, 0, portrait ? Math.PI / 2 : 0]}>
      {shadowTex && (
        <mesh ref={shadowRef} renderOrder={-1}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={shadowTex} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <group ref={group}>
        <mesh geometry={geometries.main.front} material={materials.main.front} />
        <mesh geometry={geometries.main.back} material={materials.main.back} />
        {geometries.stub && materials.stub && !stubGone && (
          <group ref={stubGroup} position={[geometries.stubPivotX, 0, 0]}>
            <mesh
              geometry={geometries.stub.front}
              material={materials.stub.front}
              onPointerDown={onStubDown}
              onPointerMove={onStubMove}
              onPointerUp={onStubUp}
              onPointerCancel={onStubUp}
            />
            <mesh
              userData={{ face: 'back' }}
              geometry={geometries.stub.back}
              material={materials.stub.back}
              onPointerDown={onStubDown}
              onPointerMove={onStubMove}
              onPointerUp={onStubUp}
              onPointerCancel={onStubUp}
            />
          </group>
        )}
      </group>
    </group>
  );
}
