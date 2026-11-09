import { renderThumbnailDataUrl } from '@mogiri/renderer';
import { createTicket, db as defaultDb, type MogiriDB, type TicketCreateInput } from '../data';
import { toTicketSpec } from './ticket-spec';

const SEED_META_KEY = 'seed_v1_done';

/**
 * 首次启动时的示例票根集合（全部使用虚构数据，符合 GEMINI.md 隐私规范）。
 * 包含镭射演唱会票、JR 新干线磁气券、登机牌、热敏电影票、烫金音乐剧票，含经纬度用于足迹地图展示。
 */
export const INITIAL_SAMPLE_TICKETS: TicketCreateInput[] = [
  {
    type: 'concert',
    title: 'STARLIGHT PARADE',
    subtitle: '東京ドーム 2DAYS — DAY 2',
    eventAt: '2026-11-21T18:00',
    eventTz: 'Asia/Tokyo',
    venueName: '東京ドーム',
    city: '東京',
    country: 'JP',
    lat: 35.7056,
    lng: 139.7519,
    seat: 'アリーナ A3 12列 34番',
    priceAmount: 11000,
    priceCurrency: 'JPY',
    details: {
      artist: 'Hoshino Lumi',
      tour: 'LIVE TOUR 2026',
      doorsAt: '16:30',
      entryNo: 'A-0347',
    },
    material: 'foil-holo',
    templateId: 'concert-holo-v1',
    wear: { torn: false, punches: [], age: 0 },
    source: 'local',
    note: 'アンコールのレーザー演出と銀テープが最高だった！',
    rating: 5,
    tags: ['推し活', 'Live', '2026'],
    companions: ['Mika'],
    status: 'active',
  },
  {
    type: 'train',
    title: 'のぞみ 21号 東京→新大阪',
    subtitle: '乗車券・新幹線特急券',
    eventAt: '2026-11-09T09:30',
    eventTz: 'Asia/Tokyo',
    venueName: '東京駅',
    city: '東京',
    country: 'JP',
    lat: 35.6812,
    lng: 139.7671,
    seat: '12番A席',
    priceAmount: 14720,
    priceCurrency: 'JPY',
    details: {
      kind: '乗車券・新幹線特急券',
      operator: 'JR東海',
      trainName: 'のぞみ 21号',
      from: '東京',
      to: '新大阪',
      car: '7',
      seatClass: '指定席',
      issued: '2026.11.-2 東京駅 MR発行',
      serial: '20142-01',
    },
    material: 'magnetic',
    templateId: 'jr-magnetic-v1',
    wear: { torn: false, punches: [{ x: 10, y: 28 }], age: 0.12 },
    source: 'local',
    note: '富士山側の窓席。新大阪まで2時間半の旅。',
    rating: 5,
    tags: ['新幹線', '関西遠征'],
    companions: [],
    status: 'active',
  },
  {
    type: 'flight',
    title: 'MG 0517 HND → CTS',
    subtitle: 'Tokyo Haneda to Sapporo New Chitose',
    eventAt: '2026-10-18T10:15',
    eventTz: 'Asia/Tokyo',
    venueName: '羽田空港 第2ターミナル',
    city: '札幌',
    country: 'JP',
    lat: 42.7752,
    lng: 141.6923,
    seat: '23A',
    priceAmount: 24800,
    priceCurrency: 'JPY',
    details: {
      airline: 'MOGIRI AIR',
      from: 'HND',
      fromName: 'Tokyo Haneda',
      to: 'CTS',
      toName: 'Sapporo New Chitose',
      flightNo: 'MG 0517',
      boardingTime: '09:45',
      gate: '62',
      cabin: 'Economy',
    },
    material: 'cardstock',
    templateId: 'boarding-pass-v1',
    wear: { torn: true, punches: [], age: 0 },
    source: 'local',
    note: '北海道オータムトリップ。搭乗口で半券が切り離された記念。',
    rating: 4,
    tags: ['北海道', 'フライト'],
    companions: ['Ken'],
    status: 'active',
  },
  {
    type: 'movie',
    title: '銀河鉄道の夜 2026',
    subtitle: 'IMAX レーザー 字幕版',
    eventAt: '2026-10-03T19:15',
    eventTz: 'Asia/Tokyo',
    venueName: 'TOHOシネマズ 新宿',
    city: '東京',
    country: 'JP',
    lat: 35.6951,
    lng: 139.7017,
    seat: 'G-14',
    priceAmount: 2200,
    priceCurrency: 'JPY',
    details: {
      cinema: 'TOHOシネマズ 新宿',
      screen: 'SCREEN 10',
      format: 'IMAX',
    },
    material: 'thermal',
    templateId: 'movie-thermal-v1',
    wear: { torn: false, punches: [], age: 0.22 },
    source: 'local',
    note: '音響と映像美に圧倒された夜。感熱紙が消える前にデジタル保存。',
    rating: 5,
    tags: ['IMAX', '映画'],
    companions: [],
    status: 'active',
  },
  {
    type: 'theater',
    title: 'Les Étoiles de Minuit',
    subtitle: '帝国劇場 特別公演',
    eventAt: '2026-09-14T13:30',
    eventTz: 'Asia/Tokyo',
    venueName: '帝国劇場',
    city: '東京',
    country: 'JP',
    lat: 35.6764,
    lng: 139.7611,
    seat: '1階 S席 E列 18番',
    priceAmount: 16500,
    priceCurrency: 'JPY',
    details: {
      company: 'GRAND MUSICAL COMPANY',
      doorsAt: '12:45',
    },
    material: 'foil-gold',
    templateId: 'theater-classic-v1',
    wear: { torn: false, punches: [], age: 0.05 },
    source: 'local',
    note: 'オーケストラピットの生演奏が素晴らしかった。',
    rating: 5,
    tags: ['ミュージカル', '観劇'],
    companions: ['Yuki'],
    status: 'active',
  },
];

export async function ensureSeedTickets(database: MogiriDB = defaultDb): Promise<void> {
  const done = await database.meta.get(SEED_META_KEY);
  if (done) return;
  const count = await database.tickets.count();
  if (count > 0) {
    await database.meta.put({ key: SEED_META_KEY, value: true });
    return;
  }

  for (const sample of INITIAL_SAMPLE_TICKETS) {
    const created = await createTicket(sample, database);
    if (typeof document !== 'undefined') {
      try {
        const thumbDataUrl = renderThumbnailDataUrl(toTicketSpec(created), 560);
        await database.tickets.update(created.id, { thumbDataUrl });
      } catch {
        // 非浏览器环境跳过缩略图生成
      }
    }
  }
  await database.meta.put({ key: SEED_META_KEY, value: true });
}
