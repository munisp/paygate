// Settings — Alert Threshold Configuration
// Lets operators tune warning/critical thresholds for consumer lag and Redis
// memory utilization. Values are persisted per-user in the database.
import { useState, useEffect } from "react";
import { Settings, AlertTriangle, AlertCircle, CheckCircle2, Save, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Severity = "ok" | "warn" | "critical";

const SEVERITY_STYLES: Record<Severity, { text: string; bg: string; border: string; label: string; icon: React.ElementType }> = {
  ok:       { text: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", label: "OK",       icon: CheckCircle2 },
  warn:     { text: "text-amber-400",   bg: "bg-amber-400/10",   border: "border-amber-400/20",   label: "WARN",     icon: AlertTriangle },
  critical: { text: "text-red-400",     bg: "bg-red-400/10",     border: "border-red-400/20",     label: "CRITICAL", icon: AlertCircle },
};

function SeverityPill({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLES[severity];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border", s.text, s.bg, s.border)}>
      <Icon size={9} />
      {s.label}
    </span>
  );
}

function ThresholdSlider({
  label,
  value,
  onChange,
  min,
  max,
  unit,
  description,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  unit: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-mono text-foreground">{label}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
            className="w-16 text-xs font-mono text-right bg-secondary border border-border rounded px-2 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <span className="text-[10px] font-mono text-muted-foreground w-8">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-secondary cursor-pointer accent-primary"
      />
      <p className="text-[10px] text-muted-foreground font-mono">{description}</p>
    </div>
  );
}

const DEFAULTS = { lagWarn: 5, lagCritical: 20, memWarnPct: 70, memCriticalPct: 85 };

export default function SettingsPage() {
  const utils = trpc.useUtils();
  const { data: saved, isLoading } = trpc.paygate.getThresholds.useQuery();
  const saveMutation = trpc.paygate.saveThresholds.useMutation({
    onSuccess: () => {
      utils.paygate.getThresholds.invalidate();
      toast.success("Thresholds saved", { description: "Alert thresholds updated and applied globally", duration: 3000 });
    },
    onError: (err) => {
      toast.error("Save failed", { description: err.message, duration: 4000 });
    },
  });

  const [lagWarn,       setLagWarn]       = useState(DEFAULTS.lagWarn);
  const [lagCritical,   setLagCritical]   = useState(DEFAULTS.lagCritical);
  const [memWarnPct,    setMemWarnPct]    = useState(DEFAULTS.memWarnPct);
  const [memCriticalPct, setMemCriticalPct] = useState(DEFAULTS.memCriticalPct);

  // Sync form from server once loaded
  useEffect(() => {
    if (saved) {
      setLagWarn(saved.lagWarn);
      setLagCritical(saved.lagCritical);
      setMemWarnPct(saved.memWarnPct);
      setMemCriticalPct(saved.memCriticalPct);
    }
  }, [saved]);

  const isDirty =
    lagWarn !== (saved?.lagWarn ?? DEFAULTS.lagWarn) ||
    lagCritical !== (saved?.lagCritical ?? DEFAULTS.lagCritical) ||
    memWarnPct !== (saved?.memWarnPct ?? DEFAULTS.memWarnPct) ||
    memCriticalPct !== (saved?.memCriticalPct ?? DEFAULTS.memCriticalPct);

  const handleReset = () => {
    if (saved) {
      setLagWarn(saved.lagWarn);
      setLagCritical(saved.lagCritical);
      setMemWarnPct(saved.memWarnPct);
      setMemCriticalPct(saved.memCriticalPct);
    } else {
      setLagWarn(DEFAULTS.lagWarn);
      setLagCritical(DEFAULTS.lagCritical);
      setMemWarnPct(DEFAULTS.memWarnPct);
      setMemCriticalPct(DEFAULTS.memCriticalPct);
    }
    toast.info("Changes discarded");
  };

  const handleSave = () => {
    if (lagWarn >= lagCritical) {
      toast.error("Invalid thresholds", { description: "Warning threshold must be less than critical threshold for consumer lag" });
      return;
    }
    if (memWarnPct >= memCriticalPct) {
      toast.error("Invalid thresholds", { description: "Warning threshold must be less than critical threshold for memory utilization" });
      return;
    }
    saveMutation.mutate({ lagWarn, lagCritical, memWarnPct, memCriticalPct });
  };

  // Live preview helpers
  const previewLagSev = (lag: number): Severity => {
    if (lag === 0) return "ok";
    if (lag <= lagWarn) return "warn";
    return "critical";
  };
  const previewMemSev = (pct: number): Severity => {
    if (pct < memWarnPct) return "ok";
    if (pct < memCriticalPct) return "warn";
    return "critical";
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground font-mono tracking-tight flex items-center gap-2">
            <Settings size={16} className="text-primary" />
            ALERT THRESHOLDS
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            Configure warning and critical thresholds for consumer lag and Redis memory · Changes apply globally across all panels
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-xs text-muted-foreground transition-colors border border-border/50 font-mono active:scale-95"
            >
              <RotateCcw size={12} />
              Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-all border active:scale-95",
              isDirty && !saveMutation.isPending
                ? "bg-primary text-primary-foreground border-primary/50 hover:bg-primary/90 shadow-sm shadow-primary/20"
                : "bg-secondary text-muted-foreground border-border/50 cursor-not-allowed opacity-60"
            )}
          >
            <Save size={12} />
            {saveMutation.isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 flex items-center justify-center text-xs text-muted-foreground font-mono">Loading saved thresholds…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Consumer Lag card */}
          <div
            className="rounded-xl border border-border p-5 space-y-5"
            style={{ background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)", boxShadow: "inset 0 0 0 1px oklch(0.72 0.18 200 / 0.06)" }}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={13} className="text-amber-400" />
              <span className="text-xs font-bold font-mono uppercase tracking-widest">Consumer Lag</span>
            </div>

            <ThresholdSlider
              label="Warning threshold"
              value={lagWarn}
              onChange={v => setLagWarn(Math.min(v, lagCritical - 1))}
              min={1}
              max={500}
              unit="msgs"
              description="Lag at or below this value triggers a warning badge"
            />
            <ThresholdSlider
              label="Critical threshold"
              value={lagCritical}
              onChange={v => setLagCritical(Math.max(v, lagWarn + 1))}
              min={2}
              max={10000}
              unit="msgs"
              description="Lag above this value triggers a critical badge"
            />

            {/* Live preview */}
            <div className="rounded-lg border border-border p-3 space-y-2" style={{ background: "oklch(0.14 0.008 265)" }}>
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Live preview</div>
              {[0, lagWarn, lagCritical].map(sample => (
                <div key={sample} className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-muted-foreground">lag = {sample} msgs</span>
                  <SeverityPill severity={previewLagSev(sample)} />
                </div>
              ))}
            </div>
          </div>

          {/* Redis Memory card */}
          <div
            className="rounded-xl border border-border p-5 space-y-5"
            style={{ background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)", boxShadow: "inset 0 0 0 1px oklch(0.72 0.18 200 / 0.06)" }}
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={13} className="text-red-400" />
              <span className="text-xs font-bold font-mono uppercase tracking-widest">Redis Memory</span>
            </div>

            <ThresholdSlider
              label="Warning threshold"
              value={memWarnPct}
              onChange={v => setMemWarnPct(Math.min(v, memCriticalPct - 1))}
              min={10}
              max={99}
              unit="%"
              description="Memory utilization at or above this % triggers a warning"
            />
            <ThresholdSlider
              label="Critical threshold"
              value={memCriticalPct}
              onChange={v => setMemCriticalPct(Math.max(v, memWarnPct + 1))}
              min={11}
              max={100}
              unit="%"
              description="Memory utilization at or above this % triggers a critical alert"
            />

            {/* Live preview */}
            <div className="rounded-lg border border-border p-3 space-y-2" style={{ background: "oklch(0.14 0.008 265)" }}>
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Live preview</div>
              {[memWarnPct - 1, memWarnPct, memCriticalPct].map(sample => (
                <div key={sample} className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-muted-foreground">mem = {sample}%</span>
                  <SeverityPill severity={previewMemSev(sample)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Info box */}
      <div
        className="rounded-lg border border-border p-4"
        style={{ background: "oklch(0.14 0.008 265)" }}
      >
        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">How thresholds work</div>
        <ul className="space-y-1 text-xs text-muted-foreground font-mono">
          <li>· Thresholds apply to all severity badges on the Kafka / Redis page and the top-bar alert pills.</li>
          <li>· Consumer lag is measured in number of unconsumed messages across all partitions in a group.</li>
          <li>· Redis memory is measured as a percentage of the configured <code className="text-primary">maxmemory</code> value.</li>
          <li>· Settings are saved per user account and take effect immediately after saving.</li>
        </ul>
      </div>
    </div>
  );
}
