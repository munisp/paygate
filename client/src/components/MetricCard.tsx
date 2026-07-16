// Metric card for key stats
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  accentColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function MetricCard({
  label, value, unit, icon: Icon, trend, trendLabel, accentColor = "text-primary", className, style,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "card-enter bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors duration-200",
        className
      )}
      style={style}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
        <Icon size={16} className={accentColor} />
      </div>
      <div className="flex items-end gap-1.5">
        <span className={cn("metric-value text-2xl", accentColor)}>{value}</span>
        {unit && <span className="text-sm text-muted-foreground mb-0.5">{unit}</span>}
      </div>
      {trendLabel && (
        <div className={cn("text-xs", trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-muted-foreground")}>
          {trendLabel}
        </div>
      )}
    </div>
  );
}

