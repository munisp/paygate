// Settings — Alert Threshold Configuration
// Lets operators tune warning/critical thresholds for consumer lag and Redis
// memory utilization. Values are persisted per-user in the database.
import { useState, useEffect, useRef } from "react";
import { Settings, AlertTriangle, AlertCircle, CheckCircle2, Save, RotateCcw, Plus, Trash2, ToggleLeft, ToggleRight, Pencil, X, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Named Alert Rules ───────────────────────────────────────────────────────

type RuleMetric = "kafka_lag" | "redis_memory";
type RuleSeverity = "warn" | "critical";

interface RuleFormState {
  id?: number;
  name: string;
  metric: RuleMetric;
  target: string;
  severity: RuleSeverity;
  threshold: number;
}

const CONSUMER_GROUPS = [
  "payment-processor",
  "kyc-worker",
  "audit-archiver",
  "fraud-detector",
  "settlement-engine",
];

const REDIS_NODES = ["redis-primary", "redis-replica"];

const EMPTY_FORM: RuleFormState = {
  name: "",
  metric: "kafka_lag",
  target: CONSUMER_GROUPS[0],
  severity: "warn",
  threshold: 10,
};

function RuleRow({
  rule,
  onEdit,
  onDelete,
  onToggle,
}: {
  rule: AlertRuleRow;
  onEdit: (rule: AlertRuleRow) => void;
  onDelete: (id: number) => void;
  onToggle: (id: number, enabled: boolean) => void;
}) {
  const isEnabled = rule.enabled === 1;
  const isCritical = rule.severity === "critical";
  return (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all",
      isEnabled
        ? "border-border bg-secondary/30"
        : "border-border/40 bg-secondary/10 opacity-60"
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono font-semibold text-foreground truncate">{rule.name}</span>
          <span className={cn(
            "text-[9px] font-mono px-1.5 py-0.5 rounded border",
            isCritical
              ? "text-red-400 bg-red-400/10 border-red-400/20"
              : "text-amber-400 bg-amber-400/10 border-amber-400/20"
          )}>
            {rule.severity.toUpperCase()}
          </span>
        </div>
        <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
          {rule.metric === "kafka_lag" ? "Kafka lag" : "Redis mem"} · <span className="text-primary/80">{rule.target}</span> · &gt; {rule.threshold}{rule.metric === "kafka_lag" ? " msgs" : "%"}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onToggle(rule.id, !isEnabled)}
          className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          title={isEnabled ? "Disable rule" : "Enable rule"}
        >
          {isEnabled ? <ToggleRight size={16} className="text-primary" /> : <ToggleLeft size={16} />}
        </button>
        <button
          onClick={() => onEdit(rule)}
          className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          title="Edit rule"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => onDelete(rule.id)}
          className="p-1 rounded hover:bg-red-400/10 transition-colors text-muted-foreground hover:text-red-400"
          title="Delete rule"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function RuleForm({
  initial,
  onSave,
  onCancel,
  isSaving,
}: {
  initial: RuleFormState;
  onSave: (form: RuleFormState) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<RuleFormState>(initial);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Auto-generate name when metric/target/severity change and name is still default
  useEffect(() => {
    const auto = `${form.target} ${form.severity}`;
    setForm(f => ({ ...f, name: f.name === "" || f.name === auto ? auto : f.name }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.metric, form.target, form.severity]);

  const targets = form.metric === "kafka_lag" ? CONSUMER_GROUPS : REDIS_NODES;

  const handleMetricChange = (m: RuleMetric) => {
    const newTargets = m === "kafka_lag" ? CONSUMER_GROUPS : REDIS_NODES;
    setForm(f => ({ ...f, metric: m, target: newTargets[0], threshold: m === "kafka_lag" ? 10 : 80 }));
  };

  const isValid = form.name.trim().length > 0 && form.target.trim().length > 0 && form.threshold > 0;

  return (
    <div className="rounded-xl border border-primary/30 p-4 space-y-4" style={{ background: "oklch(0.15 0.010 265)" }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-bold text-primary uppercase tracking-widest">
          {initial.id ? "Edit Rule" : "New Rule"}
        </span>
        <button onClick={onCancel} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Metric */}
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-muted-foreground uppercase">Metric</label>
          <select
            value={form.metric}
            onChange={e => handleMetricChange(e.target.value as RuleMetric)}
            className="w-full text-xs font-mono bg-secondary border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            <option value="kafka_lag">Kafka Consumer Lag</option>
            <option value="redis_memory">Redis Memory %</option>
          </select>
        </div>

        {/* Severity */}
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-muted-foreground uppercase">Severity</label>
          <select
            value={form.severity}
            onChange={e => setForm(f => ({ ...f, severity: e.target.value as RuleSeverity }))}
            className="w-full text-xs font-mono bg-secondary border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            <option value="warn">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        {/* Target */}
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-muted-foreground uppercase">
            {form.metric === "kafka_lag" ? "Consumer Group" : "Redis Node"}
          </label>
          <select
            value={form.target}
            onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
            className="w-full text-xs font-mono bg-secondary border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            {targets.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Threshold */}
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-muted-foreground uppercase">
            Threshold ({form.metric === "kafka_lag" ? "msgs" : "%"})
          </label>
          <input
            type="number"
            min={1}
            max={form.metric === "kafka_lag" ? 100000 : 100}
            value={form.threshold}
            onChange={e => setForm(f => ({ ...f, threshold: Math.max(1, Number(e.target.value)) }))}
            className="w-full text-xs font-mono bg-secondary border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* Rule name */}
      <div className="space-y-1">
        <label className="text-[10px] font-mono text-muted-foreground uppercase">Rule Name</label>
        <input
          ref={nameRef}
          type="text"
          maxLength={128}
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. payment-processor critical lag"
          className="w-full text-xs font-mono bg-secondary border border-border rounded px-2 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-mono rounded bg-secondary hover:bg-secondary/80 text-muted-foreground border border-border/50 transition-colors active:scale-95"
        >
          Cancel
        </button>
        <button
          onClick={() => isValid && onSave(form)}
          disabled={!isValid || isSaving}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded border transition-all active:scale-95",
            isValid && !isSaving
              ? "bg-primary text-primary-foreground border-primary/50 hover:bg-primary/90"
              : "bg-secondary text-muted-foreground border-border/50 cursor-not-allowed opacity-60"
          )}
        >
          <Check size={12} />
          {isSaving ? "Saving…" : "Save Rule"}
        </button>
      </div>
    </div>
  );
}
type AlertRuleRow = { id: number; name: string; metric: string; target: string; severity: "warn" | "critical"; threshold: number; enabled: number; createdAt: Date; updatedAt: Date };

function NamedAlertRulesSection() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.paygate.listAlertRules.useQuery();
  const rules = data?.rules ?? [];

  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleFormState | null>(null);

  const saveRuleMutation = trpc.paygate.saveAlertRule.useMutation({
    onSuccess: () => {
      utils.paygate.listAlertRules.invalidate();
      setShowForm(false);
      setEditingRule(null);
      toast.success("Rule saved");
    },
    onError: (err) => toast.error("Save failed", { description: err.message }),
  });

  const deleteRuleMutation = trpc.paygate.deleteAlertRule.useMutation({
    onSuccess: () => {
      utils.paygate.listAlertRules.invalidate();
      toast.success("Rule deleted");
    },
    onError: (err) => toast.error("Delete failed", { description: err.message }),
  });

  const toggleRuleMutation = trpc.paygate.toggleAlertRule.useMutation({
    onSuccess: () => utils.paygate.listAlertRules.invalidate(),
    onError: (err) => toast.error("Toggle failed", { description: err.message }),
  });

  const handleEdit = (rule: AlertRuleRow) => {
    setEditingRule({
      id: rule.id,
      name: rule.name,
      metric: rule.metric as RuleMetric,
      target: rule.target,
      severity: rule.severity as RuleSeverity,
      threshold: rule.threshold,
    });
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground font-mono tracking-tight flex items-center gap-2">
            <AlertTriangle size={13} className="text-amber-400" />
            NAMED ALERT RULES
          </h2>
          <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
            Per-consumer-group and per-node rules override global thresholds when matched
          </p>
        </div>
        {!showForm && !editingRule && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-mono border border-primary/20 transition-colors active:scale-95"
          >
            <Plus size={12} />
            Add Rule
          </button>
        )}
      </div>

      {(showForm) && (
        <RuleForm
          initial={EMPTY_FORM}
          onSave={(form) => saveRuleMutation.mutate(form)}
          onCancel={() => setShowForm(false)}
          isSaving={saveRuleMutation.isPending}
        />
      )}

      {editingRule && (
        <RuleForm
          initial={editingRule}
          onSave={(form) => saveRuleMutation.mutate(form)}
          onCancel={() => setEditingRule(null)}
          isSaving={saveRuleMutation.isPending}
        />
      )}

      {isLoading ? (
        <div className="h-20 flex items-center justify-center text-xs text-muted-foreground font-mono">Loading rules…</div>
      ) : rules.length === 0 ? (
        <div
          className="rounded-xl border border-dashed border-border p-6 text-center"
          style={{ background: "oklch(0.14 0.008 265)" }}
        >
          <AlertTriangle size={20} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground font-mono">No named rules yet</p>
          <p className="text-[10px] text-muted-foreground/60 font-mono mt-1">
            Add a rule to override global thresholds for specific consumer groups or Redis nodes
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <RuleRow
              key={rule.id}
              rule={rule}
              onEdit={handleEdit}
              onDelete={(id) => deleteRuleMutation.mutate({ id })}
              onToggle={(id, enabled) => toggleRuleMutation.mutate({ id, enabled })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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

      {/* Divider */}
      <div className="border-t border-border/40" />

      {/* Named Alert Rules */}
      <NamedAlertRulesSection />
    </div>
  );
}
