import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, CheckCircle2 } from "lucide-react";

interface ReportCardProps {
  title: string;
  description: string;
  available: boolean;
  to?: "/reports/vsl-closers" | "/reports/vsl-citas" | "/reports/vsl-calidad";
  accessible?: boolean;
  pendingLabel?: string;
  error?: string | undefined;
}

export function ReportCard({
  title,
  description,
  available,
  to,
  accessible,
  pendingLabel,
  error,
}: ReportCardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              available ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground"
            }`}
          >
            {available ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {available ? "Disponible" : (pendingLabel ?? "Próximamente")}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {(available || accessible) && to ? (
        <Link
          to={to}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Ver reporte
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <button
          disabled
          className="inline-flex shrink-0 cursor-not-allowed items-center justify-center rounded-lg border border-border bg-muted px-4 py-2 text-sm font-medium text-muted-foreground"
        >
          Reporte aún no disponible
        </button>
      )}
    </div>
  );
}
