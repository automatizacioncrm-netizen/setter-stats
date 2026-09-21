# Reporte directo de Google Apps Script

Configura estas variables en `.env` y en el entorno donde compilas el frontend:

```dotenv
APPS_SCRIPT_URL=https://script.google.com/macros/s/TU_DEPLOYMENT/exec
APPS_SCRIPT_SECRET=TU_FRONTEND_SECRET
```

Reinicia Vite o vuelve a compilar después de cambiarlas. Vite expone explícitamente estas dos variables al navegador para la consulta directa: usa el `frontend_secret` previsto para esta API, no credenciales privadas del servidor.

El reporte comercial consulta directamente esa Web App con GET `action=vsl_report`. `getVslReport` valida `{ ok: true, data }` y devuelve exclusivamente `data`. No necesita una nueva ruta de backend. Los servicios existentes de citas y reconciliación no se modifican.

El contrato requiere `detail` como array, `kpis`, `setters` y `sales` con `byStage`, `cashByCurrency` y `productSummary`. Los metadatos adicionales de la interfaz son opcionales; no se recalculan los KPIs recibidos. Los filtros disponibles se leen de `filters.available` o de los campos `availableSetters`, `availableClosers`, `availableOrigins`, `availableCalendars` y `availableStatuses`.

Prueba del servicio: `node --test tests/report-api.cjs`.

La comprobación del endpoint con la configuración local existente devolvió HTTP 200 y `{ "ok": false, "error": "Unauthorized" }`. Hace falta un `frontend_secret` válido para verificar los datos reales y el acceso desde el navegador.
