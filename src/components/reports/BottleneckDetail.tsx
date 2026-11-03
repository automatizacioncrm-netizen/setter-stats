import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

export function BottleneckDetail({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const text = value == null ? "" : String(value);
  if (!text.trim() || text.trim() === "—") return <>—</>;
  return (
    <div className="text-left">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((current) => !current)}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1 py-0.5 text-sm font-medium text-brand hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      >
        {expanded ? "Ocultar detalle" : "Ver detalle"}
        <ChevronDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 motion-safe:transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      <div
        id={id}
        aria-hidden={!expanded}
        className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <p className="whitespace-pre-wrap break-words pt-2">{text}</p>
        </div>
      </div>
    </div>
  );
}
