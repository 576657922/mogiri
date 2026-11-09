import * as THREE from 'three';
import { ticketFragmentShader, ticketVertexShader } from '../shaders/ticket-shader';
import type { MaterialName, QualityTier } from '../types';

/** 材质预设：Shader 参数。见 02-architecture §5.3 */
export type MaterialPreset = {
  roughness: number;
  f0: number;
  fiber: number;
  /** 镭射 / 烫金强度（蒙版区域） */
  foil: number;
};

export const MATERIAL_PRESETS: Record<MaterialName, MaterialPreset> = {
  paper: { roughness: 0.78, f0: 0.03, fiber: 1.0, foil: 1 },
  thermal: { roughness: 0.4, f0: 0.045, fiber: 0.35, foil: 1 },
  cardstock: { roughness: 0.62, f0: 0.035, fiber: 0.7, foil: 1 },
  'foil-holo': { roughness: 0.55, f0: 0.04, fiber: 0.6, foil: 1 },
  'foil-gold': { roughness: 0.55, f0: 0.04, fiber: 0.6, foil: 1 },
  // 磁气券正面是热敏纸；背面的磁性涂层用 uMagnetic 单独处理
  magnetic: { roughness: 0.4, f0: 0.045, fiber: 0.35, foil: 1 },
};

/** 光源方向（世界坐标），和 Shader 里主柔光箱的方向大致一致 */
export const KEY_LIGHT_DIR = new THREE.Vector3(-0.45, 0.55, 0.7).normalize();

export type TicketMaterialOptions = {
  albedo: THREE.Texture;
  mask: THREE.Texture;
  sizeMm: { w: number; h: number };
  cornerRadius: number;
  material: MaterialName;
  face: 'front' | 'back';
  magneticBack?: boolean;
  /** 打孔线位置（毫米），没有副券时不传 */
  tearAtMm?: number;
  piece: 'whole' | 'main' | 'stub';
  quality: QualityTier;
  seed: number;
};

export type TicketShaderMaterial = THREE.ShaderMaterial & {
  uniforms: Record<string, THREE.IUniform>;
};

export function createTicketMaterial(o: TicketMaterialOptions): TicketShaderMaterial {
  const preset = MATERIAL_PRESETS[o.material];
  const isBack = o.face === 'back';
  const material = new THREE.ShaderMaterial({
    vertexShader: ticketVertexShader,
    fragmentShader: ticketFragmentShader,
    uniforms: {
      uAlbedo: { value: o.albedo },
      uMask: { value: o.mask },
      uSizeMm: { value: new THREE.Vector2(o.sizeMm.w, o.sizeMm.h) },
      uCornerRadius: { value: o.cornerRadius },
      uRoughness: { value: preset.roughness },
      uF0: { value: preset.f0 },
      uFiber: { value: preset.fiber },
      uAge: { value: 0 },
      // 背面没有镭射和烫金；蒙版只用来镂空打孔
      uHolo: { value: isBack ? 0 : preset.foil },
      uGlitter: { value: o.quality === 'high' ? 1 : 0 },
      uMagnetic: { value: isBack && o.magneticBack ? 1 : 0 },
      uMirrorU: { value: isBack ? 1 : 0 },
      uTearU: { value: o.tearAtMm === undefined ? -1 : o.tearAtMm / o.sizeMm.w },
      uTearSide: { value: o.piece === 'main' ? 1 : o.piece === 'stub' ? -1 : 0 },
      uTearAmp: { value: 0.45 },
      uSeed: { value: o.seed },
      uOpacity: { value: 1 },
      uCurl: { value: 0 },
      uKeyDir: { value: KEY_LIGHT_DIR.clone() },
      uTime: { value: 0 },
    },
    side: THREE.FrontSide,
    transparent: false,
    alphaToCoverage: true,
  });
  return material as TicketShaderMaterial;
}

/** 修改材质参数（演示页的参数面板用） */
export function applyPreset(material: TicketShaderMaterial, preset: Partial<MaterialPreset>) {
  const u = material.uniforms;
  if (preset.roughness !== undefined && u.uRoughness) u.uRoughness.value = preset.roughness;
  if (preset.f0 !== undefined && u.uF0) u.uF0.value = preset.f0;
  if (preset.fiber !== undefined && u.uFiber) u.uFiber.value = preset.fiber;
  if (preset.foil !== undefined && u.uHolo && u.uMirrorU?.value === 0) u.uHolo.value = preset.foil;
}
