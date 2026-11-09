# 04 · 交接文档（Handoff）

> 版本 v0.2 · 2026-11-09
> 这份文档写给接手开发的人（或 AI 助手）：**已经完成了什么、公开接口是什么、接下来按什么顺序做什么。**
> 项目规范见 [03-development.md](./03-development.md)，AI 助手的工作规则见仓库根目录的 [GEMINI.md](../GEMINI.md)。

---

## 1. 现状一览

| 模块                                                       | 状态                      | 位置                                          |
| ---------------------------------------------------------- | ------------------------- | --------------------------------------------- |
| Monorepo 骨架（pnpm workspace、TypeScript、Biome、Vitest） | ✅ 完成                   | 根目录                                        |
| 共享数据结构（票型、扩展字段、识别结果 Schema）            | ✅ 完成                   | `packages/shared/src/{ticket,recognition}.ts` |
| **本地识别引擎**（规则解析、三级识别的决策和合并）         | ✅ 完成                   | `packages/shared/src/recognize/`              |
| **登机牌条码 BCBP 解析**                                   | ✅ 完成                   | `packages/shared/src/bcbp/`                   |
| **云端兜底的提示词、Schema、模型接口**                     | ✅ 完成（不含 HTTP 调用） | `packages/shared/src/ai/`                     |
| **仿真渲染引擎**（M0 的全部代码任务）                      | ✅ 完成                   | `packages/renderer/`                          |
| 主应用 `apps/app`、Supabase、Capacitor、原生 OCR 插件      | ⬜ 未开始                 | 见 §5                                         |

**做完的是「核心难点」**：渲染引擎（产品卖点）和识别引擎（决定成本）。剩下的主要是常规的 App 工程：界面、本地数据库、同步、服务端、原生壳。

---

## 2. 仿真渲染引擎 `@mogiri/renderer`

### 2.1 运行

```bash
npx -y pnpm@10 dev:renderer   # http://localhost:5174
```
演示页右上角的面板可以切换票、材质、档位、翻面、加打孔、重置副券。
URL 参数可以固定画面，用于截图对比测试：
`/?ticket=0&tiltX=0.3&tiltY=0.2&quality=high&flipped=0&ui=0`（`ticket`：0 演唱会，1 JR，2 登机牌；`ui=0` 隐藏面板）。

### 2.2 用法

```tsx
import { TicketCanvas, TicketView, TicketFallback, detectQuality, type TicketSpec } from '@mogiri/renderer';

// App 里全局只挂载一个 TicketCanvas（iOS 对 WebGL 上下文数量有限制），详情页之间切换 TicketView
<TicketCanvas quality="high">
  <TicketView spec={spec} quality="high" flipped={flipped} onTear={() => saveWear({ ...spec.wear, torn: true })} />
</TicketCanvas>

// 低端机 / 减弱动态效果：
<TicketFallback spec={spec} />

// 简单场景（演示页）：自动检测档位并选择 WebGL 或 CSS
<TicketStage spec={spec} />
```

`TicketSpec`（`packages/renderer/src/types.ts`）是渲染器自己的数据结构，**不依赖 `@mogiri/shared`**。App 需要写一个 `toTicketSpec(ticket)` 转换函数：把票据字段平铺成 `fields`（例如 `details.flightNo`），选择 `templateId`，扫描模式下传入 `faceImage` / `backImage`。

### 2.3 已实现

| 需求               | 实现                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| RENDER-01 扫描模式 | `spec.faceImage` / `backImage` 作为纹理，叠加纸张法线和光照                                                                |
| RENDER-02 生成模式 | 3 个模板：`concert-holo-v1`、`jr-magnetic-v1`、`boarding-pass-v1`（`templates/presets.ts`），Canvas2D 绘制，格式见 03 §5.2 |
| RENDER-03 材质     | `paper` / `thermal` / `cardstock` / `foil-holo` / `foil-gold` / `magnetic`（`materials/ticket-material.ts`）               |
| RENDER-04 倾斜     | 指针、陀螺仪（以第一次读数为基准，缓慢跟随）、空闲时自动摆动；阻尼平滑，±18°                                               |
| RENDER-05 翻面     | `flipped` 属性                                                                                                             |
| RENDER-06 撕副券   | 沿打孔线拖动副券（竖放时向上拖），超过 18mm 撕下飞出；主券和副券共用一条噪声锯齿线，边缘互补                               |
| RENDER-07 打孔     | `wear.punches`（蒙版 B 通道镂空）。**印章还没做**                                                                          |
| RENDER-08 岁月效果 | `wear.age`：纸张泛黄、墨色变淡                                                                                             |
| RENDER-10 降级     | `detectQuality()`（detect-gpu）+ `FpsMonitor` 运行时降档；`TicketFallback` 是 CSS 3D 版本                                  |
| 手机竖屏           | `layout="auto"`：竖屏时把长票旋转 90° 竖着显示                                                                             |

