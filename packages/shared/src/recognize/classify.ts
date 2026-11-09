import type { TicketType } from '../ticket';

/**
 * 票型判断：按各语言的关键词打分（02-architecture §6.5 ①）。
 * 权重：3 = 强特征（几乎只出现在这种票上），2 = 中等，1 = 弱特征（多种票都可能出现）。
 * 每个关键词只计一次。
 */
type Keyword = [RegExp, number];

const KEYWORDS: Record<Exclude<TicketType, 'other'>, Keyword[]> = {
  train: [
    [/乗車券/, 3],
    [/特急券/, 3],
    [/新幹線/, 3],
    [/号車|号车|車厢|车厢|호차/, 3],
    [/グリーン券|グリーン車/, 3],
    [/指定席|自由席/, 2],
    [/\bJR\b|ＪＲ/, 2],
    [/高铁|動車|动车|车次|二等座|一等座|商务座|检票口|検札|铁路|鐵路/, 3],
    [/\bKTX\b|열차|승차권/, 3],
    [/のぞみ|ひかり|こだま|はやぶさ|やまびこ|こまち|かがやき|はくたか/, 2],
    [/\d{1,2}:\d{2}\s*発|発車|下車前途無効|途中下車/, 2],
    [/(?<![A-Z0-9])[GDC]\d{1,4}次?(?![A-Z0-9])/, 1],
    [/\bRAIL\b|\bTRAIN\b|\bCOACH\b/i, 2],
  ],
  flight: [
    [/BOARDING\s*PASS/i, 3],
    [/搭乗券|登机牌|登機證|登機牌|탑승권/, 3],
    [/\bGATE\b|搭乗口|登机口|登機門|탑승구|게이트/i, 2],
    [/\bFLIGHT\b|航班|便名|항공편/i, 2],
    [/\bAIRLINES?\b|\bAIRWAYS\b|航空/i, 2],
    [/\bBOARDING\b|搭乗開始|登机时间|탑승\s*시간/i, 1],
    [/\bSEQ\b|\bZONE\b|\bPNR\b/i, 1],
  ],
  movie: [
    [/スクリーン|SCREEN|影厅|影廳|号厅|상영관/i, 3],
    [/シネマ|CINEMA|影城|影院|电影院|映画館|극장|시네마|MOVIX|メガボックス|메가박스|CGV/i, 3],
    [/上映|放映|开映|상영/, 2],
    [/劇場版|映画|电影|電影|영화/, 2],
    [/\bIMAX\b|\b4DX\b|\bMX4D\b|DOLBY|SCREENX|\b[23]D\b|字幕|吹替|配音/i, 2],
    [/鑑賞券|观影/, 2],
  ],
  concert: [
    [/\bLIVE\b|ライブ|라이브/i, 2],
    [/\bTOUR\b|ツアー|巡演|투어/i, 2],
    [/整理番号|入场序号|입장\s*번호/, 3],
    [/演唱会|演唱會|音乐会|音樂會|コンサート|CONCERT|콘서트/i, 3],
    [/開場|开场|OPEN/i, 1],
    [/開演|开演|START/i, 1],
    [/入场|入場/, 1],
    [/\bFES\b|フェス|音楽祭|音乐节/i, 2],
    [/アリーナ|ARENA|スタンド/i, 1],
    [/ドーム|DOME|ZEPP|ライブハウス/i, 1],
    [/공연/, 1],
  ],
  theater: [
    [/劇団|剧团|劇團|극단/, 3],
    [/ミュージカル|音乐剧|音樂劇|MUSICAL|뮤지컬/i, 3],
    [/话剧|話劇|舞台|戏剧|戲劇|演劇|연극|歌舞伎|宝塚|狂言|能楽/, 3],
    [/劇場(?!版)|剧场|剧院|THEATRE|극장/i, 2],
    [/公演|演出/, 1],
    [/開演|开演|開場|开场/, 1],
    [/幕間|休憩|中场休息|인터미션/, 2],
  ],
  sports: [
    [/(?<![A-Z])VS\.?(?![A-Z])|\s対\s|\s×\s/i, 3],
    [/スタジアム|STADIUM|球場|球场|경기장|야구장/i, 2],
    [/試合|比赛|比賽|MATCH|GAME|경기/i, 2],
    [/リーグ|LEAGUE|联赛|聯賽|杯|CUP|リーグ戦|プロ野球|J1|NPB|NBA|MLB|KBO/i, 2],
    [/ホーム|アウェイ|主队|客队|HOME|AWAY/i, 1],
    [/内野|外野|[一三]塁側|バックスタンド|ゴール裏|看台/, 2],
    [/KICK\s*-?OFF|試合開始|开赛/i, 2],
  ],
  exhibition: [
    [/展覧会|展覧|展览|展覽|EXHIBITION|전시/i, 3],
    [/美術館|美术馆|博物館|博物馆|MUSEUM|GALLERY|ギャラリー|미술관|박물관/i, 3],
    [/観覧券|入館|入馆|参观|觀覽|관람/, 2],
    [/有効期限|有效期|VALID/i, 1],
    [/特別展|企画展|特展/, 2],
  ],
};

export type Classification = {
  type: TicketType;
  confidence: number;
  scores: Partial<Record<TicketType, number>>;
};

export function scoreTypes(text: string): Partial<Record<TicketType, number>> {
  const scores: Partial<Record<TicketType, number>> = {};
  for (const [type, kws] of Object.entries(KEYWORDS) as Array<[TicketType, Keyword[]]>) {
    let s = 0;
    for (const [re, w] of kws) if (re.test(text)) s += w;
    if (s > 0) scores[type] = s;
  }
  return scores;
}

/**
 * 置信度 = 得分占比 × 强度。强度 = 1 − e^(−top/3)：一个强特征 ≈ 0.63，两个 ≈ 0.86。
 * 没有命中任何关键词时返回 other / 0.3。
 */
export function classify(text: string, opts: { hasBcbp?: boolean } = {}): Classification {
  if (opts.hasBcbp)
    return { type: 'flight', confidence: 1, scores: { flight: Number.POSITIVE_INFINITY } };
  const scores = scoreTypes(text);
  const ranked = (Object.entries(scores) as Array<[TicketType, number]>).sort(
    (a, b) => b[1] - a[1],
  );
  const top = ranked[0];
  if (!top) return { type: 'other', confidence: 0.3, scores };
  const second = ranked[1]?.[1] ?? 0;
  const share = top[1] / (top[1] + second);
  const strength = 1 - Math.exp(-top[1] / 3);
  const confidence =
    Math.round(Math.min(0.98, share * strength + (share === 1 ? 0.1 : 0)) * 100) / 100;
  return { type: top[0], confidence, scores };
}
