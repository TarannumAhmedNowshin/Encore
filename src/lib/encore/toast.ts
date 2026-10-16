import { toast } from "sonner";
import { CAPACITY_MESSAGE } from "./limits";

/** Show a server failure as a toast with the server's message and an optional Retry action. */
export function toastError(e: unknown, fallback: string, retry?: () => void) {
  const message = e instanceof Error && e.message ? e.message : fallback;
  if (message === CAPACITY_MESSAGE) {
    toast.error(message, {
      action: { label: "See the example", onClick: () => { window.location.href = "/app"; } },
    });
    return;
  }
  toast.error(message, retry ? { action: { label: "Retry", onClick: retry } } : undefined);
}
