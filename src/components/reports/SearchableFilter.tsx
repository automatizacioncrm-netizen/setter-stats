import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function SearchableFilter({
  label,
  value,
  options,
  allLabel,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  allLabel: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const select = (next: string) => {
    onChange(next);
    setOpen(false);
  };
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            disabled={disabled}
            className="h-9 w-full min-w-0 justify-between bg-surface px-3 font-normal"
          >
            <span className="truncate">
              {options.find((option) => option.value === value)?.label ?? (value || allLabel)}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-64 max-w-[calc(100vw-2rem)] p-0"
        >
          <Command>
            <CommandInput placeholder={`Buscar ${label.toLowerCase()}...`} />
            <CommandList>
              <CommandEmpty>No se encontraron opciones.</CommandEmpty>
              {[{ value: "", label: allLabel }, ...options].map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  onSelect={() => select(option.value)}
                >
                  <Check
                    className={`mr-2 h-4 w-4 shrink-0 ${option.value === value ? "opacity-100" : "opacity-0"}`}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
