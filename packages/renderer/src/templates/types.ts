import type { MaterialName } from '../types';

/**
 * 版式模板（只用于生成模式）。所有坐标、尺寸都以毫米为单位，原点在左上角。
 * 见 03-development §5.2。
 */
export type TemplateDef = {
  id: string;
  /** 适用的票型 */
  ticketType: string;
  size: { w: number; h: number };
  cornerRadius: number;
  /** 副券：打孔线所在的 x 坐标（毫米） */
  stub?: { at: number; perforation: 'dots' | 'line'; color?: string };
  /** 默认正面材质 */
  material: MaterialName;
  background: Background;
  regions: Region[];
  back: BackDef;
};

export type Background =
  | { kind: 'solid'; color: string }
  | {
      kind: 'guilloche';
      color: string;
      line: string;
      band?: { y: number; h: number; color: string };
    }
  | { kind: 'jr'; color: string; pattern: string }
  | { kind: 'boarding'; color: string; band: string; bandH: number; accent: string };

export type FoilKind = 'holo' | 'gold' | 'auto';

type Box = { x: number; y: number; w: number; h: number };

export type TextRegion = {
  kind: 'text';
  /** TicketSpec.fields 的 key，例如 title、details.flightNo */
  bind?: string;
  /** 固定文字（bind 为空时使用，或者作为 bind 缺失时的后备） */
  text?: string;
  /** 格式化，见 format.ts */
  format?: TextFormat;
  prefix?: string;
  suffix?: string;
  x: number;
  /** 文字顶部 y（毫米） */
  y: number;
  /** 最大宽度。配合 fit: 'shrink' 自动缩小字号 */
  w?: number;
  /** 字号（毫米，约等于大写字母高度的 1.4 倍） */
  size: number;
  weight?: number;
  font?: FontKind;
  color?: string;
  align?: 'left' | 'center' | 'right';
  fit?: 'shrink';
  letterSpacing?: number;
  uppercase?: boolean;
  /** 旋转角度（度），以 (x, y) 为中心 */
  rotate?: number;
  /** 烫金 / 镭射文字：同时写入 foil 蒙版 */
  foil?: FoilKind;
};

export type Region =
  | TextRegion
  | ({
      kind: 'rect';
      fill?: string;
      stroke?: string;
      lineWidth?: number;
      radius?: number;
      foil?: FoilKind;
    } & Box)
  | {
      kind: 'line';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
      width: number;
      dash?: number[];
    }
  | ({ kind: 'barcode'; bind: string; symbology: 'qr' | 'pdf417' | 'linear'; color?: string } & Box)
  /** 只写入 foil 蒙版、不画颜色的区域 */
  | ({ kind: 'foil'; foil: FoilKind } & Box);

export type FontKind = 'sans' | 'serif' | 'mono' | 'display';

export type TextFormat =
  | 'date.dot' // 2026.11.09
  | 'date.jp' // 2026年11月9日
  | 'date.jr' // 11月 9日
  | 'date.iata' // 09NOV
  | 'weekday.en' // MON
  | 'weekday.jp' // (月)
  | 'time'; // 18:30

export type BackDef =
  | { kind: 'plain'; color: string; material: MaterialName; lines?: string[]; lineColor?: string }
  | { kind: 'magnetic' };
