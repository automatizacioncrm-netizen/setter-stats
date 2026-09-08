import { createFileRoute } from "@tanstack/react-router";
import { reportApi } from "@/server/api/report.api.server";
export const Route = createFileRoute("/api/reports/vsl-closers")({
  server: { handlers: { GET: ({ request }) => reportApi(request) } },
});
