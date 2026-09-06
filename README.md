# Report Hub

Quiero que construyas un dashboard web profesional, limpio y responsive para ser incrustado dentro del CRM GoHighLevel (GHL) mediante iframe.

OBJETIVO GENERAL

Crear una pequeña aplicación de reportes comerciales con una pantalla inicial de selección de reportes y, por ahora, un dashboard funcional para la secuencia:

VSL | CLOSERS

Debe existir también otra opción visible llamada:

LANZAMIENTO PAGADO OEI

pero esta segunda opción todavía NO debe tener dashboard desarrollado.

========================================

1. PANTALLA INICIAL: SELECCIÓN DE REPORTE

========================================

Crear una página inicial con el título:

REPORTES COMERCIALES

Subtítulo:

Selecciona el reporte que deseas visualizar

Mostrar dos opciones en formato de tarjetas o filas grandes clickeables:

1. VSL | CLOSERS

   Estado: Disponible

   Botón: Ver reporte

2. LANZAMIENTO PAGADO OEI

   Estado: Próximamente

   Botón deshabilitado o texto:

   Reporte aún no disponible

Al hacer clic en “VSL | CLOSERS”, navegar al dashboard de esa secuencia.

No mostrar todavía ningún dashboard para LANZAMIENTO PAGADO OEI.

========================================

2. DASHBOARD VSL | CLOSERS

========================================

Título principal:

REPORTE COMERCIAL — VSL | CLOSERS

Subtítulo:

Seguimiento de agenda y desempeño por Setter

Agregar un botón visible:

← Volver a reportes

========================================

3. FILTROS DINÁMICOS

========================================

En la parte superior del dashboard colocar filtros:

- Fecha de reunión

- Setter asignado

- Estado de agenda

El filtro principal debe ser Fecha de reunión.

Permitir:

- Hoy

- Ayer

- Últimos 7 días

- Este mes

- Rango personalizado

Los filtros deben afectar automáticamente:

- KPIs

- tabla

- gráfico

Agregar también botón:

Limpiar filtros

========================================

4. KPIs SUPERIORES

========================================

Mostrar tarjetas KPI con:

- Total de oportunidades

- Agendado CRM

- Asistió

- Cancelado

- No show

- Pendiente de agenda

- Reagendado

- Tasa de asistencia

Calcular:

Tasa de asistencia =

Asistió / Total de oportunidades * 100

Opcionalmente mostrar también:

Tasa de no show =

No show / Total de oportunidades * 100

Las tarjetas deben verse profesionales y compactas.

========================================

5. TABLA PRINCIPAL

========================================

Crear una tabla dinámica equivalente a una tabla pivote.

Filas:

Setter asignado

Columnas:

- Agendado CRM

- Asistió

- Cancelado

- No show

- Pendiente de agenda

- Reagendado

- Total general

Ejemplo visual del resultado esperado:

Setter asignado | Agendado CRM | Asistió | Cancelado | No show | Pendiente de agenda | Reagendado | Total general

Cinthia

Evelyn

Jimena

Jose Luis

Joseph

Agregar una última fila:

Total general

La tabla debe:

- recalcularse automáticamente según los filtros

- permitir ordenar

- mantener alineados correctamente números y encabezados

- ser responsive

- permitir scroll horizontal en pantallas pequeñas

- resaltar la fila Total general

- NO mostrar valores vacíos como “undefined” o “null”; usar 0

IMPORTANTE:

Los datos deben agregarse contando registros según:

Setter asignado + Estado de agenda

========================================

6. GRÁFICO PRINCIPAL

========================================

Crear un gráfico visual y útil para gestión comercial.

Usar un GRÁFICO DE BARRAS APILADAS HORIZONTALES por Setter.

Eje Y:

Setter asignado

Series:

- Asistió

- Agendado CRM

- No show

- Cancelado

- Pendiente de agenda

- Reagendado

Objetivo:

Comparar rápidamente el volumen y composición de resultados de cada Setter.

Debe incluir:

- leyenda

- tooltip al pasar el mouse

- valores visibles o accesibles

- responsive

- actualización automática cuando cambien los filtros

No usar gráficos decorativos sin utilidad.

Agregar como indicador destacado encima del gráfico:

Tasa de asistencia general

========================================

7. SEGUNDO INDICADOR VISUAL

========================================

Debajo o al lado del gráfico principal, incluir un pequeño gráfico de conversión:

Agendados / Total

↓

Asistieron

↓

No show / Cancelados

Puede ser:

- barras

- progress bars

- mini funnel

Debe servir para entender rápidamente la efectividad de la agenda.

No debe ocupar demasiado espacio.

========================================

8. ESTRUCTURA DE DATOS

========================================

Preparar el frontend para recibir datos mediante una API.

No hardcodear la tabla final dentro de los componentes.

Crear una capa de servicio, por ejemplo:

