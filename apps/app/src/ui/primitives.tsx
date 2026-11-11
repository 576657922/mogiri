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
      className={`mx-auto w-full ${wide ? 'max-w-[1440px]' : 'max-w-[1160px]'} px-5 sm:px-8 ${className}`}
    >
      {children}
    </div>
  );
}

/** 轻量进入动效 */
export function Reveal({
  children,
  delay = 0,
  className = '',
  y = 8,
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
      transition={{ duration: 0.45, delay, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}

export function MaskLine({
  children,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return <span className={`block ${className}`}>{children}</span>;
}

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
    <Tag className={`label inline-flex items-center gap-2 ${className}`}>
      {index && <span className="text-faint">{index}</span>}
      <span>{children}</span>
    </Tag>
  );
}

export function SectionHead({
  index,
  title,
  aside,
  className = '',
}: {
  index?: string;
  title: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 pb-3 border-b border-line ${className}`}
    >
      <div className="flex items-baseline gap-2.5">
        {index && <span className="font-mono text-[11px] text-faint">{index}</span>}
        <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-fg">{title}</h2>
      </div>
      {aside}
    </div>
  );
}

type BtnVariant = 'solid' | 'outline' | 'accent' | 'ghost' | 'pill';

const BTN_BASE =
  'group/btn relative inline-flex items-center justify-center gap-2 rounded-full text-[13px] font-medium tracking-[-0.01em] transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap cursor-pointer';

const BTN_VARIANTS: Record<BtnVariant, string> = {
  solid: 'bg-fg text-bg-raised hover:bg-fg/85 h-9 px-4 shadow-xs',
  accent: 'bg-accent text-accent-ink hover:opacity-90 h-9 px-4 shadow-xs',
  outline:
    'border border-line-strong bg-bg-raised text-fg hover:bg-bg-subtle h-9 px-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]',
  pill: 'bg-bg-subtle text-muted hover:text-fg hover:bg-[#e8e8e5] h-8 px-3.5',
  ghost: 'text-muted hover:text-fg hover:bg-bg-subtle h-8 px-3',
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
      className={`inline-block transition-transform duration-300 group-hover/btn:translate-x-0.5 ${className}`}
    >
      →
    </span>
  );
}

/** 分段胶囊选择器（recent.design 风格） */
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
      className={`inline-flex items-center rounded-full bg-bg-subtle p-1 m-0 border-0 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`relative h-7 rounded-full px-3 text-[12px] font-medium transition-colors duration-200 cursor-pointer ${
              active ? 'text-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${ariaLabel ?? 'x'}`}
                className="absolute inset-0 rounded-full bg-bg-raised shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                transition={{ type: 'spring', stiffness: 450, damping: 35 }}
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

/** 表单字段 */
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
      <div className="flex min-h-4 items-center justify-between gap-2 mb-1.5">
        <label htmlFor={htmlFor} className="text-[12px] font-medium text-muted">
          {label}
        </label>
        {badge}
      </div>
      {children}
      {hint && <p className="mt-1 text-[11px] text-faint">{hint}</p>}
    </div>
  );
}

export function stubTilt(id: string, max = 1.6): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const unit = ((h >>> 0) % 1000) / 1000;
  return Number(((unit * 2 - 1) * max).toFixed(2));
}

export function RatingDots({ value, size = 6 }: { value: number; size?: number }) {
  return (
    <span role="img" className="inline-flex items-center gap-1" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`rounded-full transition-colors ${n <= value ? 'bg-accent' : 'bg-black/14'}`}
          style={{ width: size, height: size }}
        />
      ))}
    </span>
  );
}
