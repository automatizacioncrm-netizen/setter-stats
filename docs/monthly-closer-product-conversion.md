# Conversión mensual por closer y producto

## Actualización de Google Apps Script

El `apps-script/10_API.gs` local no generaba `sales.conversionPorProductoMensual`.
Se agregó exclusivamente el generador de esta métrica y su incorporación a `sales`.
No se cambió `API_IS_SALE_STAGE`, reconciliación, endpoints ni los demás agregados.

El archivo `monthly-closer-product-conversion.patch` de esta carpeta contiene el
diff exacto de `10_API.gs`. Para actualizar el proyecto de Apps Script manualmente:

1. Copiar la función completa entre `BEGIN MONTHLY_CLOSER_PRODUCT_CONVERSION` y
   `END MONTHLY_CLOSER_PRODUCT_CONVERSION` desde `apps-script/10_API.gs`, antes de
   `API_BUILD_VSL_REPORT`.
2. Dentro de `API_BUILD_VSL_REPORT`, agregar al objeto `const sales = {`:

```javascript
conversionPorProductoMensual: API_MONTHLY_CLOSER_PRODUCT_CONVERSION_(
  oppData, apptData, oi, ai, filtros, requestedLeadType, requestedVslTipo
),
```

3. En el índice `oi` de esa misma función, aceptar el encabezado alternativo sin
   cambiar la prioridad del encabezado existente:

```javascript
asignado: API_MASTER_INDEX_ANY_(oh, ["Asignado", "Asignado a"], true),
```

Este último ajuste evita que la validación de encabezados rechace una hoja que
contiene solamente `Asignado a`. El generador mensual consulta primero `Asignado a`
y después `Asignado`; no cambia la atribución de las otras métricas.
No se realizó un despliegue remoto.

## Contrato y atribución

Ruta de Apps Script: `data.sales.conversionPorProductoMensual`.
El proxy existente desenvuelve `data`; el frontend recibe `report.sales`.
Cada fila contiene `mes`, `embudo`, `embudoNombre`, `closer`, `producto`,
`citasAsistidas`, `ventas` y `porcentajeConversion`.

- Ventas: oportunidades únicas, exclusivamente en las cuatro fases autorizadas.
  Se reutiliza `API_NORMALIZE_STAGE` y se normalizan espacios alrededor de `/`.
  El closer procede del campo asignado de la oportunidad; no se infiere de su
  última cita ni de una lista de personas permitidas.
- Citas: registros de APPOINTMENTS_MASTER con estado Calendar de asistencia,
  únicos por Appointment ID. No se hereda asistencia de la oportunidad.
  Closer: `Closer cita`, con respaldo en el asignado de la oportunidad vinculada.
- Personas: se unifican mayúsculas, tildes y espacios mediante la clave existente.
  Se conserva un nombre real de origen, priorizando el nombre de la oportunidad.
  No se fusionan abreviaturas sin evidencia. Vacíos: `Sin closer identificado`.
- Productos: el producto de la oportunidad vinculada determina una única categoría:
  `Equipo Millonario`, `Círculo Millonario` o `Sin identificar`.
  Cada cita pertenece a una sola categoría; el denominador no se replica entre
  productos. Una cita sin oportunidad vinculada queda en `Sin identificar`.
- Se generan filas individuales y consolidadas `all` por separado. El frontend
  selecciona exclusivamente el embudo activo, sin sumar ambas colecciones.

## Fechas, filtros y límites

La asistencia se agrupa por `Fecha cita`; la venta, por `Fecha de primer pago`,
usando el normalizador de fechas existente. Una cita de septiembre y una venta de
octubre participan en meses diferentes. Es una conversión de actividad mensual,
no una conversión de cohorte: puede superar 100 %. Cero asistencias produce `null`
en la API y `N/D` en pantalla. Una fecha ausente no permite atribuir el registro a
un mes y se excluye de esta métrica, incluso si no hay rango seleccionado.

Se reutilizan los filtros no temporales del dataset directo de citas. Los filtros
dependientes de citas limitan las oportunidades mediante sus citas vinculadas;
las ventas siguen usando su propia fecha comercial. El filtro Closer se aplica a
la atribución de cada fuente, con normalización de nombres. Sin esos filtros,
una venta válida no necesita tener citas para contarse.

El reconocimiento de embudos/calendarios y la cohorte VSL siguen las funciones
existentes. El archivo local reconoce VSL, OEI y LIG; no se inventan mapeos para
otros nombres de embudos. Las selecciones frontend que combinan respuestas de
varios nombres mantienen la métrica no disponible, porque no puede garantizarse
su deduplicación a partir de agregados.

Los totales de otras tablas pueden diferir porque sus reglas de fases no se han
modificado. No se verificaron datos del despliegue remoto ni se accedió a las hojas
reales. El parche debe aplicarse al Apps Script que usa el despliegue activo.
