interface KpiCardProps {
  label: string;
  value: string | number;
  accent?: string;
  hint?: string;
}

export function KpiCard({ label, value, accent, hint }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4 shadow-card">
      <div className="flex items-center gap-2">
        {accent ? (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
        ) : null}
        <p className="text-xs font-medium uppercase leading-tight tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
