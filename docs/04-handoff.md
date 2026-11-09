# 04 · 交接文档（Handoff）

> 版本 v0.3 · 2026-11-09
> 这份文档写给接手开发的人（或 AI 助手）：**已经完成了什么、公开接口是什么、接下来按什么顺序做什么。**
> 项目规范见 [03-development.md](./03-development.md)，AI 助手的工作规则见仓库根目录的 [GEMINI.md](../GEMINI.md)。

---

## 1. 现状一览

| 模块                                                                          | 状态                      | 位置                                          |
| ----------------------------------------------------------------------------- | ------------------------- | --------------------------------------------- |
| Monorepo 骨架（pnpm workspace、TypeScript、Biome、Vitest）                    | ✅ 完成                   | 根目录                                        |
| 共享数据结构（票型、扩展字段、识别结果 Schema）                               | ✅ 完成                   | `packages/shared/src/{ticket,recognition}.ts` |
| **本地识别引擎**（规则解析、三级识别的决策和合并）                            | ✅ 完成                   | `packages/shared/src/recognize/`              |
| **登机牌条码 BCBP 解析**                                                      | ✅ 完成                   | `packages/shared/src/bcbp/`                   |
| **云端兜底的提示词、Schema、模型接口**                                        | ✅ 完成（不含 HTTP 调用） | `packages/shared/src/ai/`                     |
| **仿真渲染引擎**（M0 + 全部 8 种票型模板 + 离屏缩略图合成器 + T1 降级合成）   | ✅ 完成                   | `packages/renderer/`                          |
| **主应用 `apps/app`**（M1 本地核心 + M2 扫描透视裁切与识别确认 + 回顾与足迹） | ✅ 完成                   | `apps/app/`                                   |
| Supabase 后端迁移与 Edge Function、Capacitor 原生壳与 OCR 插件                | ⬜ 待接手                 | 见 §5                                         |

---

## 2. 仿真渲染引擎 `@mogiri/renderer`

### 2.1 运行

```bash
npx -y pnpm@10 dev:renderer   # 渲染器演示页 http://localhost:5174
npx -y pnpm@10 dev            # 主应用 apps/app
```
演示页右上角的面板可以切换票、材质、档位、翻面、加打孔、重置副券。
URL 参数可以固定画面，用于截图对比测试：
`/?ticket=0&tiltX=0.3&tiltY=0.2&quality=high&flipped=0&ui=0`（`ticket`：0 演唱会，1 JR，2 登机牌；`ui=0` 隐藏面板）。

### 2.2 用法

```tsx
import {
  TicketCanvas,
  TicketView,
  TicketFallback,
  detectQuality,
  renderThumbnailDataUrl,
  type TicketSpec,
} from '@mogiri/renderer';

// App 里全局只挂载一个 TicketCanvas（iOS 对 WebGL 上下文数量有限制），详情页之间通过 GlobalTicketStageHost 切换 TicketView
<TicketCanvas quality="high">
  <TicketView spec={spec} quality="high" flipped={flipped} onTear={() => saveWear({ ...spec.wear, torn: true })} />
</TicketCanvas>

// 低端机 / 减弱动态效果（内部调用 renderTicketCardCanvas 完整绘制箔面、打孔、撕裂边缘与泛黄）：
<TicketFallback spec={spec} />

// 离屏生成票夹列表缩略图：
const thumbUrl = renderThumbnailDataUrl(spec, 560);
```

`TicketSpec`（`packages/renderer/src/types.ts`）是渲染器自己的数据结构，**不依赖 `@mogiri/shared`**。`apps/app/src/domain/ticket-spec.ts` 提供了 `toTicketSpec(ticket, images)` 转换函数：把票据字段平铺成 `fields`（例如 `details.flightNo`），按票型选择 `DEFAULT_TEMPLATE_BY_TYPE[ticket.type]`，扫描模式下传入 `faceImage` / `backImage`。

### 2.3 已实现

