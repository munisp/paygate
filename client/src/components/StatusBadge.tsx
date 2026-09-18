// Status badge with animated pulse for healthy services
import { cn } from "@/lib/utils";

export type ServiceHealth = "healthy" | "degraded" | "critical" | "unknown";

const CONFIG: Record<ServiceHealth, { label: string; dot: string; text: string; bg: string }> = {
  healthy:  { label: "Healthy",  dot: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-400/10" },
  degraded: { label: "Degraded", dot: "bg-amber-400",   text: "text-amber-400",   bg: "bg-amber-400/10" },
  critical: { label: "Critical", dot: "bg-red-400",     text: "text-red-400",     bg: "bg-red-400/10" },
  unknown:  { label: "Unknown",  dot: "bg-slate-400",   text: "text-slate-400",   bg: "bg-slate-400/10" },
};

export default function StatusBadge({ status, showLabel = true }: { status: ServiceHealth; showLabel?: boolean }) {
  const c = CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", c.bg, c.text)}>
      <span className="relative flex h-2 w-2">
        {status === "healthy" && (
          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-60", c.dot)} />
        )}
        <span className={cn("relative inline-flex rounded-full h-2 w-2", c.dot)} />
      </span>
      {showLabel && c.label}
    </span>
  );
}
