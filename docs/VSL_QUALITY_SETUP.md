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

## Actualización vigente: Tabla 2 mensual de cinco indicadores

Esta sección sustituye la presentación anterior de encuestas por estado. La Tabla 1, el transporte HTTP y los datos de Google Sheets no se modifican.

`src/components/reports/MonthlySurveyTable.tsx` representa directamente cada fila de `surveys.rows`, en el orden de la API: periodo [0], leads que completaron encuesta [1], proporción de facturación [2], proporción de inversión [3], proporción de calificados [4]. No agrupa por estado, no suma filas, no recalcula KPI ni deduplica contactos. Se conserva el nombre del mes en español para presentación, encabezado fijo, primera columna fija y scroll responsive. Los tres porcentajes se formatean como proporciones, con hasta un decimal: 0.426 → 42.6%. Los valores faltantes o no finitos se presentan como raya, nunca como cero inventado.

`src/lib/vsl-quality.ts` valida exactamente cinco columnas y cinco valores por fila de encuestas. Verifica los encabezados en su orden normalizando mayúsculas, acentos y puntuación, y rechaza meses duplicados en lugar de agregarlos. La validación de quality y su formato porcentual permanecen iguales.

`src/components/reports/VslQualityReport.tsx` usa la nueva tabla y una clave de caché versionada (`monthly-surveys-v2`); deja de abrir el modal por mes/estado desde la Tabla 2. El modal antiguo y su endpoint no se llaman desde la nueva vista. No se inventa un endpoint de detalle mensual sin estado.

Verificación real del endpoint privado: success:true, pero surveys todavía devuelve 19 columnas y 40 filas. El despliegue configurado no satisface aún el contrato mensual nuevo. Se muestra error de contrato explícito; no se intenta convertir silenciosamente los estados antiguos. Se requiere actualizar el despliegue de Apps Script fuera de este cambio de frontend. No se modificó Apps Script ni la variable APPS_SCRIPT_URL_VSL.

Archivos de esta actualización: `src/lib/vsl-quality.ts`, `src/components/reports/VslQualityReport.tsx`, `src/components/reports/MonthlySurveyTable.tsx`, `tests/vsl-quality.cjs` y esta documentación. Las pruebas verifican el contrato, renderizado de cinco columnas, orden/API sin agregación, porcentajes, nulos, estructura antigua rechazada y conservación de la Tabla 1. No se ha realizado comprobación visual manual en navegador de escritorio o móvil.

## Diagnóstico del endpoint y encabezados confirmados

Se ajustó `src/lib/vsl-quality.ts` a los cinco encabezados reales confirmados por el usuario (incluido el denominador descriptivo de calificados). La comparación sigue validando significado y orden, normalizando únicamente mayúsculas, tildes y puntuación. No se aceptan 19 columnas ni encabezados de otros indicadores. Se validan proporciones numéricas entre 0 y 1; no se convierten porcentajes fuera de escala ni se recalculan fórmulas. `tests/vsl-quality.cjs` incluye regresión con esos nombres literales y valores 0, 1 y fuera de rango. Quality no cambia.

Origen comprobado localmente: APPS_SCRIPT_URL_VSL cargada mediante loadEnv(development) de la configuración .env; no existe una variable de proceso heredada que la reemplace en el proceso de diagnóstico. El transporte usa cache:no-store; el intermediario responde no-store. La consulta directa no utiliza la caché React Query. No se han inspeccionado ni modificado las variables del hosting de producción.

Dos consultas reales independientes, GET sin action y GET action=report al mismo despliegue /exec configurado, devolvieron success:true, 19 columnas, 40 filas, todas de 19 valores. Por ello el rechazo actual de anchura corresponde a la respuesta remota, no a una transformación ni caché de frontend. Además había una diferencia de nombres abreviados en el validador local, corregida ahora para que el contrato nuevo sea aceptado cuando esté publicado.

Corrección remota pendiente: publicar la versión actualizada de API.gs en el mismo despliegue web identificado por APPS_SCRIPT_URL_VSL. Guardar cambios en el editor no demuestra que /exec use esa versión. Si se creó otro despliegue, configurar su URL /exec en APPS_SCRIPT_URL_VSL tanto en desarrollo como en hosting, y reiniciar/re desplegar el servidor. Si el despliegue correcto continúa devolviendo 19 columnas, revisar qué código ejecuta doGet y si está leyendo resultados/hojas o caché remota de la estructura anterior. No se modificaron esas fórmulas ni recursos. Confirmar cinco encabezados y cinco valores en cada fila antes de declarar resuelta la conexión.

## Versión vigente: preguntas por estado y KPI mensuales integrados

La Tabla 2 combina `surveyStatus` (14 columnas) y `surveys` (cinco columnas) en una única tabla de 18 columnas. Las preguntas conservan los encabezados reales del endpoint y las cuatro columnas finales usan los encabezados de surveys sin su periodo duplicado. El mes y cada KPI ocupan una celda con rowSpan=4. Estados: CONFIRMADO, ASISTIÓ, CANCELADO, NO ASISTIÓ. Se mantienen fijas las dos primeras columnas y el encabezado, el estilo azul de porcentajes y el scroll.

La unión en `src/lib/join-survey-months.ts` utiliza una clave mensual YYYY-MM extraída del texto, nunca la posición de fila. Los meses se ordenan de forma descendente. La API real devuelve fechas ISO en ambos bloques; se preservan en el modelo y se normalizan exclusivamente como claves de asociación, sin conversión de zona horaria. No se suman estados, recalculan KPI ni fuerza igualdad entre poblaciones de fecha de respuesta y fecha de cita. Se preserva la unión de todos los meses presentes en cualquiera de los dos bloques.

Si falta un estado se muestra la fila con “Sin datos del backend” y rayas para las preguntas; no se sustituyen ausencias por ceros. Si falta el resumen mensual se indica “Sin datos mensuales”. Mes/estado duplicados, estados incompatibles y anchuras incorrectas se rechazan. surveyStatus es obligatorio; no existe compatibilidad silenciosa con respuestas antiguas. La caché de navegador se versiona a survey-status-kpis-v3 y el backend solicita explícitamente action=report al mismo APPS_SCRIPT_URL_VSL.

Verificación real final: HTTP 200, success:true; quality 15 columnas/5 filas, surveys 5 columnas/10 filas y surveyStatus 14 columnas/40 filas; 10 meses asociados. La API publica exactamente los cuatro estados previstos. La validación y unión actualizadas pasan con esa respuesta real. No fue necesario modificar Apps Script ni sus fórmulas.

Archivos de esta ampliación: `src/lib/vsl-quality.ts`, `src/lib/join-survey-months.ts`, `src/components/reports/MonthlySurveyTable.tsx`, `src/components/reports/VslQualityReport.tsx`, `src/server/api/vsl-quality.api.server.ts`, `tests/vsl-quality.cjs` y esta documentación. La Tabla 1 conserva su componente, columnas visibles, formato y lógica. Se probaron renderizado, encabezados, cuatro filas, KPI fusionados sin duplicación, asociación por clave, orden, datos incompletos/vacíos, contrato incompatible y periodos ISO. No se ha realizado una comprobación manual en navegador de escritorio o móvil.
