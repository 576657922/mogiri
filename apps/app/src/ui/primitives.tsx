import { motion, useReducedMotion } from 'motion/react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export function Container({
  children,
  className = '',
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`mx-auto w-full ${wide ? 'max-w-[1600px]' : 'max-w-[1360px]'} px-5 sm:px-8 lg:px-12 ${className}`}
    >
      {children}
    </div>
  );
}

/** 进入视口时淡入上移 */
export function Reveal({
  children,
  delay = 0,
  className = '',
  y = 14,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.75, delay, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}

/** 标题逐行遮罩上推 */
export function MaskLine({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <span className={`block overflow-hidden pb-[0.08em] ${className}`}>
      <motion.span
        className="block"
        initial={reduce ? false : { y: '105%' }}
        animate={{ y: '0%' }}
        transition={{ duration: 1.1, delay, ease: EASE_OUT_EXPO }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/** 等宽小标签，可带编号 */
export function Label({
  children,
  index,
  className = '',
  as: Tag = 'span',
}: {
  children: ReactNode;
  index?: string;
  className?: string;
  as?: 'span' | 'div' | 'p' | 'dt';
}) {
  return (
    <Tag className={`label inline-flex items-center gap-2.5 ${className}`}>
      {index && <span className="text-fg">{index}</span>}
      {index && <span aria-hidden className="h-px w-5 bg-line-strong" />}
      <span>{children}</span>
    </Tag>
  );
}

/** 章节标题：编号 + 衬线标题 + 发丝线 */
export function SectionHead({
  index,
  title,
  aside,
  className = '',
}: {
  index: string;
  title: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-6 border-b border-line pb-4 ${className}`}>
      <div className="flex items-baseline gap-4">
        <span className="label text-fg">{index}</span>
        <h2 className="display text-[28px] sm:text-[34px]">{title}</h2>
      </div>
      {aside}
    </div>
  );
}

type BtnVariant = 'solid' | 'outline' | 'accent' | 'ghost';

const BTN_BASE =
  'group/btn relative inline-flex items-center justify-center gap-2.5 rounded-full text-[13px] font-medium tracking-[-0.005em] transition-[background-color,color,border-color,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap';

const BTN_VARIANTS: Record<BtnVariant, string> = {
  solid: 'bg-fg text-bg hover:bg-accent hover:text-accent-ink h-11 px-5',
  accent: 'bg-accent text-accent-ink hover:bg-fg hover:text-bg h-11 px-5',
  outline: 'border border-line-strong text-fg hover:border-fg hover:bg-fg hover:text-bg h-11 px-5',
  ghost: 'text-fg hover:bg-fg/[0.06] h-9 px-3.5',
};

export function btnClass(variant: BtnVariant = 'solid', extra = ''): string {
  return `${BTN_BASE} ${BTN_VARIANTS[variant]} ${extra}`;
}

export function Btn({
  variant = 'solid',
  className = '',
  children,
  arrow = false,
  ...rest
}: ComponentPropsWithoutRef<'button'> & { variant?: BtnVariant; arrow?: boolean }) {
  return (
    <button type="button" className={btnClass(variant, className)} {...rest}>
      {children}
      {arrow && <Arrow />}
    </button>
  );
}

export function Arrow({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/btn:translate-x-1 ${className}`}
    >
      →
    </span>
  );
}

/** 文字分段选择器 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <fieldset
      aria-label={ariaLabel}
      className={`inline-flex items-center rounded-full border border-line p-[3px] m-0 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`relative h-8 rounded-full px-3.5 text-[12px] font-medium transition-colors duration-300 ${
              active ? 'text-bg' : 'text-muted hover:text-fg'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${ariaLabel ?? 'x'}`}
                className="absolute inset-0 rounded-full bg-fg"
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

/** 表单字段：等宽标签 + 下划线输入 + 提示 */
export function Field({
  label,
  htmlFor,
  hint,
  badge,
  children,
  className = '',
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex min-h-4 items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="label">
          {label}
        </label>
        {badge}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-[11.5px] text-faint">{hint}</p>}
    </div>
  );
}

/** 根据 id 生成稳定的轻微旋转角度，模拟随手放在桌上的票根 */
export function stubTilt(id: string, max = 2.2): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const unit = ((h >>> 0) % 1000) / 1000;
  return Number(((unit * 2 - 1) * max).toFixed(2));
}

/** 评分圆点 */
export function RatingDots({ value, size = 7 }: { value: number; size?: number }) {
  return (
    <span role="img" className="inline-flex items-center gap-1.5" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`rounded-full ${n <= value ? 'bg-fg' : 'border border-line-strong'}`}
          style={{ width: size, height: size }}
        />
      ))}
    </span>
  );
}
