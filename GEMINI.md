# GEMINI.md — Mogiri 项目说明（给 AI 编程助手）

> 产品：一个把纸质票 / 电子票变成「仿真实体票」的票根纪念册 App（暂定产品名「半券 Hanken」，仓库和代码包名用 `mogiri`）。
> 所有设计都在 `docs/` 里。**开始任何任务前先读 [docs/04-handoff.md](docs/04-handoff.md)**，里面写了已经完成什么、接下来做什么、按什么顺序做。

## 文档

| 文档                                               | 用途                                                     |
| -------------------------------------------------- | -------------------------------------------------------- |
| [docs/01-requirements.md](docs/01-requirements.md) | 需求：功能编号（SCAN-xx / OCR-xx / RENDER-xx …）和优先级 |
| [docs/02-architecture.md](docs/02-architecture.md) | 架构：技术选型、渲染引擎、三级识别流程、数据模型、同步   |
| [docs/03-development.md](docs/03-development.md)   | 开发规范、目录结构、测试策略、里程碑任务清单             |
| [docs/04-handoff.md](docs/04-handoff.md)           | **交接文档**：已完成的部分、公开接口、剩余任务           |

## 命令

本机没有全局安装 pnpm，用 `npx -y pnpm@10 <命令>`（或者先 `npm i -g pnpm@10`）。

```bash
npx -y pnpm@10 install
npx -y pnpm@10 dev:renderer      # 渲染器演示页 http://localhost:5174
npx vitest run                   # 全部单元测试
npx -y pnpm@10 typecheck         # 所有包的类型检查
npx biome check .                # 代码检查；加 --write 自动修复格式
```

## 规则（详见 docs/03-development.md §4）

- TypeScript 严格模式，禁止 `any`；所有外部数据（AI 输出、服务端返回、导入的 JSON）都要过 Zod 校验。
- 依赖方向：`routes → features → domain → data → platform`；`packages/renderer` 不能依赖 `apps/*`，也不依赖 `@mogiri/shared`。
- 平台能力（相机、陀螺仪、OCR、分享、文件）只通过 `apps/app/src/platform/` 调用，业务代码不直接 import `@capacitor/*`。
- 界面文案全部走 i18n（zh-CN / ja / en），不写死在代码里。
- 时间：票据时间是「活动当地时间 + IANA 时区」，禁止用 `new Date(string)` 解析不带时区的字符串。
- 注释用简体中文，标识符用英文。提交信息用 Conventional Commits。
- 改了架构或接口，要同时更新 `docs/`。

## 不要做的事

- 不要改 `packages/renderer/src/shaders/ticket-shader.ts` 的光照模型，除非用演示页截图对比过效果（见 04-handoff 的「渲染器」一节）。
- 不要放宽 `packages/shared/src/recognize/config.ts` 里的置信度阈值来「提高」本地识别完成率；改阈值必须跑 fixtures 测试，确认准确率没有下降。
- 不要把真实票据（姓名、订单号、条码内容）提交到仓库；fixtures 只能用假数据。
- 不要把 API 密钥写进代码或 `.env.example`；Edge Function 的密钥用 `supabase secrets set`。
