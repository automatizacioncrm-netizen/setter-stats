/** OBSOLETO: propuesta inicial anterior al contrato real confirmado.
 * NO DESPLEGAR: el Apps Script existente ya expone doGet; diagnosticar su registro
 * de ejecuciones. Este ejemplo usa filas y unidades diferentes al endpoint real.
 * Ver docs/VSL_QUALITY_SETUP.md. Se conserva solo como referencia histórica.
 */
/** Deploy in the NEW VSL Apps Script project only. Do not replace an existing doGet:
 * if one exists, integrate this handler into its routing explicitly.
 * Reads materialized reports only; never synchronizes GHL or rebuilds sheets.
 */
function doGet(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var spreadsheetId = props.getProperty('VSL_REPORT_SPREADSHEET_ID');
    var generatedAt = props.getProperty('VSL_REPORT_GENERATED_AT');
    // Set by the existing report generator AFTER a successful materialization.
    // No default timestamp: a read is not a data update.
    if (!spreadsheetId || !generatedAt || isNaN(Date.parse(generatedAt))) {
      throw new Error('Configura el documento y la fecha real de generación.');
    }
    if (props.getProperty('VSL_REPORT_PERCENTAGE_UNIT') !== 'ratio') {
      throw new Error('Confirma la unidad de porcentajes del reporte materializado.');
    }
    var book = SpreadsheetApp.openById(spreadsheetId);
    function readTable(name, width) {
      var sheet = book.getSheetByName(name);
      if (!sheet) throw new Error('Falta una hoja de reporte materializado.');
      var values = sheet.getDataRange().getValues();
      // Contract: row 1 contains the exact dashboard headings, no merged title rows.
      if (!values.length || values[0].length !== width) throw new Error('Encabezados incompatibles.');
      var columns = values.shift().map(String);
      var rows = values.filter(function(row) { return row.some(function(v) { return v !== ''; }); });
      // Explicit configuration must confirm numeric percentages are stored as ratios.
      // Generator must already use the approved denominators and matching rules.
      rows = rows.map(function(row) {
        return row.map(function(value, index) {
          if (columns[index].charAt(0) !== '%') return value;
          if (typeof value === 'number') return value * 100;
          if (typeof value === 'string' && /^\d+(\.\d+)?%$/.test(value.trim())) return Number(value.trim().slice(0, -1));
          if (value === '') return null;
          throw new Error('Porcentaje ambiguo; valida el formato de origen.');
        });
      });
      return { columns: columns, rows: rows };
    }
    var result = {
      success: true, generatedAt: new Date(generatedAt).toISOString(),
      timeZone: 'America/Lima', percentageUnit: 'percent',
      quality: readTable('VSL_CALIDAD_LEADS', 15),
      surveys: readTable('VSL_REPORTE_ENCUESTAS', 19),
      diagnostics: { warnings: [] }
    };
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Reporte no disponible: valida configuración y hojas materializadas.' })).setMimeType(ContentService.MimeType.JSON);
  }
}
