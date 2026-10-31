import { createFileRoute } from "@tanstack/react-router";
import { qualityApi } from "@/server/api/vsl-quality.api.server";
export const Route = createFileRoute("/api/reports/vsl-calidad")({
  server: { handlers: { GET: () => qualityApi() } },
});
