import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

/** Renders an FTS snippet with <<highlighted>> terms as soft marks. */
export function Snippet({ text, className = "" }: { text: string; className?: string }) {
  const parts: ReactNode[] = [];
  const regex = /<<(.*?)>>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <mark key={i++} className="rounded bg-ember-500/25 px-0.5 text-ember-300">
        {match[1]}
      </mark>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={className}>{parts}</span>;
}

/* ------------------------------------------------------------------ button -- */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ember-500 text-ink-950 hover:bg-ember-400 shadow-[0_10px_30px_-12px_rgba(224,127,44,0.7)]",
  secondary: "bg-ink-700 text-paper-100 hover:bg-ink-600 border border-white/5",
  ghost: "bg-transparent text-paper-200 hover:bg-white/5 border border-white/10",
  danger: "bg-red-500/90 text-white hover:bg-red-500",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2.5 text-sm"
      } ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- card -- */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-ink-850/80 backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- input -- */

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-paper-300/70">
      {children}
    </span>
  );
}

const fieldBase =
  "w-full rounded-xl border border-white/10 bg-ink-900/80 px-3.5 py-2.5 text-sm text-paper-100 outline-none transition focus:border-ember-500/70 focus:ring-2 focus:ring-ember-500/20 placeholder:text-paper-300/30";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${fieldBase} ${className}`} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldBase} resize-none ${className}`} />;
}

/* ------------------------------------------------------------------ badge -- */

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ember" | "mint" | "warn";
}) {
  const tones = {
    neutral: "bg-white/5 text-paper-200 border-white/10",
    ember: "bg-ember-500/15 text-ember-400 border-ember-500/25",
    mint: "bg-mint-500/15 text-mint-400 border-mint-500/25",
    warn: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- spinner -- */

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-paper-300/80">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-paper-300/30 border-t-ember-400" />
      {label}
    </span>
  );
}

/* ---------------------------------------------------------------- surface -- */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.2em] text-ember-400/80">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-3xl font-semibold text-paper-100">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-paper-300/70">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-ink-900/40 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ember-400/80">{icon}</div>}
      <p className="font-display text-lg text-paper-100">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-paper-300/60">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ modal -- */

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${width} max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-ink-850 p-6 shadow-2xl`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl text-paper-100">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-paper-300/60 transition hover:bg-white/5 hover:text-paper-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-ink-900/60 px-4 py-3">
      <div className="font-display text-2xl text-paper-100">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-paper-300/50">{label}</div>
    </div>
  );
}
