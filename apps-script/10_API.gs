// ============================================================
// 10_API
//
// API PARA REPORT HUB
//
// POST:
//   action=vsl_reconciliar
//
// GET:
//   action=vsl_report
//
// Ambos protegidos con FRONTEND_SECRET
// ============================================================

// ============================================================
// POST
// EJECUTAR RECONCILIACIÓN
// ============================================================

function doPost(e) {
  try {
    const action = API_GET_PARAM(e, "action");

    // ========================================================
    // VSL_RECONCILIAR
    // ========================================================

    if (action === "vsl_reconciliar") {
      if (!API_VALIDATE_SECRET(e)) {
        return API_JSON_RESPONSE({
          ok: false,
          error: "Unauthorized",
        });
      }

      const lock = LockService.getScriptLock();

      if (!lock.tryLock(5000)) {
        return API_JSON_RESPONSE({
          ok: false,
          error: "Ya existe una sincronización en ejecución.",
        });
      }

      try {
        console.log("API | Ejecutando VSL_RECONCILIAR");

        const resultado = VSL_RECONCILIAR();

        return API_JSON_RESPONSE({
          ok: true,

          funcion: "VSL_RECONCILIAR",

          mensaje: "Sincronización completada",

          resultado: resultado,

          timestamp: new Date().toISOString(),
        });
      } finally {
        lock.releaseLock();
      }
    }

    // ========================================================
    // ACCIÓN DESCONOCIDA
    // ========================================================

    return API_JSON_RESPONSE({
      ok: false,
      error: "Acción no válida",
    });
  } catch (error) {
    console.error("API POST ERROR | " + error.message);

    return API_JSON_RESPONSE({
      ok: false,

      error: error.message,
    });
  }
}

// ============================================================
// GET
// OBTENER REPORTE VSL | CLOSERS
// ============================================================

function doGet(e) {
  try {
    const action = API_GET_PARAM(e, "action");

    // ========================================================
    // REPORTE VSL | CLOSERS
    // ========================================================

    if (action === "vsl_report") {
      if (!API_VALIDATE_SECRET(e)) {
        return API_JSON_RESPONSE({
          ok: false,
          error: "Unauthorized",
        });
      }

      const filtros = {
        leadType: API_GET_PARAM(e, "leadType") || "paid",
        dateFrom: API_GET_PARAM(e, "dateFrom"),

        dateTo: API_GET_PARAM(e, "dateTo"),

        setter: API_GET_PARAM(e, "setter"),

        status: API_GET_PARAM(e, "status"),

        vslOrigin: API_GET_PARAM(e, "vslOrigin"),

        closer: API_GET_PARAM(e, "closer"),

        search: API_GET_PARAM(e, "search"),

        page: Number(API_GET_PARAM(e, "page") || 1),

        pageSize: Number(API_GET_PARAM(e, "pageSize") || 25),
      };

      const reporte = API_BUILD_VSL_REPORT(filtros);

      return API_JSON_RESPONSE({
        ok: true,

        data: reporte,
      });
    }

    // ========================================================
    // HEALTH CHECK OPCIONAL
    // ========================================================

    if (action === "ping") {
      return API_JSON_RESPONSE({
        ok: true,

        servicio: "Report Hub API",

        timestamp: new Date().toISOString(),
      });
    }

    return API_JSON_RESPONSE({
      ok: false,

      error: "Acción no válida",
    });
  } catch (error) {
    console.error("API GET ERROR | " + error.message);

    return API_JSON_RESPONSE({
      ok: false,

      error: error.message,
    });
  }
}

// ============================================================
// CONSTRUIR REPORTE VSL
// ============================================================

