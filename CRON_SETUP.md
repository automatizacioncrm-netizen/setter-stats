# Reconciliación programada VSL

Crear `CRON_SECRET` en Vercel → Settings → Environment Variables → Production. Usa un valor privado aleatorio fuerte (al menos 32 caracteres), sin saltos de línea. No uses `VITE_`. Para pruebas locales también puede ir en `.env.local`. Se mantienen `APPS_SCRIPT_URL` y `APPS_SCRIPT_SECRET`.

Hacer **redeploy de producción** después de crear la variable y publicar este código. No se ha desplegado ni activado el cron desde esta tarea. Vercel ejecuta el cron sin depender del navegador y envía `Authorization: Bearer <CRON_SECRET>` automáticamente.

`vercel.json` define dos entradas para `GET /api/cron/vsl-reconcile`:

| UTC | America/Lima | Expresión |
| --- | --- | --- |
| 05:00 | 00:00 | `0 5 * * *` |
| 17:00 | 12:00 | `0 17 * * *` |

La configuración también se propaga a `.vercel/output/config.json` mediante Nitro, tomando los horarios del mismo archivo. En Vercel comprueba las dos entradas y sus logs en Cron Jobs después del despliegue. En Hobby la ejecución no tiene precisión de minuto y puede ocurrir dentro de la hora programada; para precisión de minuto se requiere un plan compatible. Cada entrada se ejecuta una vez al día.

El handler autentica antes de llamar al servicio compartido con el POST manual. Sin autorización devuelve 401; sin configuración devuelve 503. Los logs solo incluyen resultado y cantidades, nunca encabezados, URLs privadas ni secretos. Los timeouts permanecen en 15 segundos para reporte y 60 segundos para reconciliación. Un timeout no garantiza que Apps Script haya detenido la operación.

La protección de doble clic del botón sigue vigente. El cron no agrega un bloqueo distribuido entre instancias de Vercel; la serialización global de ejecuciones concurrentes, si se requiere, debe existir en Apps Script o en un almacén compartido.

La UI solo bloquea durante la primera carga sin datos o la reconciliación manual. El GET por foco/reconexión es silencioso, conserva el último reporte y muestra «Actualizando...» junto a la fecha. Ante errores conserva los datos anteriores. Al cambiar filtros mientras carga, los datos anteriores permanecen visibles hasta recibir el nuevo contexto.

Validación local: `node --test tests/report.cjs tests/loading-dashboard.cjs`, `node node_modules/typescript/bin/tsc --noEmit` y `node node_modules/vite/bin/vite.js build`. Las pruebas del cron usan un upstream simulado, no ejecutan reconciliaciones reales.

Referencia: [Vercel Cron: autenticación y operación](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
