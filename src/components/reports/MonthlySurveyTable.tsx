import { BottleneckDetail } from "./BottleneckDetail";
import { displayReportCell, displayMonth, type QualityReport } from "@/lib/vsl-quality";
import { joinSurveyMonths } from "@/lib/join-survey-months";
export function MonthlySurveyTable({
  table,
  statusTable,
}: {
  table: QualityReport["surveys"];
  statusTable: QualityReport["surveyStatus"];
}) {
  const groups = joinSurveyMonths(table, statusTable);
  const headers = [...statusTable.columns, ...table.columns.slice(1)];
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-background shadow-card">
      <h2 className="bg-zinc-700 p-4 text-center text-base font-bold text-white">
        TABLA 2: ANÁLISIS DE ENCUESTA DE LA VSL | CLOSER (TRÁFICO PAGO)
      </h2>
      <div className="max-h-[65vh] overflow-auto">
        <table
          className="w-full table-fixed border-collapse text-sm"
          style={{ minWidth: headers.length * 160 }}
        >
          <colgroup>
            {headers.map((_, index) => (
              <col key={index} style={index < 2 ? { width: 160 } : undefined} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20 bg-white text-black">
            <tr>
              {headers.map((header, index) => (
                <th
                  key={index}
                  style={index < 2 ? { left: index * 160 } : undefined}
                  className={`min-w-40 border border-zinc-300 p-3 text-center font-bold ${index < 2 ? "sticky z-30 bg-white" : ""}`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((group) =>
              group.rows.map(({ state, values }, index) => (
                <tr
                  key={group.month + state}
                  className={index === 3 ? "border-b-2 border-zinc-400" : ""}
                >
                  {index === 0 && (
                    <td
                      rowSpan={4}
                      className="sticky left-0 z-10 border border-border border-b-2 border-b-zinc-400 bg-background p-2 text-center align-middle font-semibold"
                    >
                      {displayMonth(group.month)}
                    </td>
                  )}
                  <td
                    style={{ left: 160 }}
                    className="sticky z-10 border border-border bg-background p-2 text-left"
                  >
                    {state}
                    {!values && (
                      <span className="block text-xs text-muted-foreground">
                        Sin datos del backend
                      </span>
                    )}
                  </td>
                  {statusTable.columns.slice(2).map((header, offset) => (
                    <td key={offset} className="border border-border p-2 text-right tabular-nums">
                      {/cuellos.*botella/i.test(header) ? (
                        <BottleneckDetail
                          key={JSON.stringify([group.month, state, values])}
                          value={values?.[offset + 2]}
                        />
                      ) : values?.[offset + 2] === null ||
                        values?.[offset + 2] === undefined ||
                        values?.[offset + 2] === "" ? (
                        "—"
                      ) : (
                        String(values[offset + 2])
                      )}
                    </td>
                  ))}
                  {index === 0 &&
                    table.columns.slice(1).map((_, offset) => (
                      <td
                        key={offset}
                        rowSpan={4}
                        className={`border border-border border-b-2 border-b-zinc-400 p-2 text-right align-middle tabular-nums ${offset > 0 ? "bg-brand-soft font-semibold text-brand" : "bg-background"}`}
                      >
                        {group.kpis ? (
                          displayReportCell(group.kpis[offset + 1] ?? null, offset + 1, true)
                        ) : (
                          <span className="text-sm text-muted-foreground">Sin datos mensuales</span>
                        )}
                      </td>
                    ))}
                </tr>
              )),
            )}
          </tbody>
        </table>
        {groups.length === 0 && (
          <p className="p-5 text-muted-foreground">
            Sin resultados de encuestas para los meses consultados.
          </p>
        )}
      </div>
    </section>
  );
}
