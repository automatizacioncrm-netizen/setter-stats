// ============================================================
// 10_API
//
// API REPORT HUB - VSL | CLOSERS + OEI
//
// POST:
//   action=vsl_reconciliar (compatibilidad)
//   action=reconcile_all
//
// GET:
//   action=vsl_report
//
// leadType:
//   paid     -> Fuente contiene "VSL FUNNEL"
//   organic  -> Fuente contiene "ORGANICO" / "ORGÁNICO"
//
// Por defecto:
//   all
//
// Ambos endpoints protegidos con FRONTEND_SECRET
// ============================================================


// ============================================================
// POST
// EJECUTAR RECONCILIACIÓN
// ============================================================

// ============================================================
// RECONCILIACIÓN GLOBAL DE LOS DOS MASTER
//
// ORDEN:
// 1. OPPORTUNITIES_MASTER desde GHL
// 2. APPOINTMENTS_MASTER desde Calendar
// 3. Recalcular Numero de citas en OPPORTUNITIES_MASTER
//
// IMPORTANTE:
// - NO agrega un LockService exterior porque cada reconciliador
//   ya administra su propio lock.
// - OPM_FULL_SYNC usa checkpoint. Si todavía no termina, esta
//   función devuelve completed:false y NO ejecuta appointments.
//   El frontend debe volver a llamar action=reconcile_all.
// ============================================================

const API_RECON = {
  OPP_STAGE_PROPERTY: "API_RECON_OPPORTUNITIES_STAGE_V2",
  ALL_STAGE_PROPERTY: "API_RECON_ALL_STAGE_V2"
};

function API_RECON_GET_STAGE_(propertyName, fallback) {
  return PropertiesService.getScriptProperties().getProperty(propertyName) || fallback;
}

function API_RECON_SET_STAGE_(propertyName, stage) {
  PropertiesService.getScriptProperties().setProperty(propertyName, stage);
}

function API_RECON_CLEAR_STAGE_(propertyName) {
  PropertiesService.getScriptProperties().deleteProperty(propertyName);
}

// OPPORTUNITIES_MASTER se reconcilia con los dos procesos V2:
// 1) faltantes; 2) existentes cuyo GHL Updated At cambió.
function API_RECONCILIAR_OPPORTUNITIES() {
  if (typeof OPM_SYNC_MISSING_ONLY !== "function") {
    throw new Error("No existe OPM_SYNC_MISSING_ONLY().");
  }
  if (typeof OPM_SYNC_UPDATED_ONLY !== "function") {
    throw new Error("No existe OPM_SYNC_UPDATED_ONLY().");
  }

  const startedAt = new Date();
  let stage = API_RECON_GET_STAGE_(API_RECON.OPP_STAGE_PROPERTY, "MISSING");

  if (stage === "MISSING") {
    const result = OPM_SYNC_MISSING_ONLY();
    if (result && result.success === false) {
      throw new Error(result.error || "MISSING_ONLY devolvió success:false.");
    }
    if (!result || result.completed !== true) {
      return {
        success: true, completed: false, stage: "MISSING",
        nextAction: "CALL_RECONCILE_OPPORTUNITIES_AGAIN",
        result: result || null,
        startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString()
      };
    }
    // No iniciamos UPDATED en la misma llamada: MISSING puede haber consumido
    // casi todo el tiempo máximo de Apps Script.
    API_RECON_SET_STAGE_(API_RECON.OPP_STAGE_PROPERTY, "UPDATED");
    return {
      success: true, completed: false, stage: "UPDATED_PENDING",
      nextAction: "CALL_RECONCILE_OPPORTUNITIES_AGAIN",
      result: result,
      startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString()
    };
  }

  const result = OPM_SYNC_UPDATED_ONLY();
  if (result && result.success === false) {
    throw new Error(result.error || "UPDATED_ONLY devolvió success:false.");
  }
  if (!result || result.completed !== true) {
    return {
      success: true, completed: false, stage: "UPDATED",
      nextAction: "CALL_RECONCILE_OPPORTUNITIES_AGAIN",
      result: result || null,
      startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString()
    };
  }

  API_RECON_CLEAR_STAGE_(API_RECON.OPP_STAGE_PROPERTY);
  return {
    success: true, completed: true, stage: "COMPLETED", nextAction: null,
    result: result,
    startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString()
  };
}

// APPOINTMENTS_MASTER se reconcilia por separado y después recalcula
// Numero de citas en OPPORTUNITIES_MASTER.
function API_RECONCILIAR_APPOINTMENTS() {
  if (typeof APPOINTMENTS_MASTER_RECONCILIAR !== "function") {
    throw new Error("No existe APPOINTMENTS_MASTER_RECONCILIAR().");
  }
  if (typeof OPM_ACTUALIZAR_NUMERO_CITAS !== "function") {
    throw new Error("No existe OPM_ACTUALIZAR_NUMERO_CITAS().");
  }

  const startedAt = new Date();
  const appointments = APPOINTMENTS_MASTER_RECONCILIAR();
  if (appointments && appointments.success === false) {
    throw new Error(appointments.error || "APPOINTMENTS_MASTER devolvió success:false.");
  }
  const appointmentCounts = OPM_ACTUALIZAR_NUMERO_CITAS();
  if (appointmentCounts && appointmentCounts.success === false) {
    throw new Error(appointmentCounts.error || "No se pudo actualizar Numero de citas.");
  }

  return {
    success: true, completed: true, stage: "COMPLETED",
    appointments: appointments || null,
    appointmentCounts: appointmentCounts || null,
    startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString()
  };
}

// Compatibilidad: reconciliación completa, pero respetando la separación.
// El frontend repite reconcile_all mientras completed=false.
function RECONCILIAR_TODO() {
  let stage = API_RECON_GET_STAGE_(API_RECON.ALL_STAGE_PROPERTY, "OPPORTUNITIES");

  if (stage === "OPPORTUNITIES") {
    const opportunities = API_RECONCILIAR_OPPORTUNITIES();
    if (!opportunities.completed) {
      return {
        success: true, completed: false, stage: "OPPORTUNITIES_MASTER",
        nextAction: "CALL_RECONCILE_ALL_AGAIN", opportunities: opportunities,
        appointments: null, appointmentCounts: null
      };
    }
    API_RECON_SET_STAGE_(API_RECON.ALL_STAGE_PROPERTY, "APPOINTMENTS");
    return {
      success: true, completed: false, stage: "APPOINTMENTS_PENDING",
      nextAction: "CALL_RECONCILE_ALL_AGAIN", opportunities: opportunities,
      appointments: null, appointmentCounts: null
    };
  }

  const appointments = API_RECONCILIAR_APPOINTMENTS();
  API_RECON_CLEAR_STAGE_(API_RECON.ALL_STAGE_PROPERTY);
  return {
    success: true, completed: true, stage: "COMPLETED", nextAction: null,
    opportunities: null,
    appointments: appointments.appointments || null,
    appointmentCounts: appointments.appointmentCounts || null
  };
}

