# Contrato VSL corregido

## Causa y archivos

`loadReport()` en `src/server/api/vsl-quality.api.server.ts` emitía el error de contrato tras validar con `src/lib/vsl-quality.ts`. El esquema exigía encabezados literales, `percentageUnit: percent`, `diagnostics.warnings` y cuatro estados exactos por mes. El servicio real entrega proporciones decimales, encabezados propios, diagnostics.available/details y puede incluir OTRO.

Se corrigieron esos dos archivos, `src/components/reports/VslQualityReport.tsx` y `tests/vsl-quality.cjs`. Las rutas, clientes, servicios y conexiones de los otros dos reportes no se modifican en esta corrección. La propuesta inicial `apps-script/VSL_QUALITY_ENDPOINT.gs` se marcó como obsoleta: NO desplegarla sobre el servicio existente.

## Contrato actual

`success: true`, `generatedAt` ISO, `timeZone: America/Lima`, `quality: {columns, rows, sourceSheet?, truncated?}`, `surveys: {columns, rows, sourceSheet?, truncated?}`, `diagnostics?: {available?, details?, warnings?}`.

Se aceptan arrays de 15/19 encabezados sin comparaciones literales. Filas como arrays de la misma anchura; error con tabla, número de fila, anchura esperada y recibida. Se conservan encabezados, orden, textos, blancos, estados y meses originales. Conversión de strings numéricos inequívocos en columnas numéricas, conservando enteros fuera de precisión segura. No se recalculan métricas ni se agregan poblaciones inexistentes.

Porcentajes de quality: índices 3, 5, 8, 10. De surveys: 15, 16, 17. Son proporciones; solo la presentación aplica formato porcentaje (0.31 → 31%). Surveys[18] es cantidad sin rango; surveys[14] es leads con encuesta y cita. No se inventan leads captados ni leads que completaron encuesta como columnas adicionales. Los meses YYYY-MM se muestran como mes y año sin modificar el dato original. OTRO se conserva.

`queriedAt` lo añade el intermediario como fecha de consulta; no reemplaza `generatedAt`. Se muestra advertencia cuando el servidor declara tablas truncadas.

## Consulta y errores

Se conserva `APPS_SCRIPT_URL_VSL` privada y GET sin parámetros añadidos. La URL debe corresponder a un despliegue HTTPS Google Apps Script con ruta terminada en /exec. Los parámetros existentes se conservan, incluido token si está configurado en la URL privada; no se inventa token ni se desactiva protección. En desarrollo se carga .env; en hosting configurar la misma variable de servidor.

`success: false` se procesa antes de validar tablas y muestra el error del Apps Script. Se ocultan valores de parámetros de la URL privada y enlaces incluidos en mensajes. HTML, JSON vacío, errores HTTP y filas inválidas continúan rechazándose explícitamente.

Una consulta inicial al entrar para ambas tablas, sin consulta remota desde el menú; caché y deduplicación de React Query, exclusión de peticiones simultáneas en backend por instancia y actualización manual. El estado del menú sigue siendo conservador y no persistente entre instancias serverless.

## Verificación real

La variable existe en .env; la URL corresponde a Google Apps Script y termina en /exec. No tiene parámetro token. La red restringida falla con ENOTFOUND. La comprobación autorizada fuera de esa restricción obtuvo HTTP 200 y JSON válido con success:false. El intermediario corregido devolvió:

> Apps Script: No se pudo obtener el reporte VSL. Revisar el registro de ejecuciones de Apps Script.

El backend remoto todavía falla antes de entregar tablas. No hay acceso al código real desplegado ni a sus registros de ejecución desde este repositorio. Hace falta revisar ese registro para identificar la excepción. No se ha desplegado código ni modificado Google Sheets. Las pruebas locales validan el contrato facilitado, no certifican métricas reales ni fórmulas del generador.

## Modal de auditoría de encuestas

Archivos de esta ampliación: `src/components/reports/SurveyDetailModal.tsx`, `src/components/reports/VslQualityReport.tsx`, `src/lib/survey-detail.ts`, `src/server/adapters/vsl-quality.adapter.server.ts`, `src/server/api/vsl-quality.api.server.ts`, `src/server/api/vsl-survey-detail.api.server.ts`, `src/routes/api.reports.vsl-calidad-detail.ts`, árbol de rutas generado y `tests/vsl-quality.cjs`.

Las cantidades enteras de personas en la tabla 2, incluido cero, abren un Dialog de Radix con buscador, paginación de 25, errores/reintento, carga, encabezados fijos y scroll. Porcentajes y cuellos de botella agregados no son botones. La tabla 1 conserva su presentación anterior. Los cuatro IDs de auditoría se mantienen en el modelo sin mostrarlos. Las fechas se presentan tal como llegan: no se desplazan por zona horaria. Radix proporciona dialog modal, foco contenido y Escape; el cierre devuelve foco al botón de origen. No se ha ejecutado una prueba manual de teclado en navegador.

El navegador consulta `/api/reports/vsl-calidad-detail?month=YYYY-MM&status=...` solo tras un clic. El servidor usa exclusivamente APPS_SCRIPT_URL_VSL y el transporte privado compartido del reporte para solicitar `action=detail&month=...&status=...`, conservando parámetros de autenticación existentes. Se valida mes, estado y contrato de 16 columnas. No se agregan ni deduplican personas. Se comparten peticiones en curso idénticas por instancia; React Query cachea por mes/estado durante cinco minutos y cancela la observación anterior al cambiar selección. La condición de columna se aplica sobre el grupo recibido sin otra petición. Las discrepancias resumen/detalle generan advertencia visible y diagnóstico solo de mes, estado, columna y cantidades; no se registran personas.

Limitaciones comprobadas: la consulta real al despliegue configurado de action=detail para septiembre/ASISTIÓ devolvió `Apps Script: Acción no soportada`. Se requiere actualizar ese despliegue; no se modificó API.gs. El repositorio no contiene las funciones originales VSL20_income_(), VSL20_invest_(), VSL20_yes_() ni VSL20_no_(). Se solicitó su código. Se implementan las reglas expresas de empresario sí/no (palabra inicial normalizada) y grupo completo. Ingresos, inversión y confirmación devuelven error explícito de clasificación no disponible hasta contar con esas funciones. No se infieren rangos ni umbrales. La funcionalidad completa con datos reales permanece pendiente de ambos requisitos.