| 需求               | 实现                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RENDER-01 扫描模式 | `spec.faceImage` / `backImage` 作为纹理，叠加纸张法线和光照                                                                                                                           |
| RENDER-02 生成模式 | 8 个模板覆盖全部票型：`concert-holo-v1`、`jr-magnetic-v1`、`boarding-pass-v1`、`movie-thermal-v1`、`theater-classic-v1`、`sports-pass-v1`、`exhibition-minimal-v1`、`generic-stub-v1` |
| RENDER-03 材质     | `paper` / `thermal` / `cardstock` / `foil-holo` / `foil-gold` / `magnetic`（`materials/ticket-material.ts`）                                                                          |
| RENDER-04 倾斜     | 指针、陀螺仪（以第一次读数为基准，缓慢跟随）、空闲时自动摆动；阻尼平滑，±18°                                                                                                          |
| RENDER-05 翻面     | `flipped` 属性                                                                                                                                                                        |
| RENDER-06 撕副券   | 沿打孔线拖动副券（竖放时向上拖），超过 18mm 撕下飞出；主券和副券共用一条噪声锯齿线，边缘互补                                                                                          |
| RENDER-07 打孔     | `wear.punches`（蒙版 B 通道镂空）。**印章还没做**                                                                                                                                     |
| RENDER-08 岁月效果 | `wear.age`：纸张泛黄、墨色变淡                                                                                                                                                        |
| RENDER-10 降级     | `detectQuality()`（detect-gpu）+ `FpsMonitor` 运行时降档；`TicketFallback` 使用 `renderTicketCardCanvas` 绘制完整箔面、撕裂边缘与打孔                                                 |
| 缩略图与卡片导出   | `export/thumbnail.ts`：`renderTicketCardCanvas`、`renderThumbnailDataUrl`、`renderThumbnailBlob`                                                                                      |
| 手机竖屏           | `layout="auto"`：竖屏时把长票旋转 90° 竖着显示                                                                                                                                        |

**Shader 设计**（`shaders/ticket-shader.ts`）：一个 Shader 覆盖所有材质和正反面。光照是解析式的「摄影棚」（渐变天空 + 两块柔光箱），不需要 HDRI 文件；倾斜时柔光箱的反射在票面上移动，形成光泽。镭射 = 银色金属底 + 随视角移动的彩虹色带 + 防伪图案 + 闪粉；烫金 = 金色金属 + 拉丝噪声。深色油墨区域会自动盖住箔面。

### 2.4 渲染器的已知问题和待办

- [ ] **字体**：现在用系统字体（Hiragino / Noto / PingFang）。上线前要打包 Noto Sans JP / SC 的子集，并确认授权（03 §5.2）。
- [ ] **detect-gpu** 默认从 unpkg CDN 下载跑分数据：上线前自己托管，然后传 `benchmarksURL`。
- [ ] **印章**（RENDER-07）和**扫描模式的镭射区域画笔**（RENDER-09）：需要给 `TicketSpec` 加一个 `foilMask` 输入，写进蒙版的 R / G 通道。
- [ ] **原生陀螺仪**：Web 用 `DeviceOrientationEvent`（iOS 要先调用 `requestMotionPermission()`）；原生 App 要在 platform 层接 `@capacitor/motion`，然后通过 `tilt` 属性传进来，或者扩展 `createTiltController`。
- [ ] **截图对比测试**（`pnpm test:visual`）：演示页的 URL 参数已经准备好了。用 Playwright 截图时要加 `--use-angle=swiftshader` 启动参数（无头浏览器没有 GPU）。

> [!IMPORTANT]
> 改 Shader 或模板后，必须在演示页上看过正面、背面、不同倾斜角度，以及撕副券的效果，再提交。

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

- 测试共 225 个，全部通过；其中 `shared` 193 个、`renderer` 16 个、`app` 16 个。
- fixtures：各字段准确率 100%；**本地识别完成率 6/9 = 67%**（JR × 2、登机牌、TOHO、万达、英文棒球直接完成；两张演唱会票和韩文展览按预期走云端文字模式，它们的日期、座位、价格都在本地提取对了，只有标题置信度不够）。

---

## 4. 主应用 `apps/app`（已完成 M1 + M2 本地闭环）

