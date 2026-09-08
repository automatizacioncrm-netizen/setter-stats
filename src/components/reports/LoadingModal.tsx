import * as Dialog from "@radix-ui/react-dialog";
import { Loader2 } from "lucide-react";
import { useId } from "react";

type LoadingModalProps = {
  open: boolean;
  title: string;
  description?: string;
};

export function LoadingModal({ open, title, description }: LoadingModalProps) {
  const descriptionId = useId();
  return (
    <Dialog.Root open={open} modal>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/40" />
        <Dialog.Content
          role="dialog"
          aria-modal="true"
          aria-describedby={description ? descriptionId : undefined}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-6 text-center shadow-card focus:outline-none"
        >
          <Loader2 aria-hidden="true" className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
          <div role="status" aria-live="polite" aria-atomic="true">
            <Dialog.Title className="text-lg font-semibold text-foreground">{title}</Dialog.Title>
            {description && (
              <Dialog.Description id={descriptionId} className="mt-2 text-sm text-muted-foreground">
                {description}
              </Dialog.Description>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
