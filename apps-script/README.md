# API VSL + OEI + LIG

`10_API.gs` utiliza como base el archivo Apps Script adjunto, conservando sus reglas comerciales, filtros y detalle. Contratos, cambios, supuestos, dependencias pendientes y lista exacta de archivos modificados: [API_V2.md](API_V2.md).

Copiar el contenido en el archivo **10_API existente**, sin duplicar doGet/doPost. Actualizar la implementación web existente manteniendo URL y permisos. Este repositorio no publica automáticamente en Google.

El secreto sigue en Script Properties como `FRONTEND_SECRET`. El servidor del dashboard utiliza `APPS_SCRIPT_SECRET`; no debe exponerse al navegador.

Los GET leen los dos MASTER en memoria. `pipeline=all` incluye VSL, OEI y LIG. Paid/organic solo clasifica VSL. No se agregó el indicador de empresarios desertados.

Los módulos externos de sincronización, APP_CONFIG, GHL_PIPELINES y mappers de GHL no están disponibles. Antes de desplegar se necesita revisarlos, especialmente que UPDATED_ONLY no escriba Numero de citas. Las pruebas simulan sus contratos y no validan los datos reales.

Ejemplos completos generados con datos simulados: [examples-v2.json](examples-v2.json). Pruebas principales: `node --test tests/apps-script-v2.cjs tests/reconciliation.cjs`.
