import { createFileRoute } from "@tanstack/react-router";
import { reconciliationApi } from "@/server/api/reconciliation.api.server";
export const Route = createFileRoute("/api/reports/vsl-closers/reconcile")({
  server: { handlers: { POST: ({ request }) => reconciliationApi(request) } },
});
