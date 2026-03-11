import { useState, useEffect, useRef } from "react";
import {
  Shield, AlertTriangle, XCircle, CheckCircle2, Eye, Ban,
  TrendingUp, Activity, Brain, Zap, RefreshCw, Filter,
  ChevronDown, ChevronRight, Plus, Trash2, ToggleLeft, ToggleRight,
  Globe, CreditCard, Smartphone, Clock, ArrowUpRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// --- Data generators ---
const RISK_LEVELS = ["critical", "high", "medium", "low"] as const;
const CHANNELS = ["card", "mobile_money", "bank_transfer", "ussd"] as const;
const COUNTRIES = ["NG", "KE", "GH", "ZA", "SN", "TZ", "UG", "CM"];
const FRAUD_TYPES = ["Card Testing", "Account Takeover", "Synthetic Identity", "Velocity Abuse", "BIN Attack", "Chargeback Fraud", "Money Laundering", "Device Spoofing"];

function genTx(i: number) {
  const risk = RISK_LEVELS[Math.floor(Math.random() * RISK_LEVELS.length)];
  const score = risk === "critical" ? 85 + Math.random() * 15 : risk === "high" ? 65 + Math.random() * 20 : risk === "medium" ? 40 + Math.random() * 25 : 10 + Math.random() * 30;
  return {
    id: `txn_${Math.random().toString(36).slice(2, 10)}`,
    amount: Math.floor(Math.random() * 500000) + 1000,
    currency: ["NGN", "KES", "GHS"][i % 3],
    risk,
    score: Math.round(score),
    channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)],
    country: COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)],
    email: `user${Math.floor(Math.random() * 9999)}@${["gmail.com", "yahoo.com", "outlook.com", "temp-mail.org"][Math.floor(Math.random() * 4)]}`,
    ip: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    fraudType: FRAUD_TYPES[Math.floor(Math.random() * FRAUD_TYPES.length)],
    signals: ["Velocity spike", "New device", "VPN detected", "Card testing pattern", "Unusual hour", "Multiple declines"].slice(0, 2 + Math.floor(Math.random() * 3)),
    status: ["flagged", "blocked", "reviewing", "cleared"][Math.floor(Math.random() * 4)] as "flagged" | "blocked" | "reviewing" | "cleared",
    time: new Date(Date.now() - Math.random() * 3600000).toLocaleTimeString(),
    model: ["GraphSAGE v2.1", "XGBoost Ensemble", "Isolation Forest"][Math.floor(Math.random() * 3)],
  };
}

const INITIAL_TXS = Array.from({ length: 20 }, (_, i) => genTx(i));

const RULES = [
  { id: "r1", name: "Velocity — Card Testing", desc: "Block if >5 failed attempts in 10 min from same card", enabled: true, triggered: 234, blocked: 198, type: "velocity" },
  { id: "r2", name: "High-Risk Country Block", desc: "Flag transactions from sanctioned countries", enabled: true, triggered: 89, blocked: 89, type: "geo" },
  { id: "r3", name: "Large Amount Threshold", desc: "Flag single transactions > ₦5,000,000", enabled: true, triggered: 45, blocked: 12, type: "amount" },
  { id: "r4", name: "New Device + New Country", desc: "Flag when both device and country are new for user", enabled: true, triggered: 156, blocked: 67, type: "device" },
  { id: "r5", name: "Disposable Email Detection", desc: "Block payments from known disposable email providers", enabled: false, triggered: 312, blocked: 290, type: "email" },
  { id: "r6", name: "BIN Attack Detection", desc: "Block if >20 different cards from same IP in 1 hour", enabled: true, triggered: 18, blocked: 18, type: "velocity" },
  { id: "r7", name: "Odd-Hour Transactions", desc: "Flag transactions between 2AM-5AM local time", enabled: false, triggered: 78, blocked: 0, type: "time" },
];

const RISK_COLORS = {
  critical: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", badge: "bg-red-100 text-red-700", bar: "bg-red-500" },
  high: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", badge: "bg-orange-100 text-orange-700", bar: "bg-orange-500" },
  medium: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", badge: "bg-amber-100 text-amber-700", bar: "bg-amber-500" },
  low: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" },
};

const STATUS_ICONS = {
  flagged: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />,
  blocked: <XCircle className="w-3.5 h-3.5 text-red-600" />,
  reviewing: <Eye className="w-3.5 h-3.5 text-blue-600" />,
  cleared: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
};

