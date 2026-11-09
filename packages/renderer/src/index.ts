export type { Tilt, TiltController, TiltSource } from './input/tilt';
export {
  createTiltController,
  idleTilt,
  orientationToTilt,
  pointerToTilt,
  requestMotionPermission,
} from './input/tilt';
export type { MaterialPreset } from './materials/ticket-material';
export { applyPreset, createTicketMaterial, MATERIAL_PRESETS } from './materials/ticket-material';
export { detectQuality, dprFor, FpsMonitor, lowerTier, tierFromGpu } from './quality/quality';
export type { TicketCanvasProps } from './TicketCanvas';
export { TicketCanvas } from './TicketCanvas';
export { TicketFallback } from './TicketFallback';
export type { TicketStageProps } from './TicketStage';
export { TicketStage } from './TicketStage';
export type { TicketViewProps } from './TicketView';
export { MM, TicketView } from './TicketView';
export { DEFAULT_TEXTURE_PX, drawBack, drawFace, textureSize } from './templates/draw';
export { formatValue, parseLocalDateTime } from './templates/format';
export {
  boardingPass,
  concertHolo,
  getTemplate,
  jrMagnetic,
  SAMPLE_TICKETS,
  TEMPLATES,
} from './templates/presets';
export type { BackDef, Background, Region, TemplateDef, TextRegion } from './templates/types';
export type { MaterialName, PointMm, QualityTier, TicketSpec, Wear } from './types';
export { shouldTear, stubPoseForDrag, TEAR_THRESHOLD_MM } from './wear/tear';