function API_NORMALIZE_SOURCE(value) {
  return String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function API_GET_LEAD_TYPE(fuente) {
  const normalized = API_NORMALIZE_SOURCE(fuente);
  if (normalized.includes("VSL FUNNEL")) return "paid";
  if (normalized.includes("ORGANICO")) return "organic";
  return "other";
}

function API_BUILD_VSL_REPORT(filtros) {
  filtros = { ...(filtros || {}), leadType: filtros && filtros.leadType === "organic" ? "organic" : "paid" };

  const sheet = SHEET_GET_DATA_SHEET();

  const lastRow = sheet.getLastRow();

  const lastColumn = sheet.getLastColumn();

  if (lastRow < 2) {
    return API_EMPTY_VSL_REPORT(filtros);
  }

  // ==========================================================
  // LEER SHEET UNA SOLA VEZ
  // ==========================================================

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();

  const headers = values[0].map((header) => String(header || "").trim());

  const rows = values.slice(1);

  // ==========================================================
  // ÍNDICES
  // ==========================================================

  const idx = {
    nombre: API_HEADER_INDEX(headers, "Nombre contacto"),

    telefono: API_HEADER_INDEX(headers, "Telefono"),

    correo: API_HEADER_INDEX(headers, "Correo electrónico"),

    secuencia: API_HEADER_INDEX(headers, "Secuencia"),

    fase: API_HEADER_INDEX(headers, "Fase"),

    fuente: API_HEADER_INDEX(headers, "Fuente"),

    asignado: API_HEADER_INDEX(headers, "Asignado"),

    setter: API_HEADER_INDEX(headers, "Setter asignado"),

    vslOrigen: API_HEADER_INDEX(headers, "VSL Origen"),

    estadoAgenda: API_HEADER_INDEX(headers, "Estado de agenda"),

    fechaReunion: API_HEADER_INDEX(headers, "Fecha de reunión"),

    syncedAt: API_HEADER_INDEX_OPTIONAL(headers, "_Synced At"),
  };

  // ==========================================================
  // ESTADOS OFICIALES
  // ==========================================================

  const ESTADOS = [
    "Agendado CRM",
    "Asistió",
    "Cancelado",
    "No show",
    "Pendiente de agenda",
    "Reagendado",
  ];

  // ==========================================================
  // FILTRAR REGISTROS
  // ==========================================================

  const registros = [];

  const sourceRows = rows.filter((row) =>
    API_CELL_STRING(row[idx.secuencia]).toLowerCase() === APP_CONFIG.PIPELINE_NAME.toLowerCase() &&
    API_GET_LEAD_TYPE(row[idx.fuente]) === filtros.leadType
  );
  sourceRows.forEach((row) => {
    const secuencia = API_CELL_STRING(row[idx.secuencia]);

    // Solo VSL | Closers
    if (secuencia.toLowerCase() !== APP_CONFIG.PIPELINE_NAME.toLowerCase()) {
      return;
    }


    const setter = API_CELL_STRING(row[idx.setter]);

    const estadoAgenda = API_CELL_STRING(row[idx.estadoAgenda]);

    const vslOrigen = API_CELL_STRING(row[idx.vslOrigen]);

    const closer = API_CELL_STRING(row[idx.asignado]);

    const fechaReunion = API_NORMALIZE_DATE(row[idx.fechaReunion]);

    // ======================================================
    // FILTRO SETTER
    // ======================================================

    if (filtros.setter && setter !== filtros.setter) {
      return;
    }

    // ======================================================
    // FILTRO ESTADO
    // ======================================================

    if (filtros.status && estadoAgenda !== filtros.status) {
      return;
    }

    // ======================================================
    // FILTRO VSL ORIGEN
    // ======================================================

    if (filtros.vslOrigin && vslOrigen !== filtros.vslOrigin) {
      return;
    }

    // ======================================================
    // FILTRO CLOSER
    // ======================================================

    if (filtros.closer && closer !== filtros.closer) {
      return;
    }

    // ======================================================
    // FILTRO FECHA DESDE
    // ======================================================

    if (filtros.dateFrom && (!fechaReunion || fechaReunion < filtros.dateFrom)) {
      return;
    }

    // ======================================================
    // FILTRO FECHA HASTA
    // ======================================================

    if (filtros.dateTo && (!fechaReunion || fechaReunion > filtros.dateTo)) {
      return;
    }

    const registro = {
      nombreContacto: API_CELL_STRING(row[idx.nombre]),

      telefono: API_CELL_STRING(row[idx.telefono]),

      correo: API_CELL_STRING(row[idx.correo]),

      setterAsignado: setter,

      closerAsignado: closer,

      vslOrigen: vslOrigen,

      estadoAgenda: estadoAgenda,

      fechaReunion: fechaReunion,

      fase: API_CELL_STRING(row[idx.fase]),

      fuente: API_CELL_STRING(row[idx.fuente]),
    };

    registros.push(registro);
  });

  // ==========================================================
  // AGRUPAR POR SETTER
  // ==========================================================

  const setterMap = new Map();

  registros.forEach((registro) => {
    const setter = registro.setterAsignado || "Sin setter";

    if (!setterMap.has(setter)) {
      setterMap.set(setter, {
        setter: setter,

        agendadoCRM: 0,

        asistio: 0,

        cancelado: 0,

        noShow: 0,

        pendienteAgenda: 0,

        reagendado: 0,

        total: 0,
      });
    }

    const item = setterMap.get(setter);

    switch (registro.estadoAgenda) {
      case "Agendado CRM":
        item.agendadoCRM++;

        break;

      case "Asistió":
        item.asistio++;

        break;

      case "Cancelado":
        item.cancelado++;

        break;

      case "No show":
        item.noShow++;

        break;

      case "Pendiente de agenda":
        item.pendienteAgenda++;

        break;

      case "Reagendado":
        item.reagendado++;

        break;
    }

    // Solo contamos estados oficiales
    if (ESTADOS.includes(registro.estadoAgenda)) {
      item.total++;
    }
  });

  const setters = Array.from(setterMap.values()).sort((a, b) => b.total - a.total);

  // ==========================================================
  // KPIs
  // ==========================================================

  const kpis = {
    total: 0,

    agendadoCRM: 0,

    asistio: 0,

    cancelado: 0,

    noShow: 0,

    pendienteAgenda: 0,

    reagendado: 0,

    tasaAsistencia: 0,

    tasaNoShow: 0,
  };

  setters.forEach((item) => {
    kpis.total += item.total;

    kpis.agendadoCRM += item.agendadoCRM;

    kpis.asistio += item.asistio;

    kpis.cancelado += item.cancelado;

    kpis.noShow += item.noShow;

    kpis.pendienteAgenda += item.pendienteAgenda;

    kpis.reagendado += item.reagendado;
  });

  if (kpis.total > 0) {
    kpis.tasaAsistencia = Number(((kpis.asistio / kpis.total) * 100).toFixed(2));

    kpis.tasaNoShow = Number(((kpis.noShow / kpis.total) * 100).toFixed(2));
  }

  // La población incluye pagados sin estado válido; search no modifica los KPIs.
  const leadTypeKpis = {
    totalLeads: registros.length,
    attended: kpis.asistio,
    attendanceRate: registros.length
      ? Number(((kpis.asistio / registros.length) * 100).toFixed(2))
      : 0,
  };

  // ==========================================================
  // FILTROS DISPONIBLES
  // ==========================================================

  const settersDisponibles = API_UNIQUE_SORTED(sourceRows.map((row) => API_CELL_STRING(row[idx.setter])));

  const closersDisponibles = API_UNIQUE_SORTED(
    sourceRows.map((row) => API_CELL_STRING(row[idx.asignado])),
  );

  const origenesDisponibles = API_UNIQUE_SORTED(
    sourceRows.map((row) => API_CELL_STRING(row[idx.vslOrigen])),
  );

  // ==========================================================
  // PAGINACIÓN DEL DETALLE
  // ==========================================================

  const needle = String(filtros.search || "").trim().toLowerCase();
  const registrosDetalle = registros.filter((registro) =>
    [registro.nombreContacto, registro.telefono, registro.correo]
      .join(" ").toLowerCase().includes(needle),
  );

  const pageSize = Math.min(100, Math.max(1, Number(filtros.pageSize || 25)));

  const totalDetail = registrosDetalle.length;

  const totalPages = Math.max(1, Math.ceil(totalDetail / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(filtros.page || 1)));

  const start = (page - 1) * pageSize;

  const detail = registrosDetalle.slice(start, start + pageSize);

  // ==========================================================
  // ÚLTIMA ACTUALIZACIÓN
  // ==========================================================

  const updatedAt = new Date().toISOString();

  // ==========================================================
  // RESPONSE
  // ==========================================================

  return {
    report: "VSL | CLOSERS",
    leadType: filtros.leadType,

    updatedAt: updatedAt,

    filters: {
      applied: filtros,

      available: {
        setters: settersDisponibles,

        statuses: ESTADOS,

        vslOrigins: origenesDisponibles,

        closers: closersDisponibles,
      },
    },

    kpis: kpis,
    leadTypeKpis: leadTypeKpis,
    unknownStatusCount: registros.length - kpis.total,

    setters: setters,

    detail: {
      rows: detail,

      pagination: {
        page: page,

        pageSize: pageSize,

        totalRecords: totalDetail,

        totalPages: totalPages,
      },
    },
  };
}

// ============================================================
// REPORTE VACÍO
// ============================================================

function API_EMPTY_VSL_REPORT(filtros) {
  filtros = filtros || { leadType: "paid" };
  return {
    leadTypeKpis: { totalLeads: 0, attended: 0, attendanceRate: 0 },
    unknownStatusCount: 0,
    report: "VSL | CLOSERS",

    updatedAt: new Date().toISOString(),

    filters: {
      applied: filtros,

      available: {
        setters: [],

        statuses: [
          "Agendado CRM",
          "Asistió",
          "Cancelado",
          "No show",
          "Pendiente de agenda",
          "Reagendado",
        ],

        vslOrigins: [],

        closers: [],
      },
    },

    kpis: {
      total: 0,

      agendadoCRM: 0,

      asistio: 0,

      cancelado: 0,

      noShow: 0,

      pendienteAgenda: 0,

      reagendado: 0,

      tasaAsistencia: 0,

      tasaNoShow: 0,
    },

    setters: [],

    detail: {
      rows: [],

      pagination: {
        page: 1,

        pageSize: 25,

        totalRecords: 0,

        totalPages: 1,
      },
    },
  };
}

// ============================================================
// VALIDAR FRONTEND_SECRET
// ============================================================

function API_VALIDATE_SECRET(e) {
  const expected = PropertiesService.getScriptProperties().getProperty("FRONTEND_SECRET");

  const received = API_GET_PARAM(e, "key");

  return Boolean(expected && received && expected === received);
}

// ============================================================
// OBTENER QUERY PARAM
// ============================================================

function API_GET_PARAM(e, name) {
  if (!e || !e.parameter) {
    return "";
  }

  return String(e.parameter[name] || "").trim();
}

// ============================================================
// ÍNDICE DE HEADER OBLIGATORIO
// ============================================================

function API_HEADER_INDEX(headers, headerName) {
  const index = headers.indexOf(headerName);

  if (index === -1) {
    throw new Error("No se encontró la columna: " + headerName);
  }

  return index;
}

// ============================================================
// ÍNDICE DE HEADER OPCIONAL
// ============================================================

function API_HEADER_INDEX_OPTIONAL(headers, headerName) {
  return headers.indexOf(headerName);
}

// ============================================================
// CELDA -> STRING
// ============================================================

function API_CELL_STRING(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

// ============================================================
// NORMALIZAR FECHA YYYY-MM-DD
// ============================================================

function API_NORMALIZE_DATE(value) {
  if (!value) {
    return "";
  }

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  const text = String(value).trim();

  // ISO
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);

  if (isoMatch) {
    return isoMatch[1];
  }

  const date = new Date(text);

  if (!isNaN(date.getTime())) {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  return "";
}

// ============================================================
// UNIQUE + SORT
// ============================================================

function API_UNIQUE_SORTED(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

// ============================================================
// RESPUESTA JSON
// ============================================================

function API_JSON_RESPONSE(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
