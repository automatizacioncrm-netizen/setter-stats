import { createFileRoute } from "@tanstack/react-router";
import { commercialTrendsApi } from "@/server/api/commercial-trends.api.server";
export const Route = createFileRoute("/api/reports/commercial-trends")({
  server: { handlers: { GET: ({ request }) => commercialTrendsApi(request) } },
});
