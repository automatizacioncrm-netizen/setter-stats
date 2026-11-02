import { createFileRoute } from "@tanstack/react-router";
import { vslSyncStatusApi, vslSyncStartApi } from "@/server/api/vsl-sync.api.server";
export const Route = createFileRoute("/api/reports/vsl-calidad-sync")({
  server: {
    handlers: { GET: () => vslSyncStatusApi(), POST: ({ request }) => vslSyncStartApi(request) },
  },
});
