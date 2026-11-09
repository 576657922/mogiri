/**
 * 生成按时间有序的 UUID v7（RFC 9562）。
 * 前 48 位为毫秒级 Unix 时间戳，离线创建时天然按时间排序。
 */

let lastTimestamp = -1;
let lastSeq = 0;

function randomBytes(len: number): Uint8Array {
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytes;
}

export function uuidv7(nowMs = Date.now()): string {
  let ts = Math.max(0, Math.floor(nowMs));
  const rand = randomBytes(10);

  if (ts === lastTimestamp) {
    lastSeq = (lastSeq + 1) & 0x0fff;
    if (lastSeq === 0) ts++;
  } else {
    lastTimestamp = ts;
    lastSeq = (((rand[0] ?? 0) << 8) | (rand[1] ?? 0)) & 0x0fff;
  }

  const bytes = new Uint8Array(16);
  // 48-bit timestamp big-endian
  bytes[0] = Math.floor(ts / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ts / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ts / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ts / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ts / 2 ** 8) & 0xff;
  bytes[5] = ts & 0xff;

  // version 7 (0111) + 12-bit sequence
  bytes[6] = 0x70 | ((lastSeq >> 8) & 0x0f);
  bytes[7] = lastSeq & 0xff;

  // variant 10xx + 62-bit random
  bytes[8] = 0x80 | ((rand[2] ?? 0) & 0x3f);
  for (let i = 0; i < 7; i++) {
    bytes[9 + i] = rand[3 + i] ?? 0;
  }

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
