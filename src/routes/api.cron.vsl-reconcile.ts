import { createFileRoute } from "@tanstack/react-router";
import { cronReconciliationApi } from "@/server/api/cron-reconciliation.api.server";
export const Route = createFileRoute("/api/cron/vsl-reconcile")({
  server: { handlers: { GET: ({ request }) => cronReconciliationApi(request) } },
});
