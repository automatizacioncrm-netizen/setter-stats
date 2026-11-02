import { useCallback, useEffect, useRef, useState } from "react";
import { activeSync, syncStateSchema, type VslSyncState } from "@/lib/vsl-sync";
async function readSync(method: "GET" | "POST", signal?: AbortSignal) {
  const response = await fetch("/api/reports/vsl-calidad-sync", {
    method,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
      : AbortSignal.timeout(45000),
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No se pudo consultar la actualización.");
  return syncStateSchema.parse(body);
}
export function useVslSync(onCompleted: () => void) {
  const [state, setState] = useState<VslSyncState | null>(null),
    [tracking, setTracking] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    callback = useRef(onCompleted),
    completed = useRef(false),
    startedAt = useRef(0);
  useEffect(() => {
    callback.current = onCompleted;
  }, [onCompleted]);
  const accept = useCallback((next: VslSyncState) => {
    setState(next);
    if (next.status === "COMPLETED" && !completed.current) {
      completed.current = true;
      lock.current = false;
      setTracking(false);
      callback.current();
    } else if (next.status === "ERROR" || next.status === "IDLE") {
      lock.current = false;
      setTracking(false);
    } else setTracking(activeSync(next));
  }, []);
  useEffect(() => {
    if (!tracking) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (Date.now() - startedAt.current > 30 * 60 * 1000) {
        setError(
          "Se pausó la consulta de estado tras 30 minutos. Consulta el estado para continuar; no se iniciará otra sincronización.",
        );
        setTracking(false);
        return;
      }
      try {
        const next = await readSync("GET", controller.signal);
        if (controller.signal.aborted) return;
        setError("");
        accept(next);
        if (activeSync(next)) timer = setTimeout(() => void poll(), 3000);
      } catch (failure) {
        if (controller.signal.aborted) return;
        setError(failure instanceof Error ? failure.message : "No se pudo consultar el progreso.");
        setTracking(false);
      }
    };
    timer = setTimeout(() => void poll(), 2000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [tracking, accept]);
  const start = async () => {
    if (lock.current) return;
    lock.current = true;
    completed.current = false;
    startedAt.current = Date.now();
    setError("");
    setState(null);
    setSubmitting(true);
    try {
      accept(await readSync("POST"));
    } catch (failure) {
      setError(
        (failure instanceof Error ? failure.message : "No se pudo iniciar la actualización.") +
          " Consulta el estado antes de reintentar.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const resume = async () => {
    if (submitting || tracking) return;
    setSubmitting(true);
    setError("");
    startedAt.current = Date.now();
    try {
      const next = await readSync("GET");
      if (activeSync(next)) lock.current = true;
      accept(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo consultar el estado.");
    } finally {
      setSubmitting(false);
    }
  };
  return {
    state,
    error,
    start,
    resume,
    busy: submitting || tracking || activeSync(state),
    submitting,
    tracking,
    uncertain: lock.current && !tracking,
  };
}
