# VSL | CLOSERS

React 19 + TanStack Start 1.168.32 + TanStack Router 1.170.18. Se conserva el routing por archivos y el build de Start. Nitro genera la salida para Vercel; no se agregó index.html ni se convirtió a una SPA.

## Configuración local

Copia `.env.example` a `.env.local` en la raíz del proyecto:

```dotenv
APPS_SCRIPT_URL=
APPS_SCRIPT_SECRET=
```

En `APPS_SCRIPT_URL` pega la URL completa de tu despliegue existente de Apps Script, terminada en `/exec`. En `APPS_SCRIPT_SECRET` pega exactamente el valor existente de `FRONTEND_SECRET` de Apps Script. No es una clave nueva. Reinicia el servidor de desarrollo al cambiar las variables. `.env.local` y los demás archivos `.env*` están ignorados, excepto `.env.example`, que está vacío.

No se necesita `APPS_SCRIPT_REPORT_URL`. La misma URL recibe `action=vsl_report` por GET y `action=vsl_reconciliar` por POST. La configuración se valida en `src/server/config/env.server.ts`; el plugin local carga las dos variables en el proceso del servidor durante desarrollo, sin inyectarlas al cliente.

## Vercel

En el proyecto: **Settings → Environment Variables**. Crea `APPS_SCRIPT_URL` y `APPS_SCRIPT_SECRET` para **Production**, **Preview** y **Development**, con los valores correspondientes a cada entorno. Para Preview usa datos de prueba si no quieres reconciliar producción desde una vista previa. Cambiar la URL o la clave solo requiere editar estas variables y hacer un **redeploy**; no requiere modificar TypeScript.

El build es `bun run build` (el repositorio ya tiene `bun.lock`); los scripts también funcionan con npm/pnpm si esos gestores están instalados. El preset Nitro es `vercel`. El build genera `.vercel/output`. La función debe disponer de al menos 60 segundos para la reconciliación, más el margen de ejecución de la plataforma. No se desplegó desde esta tarea.

## Flujo

- Lectura: navegador → `GET /api/reports/vsl-closers` → adapter servidor → Apps Script `action=vsl_report` → mapper validado → UI.
- Actualización: botón → `POST /api/reports/vsl-closers/reconcile` → Apps Script `action=vsl_reconciliar` → mapper → mensaje con cantidades → nueva consulta del reporte.
- Timeouts: lectura 15 segundos; reconciliación 60 segundos, con AbortController. Un timeout no asegura que Apps Script haya detenido la operación: consulta el reporte antes de volver a actualizar.
- Filtros externos permitidos: `dateFrom`, `dateTo`, `setter`, `status`, `vslOrigin`, `closer`, `search`, `page`, `pageSize`. Se construyen con URLSearchParams; el cliente no puede sobrescribir `action` ni `key`.
- `includeDetail`, `sort` y `direction` son internos. La API entrega como máximo 100 filas. El orden se aplica únicamente a la página recibida, porque el contrato externo no ofrece orden global. La búsqueda y paginación se delegan a Apps Script. No se descargan todas las filas al navegador.

## Pruebas

```sh
bun run typecheck
bun run test
bun run build
bun run dev -- --host 127.0.0.1 --port 3000
```

Alternativas sin Bun: `node node_modules/typescript/bin/tsc --noEmit`, `node --test tests/report.cjs`, `node node_modules/vite/bin/vite.js build` y `node node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 3000`.

En PowerShell, con el servidor encendido y `.env.local` configurado:

```powershell
curl.exe "http://127.0.0.1:3000/api/reports/vsl-closers?dateFrom=2026-09-01&dateTo=2026-09-07&setter=Evelyn&includeDetail=true&page=1&pageSize=25"
curl.exe -X POST -H "x-report-request: 1" "http://127.0.0.1:3000/api/reports/vsl-closers/reconcile"
```

El segundo comando ejecuta la reconciliación real. No contiene ni necesita el secreto en el navegador. Abre `/reports/vsl-closers`, cambia filtros, activa detalle y pulsa **Actualizar datos**. Verifica en Network que solo hay llamadas a las dos rutas internas. Sin variables ambas APIs devuelven 503; rangos de fechas o páginas inválidos devuelven 400; errores externos 502 y timeouts 504. La actualización sin el encabezado interno devuelve 403.

## Datos y pendientes reales

El mapper de respuesta acepta el envelope `{ ok: true, data: ... }` indicado. Convierte números en texto, normaliza campos ausentes y conserva teléfonos como strings. El detalle espera las propiedades `nombreContacto`, `telefono`, `correo`, `setterAsignado`, `closerAsignado`, `vslOrigen`, `estadoAgenda`, `fechaReunion`, `fase`, `fuente`. Estados desconocidos se conservan en detalle. Los agregados provienen de Apps Script; la dimensión setter debe corresponder a `Setter asignado`, nunca a `Asignado` (closer). Las tasas se calculan sin división por cero.

Se conserva el mapper independiente de filas del Sheet con pruebas del ejemplo de 168 registros. Los fixtures son solo para pruebas: no están conectados al dashboard ni incluidos en el build de producción. La fecha del reporte viene de Apps Script; no se simula una actualización.

Falta introducir las dos variables y probar contra tu despliegue real, ya que no se proporcionó el secreto. También falta comprobar el formato real de las filas de detalle y el comportamiento de los agregados con `search`. La integración no inventa un endpoint externo adicional.

El proyecto existente no tiene autenticación de usuarios. La protección de solicitudes de actualización evita llamadas de navegador desde otro origen, pero no sustituye autenticación. Antes de publicar datos personales, el acceso al dashboard/API debe estar cubierto por la autenticación de tu despliegue; incrustar una URL en GoHighLevel no autentica por sí solo estas rutas.

El secreto solo se lee en servidor y se usa en el adapter. No se registra, no se devuelve en respuestas, no está hardcodeado y no usa `VITE_`. Los mensajes externos se sustituyen por errores controlados para evitar filtrar URLs con claves.

## Archivos

Creados:

- `.env.example`, `REPORTS_SETUP.md`, `tests/report.cjs`
- `src/components/reports/LeadDetailTable.tsx`, `RefreshButton.tsx`
- `src/routes/api.reports.vsl-closers.ts`, `api.reports.vsl-closers.reconcile.ts`
- `src/services/reconciliation.service.ts`
- `src/types/reconciliation.types.ts`
- `src/server/config/env.server.ts`
- `src/server/adapters/apps-script.adapter.server.ts`
- `src/server/api/report.api.server.ts`, `reconciliation.api.server.ts`
- `src/server/mappers/vsl-report.mapper.ts`, `vsl-response.mapper.ts`, `reconciliation.mapper.ts`
- `src/server/fixtures/vsl-development.ts` (solo pruebas)

Modificados:

- `.gitignore`, `package.json`, `vite.config.ts`
- `src/types/reports.ts`, `src/services/reports.ts`
- `src/pages/VslClosersDashboard.tsx`
- `src/components/reports/DashboardFilters.tsx`, `SetterStatusTable.tsx`
- `src/routeTree.gen.ts` (regenerado automáticamente)