**Shader 设计**（`shaders/ticket-shader.ts`）：一个 Shader 覆盖所有材质和正反面。光照是解析式的「摄影棚」（渐变天空 + 两块柔光箱），不需要 HDRI 文件；倾斜时柔光箱的反射在票面上移动，形成光泽。镭射 = 银色金属底 + 随视角移动的彩虹色带 + 防伪图案 + 闪粉；烫金 = 金色金属 + 拉丝噪声。深色油墨区域会自动盖住箔面。

### 2.4 渲染器的已知问题和待办

- [ ] **字体**：现在用系统字体（Hiragino / Noto / PingFang）。上线前要打包 Noto Sans JP / SC 的子集，并确认授权（03 §5.2）。
- [ ] **detect-gpu** 默认从 unpkg CDN 下载跑分数据：上线前自己托管，然后传 `benchmarksURL`。
- [ ] **CSS 降级版没有镭射效果**：箔面区域只显示底色。可以用 CSS 渐变 + `mix-blend-mode` 模拟。
- [ ] **印章**（RENDER-07）和**扫描模式的镭射区域画笔**（RENDER-09）：需要给 `TicketSpec` 加一个 `foilMask` 输入，写进蒙版的 R / G 通道。
- [ ] **缩略图离屏渲染**（M1）和**导出 PNG / MP4**（M4）：`TicketCanvas` 已经开了 `preserveDrawingBuffer`，可以用同一个渲染器、固定 `tilt` 渲染后读像素。
- [ ] **原生陀螺仪**：Web 用 `DeviceOrientationEvent`（iOS 要先调用 `requestMotionPermission()`）；原生 App 要在 platform 层接 `@capacitor/motion`，然后通过 `tilt` 属性传进来，或者扩展 `createTiltController`。
- [ ] **纸张厚度**：现在是两个平面（正面、背面）相距 0.3mm，没有侧边。倾斜 ±18° 时看不出来；如果以后要大角度旋转，需要加侧边。
- [ ] **截图对比测试**（`pnpm test:visual`）：演示页的 URL 参数已经准备好了。用 Playwright 截图时要加 `--use-angle=swiftshader` 启动参数（无头浏览器没有 GPU）。
- [ ] 演示页打包后约 400KB（gzip，含 leva 和 React）。在 App 里要单独测 three.js + R3F 分包是否在 350KB 预算内（03 §7）。

> [!IMPORTANT]
> 改 Shader 或模板后，必须在演示页上看过三种票的正面、背面、不同倾斜角度，以及撕副券的效果，再提交。

---

## 3. 本地识别引擎 `@mogiri/shared/recognize`

纯 TypeScript，不依赖平台，按 02 §6 的三级识别设计实现。

### 3.1 用法

```ts
import {
  recognizeLocal,
  decideNextStep,
  mergeResults,
  shouldEscalateToImage,
  stripSensitiveLines,
} from '@mogiri/shared/recognize';

const local = recognizeLocal(ocrLines, {
  capturedAt: exifOrNowIso, // 推断票面缺失的年份
  locale: 'ja-JP',
  barcode: zxingResult ?? undefined, // 有 BCBP 时内部自动解析，字段置信度 = 1
});
const next = decideNextStep(local, { online, quotaLeft, platform }); // 'done' | 'cloud-text' | 'cloud-image' | 'manual'
// cloud-text：发送 stripSensitiveLines(ocrLines)；结果 shouldEscalateToImage(r) 为 true 时再走图片模式（同一个 jobId）
const final = cloud ? mergeResults(local, cloud) : local.result;
```

### 3.2 结构

| 文件                       | 作用                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `normalize.ts` / `lang.ts` | 全角转半角、数字里的空格、数字上下文中的 O→0 / l→1；判断票面语言                                                           |
| `classify.ts`              | 中日英韩关键词打分判断票型                                                                                                 |
| `extract/`                 | 日期（含令和、无年份、英文、韩文）、时间（区分开场 / 开演 / 出发）、座位、价格（区分 JPY / CNY）、乘车区间、场馆、整理番号 |
| `rules/`                   | 票型专用规则：`jr.ts`、`boarding-pass.ts`、`cinema.ts`、`event.ts`（演唱会 / 话剧 / 体育 / 展览 / 其他）                   |
| `title.ts`                 | 通用标题：字号最大且不是日期 / 座位 / 价格的行，置信度 ≤ 0.6（所以演唱会票通常走云端文字模式，这是预期行为）               |
| `year.ts`                  | 缺年份推断（见 §3.4）                                                                                                      |
| `sensitive.ts`             | 订单号、姓名、会员号、长数字串的检测和过滤                                                                                 |
| `pipeline.ts`              | `recognizeLocal`、`ocrQuality`、`decideNextStep`、`mergeResults` 等                                                        |
| `config.ts`                | **所有阈值**（0.8 / 0.6 / 15 字符 / 0.5）和各票型的未来窗口                                                                |
| `fixtures/`                | 9 张合成票据的 OCR 输出 + 标注答案（JR × 2、登机牌、TOHO、万达、日文演唱会、中文演唱会、英文棒球、韩文展览）               |