严格遵循 `routes → features → domain → data → platform` 单向依赖与离线优先架构：

- **`src/platform/`**：
  - `perspective.ts`：8×9 高斯消元单应性矩阵（Homography）求解与 Canvas2D 透视拉正（`computeHomography`、`warpPerspectiveToCanvas`）。
  - `ocr.ts`：原生 Capacitor OCR 插件调用协议（`runNativeOcr`）+ 4 套内置真机识别预设样本（JR 新干线、羽田→新千岁 BCBP 登机牌、TOHO 电影票、东京巨蛋演唱会票）。
  - `share.ts`：Web Share API / 本地文件下载与 Blob 转换。
- **`src/data/`**：
  - `db.ts` & `schemas.ts`：Dexie IndexedDB（`tickets`、`media`、`blobs`、`outbox`、`meta`）+ 完整 Zod 校验。
  - `tickets.repo.ts` & `media.repo.ts`：票据与照片 CRUD 与 `outbox` 严格同事务提交；30 天回收站软删除、恢复与到期自动清理；JSON 全量备份导出与 Zod 校验导入。
  - `sync.ts`：LWW（Last-Write-Wins，`deletedAt` 优先）合并函数 `mergeLwwRecord` 与退避同步调度器 `SyncScheduler`。
- **`src/domain/`**：
  - `time.ts`：不依赖 `new Date(string)` 的本地活动时间解析、排序、即将到来倒计时计算。
  - `ticket-spec.ts`：`TicketRecord → TicketSpec` 桥接。
  - `timeline.ts`：多维筛选（票型 / 年份 / 标签 / 关键词）、按年/月倒序分组、年度回顾统计 `computeRecapStats`。
  - `recognition-bridge.ts`：将识别输出转为表单草稿，并提取置信度 < 0.8 的字段列表供确认页高亮。
- **`src/ui/` & `src/features/` & `src/routes/`**：
  - `GlobalTicketStageHost.tsx`：全局唯一 `<TicketCanvas>` 实例，详情页挂载 `#mogiri-stage-slot` 时自动贴合覆盖，避免多 WebGL 上下文崩溃。
  - 完整路由：`/`（时间轴票夹堆叠/网格视图）、`/scan`（照片四角透视裁切 + 本地识别实测台）、`/scan/confirm`（识别路由状态 + 低置信度字段高亮确认）、`/t/$id`（3D 舞台交互、翻面、撕副券、打孔、泛黄、高清 PNG 海报导出、现场照片墙）、`/t/$id/edit` & `/t/new/edit`（8 票型动态表单）、`/recap/$year`（年度统计）、`/map`（足迹地图）、`/settings`（中/日/英切换、渲染档位、JSON 备份导入导出、回收站恢复）。

---

## 5. 剩余任务（留给后续开发）

1. **Capacitor 7 原生壳与 OCR 插件（`packages/capacitor-ocr`）**：
   - 接口已在 `apps/app/src/platform/ocr.ts` 定义（`recognize({ imagePath, languages }) → { lines: OcrLine[] }`）。
   - iOS 用 `VNRecognizeTextRequest`，Android 用 ML Kit Text Recognition v2；注意把 Vision 左下角坐标系翻转为左上角原点相对坐标。
2. **Supabase 后端（`supabase/`）**：
   - 按 [02 §7.2](./02-architecture.md#72-服务端表结构postgres启用-rls) 创建 `profiles`、`tickets`、`ticket_media`、`recognition_jobs`、`entitlements` 表与 RLS 策略。
   - 实现 `supabase/functions/recognize` Edge Function：调用 `@mogiri/shared/ai` 的提示词与 `parseModelOutput()`，对接 Gemini Flash Lite / Flash。
   - 在 `apps/app/src/data/sync.ts` 中注入 `SyncTransport`，对接 Supabase 增量拉取（`server_seq > lastPulledSeq`）与上传。
3. **真实票据 OCR 样本扩充**：
   - 用真机导出真实票据的 OCR JSON，补充到 `packages/shared/src/recognize/fixtures/`，运行 `npx vitest run` 校验准确率。
