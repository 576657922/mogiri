/**
 * 渲染器的公开类型。渲染器不依赖 apps/app，也不依赖 @mogiri/shared：
 * 调用方把业务数据转换成 TicketSpec 再交给渲染器。
 */

export type MaterialName =
  | 'paper'
  | 'thermal'
  | 'cardstock'
  | 'foil-holo'
  | 'foil-gold'
  | 'magnetic';

/** 毫米坐标下的点 */
export type PointMm = { x: number; y: number };

export type Wear = {
  /** 副券是否已经撕下 */
  torn: boolean;
  /** 检票打孔位置（毫米，左上角为原点） */
  punches: PointMm[];
  /** 岁月效果 0..1（热敏纸泛黄、褪色） */
  age: number;
};

export type TicketSpec = {
  id: string;
  /** 模板 id，见 templates/index.ts。扫描模式下只用它决定尺寸、副券位置和背面 */
  templateId: string;
  /** 正面材质 */
  material: MaterialName;
  /** 模板中 bind 引用的字段，例如 title / eventAt / seat / details.flightNo */
  fields: Record<string, string>;
  /** 扫描模式：正面扫描图（已经裁切校正）。有值时不按模板绘制正面 */
  faceImage?: TexImageSource;
  /** 扫描模式：背面扫描图 */
  backImage?: TexImageSource;
  /** 覆盖模板尺寸（毫米），扫描异形票时使用 */
  sizeMm?: { w: number; h: number };
  wear: Wear;
};

export type TexImageSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

/** 渲染档位，见 02-architecture §5.5 */
export type QualityTier = 'high' | 'mid' | 'low';
