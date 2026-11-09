// 让 TypeScript 认识 Vite / Vitest 的 import.meta.glob（只在测试里用来加载 fixtures）。
// 不依赖 vite/client 类型，避免给 shared 包引入额外依赖。
interface ImportMeta {
  glob<T = unknown>(
    pattern: string | string[],
    options: { eager: true; import?: string },
  ): Record<string, T>;
}