`@mogiri/shared/bcbp`：`parseBcbp(raw)` 支持 M 格式 1–4 段航程、签发日期定年份、`^` 安全段；`bcbpToRecognition()` 不输出姓名和订座号（只在 `sensitive` 里标记）。`samples.ts` 可以生成测试用的 BCBP 字符串。

### 3.3 测试结果

- 测试共 209 个，全部通过；其中 shared 193 个（BCBP、规范化、各提取器、票型判断、流程、AI 输出校验、fixtures），renderer 16 个。
- fixtures：各字段准确率 100%；**本地识别完成率 6/9 = 67%**（JR × 2、登机牌、TOHO、万达、英文棒球直接完成；两张演唱会票和韩文展览按预期走云端文字模式，它们的日期、座位、价格都在本地提取对了，只有标题置信度不够）。

> [!WARNING]
> fixtures 是和规则一起写的合成数据，**上面的准确率偏乐观**。M2 必须用真机导出至少 100 张真实票据的 OCR 结果来校准（03 §5.7），改阈值前后都要跑 `npx vitest run --project shared`。

### 3.4 和 02 文档的差异

- `LocalRecognition` 多了两个可选字段：`barcodeFields`（条码得出的字段路径，合并时永远优先；日期以条码为准，时间可以取云端结果）和 `typeConfidence`。本地非条码字段的置信度最高 0.98，所以「1 = 来自条码」。
- `ocrQuality` 按有效字符数加权平均（短噪声行影响很小）；有效字符少于 15 个时一定低于 0.6。
- **缺年份推断**不是严格「不晚于拍摄时间」，而是每种票型有一个「未来窗口」：火车 31 天、航班 7 天、电影 14 天、演唱会 / 话剧 180 天、体育 120 天、展览 90 天（提前买票、活动前就扫描的情况）。票面印了星期时，以星期为准。没有 `capturedAt` 时用当天日期，置信度 × 0.8。
- 座位保留票面原文（`12番A席`、`3排5号`），车厢号单独放在 `details.car`；火车票种（`乗車券・新幹線特急券`）放在 `subtitle`。
- 识别出连锁影院时，片名置信度给 0.85，所以 TOHO、万达能本地完成。真实数据不理想的话，在 `rules/cinema.ts` 里调低。

### 3.5 识别引擎的待办

- [ ] 日文竖排、座位跨行、「标签一行 / 值一行」的多列版式（`findLabeledValue` 只看同一行和下一行）
- [ ] 欧洲小数逗号（`€12,50` 会被解析成 12）
- [ ] 城市提取；演唱会的艺人 / 巡演名拆分
- [ ] 中国铁路只做了基础支持（车次、车厢、座位），韩国 KTX 没有专用规则
- [ ] 时区现在只按语言和币种推断（置信度 0.6–0.75），航班不推断。需要 IATA 机场 → 时区表、车站 / 场馆地名表
- [ ] 安装 `@vitest/coverage-v8`，测覆盖率（03 §6 要求 ≥ 80%）

---

## 4. 云端兜底 `@mogiri/shared/ai`

只有提示词、Schema、输出校验和接口，**没有实际的 HTTP 调用**（在 Edge Function 里做）。

| 导出                            | 说明                                                                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SYSTEM_PROMPT`                 | 英文系统提示词：票型、字段规则、本地时间格式、置信度含义、敏感信息、禁止编造                                                                                                     |
| `buildTextPrompt(lines, hints)` | 文字模式：每行格式为 `[03] x= y= w= h= conf= \| text`，内部会再调用一次 `stripSensitiveLines` 作为保险                                                                           |
| `buildImagePrompt(hints)`       | 图片模式的提示词                                                                                                                                                                 |
| `toAiHints(hints)`              | 去掉条码，生成可以发送的提示信息（`AiHints` 类型里没有条码字段，从类型上保证条码发不出去）                                                                                       |
| `toJsonSchema()`                | `z.toJSONSchema(RecognitionResult)`                                                                                                                                              |
| `parseModelOutput(raw)`         | 接受对象、JSON 字符串、```json 代码块、夹在文字里的 JSON；规范化置信度（2–100 的整数按百分比处理）、日期格式、未知票型 → `other`；最后用 Zod 校验，失败时抛出 `ModelOutputError` |
| `AiProvider`                    | `recognizeText(lines, hints)` / `recognizeImage({ mimeType, data }, hints)`（02 文档写的是传 schema，实际改成传 `AiHints`，schema 由实现方自己用 `toJsonSchema()`）              |