function ScoreBar({ score, risk }: { score: number; risk: typeof RISK_LEVELS[number] }) {
  const c = RISK_COLORS[risk];
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${c.bar}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-mono font-semibold ${c.text}`}>{score}</span>
    </div>
  );
}

export default function FraudRisk() {
  const [transactions, setTransactions] = useState(INITIAL_TXS);
  const [rules, setRules] = useState(RULES);
  const [tab, setTab] = useState<"feed" | "rules" | "models" | "insights">("feed");
  const [filter, setFilter] = useState<"all" | typeof RISK_LEVELS[number]>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(true);
  const [showNewRule, setShowNewRule] = useState(false);
  const [newRule, setNewRule] = useState({ name: "", desc: "", type: "velocity" });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live feed simulation
  useEffect(() => {
    if (!liveMode) { if (intervalRef.current) clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      const tx = genTx(Math.random() * 100);
      setTransactions(prev => [tx, ...prev.slice(0, 49)]);
      if (tx.risk === "critical") toast.error(`Critical fraud signal: ${tx.fraudType} — ${tx.currency} ${tx.amount.toLocaleString()}`);
    }, 4000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [liveMode]);

  const filtered = filter === "all" ? transactions : transactions.filter(t => t.risk === filter);

  const stats = {
    total: transactions.length,
    blocked: transactions.filter(t => t.status === "blocked").length,
    flagged: transactions.filter(t => t.status === "flagged").length,
    fraudRate: ((transactions.filter(t => t.risk === "high" || t.risk === "critical").length / transactions.length) * 100).toFixed(1),
  };

  const handleAction = (txId: string, action: "block" | "allow" | "review") => {
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, status: action === "block" ? "blocked" : action === "allow" ? "cleared" : "reviewing" } : t));
    toast.success(action === "block" ? "Transaction blocked" : action === "allow" ? "Transaction cleared" : "Sent for manual review");
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Fraud & Risk Intelligence</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Real-time ML-powered fraud detection and risk management</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLiveMode(p => !p)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${liveMode ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-muted text-muted-foreground"}`}
          >
            <div className={`w-2 h-2 rounded-full ${liveMode ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
            {liveMode ? "Live" : "Paused"}
          </button>
          <Button size="sm" variant="outline" onClick={() => setTransactions(Array.from({ length: 20 }, (_, i) => genTx(i)))}>
            <RefreshCw className="w-4 h-4 mr-2" />Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Transactions Analyzed", value: transactions.length.toLocaleString(), icon: Activity, cls: "text-primary", sub: "Last hour" },
          { label: "Blocked", value: stats.blocked, icon: Ban, cls: "text-red-600", sub: `${((stats.blocked / stats.total) * 100).toFixed(1)}% block rate` },
          { label: "Flagged for Review", value: stats.flagged, icon: AlertTriangle, cls: "text-amber-600", sub: "Pending action" },
          { label: "Fraud Rate", value: stats.fraudRate + "%", icon: TrendingUp, cls: "text-orange-600", sub: "High + Critical risk" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.cls}`} />
            </div>
            <p className={`text-2xl font-bold ${s.cls}`} style={{ fontFamily: "Space Grotesk, sans-serif" }}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
        {(["feed", "rules", "models", "insights"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "feed" ? "Live Feed" : t === "rules" ? "Rules Engine" : t === "models" ? "ML Models" : "Insights"}
          </button>
        ))}
      </div>

      {/* Live Feed Tab */}
      {tab === "feed" && (
        <div className="space-y-4">
          {/* Risk filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Filter:</span>
            {(["all", "critical", "high", "medium", "low"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70 text-muted-foreground"}`}>
                {f === "all" ? "All" : f}
                {f !== "all" && <span className="ml-1.5 opacity-70">{transactions.filter(t => t.risk === f).length}</span>}
              </button>
            ))}
          </div>

          {/* Transaction feed */}
          <div className="space-y-2">
            {filtered.map(tx => {
              const c = RISK_COLORS[tx.risk];
              const isExpanded = expanded === tx.id;
              return (
                <div key={tx.id} className={`rounded-xl border transition-all ${isExpanded ? `${c.bg} ${c.border}` : "bg-card border-border hover:border-border/80"}`}>
                  <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : tx.id)}>
                    {/* Risk indicator */}
                    <div className={`w-2 h-8 rounded-full flex-shrink-0 ${c.bar}`} />

                    {/* Main info */}
                    <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-5 gap-3 items-center">
                      <div>
                        <p className="text-xs font-mono text-muted-foreground">{tx.id}</p>
                        <p className="text-sm font-semibold amount">{tx.currency} {tx.amount.toLocaleString()}</p>
                      </div>
                      <div className="hidden md:block">
                        <p className="text-xs text-muted-foreground">Risk Type</p>
                        <p className="text-xs font-medium truncate">{tx.fraudType}</p>
                      </div>
                      <div className="hidden md:block">
                        <p className="text-xs text-muted-foreground">Score</p>
                        <ScoreBar score={tx.score} risk={tx.risk} />
                      </div>
                      <div className="hidden md:block">
                        <p className="text-xs text-muted-foreground">Channel</p>
                        <p className="text-xs font-medium capitalize">{tx.channel.replace("_", " ")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${c.badge}`}>
                          {tx.risk}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {STATUS_ICONS[tx.status]}
                          <span className="capitalize hidden md:inline">{tx.status}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{tx.time}</span>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-4">
                      <div className="h-px bg-border" />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          { label: "Email", value: tx.email },
                          { label: "IP Address", value: tx.ip },
                          { label: "Country", value: tx.country },
                          { label: "ML Model", value: tx.model },
                        ].map(f => (
                          <div key={f.label}>
                            <p className="text-xs text-muted-foreground">{f.label}</p>
                            <p className="text-sm font-mono font-medium truncate">{f.value}</p>
                          </div>
                        ))}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Risk Signals Detected</p>
                        <div className="flex flex-wrap gap-2">
                          {tx.signals.map(s => (
                            <span key={s} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${c.badge}`}>{s}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {tx.status !== "blocked" && (
                          <Button size="sm" variant="destructive" onClick={() => handleAction(tx.id, "block")}>
                            <Ban className="w-3.5 h-3.5 mr-1.5" />Block
                          </Button>
                        )}
                        {tx.status !== "cleared" && (
                          <Button size="sm" variant="outline" onClick={() => handleAction(tx.id, "allow")} className="text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Allow
                          </Button>
                        )}
                        {tx.status !== "reviewing" && (
                          <Button size="sm" variant="outline" onClick={() => handleAction(tx.id, "review")}>
                            <Eye className="w-3.5 h-3.5 mr-1.5" />Review
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rules Engine Tab */}
      {tab === "rules" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{rules.filter(r => r.enabled).length} of {rules.length} rules active</p>
            <Button size="sm" onClick={() => setShowNewRule(true)}>
              <Plus className="w-4 h-4 mr-2" />New Rule
            </Button>
          </div>

          {showNewRule && (
            <div className="bg-card rounded-xl border border-border p-5 space-y-4">
              <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Create New Rule</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Rule Name</label>
                  <input value={newRule.name} onChange={e => setNewRule(p => ({ ...p, name: e.target.value }))} placeholder="e.g. High-value night transactions" className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-sm font-medium">Rule Type</label>
                  <select value={newRule.type} onChange={e => setNewRule(p => ({ ...p, type: e.target.value }))} className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="velocity">Velocity</option>
                    <option value="amount">Amount Threshold</option>
                    <option value="geo">Geographic</option>
                    <option value="device">Device</option>
                    <option value="email">Email</option>
                    <option value="time">Time-based</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium">Description</label>
                  <input value={newRule.desc} onChange={e => setNewRule(p => ({ ...p, desc: e.target.value }))} placeholder="Describe what this rule detects" className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              <div className="flex gap-3">
                <Button size="sm" onClick={() => {
                  if (!newRule.name) { toast.error("Enter a rule name"); return; }
                  setRules(p => [...p, { id: `r${p.length + 1}`, ...newRule, enabled: true, triggered: 0, blocked: 0 }]);
                  setShowNewRule(false);
                  setNewRule({ name: "", desc: "", type: "velocity" });
                  toast.success("Rule created and activated!");
                }}>Create Rule</Button>
                <Button size="sm" variant="outline" onClick={() => setShowNewRule(false)}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {rules.map(rule => (
              <div key={rule.id} className={`bg-card rounded-xl border p-5 transition-all ${rule.enabled ? "border-border" : "border-border/50 opacity-60"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-sm">{rule.name}</p>
                      <Badge className={`text-xs border-0 ${rule.type === "velocity" ? "bg-blue-100 text-blue-700" : rule.type === "geo" ? "bg-purple-100 text-purple-700" : rule.type === "amount" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                        {rule.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{rule.desc}</p>
                    <div className="flex items-center gap-4 mt-3">
                      <div className="text-xs">
                        <span className="text-muted-foreground">Triggered: </span>
                        <span className="font-semibold">{rule.triggered.toLocaleString()}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">Blocked: </span>
                        <span className="font-semibold text-red-600">{rule.blocked.toLocaleString()}</span>
                      </div>
                      {rule.triggered > 0 && (
                        <div className="text-xs">
                          <span className="text-muted-foreground">Block rate: </span>
                          <span className="font-semibold">{((rule.blocked / rule.triggered) * 100).toFixed(0)}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setRules(p => p.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
                        toast.success(rule.enabled ? `Rule "${rule.name}" disabled` : `Rule "${rule.name}" enabled`);
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${rule.enabled ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}
                    >
                      {rule.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      {rule.enabled ? "Active" : "Inactive"}
                    </button>
                    <button onClick={() => { setRules(p => p.filter(r => r.id !== rule.id)); toast.success("Rule deleted"); }} className="p-2 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ML Models Tab */}
      {tab === "models" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { name: "GraphSAGE v2.1", type: "Graph Neural Network", desc: "Detects fraud rings and coordinated attacks by analyzing transaction graph topology", accuracy: 97.4, precision: 96.8, recall: 94.2, latency: "12ms", status: "production", txs: "1.2M/day" },
            { name: "XGBoost Ensemble", type: "Gradient Boosting", desc: "High-speed feature-based classifier for known fraud patterns and velocity checks", accuracy: 94.1, precision: 93.5, recall: 91.8, latency: "3ms", status: "production", txs: "1.2M/day" },
            { name: "Isolation Forest", type: "Anomaly Detection", desc: "Unsupervised model for detecting novel, previously unseen fraud patterns", accuracy: 89.3, precision: 87.2, recall: 88.9, latency: "8ms", status: "shadow", txs: "1.2M/day" },
          ].map(m => (
            <div key={m.name} className="bg-card rounded-xl border border-border p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-primary" />
                    <p className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>{m.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.type}</p>
                </div>
                <Badge className={`text-xs border-0 ${m.status === "production" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {m.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{m.desc}</p>
              <div className="space-y-2">
                {[{ label: "Accuracy", val: m.accuracy }, { label: "Precision", val: m.precision }, { label: "Recall", val: m.recall }].map(s => (
                  <div key={s.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className="font-semibold">{s.val}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${s.val}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                <div>
                  <p className="text-xs text-muted-foreground">Avg Latency</p>
                  <p className="text-sm font-semibold amount">{m.latency}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Volume</p>
                  <p className="text-sm font-semibold">{m.txs}</p>
                </div>
              </div>
              {m.status === "shadow" && (
                <Button size="sm" className="w-full" onClick={() => toast.success(`${m.name} promoted to production!`)}>
                  <ArrowUpRight className="w-4 h-4 mr-2" />Promote to Production
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Insights Tab */}
      {tab === "insights" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Top Fraud Types (Last 30 Days)</h3>
            <div className="space-y-3">
              {[
                { type: "Card Testing", count: 1243, pct: 34 },
                { type: "Velocity Abuse", count: 876, pct: 24 },
                { type: "Account Takeover", count: 654, pct: 18 },
                { type: "BIN Attack", count: 432, pct: 12 },
                { type: "Synthetic Identity", count: 289, pct: 8 },
                { type: "Other", count: 145, pct: 4 },
              ].map(f => (
                <div key={f.type} className="flex items-center gap-3">
                  <div className="w-28 flex-shrink-0">
                    <p className="text-xs font-medium truncate">{f.type}</p>
                  </div>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${f.pct}%` }} />
                  </div>
                  <div className="w-16 text-right">
                    <p className="text-xs font-semibold amount">{f.count.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Risk by Channel</h3>
            <div className="space-y-3">
              {[
                { channel: "Card", rate: 4.2, volume: "45K", icon: CreditCard },
                { channel: "Mobile Money", rate: 1.8, volume: "32K", icon: Smartphone },
                { channel: "Bank Transfer", rate: 0.9, volume: "18K", icon: Globe },
                { channel: "USSD", rate: 0.4, volume: "12K", icon: Zap },
              ].map(c => (
                <div key={c.channel} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                  <c.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{c.channel}</p>
                      <p className="text-xs text-muted-foreground">{c.volume} txns</p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${c.rate > 3 ? "bg-red-500" : c.rate > 1.5 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${c.rate * 10}%` }} />
                      </div>
                      <span className={`text-xs font-semibold ${c.rate > 3 ? "text-red-600" : c.rate > 1.5 ? "text-amber-600" : "text-emerald-600"}`}>{c.rate}% fraud rate</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5 md:col-span-2">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Fraud Velocity — Last 24 Hours</h3>
            <div className="flex items-end gap-1 h-24">
              {Array.from({ length: 24 }, (_, i) => {
                const h = Math.floor(Math.random() * 80) + 10;
                const isHigh = h > 70;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`w-full rounded-t-sm transition-all ${isHigh ? "bg-red-400" : "bg-primary/40"}`} style={{ height: `${h}%` }} title={`${i}:00 — ${h} events`} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:59</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
