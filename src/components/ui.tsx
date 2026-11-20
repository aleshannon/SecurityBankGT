import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { passwordStrength } from '@/domain/format'

export const fieldClass = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-accent'

const tones = {
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-900',
  warn: 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-900',
  danger: 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950 dark:text-rose-100 dark:ring-rose-900',
  info: 'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950 dark:text-sky-100 dark:ring-sky-900',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700',
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof tones }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>
}

export function Button({
  children,
  tone = 'primary',
  type = 'button',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'accent' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-navy text-white hover:bg-[#12325c]',
    accent: 'bg-accentink text-white hover:bg-[#0a5c57]',
    ghost: 'border border-line bg-surface text-ink hover:bg-canvas',
    danger: 'bg-rose-700 text-white hover:bg-rose-800',
  }
  return (
    <button type={type} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${styles[tone]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="block text-xs text-rose-700">{error}</span> : null}
    </label>
  )
}

export function TextInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldClass} ${className}`} {...props} />
}

export function SelectInput({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${fieldClass} ${className}`} {...props} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${fieldClass} min-h-24`} {...props} />
}

export function PasswordMeter({ password }: { password: string }) {
  const score = passwordStrength(password)
  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Fuerte', 'Muy fuerte']
  const colors = ['bg-rose-500', 'bg-orange-500', 'bg-amber-400', 'bg-lime-500', 'bg-emerald-600']
  if (!password) return null
  return (
    <div className="space-y-1">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={`h-1.5 flex-1 rounded-full ${index < score ? colors[score] : 'bg-line'}`} />
        ))}
      </div>
      <p className="text-xs text-muted">Fortaleza: {labels[score]}. Mínimo 12 caracteres, con mayúscula, número y símbolo.</p>
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function KpiCard({ label, value, hint, tone = 'info' }: { label: string; value: string; hint?: string; tone?: 'ok' | 'warn' | 'danger' | 'info' }) {
  const bar = { ok: 'bg-emerald-500', warn: 'bg-amber-400', danger: 'bg-rose-600', info: 'bg-accent' }
  return (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className={`mb-3 h-1 w-10 rounded-full ${bar[tone]}`} />
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </article>
  )
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface p-4 shadow-card ${className}`}>{children}</section>
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p>
    </div>
  )
}

export function SkeletonRows() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-lg bg-line/70" />
      ))}
    </div>
  )
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (page: number) => void }) {
  return (
    <div className="mt-4 flex flex-col gap-2 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
      <p>{total} registros</p>
      <div className="flex items-center gap-2">
        <Button tone="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
        <span className="min-w-16 text-center">{page} / {pages}</span>
        <Button tone="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Siguiente</Button>
      </div>
    </div>
  )
}

export function Modal({ open, title, onClose, children, wide = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/55 p-3 sm:items-center" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="dialog-title" className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-surface p-5 shadow-card ${wide ? 'max-w-3xl' : 'max-w-xl'}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="dialog-title" className="text-lg font-semibold">{title}</h2>
          <button type="button" className="rounded-lg p-1 text-muted hover:bg-canvas" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill={light ? '#13A89E' : '#0B2545'} />
        <path d="M16 6.2 24.2 9.6v6c0 4.8-3.1 8.1-8.2 10-5.1-1.9-8.2-5.2-8.2-10v-6L16 6.2Z" fill={light ? '#0B2545' : '#13A89E'} />
      </svg>
      <span className={`text-base font-semibold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>SecurityBankGT</span>
    </span>
  )
}

export function fieldErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}
