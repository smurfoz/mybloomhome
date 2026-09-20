import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('rounded-xl border border-concrete-200 bg-white shadow-sm', className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-navy-950">{title}</h1>
        {description && <p className="mt-1 text-sm text-concrete-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs',
        variant === 'primary' && 'bg-navy-900 text-white hover:bg-navy-800',
        variant === 'secondary' && 'border border-concrete-300 bg-white text-concrete-800 hover:bg-concrete-50',
        variant === 'ghost' && 'text-concrete-600 hover:bg-concrete-100',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className
      )}
      {...props}
    />
  );
}

export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
}: {
  href: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition',
        size === 'md' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs',
        variant === 'primary' && 'bg-navy-900 text-white hover:bg-navy-800',
        variant === 'secondary' && 'border border-concrete-300 bg-white text-concrete-800 hover:bg-concrete-50',
        variant === 'ghost' && 'text-concrete-600 hover:bg-concrete-100',
        className
      )}
    >
      {children}
    </Link>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-md border border-concrete-300 bg-white px-3 py-2 text-sm text-navy-950 placeholder-concrete-400 focus:border-navy-500 focus:outline-none focus:ring-1 focus:ring-navy-500',
        props.className
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'w-full rounded-md border border-concrete-300 bg-white px-3 py-2 text-sm text-navy-950 focus:border-navy-500 focus:outline-none focus:ring-1 focus:ring-navy-500',
        props.className
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'w-full rounded-md border border-concrete-300 bg-white px-3 py-2 text-sm text-navy-950 placeholder-concrete-400 focus:border-navy-500 focus:outline-none focus:ring-1 focus:ring-navy-500',
        props.className
      )}
    />
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-concrete-700">
        {label}
      </label>
      {children}
    </div>
  );
}

const TONE_CLASSES: Record<string, string> = {
  slate: 'bg-concrete-100 text-concrete-700',
  blue: 'bg-blue-50 text-blue-700',
  amber: 'bg-amber-50 text-amber-700',
  green: 'bg-green-50 text-green-700',
  red: 'bg-red-50 text-red-700',
  purple: 'bg-purple-50 text-purple-700',
  navy: 'bg-navy-900/10 text-navy-900',
};

export function Badge({ tone = 'slate', children }: { tone?: keyof typeof TONE_CLASSES; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', TONE_CLASSES[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-concrete-300 bg-concrete-50/50 px-6 py-14 text-center">
      <p className="text-sm font-medium text-concrete-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-concrete-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'navy',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'navy' | 'amber' | 'green' | 'red';
}) {
  const barTone: Record<string, string> = {
    navy: 'bg-navy-700',
    amber: 'bg-amber-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
  };
  return (
    <Card className="relative overflow-hidden p-5">
      <div className={cn('absolute inset-x-0 top-0 h-1', barTone[tone])} />
      <p className="text-xs font-medium uppercase tracking-wide text-concrete-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-navy-950">{value}</p>
      {hint && <p className="mt-1 text-xs text-concrete-500">{hint}</p>}
    </Card>
  );
}