services/reports.ts

con una función tipo:

getVslClosersReport(filters)

El frontend debe esperar una respuesta estructurada como:

{

  "report": "VSL | CLOSERS",

  "updatedAt": "2026-09-06T16:00:00Z",

  "filters": {

    "dateFrom": "",

    "dateTo": "",

    "setter": "",

    "estadoAgenda": ""

  },

  "kpis": {

    "total": 168,

    "agendadoCRM": 55,

    "asistio": 60,

    "cancelado": 39,

    "noShow": 11,

    "pendienteAgenda": 2,

    "reagendado": 1,

    "tasaAsistencia": 35.71

  },

  "setters": [

    {

      "setter": "Cinthia",

      "agendadoCRM": 1,

      "asistio": 9,

      "cancelado": 1,

      "noShow": 1,

      "pendienteAgenda": 0,

      "reagendado": 0,

      "total": 12

    }

  ]

}

Mientras la API real no esté conectada, usar datos mock separados del componente.

No mezclar los datos mock con la lógica visual.

========================================

9. DISEÑO

========================================

Diseño corporativo y profesional.

Estilo:

- fondo claro

- tarjetas blancas

- bordes suaves

- sombras muy discretas

- buena jerarquía visual

- tipografía clara

- espacio suficiente entre componentes

- dashboard compacto, no excesivamente grande

Debe verse bien dentro de un iframe en GoHighLevel.

Evitar:

- menús laterales innecesarios

- headers gigantes

- animaciones exageradas

- componentes decorativos que consuman espacio

- texto de relleno

========================================

10. RESPONSIVE / IFRAME

========================================

La aplicación será incrustada dentro de GoHighLevel.

Por lo tanto:

- debe funcionar correctamente en iframe

- usar width: 100%

- evitar alturas fijas innecesarias

- evitar overflow general de la página

- permitir scroll vertical normal

- tabla con overflow-x automático

- diseño correcto en desktop principalmente

- compatible también con tablet

No implementar autenticación todavía.

========================================

11. NAVEGACIÓN

========================================

Rutas sugeridas:

/reports

→ selector de reportes

/reports/vsl-closers

→ dashboard VSL | CLOSERS

La ruta inicial debe ser:

/reports

Si el usuario entra directamente a:

/reports/vsl-closers

debe poder ver el dashboard sin depender de navegar primero desde /reports.

========================================

12. ESTADOS DE LA INTERFAZ

========================================

Implementar correctamente:

Loading:

“Cargando reporte...”

Error:

“No se pudo cargar la información. Intenta nuevamente.”

Sin datos:

“No existen registros para los filtros seleccionados.”

Nunca mostrar una tabla rota.

========================================

13. BOTÓN DE SINCRONIZACIÓN

========================================

Agregar arriba a la derecha un botón:

Actualizar datos

Por ahora crear solamente la interfaz y la función preparada para conectar posteriormente con un endpoint de Apps Script que ejecutará una reconciliación con GoHighLevel.

Al hacer clic:

- cambiar texto a “Actualizando...”

- deshabilitar temporalmente el botón

- mostrar spinner

- cuando la API responda, volver a cargar los datos del dashboard

- mostrar mensaje discreto:

  “Datos actualizados correctamente”

No ejecutar todavía ninguna URL real si no se proporciona endpoint.

Preparar una función:

triggerVslReconciliation()

en la capa de servicios para conectarla después.

========================================

14. FECHA DE ÚLTIMA ACTUALIZACIÓN

========================================

Mostrar en la cabecera del dashboard:

Última actualización:

06/09/2026 10:42

Este valor debe venir del backend/API.

========================================

15. TECNOLOGÍA

========================================

Usar:

- React

- TypeScript

- Tailwind CSS

- componentes reutilizables

- Recharts para gráficos

Mantener código limpio y modular.

Separar como mínimo:

pages/

  ReportsPage

  VslClosersDashboard

components/

  ReportCard

  DashboardFilters

  KpiCard

  SetterStatusTable

  SetterStatusChart

  ConversionSummary

services/

  reports.ts

types/

  reports.ts

data/

  mockVslClosers.ts

========================================

16. MUY IMPORTANTE

========================================

No inventes nuevas métricas ni estados.

Los únicos Estados de agenda iniciales son:

- Agendado CRM

- Asistió

- Cancelado

- No show

- Pendiente de agenda

- Reagendado

El reporte pertenece exclusivamente a:

VSL | CLOSERS

No mezclar datos de otras secuencias.

LANZAMIENTO PAGADO OEI debe aparecer solamente en la pantalla de selección como “Próximamente”.

Quiero que primero construyas la estructura completa, navegación, tabla dinámica, KPIs y gráficos con datos mock.

Después conectaremos la API real.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/839f049c-0a62-4d46-b658-30675041bf38).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
