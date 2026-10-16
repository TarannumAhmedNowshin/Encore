import { toast } from "sonner";

/** Show a server failure as a toast with the server's message and an optional Retry action. */
export function toastError(e: unknown, fallback: string, retry?: () => void) {
  const message = e instanceof Error && e.message ? e.message : fallback;
  toast.error(message, retry ? { action: { label: "Retry", onClick: retry } } : undefined);
}
