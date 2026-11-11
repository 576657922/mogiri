import type { MaterialName } from '@mogiri/renderer';
import type { TicketType } from '@mogiri/shared';

export type TicketTypeTheme = {
  rim: string;
  tabBg: string;
  tabInk: string;
  subInk: string;
  tintBg: string;
};

/**
 * 语义化博朗 / 瑞士档案工业色系：全应用共享的票种专属色彩身份
 * - 演出 concert：博朗信号朱红（Vermilion）
 * - 列车 train：JR 新干线磁气钴蓝（Cobalt Blue）
 * - 机票 flight：航空琥珀金（Aviation Amber）
 * - 电影 movie：胶片粉青（35mm Cine Teal）
 * - 戏剧 theater：帝国炭金（Charcoal & Imperial Buff）
 * - 展览 exhibition：美术馆青瓷灰（Museum Celadon）
 * - 赛事 sports：赛场墨绿（Racing Green）
 * - 其他 other：档案暖石（Archival Stone）
 */
export const TICKET_TYPE_THEMES: Record<TicketType, TicketTypeTheme> = {
  concert: {
    rim: '#d64c35',
    tabBg: '#ebe2d6',
    tabInk: '#141413',
    subInk: '#4a453d',
    tintBg: 'rgba(214, 76, 53, 0.09)',
  },
  train: {
    rim: '#28609c',
    tabBg: '#3973b2',
    tabInk: '#f7f7f3',
    subInk: 'rgba(247, 247, 243, 0.84)',
    tintBg: 'rgba(40, 96, 156, 0.09)',
  },
  flight: {
    rim: '#c9721e',
    tabBg: '#e4d382',
    tabInk: '#141413',
    subInk: '#474126',
    tintBg: 'rgba(201, 114, 30, 0.1)',
  },
  movie: {
    rim: '#4b8698',
    tabBg: '#9dc6d2',
    tabInk: '#141413',
    subInk: '#27424b',
    tintBg: 'rgba(75, 134, 152, 0.1)',
  },
  theater: {
    rim: '#242320',
    tabBg: '#ded8a2',
    tabInk: '#141413',
    subInk: '#45422d',
    tintBg: 'rgba(155, 126, 56, 0.11)',
  },
  exhibition: {
    rim: '#566658',
    tabBg: '#cdd6ce',
    tabInk: '#141413',
    subInk: '#384239',
    tintBg: 'rgba(86, 102, 88, 0.1)',
  },
  sports: {
    rim: '#246347',
    tabBg: '#b8d5c6',
    tabInk: '#141413',
    subInk: '#244737',
    tintBg: 'rgba(36, 99, 71, 0.1)',
  },
  other: {
    rim: '#78746b',
    tabBg: '#e3e0d8',
    tabInk: '#141413',
    subInk: '#4a4842',
    tintBg: 'rgba(120, 116, 107, 0.1)',
  },
};

export function getTicketTypeTheme(type: string): TicketTypeTheme {
  return TICKET_TYPE_THEMES[type as TicketType] ?? TICKET_TYPE_THEMES.other;
}

/**
 * 6 种仿真纸张工艺的视觉色板（用于制票台与详情检视室的材质样本圆点）
 */
export const MATERIAL_SWATCH_BG: Record<MaterialName, string> = {
  paper: 'linear-gradient(135deg, #fbfaf5 0%, #e7e3d6 100%)',
  thermal: 'linear-gradient(135deg, #f6f1e3 0%, #ddd4be 100%)',
  cardstock: 'linear-gradient(135deg, #f0ede6 0%, #cfcabe 100%)',
  'foil-holo': 'linear-gradient(135deg, #ff9bd2 0%, #8be0ff 48%, #a6ffcb 100%)',
  'foil-gold': 'linear-gradient(135deg, #f5e2a8 0%, #c89d46 52%, #8e6620 100%)',
  magnetic: 'linear-gradient(135deg, #cde5cf 0%, #89b995 52%, #2c2623 53%, #191614 100%)',
};
