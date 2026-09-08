# Reporte por tipo de lead

El archivo completo 10_API.gs reemplaza el contenido del archivo 10_API existente en Google Apps Script. Conserva doPost, VSL_RECONCILIAR, las propiedades privadas y la URL.

## Activación

1. Copiar 10_API.gs en el archivo existente, sin duplicar doGet/doPost.
2. Guardar y actualizar la implementación web existente a una nueva versión, manteniendo URL y permisos.
3. Publicar el dashboard después de actualizar Apps Script. Este repositorio no publica automáticamente en Google.

El contrato requiere leadType y leadTypeKpis. Una versión antigua produce un error controlado para evitar etiquetar pagados como orgánicos.

## Población y cálculos

API_NORMALIZE_SOURCE convierte a string, aplica trim, elimina diacríticos y convierte a mayúsculas. API_GET_LEAD_TYPE devuelve paid si contiene VSL FUNNEL; si no, organic si contiene ORGANICO; de lo contrario other. Paid tiene prioridad. Other queda fuera de ambos reportes; no se modifica el Sheet.

leadType admite paid u organic; por omisión o valor inválido se utiliza paid. Los filtros generales se aplican server-side sobre la secuencia y tipo seleccionados. Fecha de reunión conserva la normalización original; los presets del dashboard usan America/Lima y Apps Script su zona configurada.

leadTypeKpis.totalLeads cuenta todos los registros filtrados; attended suma Asistió; attendanceRate = attended / totalLeads * 100, con dos decimales y cero sin registros. La tabla suma únicamente los seis estados oficiales: su total puede ser menor que totalLeads si hay estados vacíos/desconocidos. Efectividad usa ese total clasificado como denominador. Tabla y gráfico reciben el mismo data.setters.

search solo afecta el detalle antes de paginar; nunca cambia KPIs, tabla o efectividad. Las opciones disponibles de Setter, Closer y VSL Origen se derivan de la secuencia y tipo actuales, antes de aplicar otros filtros. Un valor seleccionado sin registros en el nuevo tipo se conserva y se identifica en el selector para permitir quitarlo.

## Prueba manual

Entrar al reporte: Pagados por defecto. Seleccionar fechas y Setter, cambiar a Orgánicos: deben conservarse los filtros, reiniciarse la página y ejecutarse solo GET con leadType=organic. Verificar KPIs, tabla, gráfico, efectividad y detalle. Buscar un contacto: solo cambia el detalle. Pulsar Actualizar datos: POST seguido de GET conservando organic.

Probar VSL FUNNEL, META | VSL FUNNEL, Organico, ORGANICO | WHATSAPP, ORGÁNICO, una fuente con ambos textos y una desconocida. Comprobar que Asistieron coincide con la suma de Asistió de la tabla y que un filtro sin resultados muestra ceros.
