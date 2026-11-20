# Tabla 3: calidad de agendamientos por embudo

Se incorpora debajo de la Tabla 2 en `/reports/vsl-calidad`, sin cambiar los cálculos, datos ni columnas visibles de las dos primeras tablas. Consume exclusivamente appointmentsByFunnel dentro de la misma respuesta action=report y reutiliza el filtro global, cancelación de respuestas obsoletas, últimos datos válidos, sincronización y modal de carga existentes. No se agrega otra consulta ni un filtro independiente.

## Contrato y presentación

Once encabezados y filas posicionales: embudo [0], período [1], total [2], asistidos [3], proporción asistidos [4], restantes [5], proporción restantes [6], cancelados reales [7], no show [8], confirmados [9], otros [10]. Las proporciones se validan entre 0 y 1 y se presentan con Intl en formato porcentaje sin decimales; 0.6923 → 69%, 0.3 → 30%, 0 → 0%. Ninguna cantidad se deriva de otra columna.

Se validan anchura, tipos numéricos finitos, encabezados, origen VSL_APPOINTMENTS y metadatos. Se rechazan filas duplicadas por embudo/período y períodos incompatibles con el filtro, sin sumar ni deduplicar silenciosamente. Los nombres, orden y agregados se conservan como los entrega la API; no se reagrupan citas en el navegador. Los grupos reales comprobados son ORGÁNICO EQUIPO + ORGÁNICO CÍRCULO, VSL PAGO CÍRCULO + VSL PAGO EQUIPO y LIG CÍRCULO + LIG EQUIPO.

El componente mantiene título gris, porcentajes azules, números a la derecha, nombres a la izquierda, encabezados y primera columna fijos, y scroll dentro de la sección. No crea barras horizontales de página. Los períodos filtrados usan las etiquetas legibles del filtro existente.

La ausencia de appointmentsByFunnel muestra que la API todavía no entrega la Tabla 3. Filas vacías muestran “No hay agendamientos para el período seleccionado”. Un contrato inválido se informa solo en la tercera sección y preserva las otras dos. truncated muestra aviso de posibles datos incompletos; skippedWithoutDate se informa cuando es distinto de cero. No se incluyen datos de respaldo ficticios.

## Archivos

- src/lib/appointments-by-funnel.ts: tipos, esquema, validación contextual y formato.
- src/lib/vsl-quality.ts: amplía la respuesta con el bloque opcional y su mensaje de error.
- src/server/api/vsl-quality.api.server.ts: valida y transmite el bloque de la respuesta compartida.
- src/components/reports/AppointmentsByFunnelTable.tsx: tercera tabla.
- src/components/reports/VslQualityReport.tsx: inserción debajo de Tabla 2 y clave de caché nueva.
- src/components/reports/VslDateFilter.tsx: etiqueta del filtro compartido por las tres tablas.
- tests/vsl-quality.cjs: contrato, porcentajes, duplicados, vacío/error/truncado, renderizado y consultas compartidas.

No se modificó Google Apps Script, APPS_SCRIPT_URL_GERENCIA ni las reglas comerciales. Las cifras de prueba se limitan a tests.

## Verificación real

Se consultaron action=report sin filtro, septiembre 2026 y el rango personalizado 22–27 de octubre de 2026. El Apps Script publicado entregó appointmentsByFunnel con 11 columnas y anchuras correctas: 15 filas en histórico y tres filas para cada rango filtrado. Los tres grupos reales están presentes; los rangos filtrados entregan exclusivamente el período solicitado. Se validan también las otras tablas en la misma respuesta. No se ejecutó otra sincronización de GoHighLevel para esta tarea.

No se realizó una prueba visual manual de escritorio o móvil; se verificó el HTML renderizado y el comportamiento de las rutas con contratos válidos e incompatibles.