> [!WARNING]
> **接 Gemini 之前要先确认 Schema 兼容性**：`toJsonSchema()` 输出的 `details` 是一个 record（`additionalProperties` / `propertyNames`），Gemini 旧的 `responseSchema`（OpenAPI 子集）不支持。可以用 `responseJsonSchema`，或者在 Edge Function 里把 `details` 转成 `{ key, value, confidence }` 数组，拿到结果后再转回来。

---

## 5. 剩余任务（按顺序）

每个任务完成后对照 [03 §10 完成标准](./03-development.md#10-完成标准definition-of-done)。

### 第一步：M1 本地核心（`apps/app`）

1. 新建 `apps/app`：Vite + React 19 + TanStack Router（文件路由）+ Tailwind v4 + i18next（zh-CN / ja / en）。依赖 `@mogiri/renderer` 和 `@mogiri/shared`（workspace 协议）。
2. `data/`：Dexie 表结构照抄 02 §8.1；仓储层 + 发件箱（写入和发件箱同一个事务，见 03 §5.4）。主键用 UUID v7。
3. 8 种票型的编辑表单（字段定义在 `packages/shared/src/ticket.ts` 的 `TicketDetails`）。
4. 从相册导入图片 → 手动拖四个角做透视校正 → 作为 `faceImage`。
5. 时间线（票夹视图，按年月分组，虚拟列表）。缩略图用渲染器离屏渲染（见 §2.4）。
6. 详情页：全局一个 `TicketCanvas`，里面切换 `TicketView`；写 `toTicketSpec()`；`onTear` 写回 `wear.torn`。
7. 照片、备注、评分、标签、同行人；软删除和 30 天内恢复。

### 第二步：M2 扫描与识别

1. Capacitor 7 工程；文档扫描插件（iOS VisionKit / Android ML Kit Document Scanner）。
2. **`packages/capacitor-ocr`**：接口见 02 §6.4（`recognize({ imagePath, languages }) → { lines: OcrLine[] }`）。iOS 用 `VNRecognizeTextRequest`，Android 用 ML Kit Text Recognition v2（中日韩模型打包进 App）。`box` 要换算成**左上角为原点的相对坐标**（Vision 的坐标原点在左下角，要翻转 y）。
3. zxing-wasm 读条码 → 把 `{ format, text }` 作为 `hints.barcode` 传给 `recognizeLocal()`（BCBP 会在内部解析）。同时记录条码位置，导出时打码用。
4. 识别流程编排（`features/scan/`）：`recognizeLocal()` → `decideNextStep()` → 需要时调用 `recognize` Edge Function → `mergeResults()` → 确认页。离线或额度用完走 `manual`。
5. `supabase/functions/recognize`：用 `@mogiri/shared/ai` 的提示词和 `toJsonSchema()` 调用 Gemini（结构化输出），用 `parseModelOutput()` 校验；额度控制和 `recognition_jobs` 见 02 §6.6、§10。**发送文字前调用 `stripSensitiveLines()`**。
6. 确认页：置信度低的字段高亮；「用 AI 再识别」按钮。
7. 用真机导出真实票据的 OCR 结果，补充 fixtures（03 §5.7），跑出基准。

### 第三步及以后

M3 账号与同步、M4 分享与打磨、M5 上架与付费：按 [03 §9](./03-development.md#9-里程碑与任务) 的任务清单做。

---

## 6. 和文档的差异

| 文档原来的写法                             | 实际实现                                      | 原因                                                   |
| ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------ |
| Shader 用 `vite-plugin-glsl` 导入 `*.glsl` | Shader 写在 TS 字符串里（`ticket-shader.ts`） | 少一个构建插件，渲染器包被其他项目引用时不需要额外配置 |
| 用 drei 的 `PerformanceMonitor`            | 自己写的 `FpsMonitor`                         | 渲染器包不依赖 drei，体积更小，而且可以单元测试        |
| 模板用 JSON 文件                           | 模板用带类型的 TS 对象（结构和 03 §5.2 一致） | 有类型检查；以后要做模板商店时再改成 JSON 加载         |
| Node 22                                    | 开发时用的是 Node 26，`engines` 写的是 `>=22` | 两者都可以                                             |

识别引擎的差异见 §3.4，AI 接口的差异见 §4。