function API_POST_RESULT_(functionName, result, retryAction) {
  const completed = Boolean(result && result.completed === true);
  return API_JSON_RESPONSE({
    ok: true,
    completed: completed,
    funcion: functionName,
    stage: result && result.stage ? result.stage : null,
    mensaje: completed ? "Reconciliación completada" : "Reconciliación en progreso; continuar desde checkpoint.",
    nextAction: completed ? null : retryAction,
    resultado: result || null,
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    const action = API_GET_PARAM(e, "action");

    if (["vsl_reconciliar", "reconcile_all", "reconcile_opportunities", "reconcile_appointments"].indexOf(action) !== -1) {
      if (!API_VALIDATE_SECRET(e)) {
        return API_JSON_RESPONSE({ ok: false, completed: false, error: "Unauthorized" });
      }
    }

    if (action === "reconcile_opportunities") {
      return API_POST_RESULT_(
        "API_RECONCILIAR_OPPORTUNITIES",
        API_RECONCILIAR_OPPORTUNITIES(),
        "CALL_RECONCILE_OPPORTUNITIES_AGAIN"
      );
    }

    if (action === "reconcile_appointments") {
      return API_POST_RESULT_(
        "API_RECONCILIAR_APPOINTMENTS",
        API_RECONCILIAR_APPOINTMENTS(),
        null
      );
    }

    if (action === "vsl_reconciliar" || action === "reconcile_all") {
      return API_POST_RESULT_(
        "RECONCILIAR_TODO",
        RECONCILIAR_TODO(),
        "CALL_RECONCILE_ALL_AGAIN"
      );
    }

    return API_JSON_RESPONSE({ ok: false, completed: false, error: "Acción no válida" });
  } catch (error) {
    console.error("API POST ERROR | " + error.message);
    return API_JSON_RESPONSE({
      ok: false, completed: false, error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}


function doGet(e) {

  try {

    const action =
      API_GET_PARAM(
        e,
        "action"
      );


    // ========================================================
    // REPORTE PRINCIPAL
    // ========================================================

    if (
      action ===
      "vsl_report"
    ) {

      if (
        !API_VALIDATE_SECRET(e)
      ) {

        return API_JSON_RESPONSE({
          ok: false,
          error: "Unauthorized"
        });

      }


      const requestedLeadType =
        API_NORMALIZE_LEAD_TYPE(
          API_GET_PARAM(
            e,
            "leadType"
          )
        );


      const filtros = {

        leadType:
          requestedLeadType,

        pipeline:
          API_NORMALIZE_PIPELINE_FILTER(
            API_GET_PARAM(
              e,
              "pipeline"
            )
          ),

        calendar:
          API_GET_PARAM(
            e,
            "calendar"
          ),

        dateFrom:
          API_GET_PARAM(
            e,
            "dateFrom"
          ),

        dateTo:
          API_GET_PARAM(
            e,
            "dateTo"
          ),

        dateField:
          API_GET_PARAM(
            e,
            "dateField"
          ),

        bookingMode:
          API_GET_PARAM(
            e,
            "bookingMode"
          ),

        dayGap:
          API_GET_PARAM(
            e,
            "dayGap"
          ),

        setter:
          API_GET_PARAM(
            e,
            "setter"
          ),

        booker:
          API_GET_PARAM(
            e,
            "booker"
          ),

        status:
          API_GET_PARAM(
            e,
            "status"
          ),

        vslOrigin:
          API_GET_PARAM(
            e,
            "vslOrigin"
          ),

        vslTipo:
          API_GET_PARAM(
            e,
            "vslTipo"
          ),

        closer:
          API_GET_PARAM(
            e,
            "closer"
          ),

        search:
          API_GET_PARAM(
            e,
            "search"
          ),

        page:
          Number(
            API_GET_PARAM(
              e,
              "page"
            ) || 1
          ),

        pageSize:
          Number(
            API_GET_PARAM(
              e,
              "pageSize"
            ) || 25
          )

      };


      const reporte =
        API_BUILD_VSL_REPORT(
          filtros
        );


      return API_JSON_RESPONSE({
        ok: true,
        data: reporte
      });

    }


    // ========================================================
    // DETALLE DE CITAS PARA MODAL
    //
    // GET:
    // action=appointment_detail
    //
    // Soporta:
    // pipeline, leadType, calendar, dateFrom, dateTo,
    // setter, booker, status, vslOrigin, vslTipo,
    // closer, search, page, pageSize
    // ========================================================

    if (
      action ===
      "appointment_detail"
    ) {

      if (
        !API_VALIDATE_SECRET(e)
      ) {

        return API_JSON_RESPONSE({
          ok: false,
          error: "Unauthorized"
        });

      }


      const filtros = {

        pipeline:
          API_NORMALIZE_PIPELINE_FILTER(
            API_GET_PARAM(
              e,
              "pipeline"
            )
          ),

        leadType:
          API_NORMALIZE_LEAD_TYPE(
            API_GET_PARAM(
              e,
              "leadType"
            )
          ),

        calendar:
          API_GET_PARAM(
            e,
            "calendar"
          ),

        dateFrom:
          API_GET_PARAM(
            e,
            "dateFrom"
          ),

        dateTo:
          API_GET_PARAM(
            e,
            "dateTo"
          ),

        dateField:
          API_GET_PARAM(
            e,
            "dateField"
          ),

        bookingMode:
          API_GET_PARAM(
            e,
            "bookingMode"
          ),

        dayGap:
          API_GET_PARAM(
            e,
            "dayGap"
          ),

        setter:
          API_GET_PARAM(
            e,
            "setter"
          ),

        booker:
          API_GET_PARAM(
            e,
            "booker"
          ),

        status:
          API_GET_PARAM(
            e,
            "status"
          ),

        vslOrigin:
          API_GET_PARAM(
            e,
            "vslOrigin"
          ),

        vslTipo:
          API_GET_PARAM(
            e,
            "vslTipo"
          ),

        closer:
          API_GET_PARAM(
            e,
            "closer"
          ),

        search:
          API_GET_PARAM(
            e,
            "search"
          ),

        page:
          Number(
            API_GET_PARAM(
              e,
              "page"
            ) || 1
          ),

        pageSize:
          Number(
            API_GET_PARAM(
              e,
              "pageSize"
            ) || 50
          )

      };


      const detalle =
        API_BUILD_APPOINTMENT_DETAIL(
          filtros
        );


      return API_JSON_RESPONSE({
        ok: true,
        data: detalle
      });

    }


    // ========================================================
    // HEALTH CHECK
    // ========================================================

    if (
      action === "ping"
    ) {

      return API_JSON_RESPONSE({

        ok: true,

        servicio:
          "Report Hub API",

        timestamp:
          new Date().toISOString()

      });

    }


    return API_JSON_RESPONSE({
      ok: false,
      error: "Acción no válida"
    });


  } catch (error) {

    console.error(
      "API GET ERROR | " +
      error.message
    );


    return API_JSON_RESPONSE({
      ok: false,
      error: error.message
    });

  }

}


// ============================================================
// NORMALIZAR TIPO DE LEAD
//
// Valores:
// - all      -> VSL pagado + VSL orgánico
// - paid     -> VSL calendarios [A]
// - organic  -> VSL calendarios [ORG]
//
// OEI NO usa tipo de lead.
// Por defecto: all.
// ============================================================

function API_NORMALIZE_LEAD_TYPE(
  value
) {

  const normalized =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();


  if (
    normalized === "paid"
  ) {

    return "paid";

  }


  if (
    normalized === "organic"
  ) {

    return "organic";

  }


  return "all";

}



// ============================================================
// NORMALIZAR FILTRO DE PIPELINE
//
// Valores:
// - all  -> ambos embudos
// - vsl  -> VSL | Closers
// - oei  -> Lanzamiento I. Pagado OEI - EM
// - lig  -> Lanzamiento Interno Gratuito
// ============================================================

function API_NORMALIZE_PIPELINE_FILTER(
  value
) {

  const normalized =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();


  if (
    normalized === "vsl"
  ) {

    return "vsl";

  }


  if (
    normalized === "oei"
  ) {

    return "oei";

  }


  if (
    normalized === "lig"
  ) {

    return "lig";

  }


  return "all";

}


// ============================================================
// IDENTIFICAR PIPELINE DESDE "Secuencia"
// ============================================================

function API_GET_PIPELINE_KEY(
  secuencia
) {

  const value =
    String(
      secuencia || ""
    )
      .trim()
      .toLowerCase();


  if (
    value ===
    String(
      GHL_PIPELINES.VSL_CLOSERS.name
    )
      .trim()
      .toLowerCase()
  ) {

    return "vsl";

  }


  if (
    value ===
    String(
      GHL_PIPELINES.OEI_EM.name
    )
      .trim()
      .toLowerCase()
  ) {

    return "oei";

  }


  if (
    value ===
    String(
      GHL_PIPELINES.LIG.name
    )
      .trim()
      .toLowerCase()
  ) {

    return "lig";

  }


  return "";

}


// ============================================================
// LABEL DE PIPELINE
// ============================================================

function API_GET_PIPELINE_LABEL(
  pipelineKey
) {

  if (
    pipelineKey === "vsl"
  ) {

    return GHL_PIPELINES.VSL_CLOSERS.name;

  }


  if (
    pipelineKey === "oei"
  ) {

    return GHL_PIPELINES.OEI_EM.name;

  }


  if (
    pipelineKey === "lig"
  ) {

    return GHL_PIPELINES.LIG.name;

  }


  return "";

}


// ============================================================
// TIPO DE LEAD / AGENDAMIENTO SEGÚN PIPELINE + CALENDARIO
//
// VSL PAGADO:
// - Llamada de Claridad CM [A]
// - Sesión Equipo Millonario (A)
//
// VSL ORGÁNICO:
// - Se conserva la clasificación de leads, pero sus calendarios NO participan
//   en las métricas de citas de VSL | Closers.
//
// OEI:
// - Equipo Millonario | OEI
// - NO tiene clasificación paid / organic.
//
// Para oportunidades VSL que todavía no tienen calendario,
// se usa Fuente únicamente como fallback de clasificación.
// En cuanto exista Calendario cita, el calendario manda.
// ============================================================

function API_GET_ROW_LEAD_TYPE(
  pipelineKey,
  fuente,
  calendarioCita
) {

  if (
    pipelineKey === "oei" ||
    pipelineKey === "lig"
  ) {
    return "none";
  }

  if (
    pipelineKey !== "vsl"
  ) {
    return "other";
  }

  // ==========================================================
  // PRIMERO: CLASIFICAR POR FUENTE
  // ==========================================================

  const sourceType =
    API_GET_LEAD_TYPE(
      fuente
    );

  if (
    sourceType === "paid" ||
    sourceType === "organic"
  ) {
    return sourceType;
  }

  // ==========================================================
  // FALLBACK: CLASIFICAR POR CALENDARIO
  // ==========================================================

  const calendar =
    String(
      calendarioCita || ""
    ).trim();

  // VSL ORGÁNICO
  if (
    calendar === "ORGANICO - CIRCULO MILLONARIO" ||
    calendar === "ORGANICO - EQUIPO MILLONARIO"
  ) {
    return "organic";
  }

  // VSL PAGADO
  if (
    calendar === "VSL PAGADO - CIRCULO MILLONARIO" ||
    calendar === "VSL PAGADO - EQUIPO MILLONARIO"
  ) {
    return "paid";
  }

  return "other";
}


// ============================================================
// NORMALIZAR ESTADO DE AGENDAMIENTO
//
// PRIORIDAD:
// 1. Estado cita (Calendar)
// 2. Estado de agenda (Opportunity), solo si Estado cita está vacío.
//
// Los estados raw de Calendar se convierten a estados comerciales.
// IMPORTANTE: confirmed = Confirmado, NO Agendado CRM.
// ============================================================

function API_GET_EFFECTIVE_APPOINTMENT_STATUS(
  estadoCita,
  estadoAgenda
) {

  const calendarStatus =
    String(
      estadoCita || ""
    ).trim();


  if (
    calendarStatus
  ) {

    const normalized =
      calendarStatus
        .toLowerCase()
        .replace(
          /\s+/g,
          " "
        );


    const calendarMap = {

      confirmed:
        "Confirmado",

      showed:
        "Asistió",

      noshow:
        "No asistió",

      "no show":
        "No asistió",

      cancelled:
        "Cancelado",

      canceled:
        "Cancelado"

    };


    return (
      calendarMap[
        normalized
      ] ||
      calendarStatus
    );

  }


  const legacy =
    String(
      estadoAgenda || ""
    ).trim();


  if (!legacy) {

    return "";

  }


  const normalizedLegacy =
    legacy
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .trim()
      .toLowerCase()
      .replace(
        /\s+/g,
        " "
      );


  const legacyMap = {

    "agendado crm":
      "Agendado CRM",

    "asistio":
      "Asistió",

    "cancelado":
      "Cancelado",

    "cancelled":
      "Cancelado",

    "canceled":
      "Cancelado",

    "no show":
      "No asistió",

    "noshow":
      "No asistió",

    "pendiente de agenda":
      "Pendiente de agenda",

    "reagendado":
      "Reagendado",

    "confirmed":
      "Confirmado",

    "showed":
      "Asistió"

  };


  return (
    legacyMap[
      normalizedLegacy
    ] ||
    legacy
  );

}


// ============================================================
// FUENTE DEL ESTADO
// ============================================================

function API_GET_APPOINTMENT_STATUS_SOURCE(
  estadoCita
) {

  return String(
    estadoCita || ""
  ).trim()
    ? "calendar"
    : "opportunity";

}


// ============================================================
// CALENDARIOS PERMITIDOS POR PIPELINE
// ============================================================

function API_GET_ALLOWED_CALENDARS(
  pipelineKey
) {

  // ==========================================================
  // OEI
  // ==========================================================

  if (
    pipelineKey === "oei"
  ) {

    return [
      "Equipo Millonario | OEI",
      "Circulo Millonario | OEI"
    ];

  }

  // ==========================================================
  // VSL | CLOSERS
  // ==========================================================

  if (
    pipelineKey === "vsl"
  ) {

    // VSL | Closers: las métricas de citas usan SOLO calendarios VSL PAGADO.
    // Los calendarios cuyo nombre corresponde a ORGÁNICO quedan excluidos
    // de agendamientos, asistencias, tablas de Setter/Closer y métricas de citas.
    return [
      "VSL PAGADO - CIRCULO MILLONARIO",
      "VSL PAGADO - EQUIPO MILLONARIO"
    ];

  }

  // ==========================================================
  // LANZAMIENTO INTERNO GRATUITO
  // ==========================================================

  if (
    pipelineKey === "lig"
  ) {

    return [
      "Lanzamiento Interno Gratuito - EM",
      "Lanzamiento Interno Gratuito - CM"
    ];

  }

  return [];
}


// ============================================================
// VALIDAR CALENDARIO ↔ PIPELINE
// ============================================================

function API_IS_CALENDAR_ALLOWED(
  pipelineKey,
  calendarName
) {

  const calendar =
    String(
      calendarName || ""
    ).trim();


  if (!calendar) {

    return true;

  }


  return API_GET_ALLOWED_CALENDARS(
    pipelineKey
  ).includes(
    calendar
  );

}



// ============================================================
// RESUMEN DE AGENDAMIENTOS POR PIPELINE
// ============================================================

function API_BUILD_PIPELINE_APPOINTMENT_SUMMARY(
  leadRegistros,
  calendarRegistros
) {

  const createItem =
    (key, label, allowedCalendars) => ({
      key: key,
      label: label,
      totalLeads: 0,
      conCitaCalendar: 0,
      sinCitaCalendar: 0,
      estados: {
        agendadoCRM: 0,
        confirmado: 0,
        asistio: 0,
        cancelado: 0,
        noShow: 0,
        pendienteAgenda: 0,
        reagendado: 0
      },
      calendars: allowedCalendars.map(
        calendar => ({ calendar: calendar, count: 0 })
      )
    });


  const summary = {
    vsl: createItem(
      "vsl",
      GHL_PIPELINES.VSL_CLOSERS.name,
      API_GET_ALLOWED_CALENDARS("vsl")
    ),
    oei: createItem(
      "oei",
      GHL_PIPELINES.OEI_EM.name,
      API_GET_ALLOWED_CALENDARS("oei")
    ),
    lig: createItem(
      "lig",
      GHL_PIPELINES.LIG.name,
      API_GET_ALLOWED_CALENDARS("lig")
    )
  };


  // Leads: se cuentan por fecha de creación de Opportunity.
  (leadRegistros || []).forEach(
    registro => {
      const item = summary[registro.pipeline];
      if (!item) return;
      item.totalLeads++;
    }
  );


  // Agendamientos: se cuentan por _Appointment Created At.
  // Fallback: Fecha cita / Fecha de reunión.
  (calendarRegistros || []).forEach(
    registro => {
      const item = summary[registro.pipeline];
      if (!item) return;

      item.conCitaCalendar++;

      switch (registro.estadoAgenda) {
        case "Confirmado":
          item.estados.confirmado++;
          break;
        case "Asistió":
          item.estados.asistio++;
          break;
        case "Cancelado":
          item.estados.cancelado++;
          break;
        case "No asistió":
          item.estados.noShow++;
          break;
      }

      if (registro.calendarioCita) {
        const calendarItem = item.calendars.find(
          calendar => calendar.calendar === registro.calendarioCita
        );
        if (calendarItem) calendarItem.count++;
      }
    }
  );


  // sinCitaCalendar aquí representa la diferencia aritmética dentro
  // de la ventana seleccionada. No implica que sean la misma cohorte.
  Object.keys(summary).forEach(
    key => {
      summary[key].sinCitaCalendar = Math.max(
        0,
        summary[key].totalLeads - summary[key].conCitaCalendar
      );
    }
  );


  return summary;
}


// ============================================================
// NORMALIZAR FUENTE
// ============================================================

function API_NORMALIZE_SOURCE(
  value
) {

  return String(
    value || ""
  )
    .trim()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .toUpperCase();

}


// ============================================================
// CLASIFICAR FUENTE
//
// PRIORIDAD:
// 1. contiene VSL FUNNEL -> paid
// 2. contiene ORGANICO -> organic
// 3. otro -> other
// ============================================================

function API_GET_LEAD_TYPE(
  fuente
) {

  const source =
    API_NORMALIZE_SOURCE(
      fuente
    );


  const paidSources = [
    "VSL FUNNEL",
    "VSL FUNNEL (B)",
    "CUESTIONARIO DE APLICACION - VSL FUNNEL",
    "CUESTIONARIO DE APLICACION - VSL FUNNEL (B)",
    "ENCUESTA AL LEAD: \"ORDEN EMPRESARIAL INTENSIVO\" 31 DE AGOSTO, 01 Y 02 DE SEPTIEMBRE 2026"
  ];


  if (
    paidSources.includes(
      source
    )
  ) {

    return "paid";

  }


  if (
    source.includes(
      "ORGANICO"
    )
  ) {

    return "organic";

  }


  return "other";

}


// ============================================================
// NORMALIZAR / VALIDAR VSL ORIGEN - SOLO VSL | CLOSERS
//
// REGLA OFICIAL DE COHORTE PAGADA VSL:
// - Agendado automatico
// - No agendado
//
// Cualquier otro valor de VSL Origen queda fuera de la cohorte
// principal del reporte VSL | Closers.
// ============================================================
function API_NORMALIZE_VSL_ORIGIN_(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function API_IS_VSL_PAID_ORIGIN_(value) {
  const origin = API_NORMALIZE_VSL_ORIGIN_(value);
  return (
    origin === "AGENDADO AUTOMATICO" ||
    origin === "NO AGENDADO"
  );
}

function API_IS_VSL_AUTOMATIC_ORIGIN_(value) {
  return API_NORMALIZE_VSL_ORIGIN_(value) === "AGENDADO AUTOMATICO";
}

function API_IS_VSL_NOT_SCHEDULED_ORIGIN_(value) {
  return API_NORMALIZE_VSL_ORIGIN_(value) === "NO AGENDADO";
}

// ============================================================
// CLASIFICAR VSL PAGADO / NO PAGADO SEGUN VSL ORIGEN
// ============================================================

function API_GET_VSL_CATEGORY(
  vslOrigen,
  fuente
) {

  // Para VSL | Closers, la definición de pagado se basa en VSL Origen.
  // Los únicos valores pagados son "Agendado automatico" y "No agendado".
  if (API_IS_VSL_PAID_ORIGIN_(vslOrigen)) {
    return "paid";
  }

  // Se conserva organic como clasificación secundaria para registros que
  // no pertenecen a la cohorte pagada. La cohorte principal VSL los excluye.
  const normalizedSource = API_NORMALIZE_SOURCE(fuente);
  if (normalizedSource.includes("ORGANICO")) {
    return "organic";
  }

  return "other";
}


// ============================================================
// FASES QUE CUENTAN COMO VENTA
// ============================================================

function API_GET_SALES_STAGES(
  pipelineKey
) {

  // Las fases deben coincidir con los nombres REALES de GHL.
  // API_IS_SALE_STAGE() ya normaliza mayúsculas y tildes,
  // pero no puede corregir nombres diferentes.

  if (
    pipelineKey === "vsl"
  ) {

    return [
      "Venta Confirmada/Reserva",
      "Ventas Confirmadas"
    ];

  }


  if (
    pipelineKey === "oei"
  ) {

    return [
      "Ventas Confirmadas"
    ];

  }


  if (
    pipelineKey === "lig"
  ) {

    return [
      "Ventas"
    ];

  }


  return [];

}


// ============================================================
// NORMALIZAR FASE
// ============================================================

function API_NORMALIZE_STAGE(
  value
) {

  return String(
    value || ""
  )
    .trim()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .toUpperCase();

}



// ============================================================
// ETAPAS QUE CUENTAN COMO "NO CALIFICADOS"
// ============================================================
//
// REGLA ACTUAL:
// Lanzamiento Interno Gratuito (LIG):
// - No existe número
// - No existe
// - No interesado/No desea
// - No interesado
//
// La clasificación se hace en API para que el frontend
// únicamente consuma y muestre el KPI.
// ============================================================

function API_GET_UNQUALIFIED_STAGES_(
  pipelineKey
) {

  if (
    pipelineKey === "lig"
  ) {

    return [
      "No existe número",
      "No existe",
      "No interesado/No desea",
      "No interesado"
    ];

  }

  return [];

}


function API_IS_UNQUALIFIED_STAGE_(
  fase,
  pipelineKey
) {

  const normalizedStage =
    API_NORMALIZE_STAGE(
      fase
    );

  if (!normalizedStage) {
    return false;
  }

  return API_GET_UNQUALIFIED_STAGES_(
    pipelineKey
  ).some(
    stage =>
      API_NORMALIZE_STAGE(
        stage
      ) === normalizedStage
  );

}


// ============================================================
// DETERMINAR SI UNA FASE ES VENTA
//
// La fase se valida dentro del pipeline correspondiente.
// "Perdida" NO cuenta como venta.
// ============================================================

// ============================================================
// CLASIFICACION DE SETEO - SOLO VSL | CLOSERS
//
// REGLA COMERCIAL:
// - Lead Pendiente de Agenda       => falta setear
// - Lead Agendado (Automatico)     => falta setear
// - Cualquier otra etapa de VSL    => seteado
//
// Esta regla usa la columna Fase de OPPORTUNITIES_MASTER.
// No modifica OEI ni LIG.
// ============================================================
function API_GET_VSL_SETEO_STATUS_(pipelineKey, fase) {
  if (pipelineKey !== "vsl") return "not_applicable";

  const stage = API_NORMALIZE_STAGE(fase);
  const pendingStages = [
    API_NORMALIZE_STAGE("Lead Pendiente de Agenda"),
    API_NORMALIZE_STAGE("Lead Agendado (Automatico)")
  ];

  return pendingStages.includes(stage)
    ? "falta_setear"
    : "seteado";
}

function API_IS_SALE_STAGE(
  fase,
  pipelineKey
) {

  const normalizedStage =
    API_NORMALIZE_STAGE(
      fase
    );


  if (
    !normalizedStage ||
    normalizedStage === "PERDIDA" ||
    normalizedStage === "PERDIDO"
  ) {

    return false;

  }


  return API_GET_SALES_STAGES(
    pipelineKey
  ).some(
    salesStage =>
      API_NORMALIZE_STAGE(
        salesStage
      ) ===
      normalizedStage
  );

}


// ============================================================
// NORMALIZAR PRODUCTO
// ============================================================

function API_NORMALIZE_PRODUCT(
  value
) {

  return String(
    value || ""
  )
    .trim()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .toUpperCase();

}


// ============================================================
// TICKET TEÓRICO POR PRODUCTO
//
// Equipo Millonario  -> USD 1,497
// Circulo Millonario -> USD 10,000
//
// Si aparece otro producto, ticket = 0.
// ============================================================

function API_GET_PRODUCT_TICKET(
  producto
) {

  const normalized =
    API_NORMALIZE_PRODUCT(
      producto
    );


  if (
    normalized ===
    "EQUIPO MILLONARIO"
  ) {

    return {

      producto:
        "Equipo Millonario",

      currency:
        "USD",

      ticket:
        1497

    };

  }


  if (
    normalized ===
    "CIRCULO MILLONARIO"
  ) {

    return {

      producto:
        "Circulo Millonario",

      currency:
        "USD",

      ticket:
        10558.70

    };

  }


  return {

    producto:
      String(
        producto || ""
      ).trim(),

    currency:
      "",

    ticket:
      0

  };

}


// ============================================================
// CONSTRUIR REPORTE VSL
// ============================================================

// ============================================================
// API MASTER DATA HELPERS
// Fuentes oficiales del reporte:
// - OPPORTUNITIES_MASTER: 1 fila = 1 Opportunity
// - APPOINTMENTS_MASTER: 1 fila = 1 Appointment
// ============================================================

function API_MASTER_READ_SHEET_(sheetName) {
  const ss = SpreadsheetApp.openById(APP_CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("No existe la hoja: " + sheetName);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) return { headers: [], rows: [] };
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  return {
    headers: values[0].map(v => String(v || "").trim()),
    rows: values.slice(1)
  };
}

function API_MASTER_INDEX_ANY_(headers, names, required) {
  for (let i = 0; i < names.length; i++) {
    const idx = headers.indexOf(names[i]);
    if (idx >= 0) return idx;
  }
  if (required) {
    throw new Error("Falta columna requerida. Se esperaba una de: " + names.join(" | "));
  }
  return -1;
}

function API_MASTER_VALUE_(row, idx) {
  return idx >= 0 ? row[idx] : "";
}

function API_MASTER_LATEST_APPOINTMENT_(items) {
  if (!items || !items.length) return null;
  return items.slice().sort((a, b) => {
    const da = new Date(a.appointmentCreatedAt || a.fechaCita || a.fechaReunion || 0).getTime() || 0;
    const db = new Date(b.appointmentCreatedAt || b.fechaCita || b.fechaReunion || 0).getTime() || 0;
    return db - da;
  })[0];
}


// ============================================================
// NORMALIZACIÓN UNIFICADA DE SETTER / CREADOR DE CITA
// ============================================================

function API_NORMALIZE_PERSON_KEY_(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function API_NORMALIZE_SETTER_NAME_(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const key = API_NORMALIZE_PERSON_KEY_(raw);

  const aliases = {
    "ALVARO": "Alvaro Jesus Paniura Marin",
    "ALVARO JESUS PANIURA MARIN": "Alvaro Jesus Paniura Marin",

    "JOSE": "Jose Luis Botto Garcia",
    "JOSE LUIS": "Jose Luis Botto Garcia",
    "JOSE LUIS BOTTO GARCIA": "Jose Luis Botto Garcia",

    "JIMENA": "Claudia Jimena Ocampo Portilla",
    "CLAUDIA JIMENA": "Claudia Jimena Ocampo Portilla",
    "CLAUDIA JIMENA OCAMPO PORTILLA": "Claudia Jimena Ocampo Portilla",

    "CINTHIA": "Cinthia Maquito",
    "CINTHIA MAQUITO": "Cinthia Maquito",

    "EVELYN": "Evelyn Lopez Horna",
    "EVELYN LOPEZ": "Evelyn Lopez Horna",
    "EVELYN LOPEZ HORNA": "Evelyn Lopez Horna",

    "KIARA": "Kiara Villadolid Huamantumba",
    "KIARA VILLADOLID HUAMANTUMBA": "Kiara Villadolid Huamantumba"
  };

  return aliases[key] || raw;
}

function API_GET_EFFECTIVE_SETTER_(pipeline, opportunitySetter, createdByUserName) {
  const setter = API_NORMALIZE_SETTER_NAME_(opportunitySetter);
  const creator = API_NORMALIZE_SETTER_NAME_(createdByUserName);

  // Para una cita manual, "Creado por cita" representa quién creó
  // realmente el appointment. Para una cita automática, el campo está
  // vacío y conservamos el Setter asignado de la Opportunity.
  if (creator) return creator;
  return setter;
}

// Devuelve ambas fuentes de atribución normalizadas sin duplicar personas.
function API_GET_APPOINTMENT_SETTERS_(opportunitySetter, createdByUserName) {
  const setterOpportunity = API_NORMALIZE_SETTER_NAME_(opportunitySetter);
  const creadorCita = API_NORMALIZE_SETTER_NAME_(createdByUserName);
  const responsables = [];

  if (setterOpportunity) responsables.push(setterOpportunity);
  if (creadorCita && !responsables.includes(creadorCita)) responsables.push(creadorCita);

  return { setterOpportunity, creadorCita, responsables };
}

// Una cita pertenece a un setter si aparece en Setter asignado O en Creado por cita.
function API_APPOINTMENT_MATCHES_SETTER_(opportunitySetter, createdByUserName, wantedSetter) {
  const wanted = API_NORMALIZE_SETTER_NAME_(wantedSetter);
  if (!wanted) return true;

  return API_GET_APPOINTMENT_SETTERS_(opportunitySetter, createdByUserName)
    .responsables
    .includes(wanted);
}

function API_IS_AUTOMATIC_SETTER_FILTER_(value) {
  const key = API_NORMALIZE_PERSON_KEY_(value);
  return (
    key === API_NORMALIZE_PERSON_KEY_("Agendado automatico") ||
    key === API_NORMALIZE_PERSON_KEY_("Agendado automático") ||
    String(value || "").trim() === "__AUTOMATIC__"
  );
}

function API_GET_BOOKING_MODE_(createdByUserName) {
  return String(createdByUserName || "").trim()
    ? "manual"
    : "automatic";
}

function API_GET_BOOKING_MODE_LABEL_(createdByUserName) {
  return API_GET_BOOKING_MODE_(createdByUserName) === "automatic"
    ? "Agendado automatico"
    : "Agendado manual";
}

function API_NORMALIZE_DATE_FIELD_(value) {
  return String(value || "").trim().toLowerCase() === "meetingdate"
    ? "meetingDate"
    : "appointmentCreated";
}

function API_GET_APPOINTMENT_FILTER_DATE_(record, dateField) {
  const mode = API_NORMALIZE_DATE_FIELD_(dateField);

  if (mode === "meetingDate") {
    return API_NORMALIZE_DATE(
      record.fechaCita ||
      record.fechaReunion ||
      ""
    );
  }

  return API_NORMALIZE_DATE(
    record.appointmentCreatedAt ||
    record.fechaCreacionCita ||
    ""
  );
}

function API_DATE_DIFF_DAYS_(fromDate, toDate) {
  const from = API_NORMALIZE_DATE(fromDate);
  const to = API_NORMALIZE_DATE(toDate);

  if (!from || !to) return null;

  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  return Math.round((b - a) / 86400000);
}

function API_DATE_DIFF_LABEL_(days) {
  if (days === null || days === undefined || !Number.isFinite(Number(days))) {
    return "Sin dato";
  }

  const n = Number(days);

  if (n === 0) return "Mismo día";
  if (n === 1) return "1 día";
  if (n === -1) return "-1 día";

  return n + " días";
}

function API_MATCH_DAY_GAP_(days, filterValue) {
  const filter = String(filterValue || "").trim();
  if (!filter) return true;

  if (filter === "__SIN_DATO__") {
    return days === null || days === undefined;
  }

  return Number(days) === Number(filter);
}


// ============================================================
// PIPELINE DE APPOINTMENT SEGÚN EMBUDO/CALENDARIO
//
// Prioridad:
// 1. Embudo / Pipeline original de APPOINTMENTS_MASTER.
// 2. Calendario permitido.
//
// Esto permite que APPOINTMENTS_MASTER sea la fuente primaria de
// agendamientos incluso cuando una cita todavía no puede cruzarse
// con OPPORTUNITIES_MASTER.
// ============================================================

function API_GET_APPOINTMENT_PIPELINE_KEY_(pipelineName, calendarName) {
  const direct = API_GET_PIPELINE_KEY(pipelineName);
  if (direct) return direct;

  const calendar = String(calendarName || "").trim();
  if (!calendar) return "";

  const keys = ["vsl", "oei", "lig"];

  for (let i = 0; i < keys.length; i++) {
    if (API_GET_ALLOWED_CALENDARS(keys[i]).includes(calendar)) {
      return keys[i];
    }
  }

  return "";
}


// ============================================================
// CONSTRUIR DATASET PRIMARIO DE APPOINTMENTS_MASTER
//
// REGLA:
// - Una fila = un Appointment ID.
// - APPOINTMENTS_MASTER manda para citas.
// - OPPORTUNITIES_MASTER solo enriquece la cita.
// - No se exige que la Opportunity haya sido creada en el mismo
//   rango de fechas.
// - No se exige Estado cita para reconocer que existe la cita.
// ============================================================

function API_BUILD_DIRECT_APPOINTMENT_RECORDS_(
  apptData,
  ai,
  oppData,
  oi,
  filtros,
  requestedLeadType,
  requestedVslTipo
) {
  const opportunityById = new Map();

  oppData.rows.forEach(row => {
    const opportunityId =
      API_CELL_STRING(API_MASTER_VALUE_(row, oi.opportunityId));

    if (!opportunityId) return;

    const secuencia =
      API_CELL_STRING(API_MASTER_VALUE_(row, oi.secuencia));

    const pipeline =
      API_GET_PIPELINE_KEY(secuencia);

    opportunityById.set(opportunityId, {
      row: row,
      opportunityId: opportunityId,
      contactId: API_CELL_STRING(API_MASTER_VALUE_(row, oi.contactId)),
      nombreContacto: API_CELL_STRING(API_MASTER_VALUE_(row, oi.nombre)),
      telefono: API_CELL_STRING(API_MASTER_VALUE_(row, oi.telefono)),
      correo: API_CELL_STRING(API_MASTER_VALUE_(row, oi.correo)),
      pipeline: pipeline,
      secuencia: secuencia,
      fuente: API_CELL_STRING(API_MASTER_VALUE_(row, oi.fuente)),
      setterOpportunity: API_CELL_STRING(API_MASTER_VALUE_(row, oi.setter)),
      closerOpportunity: API_CELL_STRING(API_MASTER_VALUE_(row, oi.asignado)),
      vslOrigen: API_CELL_STRING(API_MASTER_VALUE_(row, oi.vslOrigen)),
      estadoAgendaOpportunity: API_CELL_STRING(API_MASTER_VALUE_(row, oi.estadoAgenda)),
      fechaReunionOpportunity: API_NORMALIZE_DATE(API_MASTER_VALUE_(row, oi.fechaReunion)),
      fase: API_CELL_STRING(API_MASTER_VALUE_(row, oi.fase)),
      productoEvento: API_CELL_STRING(API_MASTER_VALUE_(row, oi.producto)),
      fechaPrimerPago: API_NORMALIZE_DATE(API_MASTER_VALUE_(row, oi.fechaPrimerPago)),
      planPagos: API_CELL_STRING(API_MASTER_VALUE_(row, oi.planPagos)),
      moneda: API_CELL_STRING(API_MASTER_VALUE_(row, oi.moneda)),
      montoTotalAcordado: API_NUMBER_VALUE(API_MASTER_VALUE_(row, oi.montoTotalAcordado)),
      montoUltimoPago: API_NUMBER_VALUE(API_MASTER_VALUE_(row, oi.montoUltimoPago))
    });
  });

  const result = [];
  const seenAppointmentIds = new Set();

  apptData.rows.forEach(row => {
    const appointmentId =
      API_CELL_STRING(API_MASTER_VALUE_(row, ai.appointmentId));

    if (!appointmentId || seenAppointmentIds.has(appointmentId)) return;
    seenAppointmentIds.add(appointmentId);

    const opportunityId =
      API_CELL_STRING(API_MASTER_VALUE_(row, ai.opportunityId));

    const opp =
      opportunityById.get(opportunityId) || null;

    const calendarioCita =
      API_CELL_STRING(API_MASTER_VALUE_(row, ai.calendarioCita));

    const pipelineName =
      API_CELL_STRING(API_MASTER_VALUE_(row, ai.embudo)) ||
      API_CELL_STRING(API_MASTER_VALUE_(row, ai.pipelineOriginal));

    const pipeline =
      API_GET_APPOINTMENT_PIPELINE_KEY_(
        pipelineName,
        calendarioCita
      ) ||
      (opp ? opp.pipeline : "");

    if (!pipeline) return;

    if (
      filtros.pipeline &&
      filtros.pipeline !== "all" &&
      pipeline !== filtros.pipeline
    ) {
      return;
    }

    if (!API_IS_CALENDAR_ALLOWED(pipeline, calendarioCita)) return;

    if (
      filtros.calendar &&
      calendarioCita !== filtros.calendar
    ) {
      return;
    }

    const fuente =
      opp ? opp.fuente : "";

    const appointmentLeadType =
      API_GET_ROW_LEAD_TYPE(
        pipeline,
        fuente,
        calendarioCita
      );

    if (
      requestedLeadType !== "all" &&
      (
        pipeline !== "vsl" ||
        appointmentLeadType !== requestedLeadType
      )
    ) {
      return;
    }

    const vslOrigen =
      opp ? opp.vslOrigen : "";

    // VSL | Closers: una cita solo participa si puede vincularse a una
    // Opportunity cuya columna VSL Origen sea uno de los dos valores pagados.
    if (pipeline === "vsl" && (!opp || !API_IS_VSL_PAID_ORIGIN_(vslOrigen))) {
      return;
    }

    const vslCategoria =
      pipeline === "vsl"
        ? "paid"
        : API_GET_VSL_CATEGORY(
            vslOrigen,
            fuente
          );

    if (
      requestedVslTipo !== "all" &&
      vslCategoria !== requestedVslTipo
    ) {
      return;
    }

    if (
      filtros.vslOrigin &&
      API_NORMALIZE_SOURCE(vslOrigen) !==
      API_NORMALIZE_SOURCE(filtros.vslOrigin)
    ) {
      return;
    }

    const estadoCita =
      API_CELL_STRING(API_MASTER_VALUE_(row, ai.estadoCita));

    const estadoAgenda =
      API_GET_EFFECTIVE_APPOINTMENT_STATUS(
        estadoCita,
        opp ? opp.estadoAgendaOpportunity : ""
      );

    if (
      filtros.status &&
      estadoAgenda !== filtros.status
    ) {
      return;
    }

    const createdByUserName =
      API_CELL_STRING(API_MASTER_VALUE_(row, ai.createdByUserName));

    const bookingMode =
      API_GET_BOOKING_MODE_(createdByUserName);

    if (
      filtros.bookingMode &&
      bookingMode !==
      String(filtros.bookingMode).trim().toLowerCase()
    ) {
      return;
    }

    if (filtros.booker) {
      const wantedBooker =
        String(filtros.booker || "").trim();

      const wantsAutomatic =
        wantedBooker === "__AUTOMATIC__" ||
        API_NORMALIZE_PERSON_KEY_(wantedBooker) ===
          API_NORMALIZE_PERSON_KEY_("Agendado automatico");

      if (wantsAutomatic) {
        if (bookingMode !== "automatic") return;
      } else if (
        API_NORMALIZE_SETTER_NAME_(createdByUserName) !==
        API_NORMALIZE_SETTER_NAME_(wantedBooker)
      ) {
        return;
      }
    }

    const opportunitySetter =
      opp ? opp.setterOpportunity : "";

    const setterEfectivo =
      API_GET_EFFECTIVE_SETTER_(
        pipeline,
        opportunitySetter,
        createdByUserName
      );

    if (filtros.setter) {
      const rawSetter = String(filtros.setter || "").trim();
      const appointmentSetters = API_GET_APPOINTMENT_SETTERS_(
        opportunitySetter,
        createdByUserName
      );

      const wantsNoSetter =
        rawSetter === "__SIN_SETTER__" ||
        API_NORMALIZE_PERSON_KEY_(rawSetter) === API_NORMALIZE_PERSON_KEY_("Sin setter");

      // Permite abrir directamente el detalle de la fila "Agendado automático"
      // aunque el frontend la envíe por el parámetro setter.
      if (API_IS_AUTOMATIC_SETTER_FILTER_(rawSetter)) {
        if (bookingMode !== "automatic") return;
      } else if (wantsNoSetter) {
        if (appointmentSetters.responsables.length > 0) return;
      } else if (!API_APPOINTMENT_MATCHES_SETTER_(
        opportunitySetter,
        createdByUserName,
        rawSetter
      )) {
        return;
      }
    }

    const closerCita =
      API_CELL_STRING(API_MASTER_VALUE_(row, ai.closerCita));

    const closer =
      closerCita ||
      (opp ? opp.closerOpportunity : "");

    if (
      filtros.closer &&
      closer !== filtros.closer
    ) {
      return;
    }

    const appointmentCreatedAt =
      API_NORMALIZE_DATE(
        API_MASTER_VALUE_(row, ai.appointmentCreatedAt)
      );

    const fechaCita =
      API_NORMALIZE_DATE(
        API_MASTER_VALUE_(row, ai.fechaCita)
      );

    const fechaReunion =
      fechaCita ||
      (opp ? opp.fechaReunionOpportunity : "");

    const diferenciaDias =
      API_DATE_DIFF_DAYS_(
        appointmentCreatedAt,
        fechaReunion
      );

    if (
      !API_MATCH_DAY_GAP_(
        diferenciaDias,
        filtros.dayGap
      )
    ) {
      return;
    }

    result.push({
      appointmentId: appointmentId,
      opportunityId: opportunityId,
      contactId:
        API_CELL_STRING(API_MASTER_VALUE_(row, ai.contactId)) ||
        (opp ? opp.contactId : ""),

      nombreContacto: opp ? opp.nombreContacto : "",
      telefono: opp ? opp.telefono : "",
      correo: opp ? opp.correo : "",

      pipeline: pipeline,
      secuencia:
        opp
          ? opp.secuencia
          : API_GET_PIPELINE_LABEL(pipeline),

      fuente: fuente,
      leadType: appointmentLeadType,

      setterAsignado:
        setterEfectivo || "",

      setterEfectivo:
        setterEfectivo || "",

      setterOpportunity:
        API_NORMALIZE_SETTER_NAME_(opportunitySetter),

      agendadorCita:
        createdByUserName ||
        API_GET_BOOKING_MODE_LABEL_(createdByUserName),

      createdByUserName: createdByUserName,

      bookingMode: bookingMode,
      bookingModeLabel:
        API_GET_BOOKING_MODE_LABEL_(createdByUserName),

      closerCita: closerCita,
      closerAsignado: closer,
      closerOpportunity:
        opp ? opp.closerOpportunity : "",

      calendarioCita: calendarioCita,

      estadoCita: estadoCita,
      estadoAgenda: estadoAgenda,
      estadoAgendaOriginal:
        opp ? opp.estadoAgendaOpportunity : "",

      fuenteEstadoAgendamiento:
        estadoCita
          ? "calendar"
          : "appointment",

      appointmentCreatedAt: appointmentCreatedAt,
      fechaCreacionCita: appointmentCreatedAt,
      fechaCita: fechaCita,
      fechaReunion: fechaReunion,
      fechaAgendamiento:
        appointmentCreatedAt ||
        fechaCita ||
        fechaReunion,

      diferenciaDias: diferenciaDias,
      diferenciaDiasLabel:
        API_DATE_DIFF_LABEL_(diferenciaDias),

      vslOrigen: vslOrigen,
      vslCategoria: vslCategoria,

      fase: opp ? opp.fase : "",
      productoEvento:
        opp ? opp.productoEvento : "",
      fechaPrimerPago:
        opp ? opp.fechaPrimerPago : "",
      planPagos:
        opp ? opp.planPagos : "",
      moneda:
        opp ? opp.moneda : "",
      montoTotalAcordado:
        opp ? opp.montoTotalAcordado : 0,
      montoUltimoPago:
        opp ? opp.montoUltimoPago : 0,

      opportunityMatched:
        Boolean(opp)
    });
  });

  return result;
}


// ============================================================
// FECHA OFICIAL DE VENTA
//
// Regla única para TODOS los embudos (VSL, OEI y LIG):
// - La fecha oficial de una venta es "Fecha de primer pago".
// - Si está vacía, la venta no se atribuye a ningún período.
// ============================================================
function API_GET_SALE_DATE_(registro) {
  if (!registro) return "";
  return API_NORMALIZE_DATE(registro.fechaPrimerPago);
}

// BEGIN MONTHLY_CLOSER_PRODUCT_CONVERSION
// Isolated metric: appointment month = Fecha cita; sale month = Fecha de primer pago.
// Each appointment belongs to exactly one linked opportunity product (or Sin identificar).
function API_MONTHLY_CLOSER_PRODUCT_CONVERSION_(oppData, apptData, oi, ai, filtros, leadType, vslTipo) {
  const monthlyOi = Object.assign({}, oi, {
    asignado: API_MASTER_INDEX_ANY_(oppData.headers, ["Asignado a", "Asignado"], false)
  });
  const metric = {};
  metric.cell = (row, key) => API_CELL_STRING(API_MASTER_VALUE_(row, monthlyOi[key]));
  metric.product = value => {
    const key = API_NORMALIZE_PRODUCT(value);
    if (key === "EQUIPO MILLONARIO") return "Equipo Millonario";
    if (key === "CIRCULO MILLONARIO") return "Círculo Millonario";
    return "Sin identificar";
  };
  metric.name = value => String(value || "").trim().replace(/\s+/g, " ") || "Sin closer identificado";
  const names = new Map();
  metric.canonicalCloser = value => {
    const label = metric.name(value);
    const key = API_NORMALIZE_PERSON_KEY_(label);
    if (!names.has(key)) names.set(key, label);
    return names.get(key);
  };
  metric.matchesCloser = value => !filtros.closer ||
    API_NORMALIZE_PERSON_KEY_(metric.name(value)) === API_NORMALIZE_PERSON_KEY_(metric.name(filtros.closer));
  // Reuse the existing non-date appointment filters, but attribute closers per source below.
  // Deduplicate opportunities before joining so duplicate rows cannot change attribution.
  const opportunityRows = new Map();
  oppData.rows.forEach(row => {
    const id = metric.cell(row, "opportunityId");
    if (id && !opportunityRows.has(id)) opportunityRows.set(id, row);
  });
  const uniqueOppData = Object.assign({}, oppData, { rows: Array.from(opportunityRows.values()) });
  opportunityRows.forEach(row => metric.canonicalCloser(metric.cell(row, "asignado")));
  const appointments = API_BUILD_DIRECT_APPOINTMENT_RECORDS_(
    apptData, ai, uniqueOppData, monthlyOi,
    Object.assign({}, filtros, { closer: "" }), leadType, vslTipo
  );
  const byOpportunity = new Map();
  appointments.forEach(a => {
    const key = String(a.opportunityId || "").trim();
    if (!byOpportunity.has(key)) byOpportunity.set(key, []);
    byOpportunity.get(key).push(a);
  });
  const groups = new Map();
  metric.add = (date, pipeline, closerValue, productValue, field, id) => {
    if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !metric.matchesCloser(closerValue) ||
        !API_DATE_IN_RANGE(date, filtros.dateFrom, filtros.dateTo)) return;
    const closer = metric.canonicalCloser(closerValue);
    [pipeline, "all"].forEach(embudo => {
      const key = JSON.stringify([date.slice(0, 7), embudo, API_NORMALIZE_PERSON_KEY_(closer), productValue]);
      if (!groups.has(key)) groups.set(key, {
        mes: date.slice(0, 7), embudo: embudo,
        embudoNombre: embudo === "all" ? "Todos los embudos" : API_GET_PIPELINE_LABEL(embudo),
        closer: closer, producto: productValue, appointmentIds: new Set(), opportunityIds: new Set()
      });
      groups.get(key)[field].add(id);
    });
  };
  const seenAppointments = new Set();
  appointments.forEach(a => {
    const id = String(a.appointmentId || "").trim();
    // Only Calendar attendance; never inherit attendance from Opportunity.
    if (!id || seenAppointments.has(id) || !String(a.estadoCita || "").trim() || a.estadoAgenda !== "Asistió") return;
    seenAppointments.add(id);
    metric.add(API_NORMALIZE_DATE(a.fechaCita), a.pipeline, a.closerCita || a.closerOpportunity,
      metric.product(a.productoEvento), "appointmentIds", id);
  });
  const allowedStages = new Set([
    "Venta Confirmada/Reserva", "Venta Confirmada / Reserva",
    "Venta confirmada/Reserva", "Ventas Confirmadas"
  ].map(value => API_NORMALIZE_STAGE(value).replace(/\s*\/\s*/g, "/")));
  opportunityRows.forEach((row, id) => {
    const pipeline = API_GET_PIPELINE_KEY(metric.cell(row, "secuencia"));
    if (!pipeline || (filtros.pipeline && filtros.pipeline !== "all" && pipeline !== filtros.pipeline)) return;
    if (!allowedStages.has(API_NORMALIZE_STAGE(metric.cell(row, "fase")).replace(/\s*\/\s*/g, "/"))) return;
    const origin = metric.cell(row, "vslOrigen");
    const source = metric.cell(row, "fuente");
    if (pipeline === "vsl" && !API_IS_VSL_PAID_ORIGIN_(origin)) return;
    const category = API_GET_VSL_CATEGORY(origin, source);
    if (vslTipo !== "all" && category !== vslTipo) return;
    if (filtros.vslOrigin && API_NORMALIZE_SOURCE(origin) !== API_NORMALIZE_SOURCE(filtros.vslOrigin)) return;
    const linked = byOpportunity.get(id) || [];
    // Same paid-origin opportunity cohort as the main report; a sale needs no appointment.
    if (leadType !== "all" && (pipeline !== "vsl" || leadType !== "paid")) return;
    if ((filtros.setter || filtros.booker || filtros.calendar || filtros.status || filtros.bookingMode) && !linked.length) return;
    metric.add(API_GET_SALE_DATE_({ fechaPrimerPago: API_MASTER_VALUE_(row, monthlyOi.fechaPrimerPago) }),
      pipeline, metric.cell(row, "asignado"), metric.product(metric.cell(row, "producto")), "opportunityIds", id);
  });
  return Array.from(groups.values()).map(group => ({
    mes: group.mes, embudo: group.embudo, embudoNombre: group.embudoNombre,
    closer: group.closer, producto: group.producto,
    citasAsistidas: group.appointmentIds.size, ventas: group.opportunityIds.size,
    porcentajeConversion: group.appointmentIds.size > 0 ?
      (group.opportunityIds.size / group.appointmentIds.size) * 100 : null
  })).sort((a, b) => a.mes.localeCompare(b.mes) || a.embudo.localeCompare(b.embudo) ||
    a.closer.localeCompare(b.closer) || a.producto.localeCompare(b.producto));
}
// END MONTHLY_CLOSER_PRODUCT_CONVERSION

function API_BUILD_VSL_REPORT(filtros) {
  filtros = filtros || {};

  const requestedLeadType = API_NORMALIZE_LEAD_TYPE(filtros.leadType);
  filtros.leadType = requestedLeadType;
  const requestedVslTipo = String(filtros.vslTipo || "all").trim().toLowerCase();

  const oppData = API_MASTER_READ_SHEET_("OPPORTUNITIES_MASTER");
  const apptData = API_MASTER_READ_SHEET_("APPOINTMENTS_MASTER");

  if (!oppData.rows.length) {
    return API_EMPTY_VSL_REPORT(requestedLeadType, filtros.pipeline);
  }

  const oh = oppData.headers;
  const ah = apptData.headers;

  const oi = {
    opportunityId: API_MASTER_INDEX_ANY_(oh, ["Opportunity ID", "_Opportunity ID"], true),
    contactId: API_MASTER_INDEX_ANY_(oh, ["Contact ID", "_Contact ID"], false),
    nombre: API_MASTER_INDEX_ANY_(oh, ["Nombre contacto"], true),
    telefono: API_MASTER_INDEX_ANY_(oh, ["Telefono", "Teléfono"], true),
    correo: API_MASTER_INDEX_ANY_(oh, ["Correo electrónico", "Correo electronico"], true),
    secuencia: API_MASTER_INDEX_ANY_(oh, ["Secuencia"], true),
    fase: API_MASTER_INDEX_ANY_(oh, ["Fase"], true),
    fuente: API_MASTER_INDEX_ANY_(oh, ["Fuente"], true),
    asignado: API_MASTER_INDEX_ANY_(oh, ["Asignado", "Asignado a"], true),
    creadoEl: API_MASTER_INDEX_ANY_(oh, ["Creado el"], true),
    estado: API_MASTER_INDEX_ANY_(oh, ["Estado"], false),
    opportunityAssigned: API_MASTER_INDEX_ANY_(oh, ["Opportunity assigned"], false),
    producto: API_MASTER_INDEX_ANY_(oh, ["Producto/Evento"], true),
    fechaPrimerPago: API_MASTER_INDEX_ANY_(oh, ["Fecha de primer pago"], true),
    planPagos: API_MASTER_INDEX_ANY_(oh, ["Plan de Pagos"], true),
    moneda: API_MASTER_INDEX_ANY_(oh, ["Moneda del monto acordado"], true),
    montoTotalAcordado: API_MASTER_INDEX_ANY_(oh, ["Monto Total Acordado"], true),
    montoUltimoPago: API_MASTER_INDEX_ANY_(oh, ["Monto del último pago", "Monto del ultimo pago"], true),
    setter: API_MASTER_INDEX_ANY_(oh, ["Setter asignado"], true),
    vslOrigen: API_MASTER_INDEX_ANY_(oh, ["VSL Origen"], true),
    estadoAgenda: API_MASTER_INDEX_ANY_(oh, ["Estado de agenda"], true),
    fechaReunion: API_MASTER_INDEX_ANY_(oh, ["Fecha de reunión", "Fecha de reunion"], true),
    numeroCitas: API_MASTER_INDEX_ANY_(oh, ["Numero de citas", "Número de citas"], false)
  };

  const ai = {
    appointmentId: API_MASTER_INDEX_ANY_(ah, ["_Appointment ID", "Appointment ID"], true),
    opportunityId: API_MASTER_INDEX_ANY_(ah, ["_Opportunity ID", "Opportunity ID"], true),
    contactId: API_MASTER_INDEX_ANY_(ah, ["_Contact ID", "Contact ID"], false),
    pipelineOriginal: API_MASTER_INDEX_ANY_(ah, ["Pipeline original"], false),
    embudo: API_MASTER_INDEX_ANY_(ah, ["Embudo"], false),
    calendarioCita: API_MASTER_INDEX_ANY_(ah, ["Calendario cita", "Calendario GHL"], true),
    estadoCita: API_MASTER_INDEX_ANY_(ah, ["Estado cita"], true),
    fechaCita: API_MASTER_INDEX_ANY_(ah, ["Fecha cita"], true),
    appointmentCreatedAt: API_MASTER_INDEX_ANY_(ah, ["_Appointment Created At", "Appointment Created At"], false),
    appointmentUpdatedAt: API_MASTER_INDEX_ANY_(ah, ["_Appointment Updated At", "Appointment Updated At"], false),
    closerCita: API_MASTER_INDEX_ANY_(ah, ["Closer cita"], false),
    createdByUserName: API_MASTER_INDEX_ANY_(ah, ["Creado por cita"], false)
  };

  // Indexar citas por Opportunity ID y deduplicar por Appointment ID.
  const appointmentsByOpportunity = new Map();
  const seenAppointmentIds = new Set();

  apptData.rows.forEach(row => {
    const appointmentId = API_CELL_STRING(API_MASTER_VALUE_(row, ai.appointmentId));
    const opportunityId = API_CELL_STRING(API_MASTER_VALUE_(row, ai.opportunityId));
    if (!appointmentId || !opportunityId || seenAppointmentIds.has(appointmentId)) return;
    seenAppointmentIds.add(appointmentId);

    const pipelineName = API_CELL_STRING(API_MASTER_VALUE_(row, ai.embudo)) ||
      API_CELL_STRING(API_MASTER_VALUE_(row, ai.pipelineOriginal));
    const pipeline = API_GET_PIPELINE_KEY(pipelineName);
    const estadoCita = API_CELL_STRING(API_MASTER_VALUE_(row, ai.estadoCita));
    const calendarioCita = API_CELL_STRING(API_MASTER_VALUE_(row, ai.calendarioCita));

    const item = {
      appointmentId: appointmentId,
      opportunityId: opportunityId,
      contactId: API_CELL_STRING(API_MASTER_VALUE_(row, ai.contactId)),
      pipeline: pipeline,
      calendarioCita: calendarioCita,
      estadoCita: estadoCita,
      estadoAgenda: API_GET_EFFECTIVE_APPOINTMENT_STATUS(estadoCita, ""),
      fechaCita: API_NORMALIZE_DATE(API_MASTER_VALUE_(row, ai.fechaCita)),
      fechaReunionLandingVsl: API_LANDING_COHORT_DATE_(API_MASTER_VALUE_(row, ai.fechaCita)),
      appointmentCreatedAt: API_NORMALIZE_DATE(API_MASTER_VALUE_(row, ai.appointmentCreatedAt)),
      appointmentUpdatedAt: API_NORMALIZE_DATE(API_MASTER_VALUE_(row, ai.appointmentUpdatedAt)),
      closerCita: API_CELL_STRING(API_MASTER_VALUE_(row, ai.closerCita)),
      createdByUserName: API_CELL_STRING(API_MASTER_VALUE_(row, ai.createdByUserName))
    };

    if (!appointmentsByOpportunity.has(opportunityId)) appointmentsByOpportunity.set(opportunityId, []);
    appointmentsByOpportunity.get(opportunityId).push(item);
  });

  const ESTADOS = ["Agendado CRM", "Confirmado", "Asistió", "Cancelado", "No asistió", "Pendiente de agenda", "Reagendado"];
  const baseOpportunities = [];

  oppData.rows.forEach(row => {
    const opportunityId = API_CELL_STRING(API_MASTER_VALUE_(row, oi.opportunityId));
    const secuencia = API_CELL_STRING(API_MASTER_VALUE_(row, oi.secuencia));
    const pipeline = API_GET_PIPELINE_KEY(secuencia);
    if (!opportunityId || !pipeline) return;
    if (filtros.pipeline && filtros.pipeline !== "all" && pipeline !== filtros.pipeline) return;

    const allAppointments = (appointmentsByOpportunity.get(opportunityId) || [])
      .filter(a => !a.pipeline || a.pipeline === pipeline)
      .filter(a => API_IS_CALENDAR_ALLOWED(pipeline, a.calendarioCita));
    const latest = API_MASTER_LATEST_APPOINTMENT_(allAppointments);
    const fuente = API_CELL_STRING(API_MASTER_VALUE_(row, oi.fuente));
    const vslOrigen = API_CELL_STRING(API_MASTER_VALUE_(row, oi.vslOrigen));

    // VSL | Closers: la cohorte principal se define EXCLUSIVAMENTE por VSL Origen.
    // Solo entran "Agendado automatico" y "No agendado".
    if (pipeline === "vsl" && !API_IS_VSL_PAID_ORIGIN_(vslOrigen)) return;

    const rowLeadType = pipeline === "vsl"
      ? "paid"
      : API_GET_ROW_LEAD_TYPE(pipeline, fuente, latest ? latest.calendarioCita : "");

    if (requestedLeadType !== "all" && (pipeline !== "vsl" || rowLeadType !== requestedLeadType)) return;

    baseOpportunities.push({ row, opportunityId, pipeline, secuencia, fuente, vslOrigen, rowLeadType, allAppointments });
  });

  // Opciones disponibles, calculadas antes de los filtros finos del dashboard.
  const settersDisponibles = API_UNIQUE_SORTED(baseOpportunities.flatMap(o => {
    const opportunitySetter = API_CELL_STRING(API_MASTER_VALUE_(o.row, oi.setter));

    if (!o.allAppointments.length) {
      const normalized = API_NORMALIZE_SETTER_NAME_(opportunitySetter);
      return normalized ? [normalized] : [];
    }

    return o.allAppointments
      .flatMap(a => API_GET_APPOINTMENT_SETTERS_(opportunitySetter, a.createdByUserName).responsables)
      .filter(Boolean);
  }));

  const bookersDisponibles = API_UNIQUE_SORTED(baseOpportunities
    .filter(o => o.pipeline === "oei" || o.pipeline === "lig")
    .flatMap(o => o.allAppointments.map(a => a.createdByUserName)));

  const closersDisponibles = API_UNIQUE_SORTED(baseOpportunities.flatMap(o => {
    const assigned = API_CELL_STRING(API_MASTER_VALUE_(o.row, oi.asignado));
    const closers = o.allAppointments.map(a => a.closerCita).filter(Boolean);
    return closers.length ? closers : [assigned];
  }));

  const origenesDisponibles = API_UNIQUE_SORTED(baseOpportunities
    .filter(o => o.pipeline === "vsl")
    .map(o => API_CELL_STRING(API_MASTER_VALUE_(o.row, oi.vslOrigen)))
    .filter(v => v === "Agendado automatico" || v === "No agendado"));

  const pipelinesDisponibles = API_UNIQUE_SORTED(baseOpportunities.map(o => o.secuencia));
  const calendariosDisponibles = API_UNIQUE_SORTED(baseOpportunities.flatMap(o => o.allAppointments.map(a => a.calendarioCita)));

  const registros = [];
  const apiAppointmentRecords = [];

  baseOpportunities.forEach(o => {
    const row = o.row;
    const opportunitySetter = API_CELL_STRING(API_MASTER_VALUE_(row, oi.setter));
    const estadoAgendaOriginal = API_CELL_STRING(API_MASTER_VALUE_(row, oi.estadoAgenda));
    const vslOrigen = API_CELL_STRING(API_MASTER_VALUE_(row, oi.vslOrigen));
    const vslCategoria = API_GET_VSL_CATEGORY(vslOrigen, o.fuente);
    const assigned = API_CELL_STRING(API_MASTER_VALUE_(row, oi.asignado));

    if (requestedVslTipo !== "all" && vslCategoria !== requestedVslTipo) return;

    if (filtros.vslOrigin) {
      const direct = vslOrigen === filtros.vslOrigin;
      const sourceMatch = o.pipeline === "vsl" && API_NORMALIZE_SOURCE(o.fuente) === API_NORMALIZE_SOURCE(filtros.vslOrigin);
      if (!direct && !sourceMatch) return;
    }

    let matchingAppointments = o.allAppointments.slice();

    if (filtros.calendar) matchingAppointments = matchingAppointments.filter(a => a.calendarioCita === filtros.calendar);
    if (filtros.status) matchingAppointments = matchingAppointments.filter(a => a.estadoAgenda === filtros.status);
    if (filtros.booker) matchingAppointments = matchingAppointments.filter(a => a.createdByUserName === filtros.booker);
    if (filtros.closer) matchingAppointments = matchingAppointments.filter(a => (a.closerCita || assigned) === filtros.closer);

    if (filtros.setter) {
      const rawSetter = String(filtros.setter || "").trim();
      const wantsNoSetter =
        rawSetter === "__SIN_SETTER__" ||
        API_NORMALIZE_PERSON_KEY_(rawSetter) === API_NORMALIZE_PERSON_KEY_("Sin setter");

      matchingAppointments = matchingAppointments.filter(a => {
        const appointmentSetters = API_GET_APPOINTMENT_SETTERS_(
          opportunitySetter,
          a.createdByUserName
        );

        if (API_IS_AUTOMATIC_SETTER_FILTER_(rawSetter)) {
          return API_GET_BOOKING_MODE_(a.createdByUserName) === "automatic";
        }

        if (wantsNoSetter) {
          return appointmentSetters.responsables.length === 0;
        }

        return API_APPOINTMENT_MATCHES_SETTER_(
          opportunitySetter,
          a.createdByUserName,
          rawSetter
        );
      });
    }

    if (filtros.bookingMode) {
      matchingAppointments = matchingAppointments.filter(a =>
        API_GET_BOOKING_MODE_(a.createdByUserName) === String(filtros.bookingMode).trim().toLowerCase()
      );
    }

    const hasAppointmentDependentFilter = Boolean(
      filtros.calendar ||
      filtros.status ||
      filtros.booker ||
      filtros.closer ||
      filtros.setter ||
      filtros.bookingMode
    );
    if (hasAppointmentDependentFilter && !matchingAppointments.length) return;

    // Para filtros paid/organic basados en calendario, mantener solo citas del tipo solicitado.
    if (requestedLeadType !== "all" && o.pipeline === "vsl") {
      matchingAppointments = matchingAppointments.filter(a => API_GET_ROW_LEAD_TYPE(o.pipeline, o.fuente, a.calendarioCita) === requestedLeadType);
    }

    const latest = API_MASTER_LATEST_APPOINTMENT_(matchingAppointments.length ? matchingAppointments : o.allAppointments);
    const createdBy = latest ? latest.createdByUserName : "";
    const setter = API_GET_EFFECTIVE_SETTER_(o.pipeline, opportunitySetter, createdBy);
    const closerCita = latest ? latest.closerCita : "";
    const closer = closerCita || assigned;
    const estadoCitaRaw = latest ? latest.estadoCita : "";
    const estadoAgenda = API_GET_EFFECTIVE_APPOINTMENT_STATUS(estadoCitaRaw, estadoAgendaOriginal);
    const fechaReunion = API_NORMALIZE_DATE(API_MASTER_VALUE_(row, oi.fechaReunion));
    const fechaCita = latest ? latest.fechaCita : "";
    const appointmentCreatedAt = latest ? latest.appointmentCreatedAt : "";
    const fechaAgendamiento = appointmentCreatedAt || fechaCita || fechaReunion;

    const baseRecord = {
      opportunityId: o.opportunityId,
      contactId: API_CELL_STRING(API_MASTER_VALUE_(row, oi.contactId)),
      nombreContacto: API_CELL_STRING(API_MASTER_VALUE_(row, oi.nombre)),
      telefono: API_CELL_STRING(API_MASTER_VALUE_(row, oi.telefono)),
      correo: API_CELL_STRING(API_MASTER_VALUE_(row, oi.correo)),
      fechaCreacionOportunidad: API_NORMALIZE_DATE(API_MASTER_VALUE_(row, oi.creadoEl)),
      fechaCreacionLandingVsl: o.pipeline === "vsl"
        ? API_LANDING_COHORT_DATE_(API_MASTER_VALUE_(row, oi.creadoEl)) : "",
      pipeline: o.pipeline,
      secuencia: o.secuencia,
      setterAsignado: setter,
      setterOpportunity: API_NORMALIZE_SETTER_NAME_(opportunitySetter),
      agendadorCita: createdBy || API_GET_BOOKING_MODE_LABEL_(createdBy),
      createdByUserName: createdBy,
      bookingMode: API_GET_BOOKING_MODE_(createdBy),
      bookingModeLabel: API_GET_BOOKING_MODE_LABEL_(createdBy),
      closerAsignado: closer,
      closerOpportunity: assigned,
      closerCita: closerCita,
      calendarioCita: latest ? latest.calendarioCita : "",
      estadoAgenda: estadoAgenda,
      estadoCita: estadoCitaRaw,
      estadoAgendaOriginal: estadoAgendaOriginal,
      fuenteEstadoAgendamiento: API_GET_APPOINTMENT_STATUS_SOURCE(estadoCitaRaw),
      fechaAgendamiento: fechaAgendamiento,
      fechaCita: fechaCita,
      appointmentCreatedAt: appointmentCreatedAt,
      fechaReunion: fechaReunion,
      vslOrigen: vslOrigen,
      vslCategoria: vslCategoria,
      fase: API_CELL_STRING(API_MASTER_VALUE_(row, oi.fase)),
      fuente: o.fuente,
      productoEvento: API_CELL_STRING(API_MASTER_VALUE_(row, oi.producto)),
      fechaPrimerPago: API_NORMALIZE_DATE(API_MASTER_VALUE_(row, oi.fechaPrimerPago)),
      planPagos: API_CELL_STRING(API_MASTER_VALUE_(row, oi.planPagos)),
      moneda: API_CELL_STRING(API_MASTER_VALUE_(row, oi.moneda)),
      montoTotalAcordado: API_NUMBER_VALUE(API_MASTER_VALUE_(row, oi.montoTotalAcordado)),
      montoUltimoPago: API_NUMBER_VALUE(API_MASTER_VALUE_(row, oi.montoUltimoPago)),
      leadType: o.rowLeadType,
      numeroCitasSheet: API_NUMBER_VALUE(API_MASTER_VALUE_(row, oi.numeroCitas)),
      numeroCitasCalculado: o.allAppointments.length,
      citasVerificadas: oi.numeroCitas < 0 || API_NUMBER_VALUE(API_MASTER_VALUE_(row, oi.numeroCitas)) === o.allAppointments.length
    };

    registros.push(baseRecord);

    matchingAppointments.forEach(a => {
      const appointmentLeadType = API_GET_ROW_LEAD_TYPE(o.pipeline, o.fuente, a.calendarioCita);
      if (requestedLeadType !== "all" && o.pipeline === "vsl" && appointmentLeadType !== requestedLeadType) return;
      apiAppointmentRecords.push(Object.assign({}, baseRecord, {
        appointmentId: a.appointmentId,
        setterAsignado: API_GET_EFFECTIVE_SETTER_(o.pipeline, opportunitySetter, a.createdByUserName),
        setterOpportunity: API_NORMALIZE_SETTER_NAME_(opportunitySetter),
        agendadorCita: a.createdByUserName || API_GET_BOOKING_MODE_LABEL_(a.createdByUserName),
        createdByUserName: a.createdByUserName,
        bookingMode: API_GET_BOOKING_MODE_(a.createdByUserName),
        bookingModeLabel: API_GET_BOOKING_MODE_LABEL_(a.createdByUserName),
        closerCita: a.closerCita,
        closerAsignado: a.closerCita || assigned,
        calendarioCita: a.calendarioCita,
        estadoCita: a.estadoCita,
        estadoAgenda: a.estadoAgenda,
        estadoAgendaOriginal: estadoAgendaOriginal,
        fuenteEstadoAgendamiento: "calendar",
        fechaCita: a.fechaCita,
        appointmentCreatedAt: a.appointmentCreatedAt,
        fechaAgendamiento: a.appointmentCreatedAt || a.fechaCita || fechaReunion,
        leadType: appointmentLeadType
      }));
    });
  });

  // ==========================================================
  // DATASET EXCLUSIVO DE AGENDAMIENTOS REALES DE CALENDAR
  //
  // Un registro entra aquí únicamente si Estado cita tiene valor.
  // Los estados heredados de Opportunity NO participan.
  // ==========================================================

  // ==========================================================
  // DATASETS TEMPORALES INDEPENDIENTES
  //
  // Un mismo dateFrom/dateTo se interpreta según el KPI:
  // - Leads: Creado el
  // - Agendamientos: _Appointment Created At (fallback Fecha cita / Fecha de reunión)
  // - Ventas: Fecha de primer pago para VSL, OEI y LIG.
  // - Atribución de ventas: todas las citas asistidas históricas.
  // El filtro de leads es independiente del filtro de ventas.
  // ==========================================================

  const leadRegistros =
    registros.filter(
      registro =>
        API_DATE_IN_RANGE(
          registro.fechaCreacionOportunidad,
          filtros.dateFrom,
          filtros.dateTo
        )
    );


  // IMPORTANTE:
  // Las citas se reconstruyen DIRECTAMENTE desde APPOINTMENTS_MASTER.
  // OPPORTUNITIES_MASTER se usa solo para enriquecer la cita.
  // De esta forma, una cita creada en octubre NO desaparece porque
  // su Opportunity haya sido creada en septiembre.
  const directAppointmentRecords =
    API_BUILD_DIRECT_APPOINTMENT_RECORDS_(
      apptData,
      ai,
      oppData,
      oi,
      filtros,
      requestedLeadType,
      requestedVslTipo
    );


  const appointmentRegistros =
    directAppointmentRecords.filter(
      registro =>
        API_DATE_IN_RANGE(
          API_GET_APPOINTMENT_FILTER_DATE_(
            registro,
            filtros.dateField
          ),
          filtros.dateFrom,
          filtros.dateTo
        )
    );


  // Una fila válida de APPOINTMENTS_MASTER con Appointment ID
  // representa una cita real. NO se exige Estado cita para contarla.
  const calendarRegistros =
    appointmentRegistros.slice();


  // ==========================================================
  // VENTAS: FILTRO POR FECHA EFECTIVA DE VENTA
  //
  // Regla única para VSL, OEI y LIG:
  // 1) Fecha de primer pago.
  // 2) Si está vacía y hay rango, no se puede atribuir la venta al período.
  // ==========================================================
  const salesRegistros = registros.filter(registro => {
    const desde = String(filtros.dateFrom || "").trim();
    const hasta = String(filtros.dateTo || "").trim();

    // Sin rango de fechas, no excluir por fecha.
    if (!desde && !hasta) return true;

    const fechaVenta = API_GET_SALE_DATE_(registro);
    if (!fechaVenta) return false;

    return API_DATE_IN_RANGE(fechaVenta, desde, hasta);
  });


  // LEADS SIN CITA: cohortes por fecha de creacion de Opportunity.
  // Cruce contra citas HISTORICAS por Opportunity ID y calendario del embudo.
  // No se resta la cantidad de appointments del numero de leads.
  const leadsSinCitaPorEmbudo = {};
  ["vsl", "oei"].forEach(pipelineKey => {
    const leadsById = new Map();
    leadRegistros.forEach(r => {
      if (r.pipeline !== pipelineKey) return;
      const oid = String(r.opportunityId || "").trim();
      if (oid && !leadsById.has(oid)) leadsById.set(oid, r);
    });
    const detail = [];
    let conCita = 0;
    leadsById.forEach((lead, oid) => {
      // VSL | Closers: "Leads agendados (Automático)" se obtiene de la
      // columna VSL Origen, NO de la existencia de appointments.
      // - Agendado automatico => lead agendado automáticamente
      // - No agendado         => lead pendiente de agenda
      let hasAppt;

      if (pipelineKey === "vsl") {
        hasAppt = API_IS_VSL_AUTOMATIC_ORIGIN_(lead.vslOrigen);
      } else {
        const appts = (appointmentsByOpportunity.get(oid) || []).filter(a =>
          (!a.pipeline || a.pipeline === pipelineKey) &&
          API_IS_CALENDAR_ALLOWED(pipelineKey, a.calendarioCita)
        );
        hasAppt = appts.length > 0;
      }

      if (hasAppt) {
        conCita++;
      } else {
        detail.push({
          opportunityId: oid,
          nombreContacto: lead.nombreContacto || "",
          fechaCreacion: lead.fechaCreacionOportunidad || "",
          setter: lead.setterOpportunity || lead.setterAsignado || "",
          pipeline: pipelineKey,
          vslOrigen: lead.vslOrigen || ""
        });
      }
    });
    const total = leadsById.size;
    leadsSinCitaPorEmbudo[pipelineKey] = {
      totalLeads: total,
      leadsConCita: conCita,
      leadsSinCita: detail.length,
      porcentajeSinCita: total ? Number((detail.length * 100 / total).toFixed(2)) : null,
      porcentajeConCita: total ? Number((conCita * 100 / total).toFixed(2)) : null,
      detalleSinCita: detail
    };
  });
  const leadsVslSinCita = leadsSinCitaPorEmbudo.vsl;
  const cohorteDiariaVsl = filtros.pipeline === "vsl"
    ? API_BUILD_LANDING_VSL_COHORT_(registros, appointmentsByOpportunity, filtros)
    : undefined;

  // Resumen explícito de Landing VSL Ads basado SOLO en VSL Origen.
  // Este bloque evita que el frontend tenga que inferir la regla.
  const vslOriginRows = leadRegistros.filter(r => r.pipeline === "vsl");
  const vslOriginTotal = vslOriginRows.length;
  const vslOriginAgendadosAutomatico = vslOriginRows.filter(r =>
    API_IS_VSL_AUTOMATIC_ORIGIN_(r.vslOrigen)
  ).length;
  const vslOriginNoAgendados = vslOriginRows.filter(r =>
    API_IS_VSL_NOT_SCHEDULED_ORIGIN_(r.vslOrigen)
  ).length;

  const vslOriginSummary = {
    criterio: "OPPORTUNITIES_MASTER.VSL Origen",
    valoresPagados: ["Agendado automatico", "No agendado"],
    totalLeads: vslOriginTotal,
    leadsAgendadosAutomatico: vslOriginAgendadosAutomatico,
    leadsPendientesAgenda: vslOriginNoAgendados,
    agendadosAutomaticoPct: vslOriginTotal
      ? Number((vslOriginAgendadosAutomatico * 100 / vslOriginTotal).toFixed(2))
      : 0,
    pendientesAgendaPct: vslOriginTotal
      ? Number((vslOriginNoAgendados * 100 / vslOriginTotal).toFixed(2))
      : 0
  };

  const pipelineSummary =
    API_BUILD_PIPELINE_APPOINTMENT_SUMMARY(
      leadRegistros,
      calendarRegistros
    );


  // ==========================================================
  // AGENDADORES OEI Y CLOSERS DE LAS CITAS FILTRADAS
  //
  // Respetan pipeline, calendario, fechas, estado y demás filtros.
  // Por defecto, al no aplicar filtros, reflejan ambos embudos;
  // los agendadores solo se construyen con OEI.
  // ==========================================================

  const oeiBookerMap =
    new Map();

  const ligBookerMap =
    new Map();

  const closerCalendarMap =
    new Map();


  calendarRegistros.forEach(
    registro => {

      if (
        registro.pipeline === "oei" ||
        registro.pipeline === "lig"
      ) {

        const booker =
          registro.agendadorCita ||
          "Sin agendador";

        const targetMap =
          registro.pipeline === "lig"
            ? ligBookerMap
            : oeiBookerMap;

        if (
          !targetMap.has(
            booker
          )
        ) {

          targetMap.set(
            booker,
            {
              agendador:
                booker,
              total:
                0
            }
          );

        }

        targetMap.get(
          booker
        ).total++;

      }


      const closer =
        registro.closerCita ||
        registro.closerAsignado ||
        "Sin closer";

      if (
        !closerCalendarMap.has(
          closer
        )
      ) {

        closerCalendarMap.set(
          closer,
          {
            closer:
              closer,
            total:
              0
          }
        );

      }

      closerCalendarMap.get(
        closer
      ).total++;

    }
  );


  const oeiBookers =
    Array.from(
      oeiBookerMap.values()
    )
      .sort(
        (a, b) =>
          b.total - a.total
      );


  const ligBookers =
    Array.from(
      ligBookerMap.values()
    )
      .sort(
        (a, b) =>
          b.total - a.total
      );


  const calendarClosers =
    Array.from(
      closerCalendarMap.values()
    )
      .sort(
        (a, b) =>
          b.total - a.total
      );


  // ==========================================================
  // AGRUPAR AGENDAMIENTOS REALES DE CALENDAR POR SETTER
  // ==========================================================

  const setterMap =
    new Map();


  calendarRegistros.forEach(
    registro => {

      const setter =
        registro.setterAsignado ||
        "Sin setter";


      if (
        !setterMap.has(
          setter
        )
      ) {

        setterMap.set(
          setter,
          {

            setter:
              setter,

            // Se conservan por compatibilidad,
            // pero ya NO se alimentan desde Opportunity.
            agendadoCRM:
              0,

            confirmado:
              0,

            asistio:
              0,

            cancelado:
              0,

            noShow:
              0,

            pendienteAgenda:
              0,

            reagendado:
              0,

            total:
              0

          }
        );

      }


      const item =
        setterMap.get(
          setter
        );


      // VSL | CLOSERS:
      // "Confirmado" se conserva como estado visible, pero NO forma parte
      // del Total de agendamientos del Setter.
      // En OEI, LIG y vista general se conserva la lógica anterior.
      const excluirConfirmadoDelTotalSetterVsl =
        String(filtros.pipeline || "").trim().toLowerCase() === "vsl" &&
        registro.estadoAgenda === "Confirmado";

      if (!excluirConfirmadoDelTotalSetterVsl) {
        item.total++;
      }

      switch (
        registro.estadoAgenda
      ) {

        case "Confirmado":
          item.confirmado++;
          break;

        case "Asistió":
          item.asistio++;
          break;

        case "Cancelado":
          item.cancelado++;
          break;

        case "No asistió":
          item.noShow++;
          break;

      }

    }
  );


  const setters =
    Array
      .from(
        setterMap.values()
      )
      .sort(
        (a, b) =>
          b.total - a.total
      );


  // ==========================================================
  // KPIs EXCLUSIVOS DE CALENDAR
  // ==========================================================

  const kpis = {

    total:
      0,

    // Compatibilidad de contrato.
    agendadoCRM:
      0,

    confirmado:
      0,

    asistio:
      0,

    cancelado:
      0,

    noShow:
      0,

    // Compatibilidad de contrato.
    pendienteAgenda:
      0,

    // Compatibilidad de contrato.
    reagendado:
      0,

    tasaAsistencia:
      0,

    tasaNoShow:
      0

  };


  setters.forEach(
    item => {

      kpis.total +=
        item.total;

      kpis.confirmado +=
        item.confirmado;

      kpis.asistio +=
        item.asistio;

      kpis.cancelado +=
        item.cancelado;

      kpis.noShow +=
        item.noShow;

    }
  );


  if (
    kpis.total > 0
  ) {

    kpis.tasaAsistencia =
      Number(
        (
          (
            kpis.asistio /
            kpis.total
          ) *
          100
        ).toFixed(2)
      );


    kpis.tasaNoShow =
      Number(
        (
          (
            kpis.noShow /
            kpis.total
          ) *
          100
        ).toFixed(2)
      );

  }


  // ==========================================================
  // VALIDACIÓN CALENDAR
  //
  // Para los estados actuales de GHL:
  // confirmed / showed / noshow / cancelled
  // la suma por Setter debe coincidir con calendarRegistros.
  // ==========================================================

  const calendarTotalFromSetters =
    setters.reduce(
      (sum, item) =>
        sum +
        Number(
          item.total || 0
        ),
      0
    );


  const calendarUnknownStatusCount =
    calendarRegistros.filter(
      registro =>
        ![
          "Confirmado",
          "Asistió",
          "Cancelado",
          "No asistió"
        ].includes(
          registro.estadoAgenda
        )
    ).length;


  const calendarExpectedSetterTotal =
    String(filtros.pipeline || "").trim().toLowerCase() === "vsl"
      ? calendarRegistros.filter(
          registro => registro.estadoAgenda !== "Confirmado"
        ).length
      : calendarRegistros.length;

  if (
    calendarTotalFromSetters !==
    calendarExpectedSetterTotal
  ) {

    console.warn(
      "CALENDAR SETTER VALIDATION | setters=" +
      calendarTotalFromSetters +
      " | esperado=" +
      calendarExpectedSetterTotal +
      " | calendarRegistros=" +
      calendarRegistros.length +
      " | estadosDesconocidos=" +
      calendarUnknownStatusCount
    );

  }


  // ==========================================================
  // KPIs GENERALES
  //
  // totalLeads = todas las Opportunities filtradas.
  // attended / attendanceRate = solo Calendar real.
  // ==========================================================

  const totalLeads =
    leadRegistros.length;


  const totalAppointments =
    calendarRegistros.length;


  const attended =
    calendarRegistros.filter(
      registro =>
        registro.estadoAgenda ===
        "Asistió"
    ).length;


  const attendanceRate =
    totalAppointments > 0
      ? Number(
          (
            (
              attended /
              totalAppointments
            ) *
            100
          ).toFixed(2)
        )
      : 0;


  const leadTypeKpis = {

    totalLeads:
      totalLeads,

    totalAppointments:
      totalAppointments,

    attended:
      attended,

    attendanceRate:
      attendanceRate

  };


  // ==========================================================
  // RESUMEN VSL POR TIPO
  //
  // Leads = todas las Opportunities VSL de ese tipo.
  // Asistencia = solo citas reales Calendar de ese tipo.
  // ==========================================================

  const vslPaidRows =
    leadRegistros.filter(
      registro =>
        registro.pipeline === "vsl" &&
        registro.leadType === "paid"
    );


  const vslOrganicRows =
    leadRegistros.filter(
      registro =>
        registro.pipeline === "vsl" &&
        registro.leadType === "organic"
    );


  const vslPaidCalendarRows =
    calendarRegistros.filter(
      registro =>
        registro.pipeline === "vsl" &&
        registro.leadType === "paid"
    );


  const vslOrganicCalendarRows =
    calendarRegistros.filter(
      registro =>
        registro.pipeline === "vsl" &&
        registro.leadType === "organic"
    );


  const vslPaidAttended =
    vslPaidCalendarRows.filter(
      registro =>
        registro.estadoAgenda ===
        "Asistió"
    ).length;


  const vslOrganicAttended =
    vslOrganicCalendarRows.filter(
      registro =>
        registro.estadoAgenda ===
        "Asistió"
    ).length;


  const paidKpis = {

    totalVslPaidLeads:
      vslPaidRows.length,

    totalAppointments:
      vslPaidCalendarRows.length,

    attended:
      vslPaidAttended,

    attendanceRate:
      vslPaidCalendarRows.length > 0
        ? Number(
            (
              (
                vslPaidAttended /
                vslPaidCalendarRows.length
              ) * 100
            ).toFixed(2)
          )
        : 0

  };


  const organicKpis = {

    totalVslOrganicLeads:
      vslOrganicRows.length,

    totalAppointments:
      vslOrganicCalendarRows.length,

    attended:
      vslOrganicAttended,

    attendanceRate:
      vslOrganicCalendarRows.length > 0
        ? Number(
            (
              (
                vslOrganicAttended /
                vslOrganicCalendarRows.length
              ) * 100
            ).toFixed(2)
          )
        : 0

  };


  // ==========================================================
  // VENTAS
  //
  // Una venta = una Opportunity cuya Fase sea una de las
  // cuatro fases comerciales definidas.
  //
  // IMPORTANTE:
  // registros YA contiene los filtros aplicados.
  // Por eso sales responde automáticamente a:
  //
  // - Pagados / Orgánicos
  // - Fecha de cita
  // - Setter efectivo (OEI/LIG = Creado por cita)
  // - Estado de agenda
  // - VSL Origen
  // - Closer
  // ==========================================================

  const salesRows =
    salesRegistros.filter(
      registro =>
        API_IS_SALE_STAGE(
          registro.fase,
          registro.pipeline
        )
    );


  // ==========================================================
  // VENTAS POR FASE
  //
  // Se construye desde las fases REALES encontradas después
  // de aplicar los filtros. No se muestran fases ficticias en 0.
  // ==========================================================

  const salesByStageMap =
    new Map();


  salesRows.forEach(
    registro => {

      const stage =
        String(
          registro.fase || ""
        ).trim();


      if (!stage) {
        return;
      }


      const key =
        API_NORMALIZE_STAGE(
          stage
        );


      const current =
        salesByStageMap.get(
          key
        );


      if (current) {

        current.count++;

      } else {

        salesByStageMap.set(
          key,
          {
            stage: stage,
            count: 1
          }
        );

      }

    }
  );


  const salesByStage =
    Array
      .from(
        salesByStageMap.values()
      )
      .sort(
        (a, b) =>
          a.stage.localeCompare(
            b.stage
          )
      );


  // ==========================================================
  // DETALLE DE VENTAS
  // ==========================================================

  const salesDetailRows =
    salesRows.map(
      registro => ({

        setterAsignado:
          registro.setterAsignado || "",

        // Agendador real de la cita, o indicador de cita automatica.
        agendadorCita:
          registro.agendadorCita || "",

        createdByUserName:
          registro.createdByUserName || "",

        closerAsignado:
          registro.closerAsignado || "",

        closerCita:
          registro.closerCita || "",

        nombreContacto:
          registro.nombreContacto || "",

        fase:
          registro.fase || "",

        fuente:
          registro.fuente || "",

        productoEvento:
          registro.productoEvento || "",

        // Fecha que determina la inclusión de la venta
        // cuando el frontend aplica dateFrom/dateTo.
        fechaVenta: API_GET_SALE_DATE_(registro),

        // Campos financieros oficiales para TODOS los embudos.
        // Fuente única: Fecha de primer pago + Moneda del monto acordado
        // + Monto Total Acordado + Monto del último pago.
        fechaPrimerPago:
          registro.fechaPrimerPago || "",

        planPagos:
          registro.planPagos || "",

        moneda:
          registro.moneda || "",

        montoTotalAcordado:
          Number(registro.montoTotalAcordado || 0),

        montoUltimoPago:
          Number(registro.montoUltimoPago || 0),

        fechaReunion:
          registro.fechaReunion || "",

        fechaCita:
          registro.fechaCita || "",

        fechaAgendamiento:
          registro.fechaAgendamiento || "",

        pipeline:
          registro.pipeline || "",

        secuencia:
          registro.secuencia || "",

        calendarioCita:
          registro.calendarioCita || "",

        estadoAgenda:
          registro.estadoAgenda || "",

        estadoCita:
          registro.estadoCita || ""

      })
    );


  // ==========================================================
  // CASH COLECTADO POR MONEDA
  //
  // No se mezclan USD y PEN en un único total.
  // ==========================================================

  const cashByCurrencyMap =
    new Map();


  salesDetailRows.forEach(
    row => {

      const currency =
        row.moneda ||
        "SIN MONEDA";


      const current =
        cashByCurrencyMap.get(
          currency
        ) || 0;


      cashByCurrencyMap.set(
        currency,
        current +
        Number(
          row.montoUltimoPago || 0
        )
      );

    }
  );


  const cashByCurrency =
    Array.from(
      cashByCurrencyMap.entries()
    )
      .map(
        ([currency, amount]) => ({

          currency:
            currency,

          amount:
            Number(
              amount.toFixed(2)
            )

        })
      )
      .sort(
        (a, b) =>
          a.currency.localeCompare(
            b.currency
          )
      );


  // ==========================================================
  // RESUMEN FINANCIERO POR PRODUCTO
  //
  // El valor de venta usa Monto Total Acordado REAL del Sheet.
  // No sustituimos PEN/USD ni descuentos por un ticket teórico.
  // cashRecaudado usa Monto del último pago.
  // Se separa el mismo producto por moneda para no mezclar PEN/USD.
  // ==========================================================

  const productSalesMap =
    new Map();


  salesDetailRows.forEach(
    row => {

      const producto =
        String(
          row.productoEvento || ""
        ).trim();

      const moneda =
        String(
          row.moneda || ""
        ).trim() ||
        "SIN MONEDA";


      if (!producto) {
        return;
      }


      const key =
        API_NORMALIZE_PRODUCT(
          producto
        ) +
        "|" +
        moneda.toUpperCase();


      if (
        !productSalesMap.has(
          key
        )
      ) {

        productSalesMap.set(
          key,
          {
            producto: producto,
            cantidad: 0,
            moneda: moneda,
            valorVenta: 0,
            cashRecaudado: 0
          }
        );

      }


      const item =
        productSalesMap.get(
          key
        );


      item.cantidad++;

      item.valorVenta +=
        Number(
          row.montoTotalAcordado || 0
        );

      item.cashRecaudado +=
        Number(
          row.montoUltimoPago || 0
        );

    }
  );


  const productSummary =
    Array
      .from(
        productSalesMap.values()
      )
      .map(
        item => {

          const valorVenta =
            Number(
              Number(
                item.valorVenta || 0
              ).toFixed(2)
            );

          const cashRecaudado =
            Number(
              Number(
                item.cashRecaudado || 0
              ).toFixed(2)
            );

          const cantidad =
            Number(
              item.cantidad || 0
            );

          const ticketPromedio =
            cantidad > 0
              ? Number(
                  (
                    valorVenta /
                    cantidad
                  ).toFixed(2)
                )
              : 0;

          const porcentajeRecaudado =
            valorVenta > 0
              ? Number(
                  (
                    (
                      cashRecaudado /
                      valorVenta
                    ) *
                    100
                  ).toFixed(2)
                )
              : 0;


          return {
            producto: item.producto || "",
            cantidad: cantidad,
            moneda: item.moneda || "",
            ticket: ticketPromedio,
            ticketPromedio: ticketPromedio,
            valorVenta: valorVenta,
            cashRecaudado: cashRecaudado,
            porcentajeRecaudado: porcentajeRecaudado
          };

        }
      )
      .sort(
        (a, b) => {

          const productCompare =
            a.producto.localeCompare(
              b.producto
            );

          if (productCompare !== 0) {
            return productCompare;
          }

          return a.moneda.localeCompare(
            b.moneda
          );

        }
      );


  // ==========================================================
  // RESUMEN TOTAL POR MONEDA
  //
  // No se mezclan monedas distintas.
  // ==========================================================

  const salesValueByCurrencyMap = new Map();
  salesDetailRows.forEach(row => {
    const currency = String(row.moneda || "SIN MONEDA").trim().toUpperCase();
    if (!salesValueByCurrencyMap.has(currency)) {
      salesValueByCurrencyMap.set(currency, {
        currency: currency,
        salesValue: 0,
        cashCollected: 0
      });
    }
    const item = salesValueByCurrencyMap.get(currency);
    item.salesValue += Number(row.montoTotalAcordado || 0);
    item.cashCollected += Number(row.montoUltimoPago || 0);
  });

  const salesValueByCurrency =
    Array
      .from(
        salesValueByCurrencyMap.values()
      )
      .map(
        item => {

          const salesValue =
            Number(
              Number(
                item.salesValue || 0
              ).toFixed(2)
            );


          const cashCollected =
            Number(
              Number(
                item.cashCollected || 0
              ).toFixed(2)
            );


          return {

            currency:
              item.currency,

            salesValue:
              salesValue,

            cashCollected:
              cashCollected,

            collectedRate:
              salesValue > 0
                ? Number(
                    (
                      (
                        cashCollected /
                        salesValue
                      ) *
                      100
                    ).toFixed(2)
                  )
                : 0

          };

        }
      )
      .sort(
        (a, b) =>
          a.currency.localeCompare(
            b.currency
          )
      );


  const sales = {

    conversionPorProductoMensual: API_MONTHLY_CLOSER_PRODUCT_CONVERSION_(
      oppData, apptData, oi, ai, filtros, requestedLeadType, requestedVslTipo
    ),

    total:
      salesRows.length,

    byStage:
      salesByStage,

    cashByCurrency:
      cashByCurrency,

    productSummary:
      productSummary,

    salesValueByCurrency:
      salesValueByCurrency,

    rows:
      salesDetailRows

  };


  // ==========================================================
  // DATASETS INDEPENDIENTES PARA SETTER / CLOSER
  //
  // REGLA COMERCIAL PARA TODOS LOS EMBUDOS:
  //
  // SETTER:
  // - Solo estados "Asistió" y "No asistió".
  // - El rango dateFrom/dateTo se mide por _Appointment Created At.
  //
  // CLOSER:
  // - Solo estados "Asistió" y "No asistió".
  // - El rango dateFrom/dateTo se mide por Fecha cita / Fecha de reunión.
  //
  // IMPORTANTE:
  // - Esta separación NO modifica leadRegistros.
  // - NO modifica vslSeteo ni la cantidad de "Leads seteados".
  // - NO modifica calendarRegistros ni el detalle general de Calendar.
  // - Se mantiene el mismo contrato JSON para no tocar el frontend.
  // ==========================================================

  // Dataset histórico de Calendar: independiente de las cohortes de rendimiento.
  const activityAppointmentsById = new Map();
  calendarRegistros.forEach(a => {
    const id = String(a.appointmentId || "").trim();
    if (id && !activityAppointmentsById.has(id)) activityAppointmentsById.set(id, a);
  });
  const activityAppointments = Array.from(activityAppointmentsById.values());

  const attendanceStatuses = new Set([
    "Asistió",
    "No asistió"
  ]);

  const setterActivityAppointments = directAppointmentRecords.filter(a => {
    if (!attendanceStatuses.has(a.estadoAgenda)) return false;

    const fechaCreacionCita = API_NORMALIZE_DATE(
      a.appointmentCreatedAt ||
      a.fechaCreacionCita ||
      ""
    );

    return API_DATE_IN_RANGE(
      fechaCreacionCita,
      filtros.dateFrom,
      filtros.dateTo
    );
  });

  const closerActivityAppointments = directAppointmentRecords.filter(a => {
    if (!attendanceStatuses.has(a.estadoAgenda)) return false;

    const fechaCita = API_NORMALIZE_DATE(
      a.fechaCita ||
      a.fechaReunion ||
      ""
    );

    return API_DATE_IN_RANGE(
      fechaCita,
      filtros.dateFrom,
      filtros.dateTo
    );
  });

  // ==========================================================
  // KPI DE CLOSERS: CITAS ASISTIDAS Y VENTAS VINCULADAS
  // Fuente primaria: APPOINTMENTS_MASTER, un Appointment ID por cita.
  // Para actividad del closer se usa Fecha cita / Fecha de reunión.
  // Solo cuentan Asistió + No asistió.
  // Venta: Opportunity ID unico en fase de venta.
  // Si hubo varios closers en citas asistidas de una misma venta,
  // no se atribuye arbitrariamente a ninguno.
  // ==========================================================
  const closerStatsMap = new Map();
  const attendedByOpportunity = new Map();
  const attendedIds = new Set();

  closerActivityAppointments.forEach(a => {
    if (a.estadoAgenda !== "Asistió") return;
    const appointmentId = String(a.appointmentId || "").trim();
    if (!appointmentId || attendedIds.has(appointmentId)) return;
    attendedIds.add(appointmentId);
    const closer = String(a.closerCita || a.closerAsignado || "").trim() || "Sin closer identificado";
    if (!closerStatsMap.has(closer)) {
      closerStatsMap.set(closer, { closer, citasAsistidas: 0, ventas: 0, conversionPct: 0 });
    }
    closerStatsMap.get(closer).citasAsistidas++;
    // El denominador del closer se limita al periodo por FECHA DE CITA.
    // Solo participa el estado Asistió para citasAsistidas.

  });

  // ATRIBUCION HISTORICA: citas asistidas de TODOS los periodos.
  // Se usan las citas ya indexadas de APPOINTMENTS_MASTER, sin dateFrom/dateTo.
  // La venta se filtra por fecha comercial previamente, en salesRows.
  const validSaleOpportunityIds = new Set(salesRows.map(s => String(s.opportunityId || "").trim()).filter(Boolean));
  const opportunityIndexForSales = new Map(baseOpportunities.map(o => [o.opportunityId, o]));
  validSaleOpportunityIds.forEach(oid => {
    const base = opportunityIndexForSales.get(oid);
    if (!base) return;
    const seenHistoricalAppointments = new Set();
    (appointmentsByOpportunity.get(oid) || []).forEach(a => {
      if (!a.appointmentId || seenHistoricalAppointments.has(a.appointmentId)) return;
      seenHistoricalAppointments.add(a.appointmentId);
      if (a.pipeline && a.pipeline !== base.pipeline) return;
      if (!API_IS_CALENDAR_ALLOWED(base.pipeline, a.calendarioCita)) return;
      if (a.estadoAgenda !== "Asistió") return;
      const rawCloser = String(a.closerCita || "").trim();
      if (!rawCloser) return;
      const key = API_NORMALIZE_PERSON_KEY_(rawCloser);
      const official = {
        "FIORELA BERNALES": "Fiorela Bernales",
        "EZEQUIEL DARIO": "Ezequiel Dario",
        "AMARANTA ALFONSO KRASNOVA": "Amaranta Alfonso Krasnova"
      };
      const closer = official[key] || rawCloser;
      if (!attendedByOpportunity.has(oid)) attendedByOpportunity.set(oid, new Set());
      attendedByOpportunity.get(oid).add(closer);
    });
  });

  const countedSales = new Set();
  let ventasSinCitaAsistida = 0;
  let ventasAtribucionAmbigua = 0;
  salesRows.forEach(sale => {
    const oid = String(sale.opportunityId || "").trim();
    if (!oid || countedSales.has(oid)) return;
    countedSales.add(oid);
    const candidates = attendedByOpportunity.get(oid);
    if (!candidates || !candidates.size) { ventasSinCitaAsistida++; return; }
    if (candidates.size !== 1) { ventasAtribucionAmbigua++; return; }
    const closer = Array.from(candidates)[0];
    if (closer === "Sin closer identificado") { ventasAtribucionAmbigua++; return; }
    if (!closerStatsMap.has(closer)) {
      closerStatsMap.set(closer, { closer, citasAsistidas: 0, ventas: 0, conversionPct: 0 });
    }
    closerStatsMap.get(closer).ventas++;
  });

  const conversionPorCloser = Array.from(closerStatsMap.values())
    .map(item => ({
      ...item,
      conversionPct: item.citasAsistidas
        ? Number((item.ventas * 100 / item.citasAsistidas).toFixed(2))
        : null
    }))
    .sort((a, b) => b.citasAsistidas - a.citasAsistidas || a.closer.localeCompare(b.closer));

  // LIG ya forma parte del dataset principal cuando pipeline=all.
  // Por eso no se reconstruye un segundo dataset especial: evitamos duplicar citas.
  const isGeneralPipeline = !filtros.pipeline || filtros.pipeline === "all";
  const ligAppointmentRecords = [];

  // ==========================================================
  // CONVERSIÓN DE ASISTENCIA POR CLOSER
  //
  // Citas asignadas = Asistió + No asistió.
  // Fecha del periodo = Fecha cita / Fecha de reunión.
  // Confirmado y Cancelado NO entran en el total.
  // ==========================================================
  const closerAttendanceMap = new Map();
  const closerAppointmentIds = new Set();

  closerActivityAppointments.forEach(a => {
    const id = String(a.appointmentId || "").trim();
    if (!id || closerAppointmentIds.has(id)) return;
    closerAppointmentIds.add(id);

    const closer =
      String(a.closerCita || a.closerAsignado || "").trim() ||
      "Sin closer identificado";

    if (!closerAttendanceMap.has(closer)) {
      closerAttendanceMap.set(closer, {
        closer,
        agendamientos: 0,
        citasAsistidas: 0,
        asistenciaPct: null
      });
    }

    const item = closerAttendanceMap.get(closer);

    // closerActivityAppointments ya contiene únicamente
    // Asistió + No asistió.
    item.agendamientos++;

    if (a.estadoAgenda === "Asistió") {
      item.citasAsistidas++;
    }
  });

  const asistenciaPorCloserTodosEmbudos =
    Array.from(closerAttendanceMap.values())
      .map(item => ({
        ...item,
        asistenciaPct: item.agendamientos
          ? Number(
              (
                100 *
                item.citasAsistidas /
                item.agendamientos
              ).toFixed(2)
            )
          : null
      }))
      .sort(
        (a, b) =>
          b.agendamientos - a.agendamientos ||
          a.closer.localeCompare(b.closer)
      );

  // ==========================================================
  // CONVERSIÓN DE ASISTENCIA POR SETTER
  //
  // Agendamientos = Asistió + No asistió.
  // Fecha del periodo = _Appointment Created At.
  // Confirmado y Cancelado NO entran en el total.
  // ==========================================================
  const setterStatsMap = new Map();
  const setterAppointmentIds = new Set();

  setterActivityAppointments.forEach(a => {
    const id = String(a.appointmentId || "").trim();
    if (!id || setterAppointmentIds.has(id)) return;
    setterAppointmentIds.add(id);

    const setter =
      API_NORMALIZE_SETTER_NAME_(
        a.setterAsignado ||
        a.setterEfectivo ||
        ""
      ) ||
      "Sin setter identificado";

    if (!setterStatsMap.has(setter)) {
      setterStatsMap.set(setter, {
        setter,
        agendamientos: 0,
        citasAsistidas: 0,
        asistenciaPct: 0
      });
    }

    const item = setterStatsMap.get(setter);

    // setterActivityAppointments ya contiene únicamente
    // Asistió + No asistió.
    item.agendamientos++;

    if (a.estadoAgenda === "Asistió") {
      item.citasAsistidas++;
    }
  });

  const asistenciaPorSetter =
    Array.from(setterStatsMap.values())
      .map(item => ({
        ...item,
        asistenciaPct: item.agendamientos
          ? Number(
              (
                item.citasAsistidas *
                100 /
                item.agendamientos
              ).toFixed(2)
            )
          : null
      }))
      .sort(
        (a, b) =>
          b.agendamientos - a.agendamientos ||
          a.setter.localeCompare(b.setter)
      );

  const performance = {
    conversionPorCloser,
    asistenciaPorSetter,
    asistenciaPorCloserTodosEmbudos,
    alcanceAsistencia:
      isGeneralPipeline
        ? "vsl+oei+lig"
        : String(filtros.pipeline),
    alcanceConversionCloser:
      isGeneralPipeline
        ? "vsl+oei+lig"
        : String(filtros.pipeline),
    diagnostics: {
      citasLigIncluidasSoloEnActividad: 0,
      citasUnicasActividad: activityAppointments.length,
      citasUnicasActividadSetter:
        setterAppointmentIds.size,
      citasUnicasActividadCloser:
        closerAppointmentIds.size,
      ventasSinCitaAsistida,
      ventasAtribucionAmbigua,
      ventasUnicas:
        countedSales.size,
      citasAsistidasUnicas:
        attendedIds.size,
      criterio:
        "Setter: Asistió + No asistió por _Appointment Created At. Closer: Asistió + No asistió por Fecha cita / Fecha de reunión."
    }
  };

  // ==========================================================
  // INDICADORES DE NEGOCIO SOLICITADOS (excepto punto 6)
  // ==========================================================

  // 2) Rendimiento nuevo y campos históricos de compatibilidad.
  const bookedOpportunityIds = new Set(appointmentsByOpportunity.keys());
  const setterLeadMap = new Map();
  leadRegistros.forEach(r => {
    const setter = API_NORMALIZE_SETTER_NAME_(r.setterOpportunity || "") || "Sin setter identificado";
    if (!setterLeadMap.has(setter)) setterLeadMap.set(setter, { setter, leadsAsignados: 0, agendados: 0 });
    const item = setterLeadMap.get(setter);
    item.leadsAsignados++;
    // Campo histórico: leads del periodo con cita histórica, sin cambiar su definición.
    if (bookedOpportunityIds.has(r.opportunityId)) item.agendados++;
  });
  setterStatsMap.forEach((_, setter) => {
    if (!setterLeadMap.has(setter)) setterLeadMap.set(setter, { setter, leadsAsignados: 0, agendados: 0 });
  });
  const agendamientoPorSetter = Array.from(setterLeadMap.values()).map(item => {
    const agendamientos = setterStatsMap.get(item.setter)?.agendamientos || 0;
    return {
      ...item,
      noAgendados: item.leadsAsignados - item.agendados,
      agendamientos,
      agendamientoPct: item.leadsAsignados ? Number((100 * agendamientos / item.leadsAsignados).toFixed(2)) : null
    };
  }).sort((a, b) => b.agendamientos - a.agendamientos || a.setter.localeCompare(b.setter));

  // 3) % conversión por embudo.
  const conversionPorEmbudo = ["vsl", "oei", "lig"].map(pipelineKey => {
    const leads = new Set(leadRegistros.filter(r => r.pipeline === pipelineKey).map(r => String(r.opportunityId || "")).filter(Boolean));
    const ventas = new Set(salesRows.filter(r => r.pipeline === pipelineKey).map(r => String(r.opportunityId || "")).filter(Boolean));
    return {
      pipeline: pipelineKey,
      label: API_GET_PIPELINE_LABEL(pipelineKey),
      leads: leads.size,
      ventas: ventas.size,
      conversionPct: leads.size ? Number((ventas.size * 100 / leads.size).toFixed(2)) : null
    };
  });

  // 4) Leads VSL no agendados por mes de creación de Opportunity.
  const vslMonthly = new Map();
  leadRegistros.filter(r => r.pipeline === "vsl").forEach(r => {
    const month = String(r.fechaCreacionOportunidad || "").slice(0, 7) || "SIN_FECHA";
    if (!vslMonthly.has(month)) vslMonthly.set(month, { month: month, leads: new Set(), noAgendados: new Set() });
    const item = vslMonthly.get(month);
    const oid = String(r.opportunityId || "").trim();
    if (!oid) return;
    item.leads.add(oid);
    // Para VSL, "No agendado" se define por la columna VSL Origen.
    if (API_IS_VSL_NOT_SCHEDULED_ORIGIN_(r.vslOrigen)) {
      item.noAgendados.add(oid);
    }
  });
  const leadsNoAgendadosVslPorMes = Array.from(vslMonthly.values()).map(item => ({
    month: item.month,
    leads: item.leads.size,
    agendados: Array.from(item.leads).filter(oid => bookedOpportunityIds.has(oid)).length,
    noAgendados: item.noAgendados.size,
    noAgendadosPct: item.leads.size ? Number((item.noAgendados.size * 100 / item.leads.size).toFixed(2)) : null
  })).sort((a, b) => a.month.localeCompare(b.month));

  // 5) Sesiones entregadas = Appointment único con estado efectivo Asistió.
  const sesionesCloserMap = new Map();
  const sesionesIds = new Set();
  activityAppointments.forEach(a => {
    if (a.estadoAgenda !== "Asistió") return;
    const id = String(a.appointmentId || "").trim();
    if (!id || sesionesIds.has(id)) return;
    sesionesIds.add(id);
    const closer = String(a.closerCita || a.closerAsignado || "").trim() || "Sin closer identificado";
    sesionesCloserMap.set(closer, (sesionesCloserMap.get(closer) || 0) + 1);
  });
  const sesionesEntregadasPorCloser = Array.from(sesionesCloserMap.entries())
    .map(([closer, sesiones]) => ({ closer: closer, sesiones: sesiones, sesionesEntregadas: sesiones }))
    .sort((a, b) => b.sesiones - a.sesiones || a.closer.localeCompare(b.closer));

  // 7) Cash registrado por embudo y producto.
  // IMPORTANTE: usa el campo monetario que esta API ya interpreta como cobro registrado
  // (Monto del último pago). No inventa pagos no presentes en el Master.
  const cashPipelineMap = new Map();
  const cashProductMap = new Map();
  const cashCrossMap = new Map();
  salesDetailRows.forEach(row => {
    const pipeline = String(row.pipeline || "").trim() || "sin_pipeline";
    const producto = String(row.productoEvento || "").trim() || "Sin producto";
    const moneda = String(row.moneda || "SIN MONEDA").trim().toUpperCase();
    const amount = Number(row.montoUltimoPago || 0);
    const pKey = pipeline + "|" + moneda;
    const prodKey = producto + "|" + moneda;
    const crossKey = pipeline + "|" + producto + "|" + moneda;
    cashPipelineMap.set(pKey, (cashPipelineMap.get(pKey) || 0) + amount);
    cashProductMap.set(prodKey, (cashProductMap.get(prodKey) || 0) + amount);
    cashCrossMap.set(crossKey, (cashCrossMap.get(crossKey) || 0) + amount);
  });
  const cashPorEmbudo = Array.from(cashPipelineMap.entries()).map(([key, amount]) => {
    const parts = key.split("|");
    return { pipeline: parts[0], moneda: parts[1], cash: Number(amount.toFixed(2)) };
  });
  const cashPorProducto = Array.from(cashProductMap.entries()).map(([key, amount]) => {
    const parts = key.split("|");
    return { producto: parts[0], moneda: parts[1], cash: Number(amount.toFixed(2)) };
  });
  const cashPorEmbudoProducto = Array.from(cashCrossMap.entries()).map(([key, amount]) => {
    const parts = key.split("|");
    return { pipeline: parts[0], producto: parts[1], moneda: parts[2], cash: Number(amount.toFixed(2)) };
  });

  // ==========================================================
  // CLASIFICACION DE SETEO - SOLO VSL
  //
  // La cohorte respeta el mismo rango de fechas de leads
  // (Creado el) aplicado a leadRegistros.
  // ==========================================================
  const vslSeteoRows = leadRegistros
    .filter(r => r.pipeline === "vsl")
    .map(r => ({
      opportunityId: String(r.opportunityId || ""),
      nombreContacto: String(r.nombreContacto || ""),
      fechaCreacion: String(r.fechaCreacionOportunidad || ""),
      fase: String(r.fase || ""),
      estadoSeteo: API_GET_VSL_SETEO_STATUS_(r.pipeline, r.fase),
      setter: String(r.setterOpportunity || r.setterAsignado || ""),
      fuente: String(r.fuente || ""),
      leadType: String(r.leadType || "")
    }));

  const vslFaltanSetearRows = vslSeteoRows.filter(r => r.estadoSeteo === "falta_setear");
  const vslSeteadosRows = vslSeteoRows.filter(r => r.estadoSeteo === "seteado");

  const vslSeteoStageMap = new Map();
  vslSeteoRows.forEach(r => {
    const stage = r.fase || "Sin etapa";
    const key = r.estadoSeteo + "|" + stage;
    if (!vslSeteoStageMap.has(key)) {
      vslSeteoStageMap.set(key, {
        estadoSeteo: r.estadoSeteo,
        fase: stage,
        total: 0
      });
    }
    vslSeteoStageMap.get(key).total++;
  });

  const vslTotalSeteo = vslSeteoRows.length;
  // % de asistencia comercial VSL:
  // Leads asistidos / Leads seteados × 100.
  // `attended` ya proviene de calendarRegistros; para VSL esos registros
  // excluyen los calendarios ORGÁNICOS mediante API_GET_ALLOWED_CALENDARS().
  const vslAsistenciaSobreSeteadosPct =
    vslSeteadosRows.length > 0
      ? Number(((attended / vslSeteadosRows.length) * 100).toFixed(2))
      : 0;

  const vslSeteo = {
    aplicaSoloA: "vsl",
    criterioFecha: "Creado el",
    etapasFaltanSetear: [
      "Lead Pendiente de Agenda",
      "Lead Agendado (Automatico)"
    ],
    totalLeadsVsl: vslTotalSeteo,
    faltanSetear: vslFaltanSetearRows.length,
    seteados: vslSeteadosRows.length,
    asistidos: attended,
    asistenciaSobreSeteadosPct: vslAsistenciaSobreSeteadosPct,
    faltanSetearPct: vslTotalSeteo
      ? Number((vslFaltanSetearRows.length * 100 / vslTotalSeteo).toFixed(2))
      : 0,
    seteadosPct: vslTotalSeteo
      ? Number((vslSeteadosRows.length * 100 / vslTotalSeteo).toFixed(2))
      : 0,
    porEtapa: Array.from(vslSeteoStageMap.values())
      .sort((a, b) => b.total - a.total || a.fase.localeCompare(b.fase)),
    faltanSetearRows: vslFaltanSetearRows,
    seteadosRows: vslSeteadosRows
  };

  // Mantener compatibilidad con el frontend actual.
  // En el reporte VSL, la tasa principal de asistencia se define como:
  // Leads asistidos / Leads seteados × 100.
  // Para OEI, LIG o vista general se conserva la lógica previa.
  if (String(filtros.pipeline || "").trim().toLowerCase() === "vsl") {
    kpis.tasaAsistencia = vslAsistenciaSobreSeteadosPct;
    leadTypeKpis.attendanceRate = vslAsistenciaSobreSeteadosPct;
  }

  // ETAPAS DE OPPORTUNITY POR EMBUDO: VSL, OEI Y LIG.
  // Cuenta Opportunities unicas de la cohorte de leads filtrada por "Creado el".
  // "Fase" es etapa comercial; no equivale a "Estado cita" de Calendar.
  const etapasPorEmbudo = (() => {
    const keys = ["vsl", "oei", "lig"];
    const buckets = {};
    keys.forEach(key => {
      buckets[key] = { pipeline: key, label: API_GET_PIPELINE_LABEL(key), totalLeads: 0, porEtapa: [], _ids: new Set(), _stages: new Map() };
    });
    leadRegistros.forEach(row => {
      const key = String(row.pipeline || "").trim().toLowerCase();
      const bucket = buckets[key];
      if (!bucket) return;
      const id = String(row.opportunityId || "").trim();
      if (!id || bucket._ids.has(id)) return;
      bucket._ids.add(id);
      const fase = String(row.fase || "").trim() || "Sin etapa";
      bucket._stages.set(fase, (bucket._stages.get(fase) || 0) + 1);
    });
    keys.forEach(key => {
      const bucket = buckets[key];
      bucket.totalLeads = bucket._ids.size;
      bucket.porEtapa = Array.from(bucket._stages.entries())
        .map(([fase, total]) => ({ fase: fase, total: total,
          porcentaje: bucket.totalLeads ? Number((total * 100 / bucket.totalLeads).toFixed(2)) : 0 }))
        .sort((a, b) => b.total - a.total || a.fase.localeCompare(b.fase));
      delete bucket._ids;
      delete bucket._stages;
    });
    return {
      criterioFecha: "Creado el",
      campoOrigen: "OPPORTUNITIES_MASTER.Fase",
      totalLeads: keys.reduce((n, key) => n + buckets[key].totalLeads, 0),
      porEmbudo: buckets,
      validacion: {
        sumasCorrectas: keys.every(key => buckets[key].totalLeads === buckets[key].porEtapa.reduce((n, e) => n + e.total, 0))
      }
    };
  })();

  // ==========================================================
  // KPI DE CALIFICACIÓN - LANZAMIENTO INTERNO GRATUITO (LIG)
  // ==========================================================
  //
  // "No calificados" = suma de Opportunities únicas ubicadas en:
  // - No existe número
  // - No existe
  // - No interesado/No desea
  // - No interesado
  //
  // Se usa etapasPorEmbudo para mantener exactamente la misma
  // cohorte, deduplicación por Opportunity ID y filtro de fecha
  // que el conteo oficial de etapas.
  // ==========================================================

  const ligNoCalificados = (() => {

    const ligBucket =
      etapasPorEmbudo &&
      etapasPorEmbudo.porEmbudo
        ? etapasPorEmbudo.porEmbudo.lig
        : null;

    const totalLeads =
      ligBucket
        ? Number(ligBucket.totalLeads || 0)
        : 0;

    const stages =
      API_GET_UNQUALIFIED_STAGES_("lig");

    const detalle =
      stages.map(stageName => {

        const found =
          ligBucket &&
          Array.isArray(ligBucket.porEtapa)
            ? ligBucket.porEtapa.find(
                item =>
                  API_NORMALIZE_STAGE(item.fase) ===
                  API_NORMALIZE_STAGE(stageName)
              )
            : null;

        return {
          fase: stageName,
          total: found ? Number(found.total || 0) : 0
        };

      });

    const noCalificados =
      detalle.reduce(
        (sum, item) =>
          sum + Number(item.total || 0),
        0
      );

    return {
      aplicaSoloA: "lig",
      criterioFecha: "Creado el",
      campoOrigen: "OPPORTUNITIES_MASTER.Fase",
      etapasNoCalificadas: stages,
      totalLeads: totalLeads,
      noCalificados: noCalificados,
      noCalificadosPct:
        totalLeads > 0
          ? Number(
              (
                noCalificados *
                100 /
                totalLeads
              ).toFixed(2)
            )
          : 0,
      detalleNoCalificados: detalle
    };

  })();


  const businessMetrics = {
    conversionPorCloser: conversionPorCloser,
    agendamientoPorSetter: agendamientoPorSetter,
    conversionPorEmbudo: conversionPorEmbudo,
    leadsNoAgendadosVslPorMes: leadsNoAgendadosVslPorMes,
    sesionesEntregadasPorCloser: sesionesEntregadasPorCloser,
    cashPorEmbudo: cashPorEmbudo,
    cashPorProducto: cashPorProducto,
    cashPorEmbudoProducto: cashPorEmbudoProducto,
    vslSeteo: vslSeteo,
    etapasPorEmbudo: etapasPorEmbudo,
    ligNoCalificados: ligNoCalificados
  };

  // ==========================================================
  // VALIDACIÓN INTERNA DE VENTAS
  // ==========================================================

  const salesStageTotal =
    salesByStage.reduce(
      (sum, item) =>
        sum + item.count,
      0
    );


  if (
    salesStageTotal !==
    sales.total
  ) {

    console.warn(
      "SALES VALIDATION | total=" +
      sales.total +
      " | byStage=" +
      salesStageTotal
    );

  }


  // ==========================================================
  // SEARCH DEL DETALLE GENERAL
  //
  // Search no altera KPIs ni ventas.
  // Solo altera la tabla de detalle general.
  // ==========================================================

  const needle =
    String(
      filtros.search || ""
    )
      .trim()
      .toLowerCase();


  const registrosDetalle =
    leadRegistros.filter(
      registro => {

        if (
          !needle
        ) {

          return true;

        }


        return [

          registro.nombreContacto,

          registro.telefono,

          registro.correo

        ]
          .join(" ")
          .toLowerCase()
          .includes(
            needle
          );

      }
    );


  // ==========================================================
  // PAGINACIÓN DETALLE GENERAL
  // ==========================================================

  const pageSize =
    Math.min(
      100,
      Math.max(
        1,
        Number(
          filtros.pageSize ||
          25
        )
      )
    );


  const totalDetail =
    registrosDetalle.length;


  const totalPages =
    Math.max(
      1,
      Math.ceil(
        totalDetail /
        pageSize
      )
    );


  const page =
    Math.min(
      totalPages,
      Math.max(
        1,
        Number(
          filtros.page ||
          1
        )
      )
    );


  const start =
    (
      page - 1
    ) *
    pageSize;


  const detail =
    registrosDetalle.slice(
      start,
      start + pageSize
    );


  // ==========================================================
  // ESTADOS DESCONOCIDOS
  // ==========================================================

  const unknownStatusCount =
    calendarRegistros.filter(
      registro =>
        registro.estadoAgenda &&
        !ESTADOS.includes(
          registro.estadoAgenda
        )
    ).length;


  const withoutStatusCount =
    appointmentRegistros.filter(
      registro =>
        !registro.estadoAgenda
    ).length;


  // ==========================================================
  // ÚLTIMA ACTUALIZACIÓN
  // ==========================================================

  const updatedAt =
    new Date()
      .toISOString();


  // ==========================================================
  // RESPONSE
  // ==========================================================

  return {

    report:
      "VSL | Closers + OEI + LIG",

    leadType:
      requestedLeadType,

    leadTypeLabel:
      requestedLeadType === "paid"
        ? "Pagados"
        : requestedLeadType === "organic"
          ? "Orgánicos"
          : "Todos",

    updatedAt:
      updatedAt,

    dateSemantics: {
      leads: "Creado el",
      appointments: "_Appointment Created At",
      appointmentsFallback: "Fecha cita → Fecha de reunión",
      setterPerformance: "_Appointment Created At",
      closerPerformance: "Fecha cita → Fecha de reunión",
      setterCloserStatuses: "Asistió + No asistió",
      sales: "VSL/OEI/LIG: Fecha de primer pago. Sin rango: todas las ventas en fase de venta",
      salesFallback: "Sin fallback: si Fecha de primer pago está vacía, la venta no se atribuye a un período",
      paymentDate: "Fecha de primer pago"
    },


    filters: {

      applied:
        filtros,

      available: {

        leadTypes:
          filtros.pipeline === "vsl"
            ? [

                {
                  value: "all",
                  label: "Todos"
                },

                {
                  value: "paid",
                  label: "Pagados"
                },

                {
                  value: "organic",
                  label: "Orgánicos"
                }

              ]
            : [],

        leadTypeFilterEnabled:
          filtros.pipeline === "vsl",

        pipelines:
          pipelinesDisponibles,

        calendars:
          calendariosDisponibles,

        setters:
          settersDisponibles,

        // OEI: usuarios de "Creado por cita".
        // Para pipeline=vsl este arreglo queda vacío.
        bookers:
          filtros.pipeline === "vsl"
            ? []
            : bookersDisponibles,

        statuses: [
          "Confirmado",
          "Asistió",
          "Cancelado",
          "No asistió"
        ],

        dateFields: [
          { value: "appointmentCreated", label: "Fecha de creación de cita" },
          { value: "meetingDate", label: "Fecha de cita / reunión" }
        ],

        bookingModes: [
          { value: "automatic", label: "Agendado automatico" },
          { value: "manual", label: "Agendado manual" }
        ],

        vslOrigins:
          origenesDisponibles,

        closers:
          closersDisponibles

      }

    },


    // Cohorte VSL pagada y conversión automática basadas en VSL Origen.
    vslOriginSummary:
      vslOriginSummary,

    pipelineSummary:
      pipelineSummary,


    kpis:
      kpis,


    leadTypeKpis:
      leadTypeKpis,


    paidKpis:
      paidKpis,


    organicKpis:
      organicKpis,


    // ========================================================
    // NUEVO: VENTAS
    // ========================================================

    sales:
      sales,

    leadsVslSinCita: leadsVslSinCita,
    leadsSinCitaPorEmbudo: leadsSinCitaPorEmbudo,
    cohorteDiariaVsl: cohorteDiariaVsl,

    performance: performance,

    // Clasificacion comercial de seteo. Solo VSL.
    vslSeteo: vslSeteo,
    etapasPorEmbudo: etapasPorEmbudo,

    // KPI agrupado de No calificados para Lanzamiento Interno Gratuito.
    ligNoCalificados: ligNoCalificados,

    // Se expone tambien el bloque de indicadores de negocio calculado arriba.
    businessMetrics: businessMetrics,


    unknownStatusCount:
      unknownStatusCount,

    withoutStatusCount:
      withoutStatusCount,

    calendarUnknownStatusCount:
      calendarUnknownStatusCount,

    calendarAppointmentsTotal:
      calendarRegistros.length,


    // Personas asociadas a las citas que quedaron después
    // de aplicar los filtros actuales.
    appointmentPeople: {

      // Solo OEI: "Creado por cita".
      oeiBookers:
        oeiBookers,

      // LIG: "Creado por cita".
      ligBookers:
        ligBookers,

      // Todos los agendadores (OEI + LIG).
      bookers:
        oeiBookers.concat(ligBookers),

      // VSL + OEI + LIG: "Closer cita".
      closers:
        calendarClosers

    },


    setters:
      setters,


    detail: {

      rows:
        detail,

      pagination: {

        page:
          page,

        pageSize:
          pageSize,

        totalRecords:
          totalDetail,

        totalPages:
          totalPages

      }

    }

  };

}



// ============================================================
// DETALLE DE AGENDAMIENTOS PARA MODAL
//
// Fuentes:
// - OPPORTUNITIES_MASTER
// - APPOINTMENTS_MASTER
//
// JOIN:
// OPPORTUNITIES_MASTER.Opportunity ID
// = APPOINTMENTS_MASTER._Opportunity ID
//
// Una fila de salida = una cita real de Calendar.
// Se deduplica por Appointment ID.
// ============================================================

function API_BUILD_APPOINTMENT_DETAIL(filtros) {
  filtros = filtros || {};

  const pipelineFilter = API_NORMALIZE_PIPELINE_FILTER(filtros.pipeline);
  const leadTypeFilter = API_NORMALIZE_LEAD_TYPE(filtros.leadType);
  const vslTipoFilter = String(filtros.vslTipo || "all").trim().toLowerCase();
  const dateField = API_NORMALIZE_DATE_FIELD_(filtros.dateField);

  const oppData = API_MASTER_READ_SHEET_("OPPORTUNITIES_MASTER");
  const apptData = API_MASTER_READ_SHEET_("APPOINTMENTS_MASTER");

  const oh = oppData.headers;
  const ah = apptData.headers;

  const oi = {
    opportunityId: API_MASTER_INDEX_ANY_(oh, ["Opportunity ID", "_Opportunity ID"], true),
    contactId: API_MASTER_INDEX_ANY_(oh, ["Contact ID", "_Contact ID"], false),
    nombre: API_MASTER_INDEX_ANY_(oh, ["Nombre contacto"], true),
    telefono: API_MASTER_INDEX_ANY_(oh, ["Telefono", "Teléfono"], true),
    correo: API_MASTER_INDEX_ANY_(oh, ["Correo electrónico", "Correo electronico"], true),
    secuencia: API_MASTER_INDEX_ANY_(oh, ["Secuencia"], true),
    fuente: API_MASTER_INDEX_ANY_(oh, ["Fuente"], true),
    asignado: API_MASTER_INDEX_ANY_(oh, ["Asignado"], false),
    setter: API_MASTER_INDEX_ANY_(oh, ["Setter asignado"], true),
    vslOrigen: API_MASTER_INDEX_ANY_(oh, ["VSL Origen"], false),
    fechaReunion: API_MASTER_INDEX_ANY_(oh, ["Fecha de reunión", "Fecha de reunion"], false)
  };

  const ai = {
    appointmentId: API_MASTER_INDEX_ANY_(ah, ["_Appointment ID", "Appointment ID"], true),
    opportunityId: API_MASTER_INDEX_ANY_(ah, ["_Opportunity ID", "Opportunity ID"], true),
    contactId: API_MASTER_INDEX_ANY_(ah, ["_Contact ID", "Contact ID"], false),
    pipelineOriginal: API_MASTER_INDEX_ANY_(ah, ["Pipeline original"], false),
    embudo: API_MASTER_INDEX_ANY_(ah, ["Embudo"], false),
    calendarioCita: API_MASTER_INDEX_ANY_(ah, ["Calendario cita", "Calendario GHL"], true),
    estadoCita: API_MASTER_INDEX_ANY_(ah, ["Estado cita"], true),
    fechaCita: API_MASTER_INDEX_ANY_(ah, ["Fecha cita"], true),
    appointmentCreatedAt: API_MASTER_INDEX_ANY_(ah, ["_Appointment Created At", "Appointment Created At"], false),
    appointmentUpdatedAt: API_MASTER_INDEX_ANY_(ah, ["_Appointment Updated At", "Appointment Updated At"], false),
    closerCita: API_MASTER_INDEX_ANY_(ah, ["Closer cita"], false),
    createdByUserName: API_MASTER_INDEX_ANY_(ah, ["Creado por cita"], false)
  };

  const opportunitiesById = new Map();

  oppData.rows.forEach(row => {
    const opportunityId = API_CELL_STRING(API_MASTER_VALUE_(row, oi.opportunityId));
    if (!opportunityId) return;

    const secuencia = API_CELL_STRING(API_MASTER_VALUE_(row, oi.secuencia));
    const pipeline = API_GET_PIPELINE_KEY(secuencia);
    if (!pipeline) return;

    opportunitiesById.set(opportunityId, {
      opportunityId: opportunityId,
      contactId: API_CELL_STRING(API_MASTER_VALUE_(row, oi.contactId)),
      nombreContacto: API_CELL_STRING(API_MASTER_VALUE_(row, oi.nombre)),
      telefono: API_CELL_STRING(API_MASTER_VALUE_(row, oi.telefono)),
      correo: API_CELL_STRING(API_MASTER_VALUE_(row, oi.correo)),
      pipeline: pipeline,
      secuencia: secuencia,
      fuente: API_CELL_STRING(API_MASTER_VALUE_(row, oi.fuente)),
      setterOpportunity: API_CELL_STRING(API_MASTER_VALUE_(row, oi.setter)),
      closerOpportunity: API_CELL_STRING(API_MASTER_VALUE_(row, oi.asignado)),
      vslOrigen: API_CELL_STRING(API_MASTER_VALUE_(row, oi.vslOrigen)),
      fechaReunionOpportunity: API_NORMALIZE_DATE(API_MASTER_VALUE_(row, oi.fechaReunion))
    });
  });

  const rows = [];
  const seenAppointmentIds = new Set();

  apptData.rows.forEach(row => {
    const appointmentId = API_CELL_STRING(API_MASTER_VALUE_(row, ai.appointmentId));
    const opportunityId = API_CELL_STRING(API_MASTER_VALUE_(row, ai.opportunityId));

    if (!appointmentId || !opportunityId || seenAppointmentIds.has(appointmentId)) return;
    seenAppointmentIds.add(appointmentId);

    const opp = opportunitiesById.get(opportunityId) || null;

    const appointmentPipelineName =
      API_CELL_STRING(API_MASTER_VALUE_(row, ai.embudo)) ||
      API_CELL_STRING(API_MASTER_VALUE_(row, ai.pipelineOriginal));

    const calendario =
      API_CELL_STRING(API_MASTER_VALUE_(row, ai.calendarioCita));

    const appointmentPipeline =
      API_GET_APPOINTMENT_PIPELINE_KEY_(
        appointmentPipelineName,
        calendario
      ) ||
      (opp ? opp.pipeline : "");

    if (!appointmentPipeline) return;

    if (
      pipelineFilter !== "all" &&
      appointmentPipeline !== pipelineFilter
    ) {
      return;
    }

    if (
      opp &&
      opp.pipeline &&
      appointmentPipeline !== opp.pipeline
    ) {
      return;
    }

    // VSL queda limitado exactamente a sus 4 calendarios permitidos;
    // OEI y LIG conservan sus calendarios permitidos.
    if (!API_IS_CALENDAR_ALLOWED(appointmentPipeline, calendario)) return;
    if (filtros.calendar && calendario !== filtros.calendar) return;

    const estadoCitaRaw =
      API_CELL_STRING(API_MASTER_VALUE_(row, ai.estadoCita));

    // Para el detalle enriquecido necesitamos la Opportunity.
    // El KPI principal NO depende de este JOIN; se calcula directamente
    // desde APPOINTMENTS_MASTER en API_BUILD_VSL_REPORT.
    if (!opp) return;

    const estado =
      API_GET_EFFECTIVE_APPOINTMENT_STATUS(
        estadoCitaRaw,
        ""
      );
    if (filtros.status && estado !== filtros.status) return;

    const createdByUserName = API_CELL_STRING(API_MASTER_VALUE_(row, ai.createdByUserName));
    const bookingMode = API_GET_BOOKING_MODE_(createdByUserName);
    const bookingModeLabel = API_GET_BOOKING_MODE_LABEL_(createdByUserName);

    if (
      filtros.bookingMode &&
      bookingMode !== String(filtros.bookingMode).trim().toLowerCase()
    ) {
      return;
    }

    const setterEfectivo = API_GET_EFFECTIVE_SETTER_(
      opp.pipeline,
      opp.setterOpportunity,
      createdByUserName
    );

    const setterFilter = String(filtros.setter || "").trim();

    if (setterFilter) {
      const appointmentSetters = API_GET_APPOINTMENT_SETTERS_(
        opp.setterOpportunity,
        createdByUserName
      );

      const wantsNoSetter =
        setterFilter === "__SIN_SETTER__" ||
        API_NORMALIZE_PERSON_KEY_(setterFilter) === API_NORMALIZE_PERSON_KEY_("Sin setter");

      // Compatibilidad: si el frontend abre la fila "Agendado automático"
      // usando setter=Agendado automatico, devolvemos todas las citas cuyo
      // Creado por cita está vacío.
      if (API_IS_AUTOMATIC_SETTER_FILTER_(setterFilter)) {
        if (bookingMode !== "automatic") return;
      } else if (wantsNoSetter) {
        if (appointmentSetters.responsables.length > 0) return;
      } else if (!API_APPOINTMENT_MATCHES_SETTER_(
        opp.setterOpportunity,
        createdByUserName,
        setterFilter
      )) {
        return;
      }
    }

    if (filtros.booker) {
      const wantedBooker = String(filtros.booker).trim();

      if (wantedBooker === "__AUTOMATIC__" || wantedBooker.toLowerCase() === "agendado automatico") {
        if (bookingMode !== "automatic") return;
      } else if (
        API_NORMALIZE_SETTER_NAME_(createdByUserName) !==
        API_NORMALIZE_SETTER_NAME_(wantedBooker)
      ) {
        return;
      }
    }

    const closerCita = API_CELL_STRING(API_MASTER_VALUE_(row, ai.closerCita));
    const closer = closerCita || opp.closerOpportunity;

    if (filtros.closer && closer !== filtros.closer) return;

    const appointmentLeadType = API_GET_ROW_LEAD_TYPE(
      opp.pipeline,
      opp.fuente,
      calendario
    );

    if (
      leadTypeFilter !== "all" &&
      (opp.pipeline !== "vsl" || appointmentLeadType !== leadTypeFilter)
    ) {
      return;
    }

    const vslCategoria = API_GET_VSL_CATEGORY(opp.vslOrigen, opp.fuente);

    if (vslTipoFilter !== "all" && vslCategoria !== vslTipoFilter) return;

    // VSL Origen se filtra SOLO contra el campo VSL Origen.
    if (
      filtros.vslOrigin &&
      API_NORMALIZE_SOURCE(opp.vslOrigen) !== API_NORMALIZE_SOURCE(filtros.vslOrigin)
    ) {
      return;
    }

    const fechaCreacionCita = API_NORMALIZE_DATE(
      API_MASTER_VALUE_(row, ai.appointmentCreatedAt)
    );

    const fechaCita = API_NORMALIZE_DATE(
      API_MASTER_VALUE_(row, ai.fechaCita)
    );

    const fechaReunion = fechaCita || opp.fechaReunionOpportunity;

    const fechaFiltro = API_GET_APPOINTMENT_FILTER_DATE_(
      {
        appointmentCreatedAt: fechaCreacionCita,
        fechaCreacionCita: fechaCreacionCita,
        fechaCita: fechaCita,
        fechaReunion: fechaReunion
      },
      dateField
    );

    if (!API_DATE_IN_RANGE(fechaFiltro, filtros.dateFrom, filtros.dateTo)) return;

    const diferenciaDias = API_DATE_DIFF_DAYS_(fechaCreacionCita, fechaReunion);
    const diferenciaDiasLabel = API_DATE_DIFF_LABEL_(diferenciaDias);

    if (!API_MATCH_DAY_GAP_(diferenciaDias, filtros.dayGap)) return;

    const search = String(filtros.search || "").trim().toLowerCase();

    if (search) {
      const haystack = [
        opp.nombreContacto,
        opp.telefono,
        opp.correo,
        appointmentId,
        opportunityId,
        opp.contactId,
        setterEfectivo,
        createdByUserName,
        bookingModeLabel,
        calendario,
        estado,
        closer,
        opp.vslOrigen,
        diferenciaDiasLabel
      ].join(" ").toLowerCase();

      if (!haystack.includes(search)) return;
    }

    rows.push({
      appointmentId: appointmentId,
      opportunityId: opportunityId,
      contactId:
        API_CELL_STRING(API_MASTER_VALUE_(row, ai.contactId)) ||
        opp.contactId,

      nombreContacto: opp.nombreContacto,
      telefono: opp.telefono,

      // Se conserva en API por compatibilidad/búsqueda.
      // El frontend debe ocultar visualmente esta columna.
      correo: opp.correo,

      pipeline: opp.pipeline,
      secuencia: opp.secuencia,

      // Setter efectivo unificado:
      // Creado por cita manual > Setter asignado.
      // Los alias Jose/Jose Luis, Jimena/Claudia Jimena, etc. se consolidan.
      agendadoPor: setterEfectivo || "Sin setter",
      setterEfectivo: setterEfectivo,
      setterAsignado: API_NORMALIZE_SETTER_NAME_(opp.setterOpportunity),
      creadoPorCita: createdByUserName,
      creadoPorCitaNormalizado: API_NORMALIZE_SETTER_NAME_(createdByUserName),
      responsablesAgendamiento: API_GET_APPOINTMENT_SETTERS_(
        opp.setterOpportunity,
        createdByUserName
      ).responsables,

      bookingMode: bookingMode,
      bookingModeLabel: bookingModeLabel,

      calendario: calendario,
      estado: estado,
      estadoCitaRaw: estadoCitaRaw,

      fechaCreacionCita: fechaCreacionCita,
      fechaReunion: fechaReunion,
      fechaCita: fechaCita,

      diferenciaDias: diferenciaDias,
      diferenciaDiasLabel: diferenciaDiasLabel,

      closer: closer,
      closerCita: closerCita,
      closerOpportunity: opp.closerOpportunity,

      leadType: appointmentLeadType,
      vslCategoria: vslCategoria,
      vslOrigen: opp.vslOrigen
    });
  });

  // Más recientes primero por defecto: _Appointment Created At DESC.
  rows.sort((a, b) => {
    const da = String(a.fechaCreacionCita || "");
    const db = String(b.fechaCreacionCita || "");
    const byCreated = db.localeCompare(da);
    if (byCreated !== 0) return byCreated;

    return String(b.fechaReunion || "").localeCompare(
      String(a.fechaReunion || "")
    );
  });

  const summary = {
    total: rows.length,
    confirmado: 0,
    asistio: 0,
    cancelado: 0,
    noShow: 0,
    tasaAsistencia: 0
  };

  rows.forEach(item => {
    switch (item.estado) {
      case "Confirmado":
        summary.confirmado++;
        break;
      case "Asistió":
        summary.asistio++;
        break;
      case "Cancelado":
        summary.cancelado++;
        break;
      case "No asistió":
        summary.noShow++;
        break;
    }
  });

  summary.tasaAsistencia =
    summary.total > 0
      ? Number(((summary.asistio / summary.total) * 100).toFixed(2))
      : 0;

  const availableDayGaps = Array.from(
    new Map(
      rows.map(item => [
        item.diferenciaDias === null ? "__SIN_DATO__" : String(item.diferenciaDias),
        {
          value: item.diferenciaDias === null ? "__SIN_DATO__" : String(item.diferenciaDias),
          label: item.diferenciaDiasLabel,
          days: item.diferenciaDias
        }
      ])
    ).values()
  ).sort((a, b) => {
    if (a.days === null) return 1;
    if (b.days === null) return -1;
    return a.days - b.days;
  });

  const availableBookingModes = [
    { value: "automatic", label: "Agendado automatico" },
    { value: "manual", label: "Agendado manual" }
  ];

  const pageSize = Math.min(
    100,
    Math.max(1, Number(filtros.pageSize || 50))
  );

  const totalRecords = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const page = Math.min(
    totalPages,
    Math.max(1, Number(filtros.page || 1))
  );

  const start = (page - 1) * pageSize;
  const pagedRows = rows.slice(start, start + pageSize);

  return {
    report: "Appointment Detail",
    updatedAt: new Date().toISOString(),

    dateSemantics: {
      appointmentCreated: "_Appointment Created At",
      meetingDate: "Fecha cita → Fecha de reunión"
    },

    filters: {
      applied: {
        pipeline: pipelineFilter,
        leadType: leadTypeFilter,
        calendar: String(filtros.calendar || ""),
        dateFrom: String(filtros.dateFrom || ""),
        dateTo: String(filtros.dateTo || ""),
        dateField: dateField,
        setter: String(filtros.setter || ""),
        booker: String(filtros.booker || ""),
        bookingMode: String(filtros.bookingMode || ""),
        dayGap: String(filtros.dayGap || ""),
        status: String(filtros.status || ""),
        vslOrigin: String(filtros.vslOrigin || ""),
        vslTipo: vslTipoFilter,
        closer: String(filtros.closer || ""),
        search: String(filtros.search || "")
      },

      available: {
        dateFields: [
          { value: "appointmentCreated", label: "Fecha de creación de cita" },
          { value: "meetingDate", label: "Fecha de cita / reunión" }
        ],
        bookingModes: availableBookingModes,
        dayGaps: availableDayGaps
      }
    },

    summary: summary,
    rows: pagedRows,

    pagination: {
      page: page,
      pageSize: pageSize,
      totalRecords: totalRecords,
      totalPages: totalPages
    }
  };
}


// ============================================================
// REPORTE VACÍO
// ============================================================

function API_EMPTY_VSL_REPORT(
  leadType,
  pipeline
) {

  const normalizedLeadType =
    API_NORMALIZE_LEAD_TYPE(
      leadType
    );


  const normalizedPipeline =
    API_NORMALIZE_PIPELINE_FILTER(
      pipeline
    );


  return {

    cohorteDiariaVsl: normalizedPipeline === "vsl"
      ? { version: 1, totalLeads: 0, porDia: [] } : undefined,

    report:
      "VSL | Closers + OEI + LIG",

    leadType:
      normalizedLeadType,

    leadTypeLabel:
      normalizedLeadType === "paid"
        ? "Pagados"
        : normalizedLeadType === "organic"
          ? "Orgánicos"
          : "Todos",

    updatedAt:
      new Date()
        .toISOString(),


    filters: {

      applied: {

        leadType:
          normalizedLeadType,

        pipeline:
          normalizedPipeline

      },

      available: {

        leadTypes:
          normalizedPipeline === "vsl"
            ? [

                {
                  value: "all",
                  label: "Todos"
                },

                {
                  value: "paid",
                  label: "Pagados"
                },

                {
                  value: "organic",
                  label: "Orgánicos"
                }

              ]
            : [],

        leadTypeFilterEnabled:
          normalizedPipeline === "vsl",

        pipelines: [
          GHL_PIPELINES.VSL_CLOSERS.name,
          GHL_PIPELINES.OEI_EM.name,
          GHL_PIPELINES.LIG.name
        ],

        calendars: [
          "Equipo Millonario | OEI",
          "Circulo Millonario | OEI",
          "Lanzamiento Interno Gratuito - EM",
          "Lanzamiento Interno Gratuito - CM",
          "Llamada de Claridad CM [A]",
          "Sesión Equipo Millonario (A)",
          "Llamada de Claridad CM [ORG]",
          "Sesión Equipo Millonario (ORG)"
        ],

        setters: [],

        bookers: [],

        statuses: [

          "Confirmado",

          "Asistió",

          "Cancelado",

          "No asistió"

        ],

        vslOrigins: [],

        closers: []

      }

    },


    vslOriginSummary: {
      criterio: "OPPORTUNITIES_MASTER.VSL Origen",
      valoresPagados: ["Agendado automatico", "No agendado"],
      totalLeads: 0,
      leadsAgendadosAutomatico: 0,
      leadsPendientesAgenda: 0,
      agendadosAutomaticoPct: 0,
      pendientesAgendaPct: 0
    },

    pipelineSummary: {

      vsl: {

        key: "vsl",

        label:
          GHL_PIPELINES.VSL_CLOSERS.name,

        totalLeads: 0,

        conCitaCalendar: 0,

        sinCitaCalendar: 0,

        estados: {

          agendadoCRM: 0,

          confirmado: 0,

          asistio: 0,

          cancelado: 0,

          noShow: 0,

          pendienteAgenda: 0,

          reagendado: 0

        },

        calendars:
          API_GET_ALLOWED_CALENDARS(
            "vsl"
          ).map(
            calendar => ({
              calendar: calendar,
              count: 0
            })
          )

      },

      oei: {

        key: "oei",

        label:
          GHL_PIPELINES.OEI_EM.name,

        totalLeads: 0,

        conCitaCalendar: 0,

        sinCitaCalendar: 0,

        estados: {

          agendadoCRM: 0,

          confirmado: 0,

          asistio: 0,

          cancelado: 0,

          noShow: 0,

          pendienteAgenda: 0,

          reagendado: 0

        },

        calendars:
          API_GET_ALLOWED_CALENDARS(
            "oei"
          ).map(
            calendar => ({
              calendar: calendar,
              count: 0
            })
          )

      },

      lig: {

        key: "lig",

        label:
          GHL_PIPELINES.LIG.name,

        totalLeads: 0,

        conCitaCalendar: 0,

        sinCitaCalendar: 0,

        estados: {

          agendadoCRM: 0,

          confirmado: 0,

          asistio: 0,

          cancelado: 0,

          noShow: 0,

          pendienteAgenda: 0,

          reagendado: 0

        },

        calendars:
          API_GET_ALLOWED_CALENDARS(
            "lig"
          ).map(
            calendar => ({
              calendar: calendar,
              count: 0
            })
          )

      }

    },


    kpis: {

      total: 0,

      agendadoCRM: 0,

      confirmado: 0,

      asistio: 0,

      cancelado: 0,

      noShow: 0,

      pendienteAgenda: 0,

      reagendado: 0,

      tasaAsistencia: 0,

      tasaNoShow: 0

    },


    leadTypeKpis: {

      totalLeads: 0,

      attended: 0,

      attendanceRate: 0

    },


    paidKpis: {

      totalVslPaidLeads: 0,

      attended: 0,

      attendanceRate: 0

    },


    organicKpis: {

      totalVslOrganicLeads: 0,

      attended: 0,

      attendanceRate: 0

    },


    // ========================================================
    // VENTAS VACÍAS
    // ========================================================

    sales: {

      total: 0,

      byStage: [

        {
          stage:
            "Reserva / Deposito",
          count: 0
        },

        {
          stage:
            "Venta - Pagando a Cuotas",
          count: 0
        },

        {
          stage:
            "Venta Cerrada (Pago De Contado)",
          count: 0
        },

        {
          stage:
            "Venta Cerrada (Cuotas Pagadas)",
          count: 0
        },

        {
          stage:
            "Perdida",
          count: 0
        }

      ],

      cashByCurrency: [],

      productSummary: [],

      salesValueByCurrency: [],

      rows: []

    },


    etapasPorEmbudo: {
      criterioFecha: "Creado el",
      campoOrigen: "OPPORTUNITIES_MASTER.Fase",
      totalLeads: 0,
      porEmbudo: {
        vsl: { pipeline: "vsl", label: "VSL | Closers", totalLeads: 0, porEtapa: [] },
        oei: { pipeline: "oei", label: "OEI", totalLeads: 0, porEtapa: [] },
        lig: { pipeline: "lig", label: "LIG", totalLeads: 0, porEtapa: [] }
      },
      validacion: { sumasCorrectas: true }
    },

    vslSeteo: {
      aplicaSoloA: "vsl",
      criterioFecha: "Creado el",
      etapasFaltanSetear: [
        "Lead Pendiente de Agenda",
        "Lead Agendado (Automatico)"
      ],
      totalLeadsVsl: 0,
      faltanSetear: 0,
      seteados: 0,
      asistidos: 0,
      asistenciaSobreSeteadosPct: 0,
      faltanSetearPct: 0,
      seteadosPct: 0,
      porEtapa: [],
      faltanSetearRows: [],
      seteadosRows: []
    },

    ligNoCalificados: {
      aplicaSoloA: "lig",
      criterioFecha: "Creado el",
      campoOrigen: "OPPORTUNITIES_MASTER.Fase",
      etapasNoCalificadas: [
        "No existe número",
        "No existe",
        "No interesado/No desea",
        "No interesado"
      ],
      totalLeads: 0,
      noCalificados: 0,
      noCalificadosPct: 0,
      detalleNoCalificados: [
        { fase: "No existe número", total: 0 },
        { fase: "No existe", total: 0 },
        { fase: "No interesado/No desea", total: 0 },
        { fase: "No interesado", total: 0 }
      ]
    },

    businessMetrics: {
      etapasPorEmbudo: {
        criterioFecha: "Creado el",
        campoOrigen: "OPPORTUNITIES_MASTER.Fase",
        totalLeads: 0,
        porEmbudo: {
          vsl: { pipeline: "vsl", label: "VSL | Closers", totalLeads: 0, porEtapa: [] },
          oei: { pipeline: "oei", label: "OEI", totalLeads: 0, porEtapa: [] },
          lig: { pipeline: "lig", label: "LIG", totalLeads: 0, porEtapa: [] }
        },
        validacion: { sumasCorrectas: true }
      },
      conversionPorCloser: [],
      agendamientoPorSetter: [],
      conversionPorEmbudo: [],
      leadsNoAgendadosVslPorMes: [],
      sesionesEntregadasPorCloser: [],
      cashPorEmbudo: [],
      cashPorProducto: [],
      cashPorEmbudoProducto: [],
      ligNoCalificados: {
        aplicaSoloA: "lig",
        criterioFecha: "Creado el",
        campoOrigen: "OPPORTUNITIES_MASTER.Fase",
        etapasNoCalificadas: [
        "No existe número",
        "No existe",
        "No interesado/No desea",
        "No interesado"
      ],
        totalLeads: 0,
        noCalificados: 0,
        noCalificadosPct: 0,
        detalleNoCalificados: [
        { fase: "No existe número", total: 0 },
        { fase: "No existe", total: 0 },
        { fase: "No interesado/No desea", total: 0 },
        { fase: "No interesado", total: 0 }
      ]
      },
      vslSeteo: {
        aplicaSoloA: "vsl",
        criterioFecha: "Creado el",
        etapasFaltanSetear: [
          "Lead Pendiente de Agenda",
          "Lead Agendado (Automatico)"
        ],
        totalLeadsVsl: 0,
        faltanSetear: 0,
        seteados: 0,
        faltanSetearPct: 0,
        seteadosPct: 0,
        porEtapa: [],
        faltanSetearRows: [],
        seteadosRows: []
      }
    },

    unknownStatusCount:
      0,

    withoutStatusCount:
      0,

    calendarUnknownStatusCount:
      0,

    calendarAppointmentsTotal:
      0,

    appointmentPeople: {

      oeiBookers: [],

      closers: []

    },

    setters: [],


    detail: {

      rows: [],

      pagination: {

        page: 1,

        pageSize: 25,

        totalRecords: 0,

        totalPages: 1

      }

    }

  };

}


// ============================================================
// VALIDAR FRONTEND_SECRET
// ============================================================

function API_VALIDATE_SECRET(
  e
) {

  const expected =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        "FRONTEND_SECRET"
      );


  const received =
    API_GET_PARAM(
      e,
      "key"
    );


  return Boolean(
    expected &&
    received &&
    expected === received
  );

}


// ============================================================
// OBTENER QUERY PARAM
// ============================================================

function API_GET_PARAM(
  e,
  name
) {

  if (
    !e ||
    !e.parameter
  ) {

    return "";

  }


  return String(
    e.parameter[name] ||
    ""
  ).trim();

}


// ============================================================
// ÍNDICE DE HEADER OBLIGATORIO
// ============================================================

function API_HEADER_INDEX(
  headers,
  headerName
) {

  const index =
    headers.indexOf(
      headerName
    );


  if (
    index === -1
  ) {

    throw new Error(
      "No se encontró la columna: " +
      headerName
    );

  }


  return index;

}


// ============================================================
// ÍNDICE DE HEADER OPCIONAL
// ============================================================

function API_HEADER_INDEX_OPTIONAL(
  headers,
  headerName
) {

  return headers.indexOf(
    headerName
  );

}


// ============================================================
// CELDA A STRING
// ============================================================

function API_CELL_STRING(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return "";

  }


  return String(
    value
  ).trim();

}


// ============================================================
// CONVERTIR VALOR A NÚMERO
//
// Soporta:
// 1500
// "1500"
// "$ 1,500.00"
// "S/ 1,500.00"
// ============================================================

function API_NUMBER_VALUE(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return 0;

  }


  if (
    typeof value === "number"
  ) {

    return isNaN(value)
      ? 0
      : value;

  }


  let normalized =
    String(value)
      .trim();


  // Quitar símbolos de moneda y espacios,
  // conservar dígitos, punto, coma y signo.
  normalized =
    normalized.replace(
      /[^0-9,.-]/g,
      ""
    );


  // Caso típico 1,500.00 -> 1500.00
  if (
    normalized.includes(",") &&
    normalized.includes(".")
  ) {

    normalized =
      normalized.replace(
        /,/g,
        ""
      );

  } else if (
    normalized.includes(",") &&
    !normalized.includes(".")
  ) {

    // Si solo hay coma:
    // - 1,500 -> 1500
    // - 1500,50 -> 1500.50
    const parts =
      normalized.split(",");

    if (
      parts.length === 2 &&
      parts[1].length <= 2
    ) {

      normalized =
        parts[0] +
        "." +
        parts[1];

    } else {

      normalized =
        normalized.replace(
          /,/g,
          ""
        );

    }

  }


  const number =
    Number(
      normalized
    );


  return isNaN(number)
    ? 0
    : number;

}


// ============================================================
// VALIDAR FECHA DENTRO DE RANGO
//
// Si no existe filtro de fecha, el registro entra aunque su fecha
// esté vacía. Si existe dateFrom/dateTo, una fecha vacía no entra.
// ============================================================

function API_DATE_IN_RANGE(
  dateValue,
  dateFrom,
  dateTo
) {

  const date = API_NORMALIZE_DATE(dateValue);
  const from = API_NORMALIZE_DATE(dateFrom);
  const to = API_NORMALIZE_DATE(dateTo);

  if (!from && !to) {
    return true;
  }

  if (!date) {
    return false;
  }

  if (from && date < from) {
    return false;
  }

  if (to && date > to) {
    return false;
  }

  return true;
}


// ============================================================
// NORMALIZAR FECHA YYYY-MM-DD
// ============================================================

// Additive Landing-only contract. Membership uses the existing commercial filters
// plus opportunity creation dates; historical appointments have no date filter.
function API_BUILD_LANDING_VSL_COHORT_(leads, appointmentsByOpportunity, filters) {
  const unique = new Map();
  leads.forEach(lead => {
    const id = String(lead.opportunityId || "").trim();
    const fecha = API_LANDING_COHORT_DATE_(lead.fechaCreacionLandingVsl || lead.fechaCreacionOportunidad);
    if (filters && fecha && ((filters.dateFrom && fecha < filters.dateFrom) ||
        (filters.dateTo && fecha > filters.dateTo))) return;
    if (id && lead.pipeline === "vsl" && API_IS_VSL_PAID_ORIGIN_(lead.vslOrigen) && !unique.has(id)) {
      unique.set(id, lead);
    }
  });
  if (Array.from(unique.values()).some(lead => !API_LANDING_COHORT_DATE_(lead.fechaCreacionLandingVsl || lead.fechaCreacionOportunidad))) {
    return { error: "Landing VSL: oportunidad sin fecha de creación válida." };
  }
  const days = new Map();
  unique.forEach((lead, opportunityId) => {
    const fecha = API_LANDING_COHORT_DATE_(lead.fechaCreacionLandingVsl || lead.fechaCreacionOportunidad);
    const seen = new Set();
    const citas = (appointmentsByOpportunity.get(opportunityId) || [])
      .filter(a => {
        if (!a.appointmentId || seen.has(a.appointmentId) ||
            (a.pipeline && a.pipeline !== "vsl") ||
            !API_IS_CALENDAR_ALLOWED("vsl", a.calendarioCita)) return false;
        seen.add(a.appointmentId);
        return true;
      })
      .map(a => ({
        appointmentId: a.appointmentId,
        fechaReunion: API_LANDING_COHORT_DATE_(a.fechaReunionLandingVsl || a.fechaCita),
        estadoCalendar: a.estadoCita || "",
        estadoAgenda: API_GET_EFFECTIVE_APPOINTMENT_STATUS(a.estadoCita, ""),
        agendador: a.createdByUserName || "",
        closer: a.closerCita || "",
        calendario: a.calendarioCita || ""
      }));
    const resultadoAsistencia = citas.some(a => a.estadoAgenda === "Asistió") ? "Asistió"
      : citas.some(a => a.estadoAgenda === "No asistió") ? "No asistió"
      : citas.length ? "Sin resultado" : "Pendiente de agenda";
    if (!days.has(fecha)) days.set(fecha, {
      fecha, totalLeads: 0, leadsAsistidos: 0, leadsNoAsistidos: 0,
      leadsPendientesResultado: 0, porcentajeAsistencia: 0, leads: []
    });
    const day = days.get(fecha);
    day.totalLeads++;
    if (resultadoAsistencia === "Asistió") day.leadsAsistidos++;
    else if (resultadoAsistencia === "No asistió") day.leadsNoAsistidos++;
    else day.leadsPendientesResultado++;
    day.leads.push({
      opportunityId,
      nombreContacto: lead.nombreContacto || "",
      fechaCreacion: fecha,
      setter: lead.setterOpportunity || "",
      closerAsignado: lead.closerOpportunity || "",
      pipeline: "vsl",
      resultadoAsistencia,
      citas
    });
  });
  const porDia = Array.from(days.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  porDia.forEach(day => {
    day.porcentajeAsistencia = Number((day.leadsAsistidos * 100 / day.totalLeads).toFixed(2));
  });
  return { version: 1, totalLeads: unique.size, porDia };
}

// Date-only sheet values stay unchanged; timestamps use the configured business zone.
function API_LANDING_COHORT_DATE_(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? "" : Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function API_NORMALIZE_DATE(
  value
) {

  if (
    !value
  ) {

    return "";

  }


  if (
    Object.prototype
      .toString
      .call(
        value
      ) ===
      "[object Date]" &&
    !isNaN(
      value.getTime()
    )
  ) {

    return Utilities
      .formatDate(
        value,
        Session
          .getScriptTimeZone(),
        "yyyy-MM-dd"
      );

  }


  const text =
    String(
      value
    ).trim();


  const isoMatch =
    text.match(
      /^(\d{4}-\d{2}-\d{2})/
    );


  if (
    isoMatch
  ) {

    return isoMatch[1];

  }


  const date =
    new Date(
      text
    );


  if (
    !isNaN(
      date.getTime()
    )
  ) {

    return Utilities
      .formatDate(
        date,
        Session
          .getScriptTimeZone(),
        "yyyy-MM-dd"
      );

  }


  return "";

}


// ============================================================
// UNIQUE + SORT
// ============================================================

function API_UNIQUE_SORTED(
  values
) {

  return Array
    .from(
      new Set(
        values.filter(
          Boolean
        )
      )
    )
    .sort(
      (a, b) =>
        a.localeCompare(
          b
        )
    );

}


// ============================================================
// RESPUESTA JSON
// ============================================================

function API_JSON_RESPONSE(
  data
) {

  return ContentService
    .createTextOutput(
      JSON.stringify(
        data
      )
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );

}
