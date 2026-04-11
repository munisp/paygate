/**
 * BridgeEmptyState.tsx
 *
 * Reusable empty / error state component for pages that depend on the
 * middleware bridge. When the bridge is offline or returns no data, show
 * a friendly placeholder with an optional retry button.
 */
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface BridgeEmptyStateProps {
  /** Icon variant: "offline" (bridge down), "empty" (no data), "error" (generic error) */
  variant?: "offline" | "empty" | "error";
  title?: string;
  description?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

const VARIANTS = {
  offline: {
    icon: WifiOff,
    iconClass: "text-amber-500",
    defaultTitle: "Bridge Unavailable",
    defaultDesc:
      "The payment bridge is temporarily offline. Data will appear automatically when connectivity is restored.",
  },
  empty: {
    icon: Wifi,
    iconClass: "text-muted-foreground",
    defaultTitle: "No Data Yet",
    defaultDesc: "There are no records to display. Data will appear here once activity is recorded.",
  },
  error: {
    icon: AlertTriangle,
    iconClass: "text-destructive",
    defaultTitle: "Something went wrong",
    defaultDesc: "An unexpected error occurred while loading data. Please try again.",
  },
} as const;

export function BridgeEmptyState({
  variant = "offline",
  title,
  description,
  onRetry,
  isRetrying = false,
  className = "",
}: BridgeEmptyStateProps) {
  const cfg = VARIANTS[variant];
  const Icon = cfg.icon;

  return (
    <Card className={`border-dashed ${className}`}>
      <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div className={`p-4 rounded-full bg-muted ${cfg.iconClass}`}>
          <Icon className="w-8 h-8" />
        </div>
        <div className="space-y-1 max-w-sm">
          <p className="font-semibold text-foreground">{title ?? cfg.defaultTitle}</p>
          <p className="text-sm text-muted-foreground">{description ?? cfg.defaultDesc}</p>
        </div>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isRetrying ? "animate-spin" : ""}`} />
            {isRetrying ? "Retrying…" : "Retry"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Inline loading skeleton for data tables and cards.
 * Use this while isLoading is true.
 */
export function DataSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="h-8 bg-muted animate-pulse rounded flex-1"
              style={{ animationDelay: `${(i * cols + j) * 50}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default BridgeEmptyState;
