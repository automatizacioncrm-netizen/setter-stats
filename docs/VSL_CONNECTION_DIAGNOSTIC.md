# Diagnóstico de comunicación VSL, Orgánico, LIG y Encuestas

## Evidencia real (4 de noviembre de 2026, America/Lima)

La variable usada sigue siendo APPS_SCRIPT_URL_VSL, privada en el servidor. La URL configurada pasa la validación HTTPS de script.google.com/macros/s/.../exec. No se sustituyó por una URL fija ni por otra variable.

- GET action=report histórico: 7,285 ms, HTTP 200, application/json; redirección final a https://script.googleusercontent.com/macros/echo (valores de sus parámetros omitidos).
- GET action=report&startDate=2026-10-01&endDate=2026-10-31: 11,358 ms, HTTP 200, application/json.
- Ruta HTTP local real http://127.0.0.1:8080/api/reports/vsl-calidad: 6,387 ms, HTTP 200, success:true, VSL/Orgánico/LIG con 5 filas cada uno.
- Proxy corregido qualityApi: 5,955 ms total, HTTP 200, success:true. VSL 5 filas; Orgánico 5; LIG 5; encuestas mensuales 10; encuestas por estado 40; agendamientos 12.

No se reprodujo un timeout, fallo de red ni CORS en estas mediciones. No se puede atribuir con certeza el incidente anterior a un timeout. El mensaje anterior procedía del catch de fetchVslJson: mezclaba indiscriminadamente problemas de red y timeout, con dos intentos de 20 segundos. El navegador tenía otro límite de 45 segundos.

## Defectos comprobados y corrección

- El esquema Zod descartaba qualityOrganico y qualityLIG por no declararlos. Ahora conserva sus siete columnas y valida sus proporciones sin recalcularlas.
- El backend real informa APPOINTMENTS_MASTER como fuente de appointmentsByFunnel; el frontend solo admitía VSL_APPOINTMENTS. Se aceptan esas dos fuentes verificadas; los cálculos permanecen intactos.
- El transporte distingue CONFIGURATION, NETWORK, TIMEOUT, CANCELLED, HTTP, CONTENT_TYPE, INVALID_JSON y UPSTREAM_FAILURE.
- Un presupuesto total de 60 segundos cubre redirecciones, lectura del cuerpo y reintentos. Un timeout no se reintenta; POST sigue sin reintento. Los consumidores del navegador esperan hasta 75 segundos.
- Nitro/Vercel configura maxDuration:90 para la función generada. El despliegue y el plan de hosting deben aceptar ese límite.
- Los registros [vsl-http] incluyen método, acción, intento, duración, estado HTTP, URL consultada, URL final, tipo de contenido y error. Se oculta el ID del despliegue y todos los valores de query; mensajes se saneaban y continúan saneándose. No se registran cuerpos ni filas de usuarios.
- El navegador utiliza la ruta del mismo origen /api/reports/vsl-calidad. Google se consulta desde el servidor: no se usó no-cors ni se intentó eludir las restricciones CORS.

## Períodos y límite del endpoint actual

El histórico real incluye qualityOrganico y qualityLIG. La consulta filtrada de octubre respondió sin ambos bloques. No se reutilizan los agregados históricos en un filtro: sus componentes muestran explícitamente que la API no entrega ese reporte para el período solicitado. Para mostrar Orgánico/LIG filtrados, el backend tiene que incluirlos en esa respuesta; no se modificó API.gs.

Se mantienen los períodos, valores y proporciones del servicio; las dos tablas nuevas completan la integración solicitada anteriormente y reutilizan el diseño existente, sin cambios en las columnas de las tablas anteriores.

## Validación

45 pruebas pertinentes aprobadas (transporte, cancelación, HTTP/JSON, saneamiento, contratos, conservación de métricas y renderizado). TypeScript y lint correctos. Build de producción correcto; la función Vercel generada contiene maxDuration:90.

Pendiente en el navegador y despliegue del usuario: confirmar /api/reports/vsl-calidad en Network, que no aparece un fetch directo a Google, que se usa el despliegue vigente configurado en el hosting y que no hay un proxy externo con un timeout menor. Verificar visualmente loader, cambio de filtros y las nuevas tablas, y revisar los registros [vsl-http] si reaparece el incidente.

## Archivos de implementación

- src/server/adapters/vsl-quality.adapter.server.ts: errores tipados, registro seguro y presupuesto de 60 s.
- src/server/api/vsl-quality.api.server.ts: códigos de error y HTTP 504 para timeout.
- src/lib/vsl-report-request.ts: solicitud del navegador al proxy con clasificación de errores y límite de 75 s.
- src/lib/vsl-quality.ts: conserva y valida qualityOrganico/qualityLIG.
- src/lib/appointments-by-funnel.ts: acepta la fuente real APPOINTMENTS_MASTER además de VSL_APPOINTMENTS; no cambia fórmulas.
- src/components/reports/FunnelLeadQualityTable.tsx: presentación de los dos bloques reales de calidad.
- src/components/reports/VslQualityReport.tsx: usa el cliente del proxy y renderiza Orgánico/LIG.
- src/components/reports/VslDateFilter.tsx: etiqueta general sin un conteo fijo de tablas.
- src/components/reports/VslCommercialTable.tsx, src/components/reports/SurveyDetailModal.tsx y src/hooks/use-vsl-sync.ts: alinean sus límites de espera con el transporte compartido.
- vite.config.ts: maxDuration:90 en la configuración nativa de Nitro/Vercel.
- tests/vsl-quality.cjs: pruebas de contratos y categorías de error.

No se modificó ningún archivo de Google Apps Script.
