import { toast as sonnerToast } from "sonner";

// Compatibility shim for components that use shadcn/ui useToast pattern
// Routes to sonner toast under the hood
export function useToast() {
  const toast = (opts: { title?: string; description?: string; variant?: "default" | "destructive" }) => {
    if (opts.variant === "destructive") {
      sonnerToast.error(opts.title ?? "Error", { description: opts.description });
    } else {
      sonnerToast.success(opts.title ?? "Success", { description: opts.description });
    }
  };
  return { toast };
}
