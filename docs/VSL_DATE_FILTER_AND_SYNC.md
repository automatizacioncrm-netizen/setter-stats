# Filtro global y sincronización VSL sin tokens

## Uso y configuración vigente

El filtro global de `/reports/vsl-calidad` conserva Todo el histórico, presets en America/Lima, rango personalizado inclusivo de hasta 366 días y Limpiar filtro. Las dos tablas usan una respuesta común, con recalculado remoto al enviar startDate/endDate. La Tabla 1 mantiene las 15 columnas y la Tabla 2 mantiene sus preguntas por estado y cuatro KPI mensuales, sin cambiar fórmulas.

La única variable necesaria para esta integración es APPS_SCRIPT_URL_GERENCIA, privada del servidor. VSL_REFRESH_TOKEN y VSL_REPORT_API_TOKEN no se requieren ni se leen para sincronizar. El transporte elimina parámetros token/refreshToken obsoletos de la URL configurada, si los hubiera, y conserva el tratamiento seguro de errores.

## Actualizar datos

El navegador envía POST a `/api/reports/vsl-calidad-sync`. Esta ruta conserva la comprobación de Origin y comparte inicios simultáneos por instancia. Consulta `GET action=syncstatus` sin token. Si el trabajo está QUEUED/RUNNING, lo sigue sin iniciar otro. De lo contrario envía un solo POST JSON `{"action":"refresh"}` al mismo Apps Script, sin credenciales adicionales. Los POST no se reintentan automáticamente ante errores ambiguos.

El endpoint real responde a syncstatus con `{"success":true,"job":{...}}`. La ruta extrae job, valida status/stage/completedStages/warning/error y conserva id/startedAt/updatedAt/finishedAt para seguimiento. Al cliente se devuelve el estado normalizado; no se modifica el contrato de tablas.

El hook existente consulta periódicamente la ruta segura mientras está activo, muestra las etapas leads/appointments/surveys/reports y sus completedStages reales, detiene y limpia el seguimiento al desmontar o terminar y mantiene el filtro. Solo COMPLETED dispara la recarga de las dos tablas. ERROR conserva los datos y permite reintentar; Consultar estado recupera un seguimiento incierto sin reenviar refresh. No se inventan porcentajes de avance ni finalizaciones.

## Verificación real de esta corrección

La lectura previa del reporte fue válida: quality 15 columnas/5 filas, surveys 5 columnas/10 filas y surveyStatus 14 columnas/40 filas. generatedAt previo: 2026-11-02T10:03:06-05:00.

El GET syncstatus sin token respondió correctamente, inicialmente IDLE. Se ejecutó un POST real a través de la ruta actualizada, con body {action:refresh} y sin token. Apps Script lo rechazó por falta de autorización de ScriptApp.getProjectTriggers. Una consulta posterior confirmó el trabajo d4f9a283-dba0-4440-ba90-bed28b1c9b97 en ERROR, stage leads, completedStages vacío. El error indica que no se pudo programar el trabajo y requiere el permiso de Google script.scriptapp. No se volvió a iniciar automáticamente ni se marcó como COMPLETED.

El primer intento requirió la siguiente autorización en la cuenta propietaria del Apps Script: autorizar el acceso a disparadores ejecutando desde el editor la función correspondiente. Si el manifiesto define oauthScopes explícitos, debe incluir https://www.googleapis.com/auth/script.scriptapp. La documentación oficial del método describe ese permiso: https://developers.google.com/apps-script/reference/script/script-app#getProjectTriggers(). El usuario confirmó que autorizó los permisos. El reintento y su resultado final se documentan a continuación. No se modificó Apps Script desde este repositorio.

Resultado final verificado tras la autorización del usuario: el trabajo 6069d133-e190-4f0f-9e7e-1d6cda5d4427 llegó a COMPLETED el 02/11/2026 a las 10:28:12 (America/Lima). completedStages incluye leads, appointments, surveys y reports; error es null. Se siguió el mismo identificador desde QUEUED hasta el final, sin duplicar POST. Hubo un timeout transitorio de lectura de estado; se retomó solo el GET y se preservó el mismo trabajo.

Tras COMPLETED se volvió a consultar el reporte por las rutas actualizadas. Todo el histórico devolvió quality 15 columnas/5 filas, surveys 5 columnas/10 filas y surveyStatus 14 columnas/40 filas; generatedAt 2026-11-02T10:28:19-05:00. Con startDate=2026-10-01 y endDate=2026-10-31 devolvió filter inclusivo confirmado, quality 15 columnas/1 fila, surveys 5 columnas/1 fila y surveyStatus 14 columnas/4 filas; generatedAt 2026-11-02T10:28:31-05:00. Ambas respuestas pasaron la validación completa y no se modificaron cantidades ni fórmulas en el frontend.

Se considera completado el ciclo real confirmado por el orquestador y verificada la lectura posterior de ambas tablas. Advertencia real conservada: el sincronizador de leads no informa si agotó el tiempo antes de recorrer todos los registros. COMPLETED no certifica por sí solo una cobertura exhaustiva ni una reconciliación completa de GoHighLevel.

## Archivos de esta corrección

- src/server/api/vsl-sync.api.server.ts: elimina secreto y parámetros de autenticación; admite el sobre job real.
- src/server/adapters/vsl-quality.adapter.server.ts: elimina parámetros token/refreshToken obsoletos de solicitudes a este Apps Script.
- src/lib/vsl-sync.ts: conserva identificador y marcas temporales del trabajo.
- vite.config.ts: elimina la carga de VSL_REFRESH_TOKEN.
- tests/vsl-quality.cjs: verifica inicio y seguimiento sin token, sobre job, Origin, exclusión de duplicados y errores reales.

El filtro global, los cálculos, las columnas de ambas tablas y los demás reportes permanecen sin cambios en esta corrección. Las pruebas controladas se complementaron con la sincronización real y las lecturas posteriores documentadas arriba.
