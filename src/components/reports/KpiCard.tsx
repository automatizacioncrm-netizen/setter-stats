interface KpiCardProps {
  label: string;
  value: string | number;
  accent?: string;
  hint?: string;
}

export function KpiCard({ label, value, accent, hint }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
      <div className="flex items-center gap-2">
        {accent ? (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
        ) : null}
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
