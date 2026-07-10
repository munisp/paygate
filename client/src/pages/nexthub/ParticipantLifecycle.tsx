import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Shield, Activity, AlertTriangle, CheckCircle2, XCircle, Plus, Settings,
  RefreshCw, Wallet, TrendingUp, BarChart3, Clock, CheckCircle, Circle
} from "lucide-react";

// ── Onboarding Step Tracker ───────────────────────────────────────────────────
const ONBOARDING_STEPS = [
  { id: 1, label: "Registration", description: "DFSP registered in scheme directory", icon: "📝" },
  { id: 2, label: "KYB Verification", description: "Know-Your-Business documents verified", icon: "🔍" },
  { id: 3, label: "Technical Setup", description: "Endpoint URLs and certificates configured", icon: "⚙️" },
  { id: 4, label: "Settlement Account", description: "Nostro/vostro account linked to TigerBeetle", icon: "🏦" },
  { id: 5, label: "NDC Configuration", description: "Net Debit Cap and position limits set", icon: "📊" },
  { id: 6, label: "Sandbox Testing", description: "End-to-end test transfers completed", icon: "🧪" },
  { id: 7, label: "Go-Live Approval", description: "Scheme operator approval granted", icon: "✅" },
];

type OnboardingStatus = "not_started" | "in_progress" | "completed" | "blocked";

function OnboardingTracker({ completedSteps = 0, blockedStep }: { completedSteps: number; blockedStep?: number }) {
  return (
    <div className="space-y-2">
      {ONBOARDING_STEPS.map((step, idx) => {
        const stepNum = idx + 1;
        const status: OnboardingStatus =
          stepNum <= completedSteps ? "completed" :
          stepNum === blockedStep ? "blocked" :
          stepNum === completedSteps + 1 ? "in_progress" : "not_started";

        const cfg = {
          completed: { bg: "bg-green-500", border: "border-green-500", text: "text-green-600 dark:text-green-400", icon: <CheckCircle2 className="h-4 w-4 text-white" /> },
          in_progress: { bg: "bg-blue-500 animate-pulse", border: "border-blue-500", text: "text-blue-600 dark:text-blue-400", icon: <Clock className="h-4 w-4 text-white" /> },
          blocked: { bg: "bg-destructive", border: "border-destructive", text: "text-destructive", icon: <XCircle className="h-4 w-4 text-white" /> },
          not_started: { bg: "bg-muted", border: "border-muted", text: "text-muted-foreground", icon: <Circle className="h-4 w-4 text-muted-foreground" /> },
        }[status];

        return (
          <div key={step.id} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full ${cfg.bg} border-2 ${cfg.border} flex items-center justify-center shrink-0 transition-all duration-500`}>
                {status === "completed" ? cfg.icon : status === "in_progress" ? cfg.icon : status === "blocked" ? cfg.icon : <span className="text-xs font-bold text-muted-foreground">{stepNum}</span>}
              </div>
              {idx < ONBOARDING_STEPS.length - 1 && (
                <div className={`w-0.5 h-6 mt-1 ${stepNum < completedSteps ? "bg-green-500" : "bg-border"} transition-colors duration-500`} />
              )}
            </div>
            <div className={`flex-1 pb-2 ${status === "not_started" ? "opacity-50" : ""} transition-opacity duration-300`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{step.label}</span>
                <span className="text-base">{step.icon}</span>
                {status === "in_progress" && <Badge variant="outline" className="text-xs text-blue-600 border-blue-500">In Progress</Badge>}
                {status === "blocked" && <Badge variant="destructive" className="text-xs">Blocked</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{step.description}</p>
            </div>
          </div>
        );
      })}
      <div className="mt-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Onboarding Progress</span>
          <span>{completedSteps}/{ONBOARDING_STEPS.length} steps</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-700"
            style={{ width: `${(completedSteps / ONBOARDING_STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Position Limit Chart (bar chart using CSS) ────────────────────────────────
function PositionLimitChart({ participants }: { participants: Array<{ name: string; netDebitCap: string | null; currentPosition: string | null }> }) {
  const items = (participants ?? []).slice(0, 8).map((p) => {
    const cap = parseFloat(p.netDebitCap ?? "1000000");
    const pos = parseFloat(p.currentPosition ?? "0");
    const pct = cap > 0 ? Math.min((pos / cap) * 100, 100) : 0;
    return { name: p.name, cap, pos, pct };
  });

  if (items.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-sm">No participants to display</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium truncate max-w-[140px]">{item.name}</span>
            <span className="text-muted-foreground">
              {item.pos.toLocaleString()} / {item.cap.toLocaleString()}
            </span>
          </div>
          <div className="h-4 bg-muted rounded-full overflow-hidden relative">
            <div
              className={`h-full rounded-full transition-all duration-700 ${item.pct > 90 ? "bg-red-500" : item.pct > 70 ? "bg-yellow-500" : "bg-blue-500"}`}
              style={{ width: `${item.pct}%` }}
            />
            <span className="absolute right-2 top-0 h-full flex items-center text-xs font-bold text-white mix-blend-difference">
              {item.pct.toFixed(0)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── NDC Utilisation Chart ─────────────────────────────────────────────────────
function NDCChart({ participants }: { participants: Array<{ name: string; ndcStatus: string | null; netDebitCap: string | null; currentPosition: string | null }> }) {
  const items = (participants ?? []).slice(0, 8);
  if (items.length === 0) return <div className="text-center py-8 text-muted-foreground text-sm">No data</div>;

  const maxVal = Math.max(...items.map((p) => parseFloat(p.netDebitCap ?? "0")), 1);

  return (
    <div className="flex items-end gap-2 h-40 pt-4">
      {items.map((p, i) => {
        const cap = parseFloat(p.netDebitCap ?? "0");
        const pos = parseFloat(p.currentPosition ?? "0");
        const capPct = (cap / maxVal) * 100;
        const posPct = (pos / maxVal) * 100;
        const status = p.ndcStatus ?? "OK";
        const barColor = status === "BREACHED" ? "bg-red-500" : status === "ALERT" ? "bg-yellow-500" : "bg-blue-500";

        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
            <div className="w-full relative flex flex-col justify-end" style={{ height: "120px" }}>
              {/* Cap bar (ghost) */}
              <div className="absolute bottom-0 left-0 right-0 bg-muted rounded-t-sm" style={{ height: `${capPct}%` }} />
              {/* Position bar */}
              <div className={`relative z-10 ${barColor} rounded-t-sm transition-all duration-700`} style={{ height: `${posPct}%` }} />
            </div>
            <span className="text-xs text-muted-foreground truncate w-full text-center" title={p.name}>
              {p.name.split(" ")[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Status colors ─────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-500/10 text-green-400 border-green-500/20",
  SUSPENDED: "bg-red-500/10 text-red-400 border-red-500/20",
  PENDING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  OFFBOARDED: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

function NDCBar({ utilisation, status }: { utilisation: number; status: string }) {
  const pct = Math.min(utilisation * 100, 100);
  const color = status === "BREACHED" ? "bg-red-500" : status === "ALERT" ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono w-12 text-right ${status === "BREACHED" ? "text-red-400" : status === "ALERT" ? "text-yellow-400" : "text-green-400"}`}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ParticipantLifecycle() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [currency, setCurrency] = useState("NGN");
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);
  const [selectedForTracker, setSelectedForTracker] = useState<string | null>(null);

  const [onboardForm, setOnboardForm] = useState({
    name: "", dfspId: "", currency: "NGN", schemeType: "FSPIOP", endpointUrl: "",
  });
  const [limitsForm, setLimitsForm] = useState({
    netDebitCap: "", liquidityCover: "", alertThreshold: "0.8", suspendOnBreach: true,
  });

  const { data: participants, refetch } = trpc.nexthubParticipants.list.useQuery({ currency, status: statusFilter === "ALL" ? undefined : statusFilter });
  const { data: positions } = trpc.nexthubParticipants.getPositions.useQuery({ currency }, { refetchInterval: 10000 });
  const { data: limits } = trpc.nexthubParticipants.getLimits.useQuery({ currency });

  const onboard = trpc.nexthubParticipants.onboard.useMutation({
    onSuccess: () => { refetch(); setOnboardOpen(false); toast({ title: "Participant onboarded" }); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const setLimits = trpc.nexthubParticipants.setLimits.useMutation({
    onSuccess: () => { refetch(); setLimitsOpen(false); toast({ title: "Limits updated" }); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const suspend = trpc.nexthubParticipants.suspend.useMutation({
    onSuccess: () => { refetch(); toast({ title: "Participant suspended" }); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
  const activate = trpc.nexthubParticipants.activate.useMutation({
    onSuccess: () => { refetch(); toast({ title: "Participant activated" }); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Merge positions into participants for charts
  const participantsWithPositions = (participants ?? []).map((p) => {
    const pos = (positions ?? []).find((x) => x.dfspId === p.dfspId);
    const lim = (limits ?? []).find((x) => x.dfspId === p.dfspId);
    return {
      ...p,
      currentPosition: pos?.currentPosition ?? "0",
      netDebitCap: lim?.netDebitCap ?? "1000000",
      ndcStatus: pos?.ndcStatus ?? "OK",
    };
  });

  const selectedTrackerParticipant = participantsWithPositions.find((p) => p.dfspId === selectedForTracker);
  const trackerCompletedSteps = selectedTrackerParticipant
    ? selectedTrackerParticipant.status === "ACTIVE" ? 7
    : selectedTrackerParticipant.status === "PENDING" ? 3
    : selectedTrackerParticipant.status === "SUSPENDED" ? 6
    : 0
    : 0;

  const stats = {
    total: (participants ?? []).length,
    active: (participants ?? []).filter((p) => p.status === "ACTIVE").length,
    suspended: (participants ?? []).filter((p) => p.status === "SUSPENDED").length,
    pending: (participants ?? []).filter((p) => p.status === "PENDING").length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Participant Lifecycle</h1>
          <p className="text-muted-foreground text-sm">Manage DFSP onboarding, position limits, and net debit caps</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Dialog open={onboardOpen} onOpenChange={setOnboardOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Onboard DFSP</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Onboard New Participant</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                {[
                  { label: "Institution Name", key: "name", placeholder: "e.g. First Bank Nigeria" },
                  { label: "DFSP ID", key: "dfspId", placeholder: "e.g. firstbank-ng" },
                  { label: "Endpoint URL", key: "endpointUrl", placeholder: "https://api.firstbank.ng/fspiop" },
                ].map(({ label, key, placeholder }) => (
                  <div key={key} className="space-y-1.5">
                    <Label>{label}</Label>
                    <Input placeholder={placeholder} value={(onboardForm as any)[key]} onChange={(e) => setOnboardForm((p) => ({ ...p, [key]: e.target.value }))} />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Currency</Label>
                    <Select value={onboardForm.currency} onValueChange={(v) => setOnboardForm((p) => ({ ...p, currency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["NGN", "GHS", "KES", "ZAR", "USD"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Scheme Type</Label>
                    <Select value={onboardForm.schemeType} onValueChange={(v) => setOnboardForm((p) => ({ ...p, schemeType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["FSPIOP", "ISO20022", "CBDC"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="outline" onClick={() => setOnboardOpen(false)}>Cancel</Button>
                <Button onClick={() => onboard.mutate(onboardForm)} disabled={!onboardForm.name || !onboardForm.dfspId || onboard.isPending}>
                  {onboard.isPending ? "Onboarding…" : "Onboard"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total DFSPs", value: stats.total, icon: <Users className="h-5 w-5 text-blue-500" />, color: "text-blue-600" },
          { label: "Active", value: stats.active, icon: <CheckCircle2 className="h-5 w-5 text-green-500" />, color: "text-green-600" },
          { label: "Suspended", value: stats.suspended, icon: <XCircle className="h-5 w-5 text-destructive" />, color: "text-destructive" },
          { label: "Pending", value: stats.pending, icon: <Clock className="h-5 w-5 text-yellow-500" />, color: "text-yellow-600" },
        ].map(({ label, value, icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 flex items-center gap-3">
              {icon}
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="participants">
        <TabsList>
          <TabsTrigger value="participants"><Users className="h-4 w-4 mr-2" /> Participants</TabsTrigger>
          <TabsTrigger value="positions"><BarChart3 className="h-4 w-4 mr-2" /> Position Limits</TabsTrigger>
          <TabsTrigger value="onboarding"><CheckCircle className="h-4 w-4 mr-2" /> Onboarding Tracker</TabsTrigger>
        </TabsList>

        {/* Participants Tab */}
        <TabsContent value="participants" className="mt-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{["NGN", "GHS", "KES", "ZAR", "USD"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            {["ALL", "ACTIVE", "SUSPENDED", "PENDING", "OFFBOARDED"].map((s) => (
              <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s)}>{s}</Button>
            ))}
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DFSP</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheme</TableHead>
                  <TableHead>NDC Utilisation</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(participantsWithPositions ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No participants found</TableCell></TableRow>
                )}
                {(participantsWithPositions ?? []).map((p) => {
                  const cap = parseFloat(p.netDebitCap ?? "1000000");
                  const pos = parseFloat(p.currentPosition ?? "0");
                  const utilisation = cap > 0 ? pos / cap : 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{p.dfspId}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[p.status] ?? ""}`}>{p.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{p.schemeType}</TableCell>
                      <TableCell className="min-w-[140px]">
                        <NDCBar utilisation={utilisation} status={p.ndcStatus ?? "OK"} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSelectedParticipant(p.dfspId); setLimitsOpen(true); }}>
                            <Settings className="h-3 w-3 mr-1" /> Limits
                          </Button>
                          {p.status === "ACTIVE" ? (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => suspend.mutate({ dfspId: p.dfspId })}>Suspend</Button>
                          ) : p.status === "SUSPENDED" ? (
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600" onClick={() => activate.mutate({ dfspId: p.dfspId })}>Activate</Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Position Limits Tab */}
        <TabsContent value="positions" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" /> Position vs NDC Cap
                </CardTitle>
                <p className="text-xs text-muted-foreground">Current position as percentage of net debit cap — updates every 10s</p>
              </CardHeader>
              <CardContent>
                <PositionLimitChart participants={participantsWithPositions} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-purple-500" /> NDC Utilisation by DFSP
                </CardTitle>
                <p className="text-xs text-muted-foreground">Grey = cap ceiling, coloured = current position</p>
              </CardHeader>
              <CardContent>
                <NDCChart participants={participantsWithPositions} />
              </CardContent>
            </Card>
          </div>

          {/* Alert table */}
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" /> NDC Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {participantsWithPositions.filter((p) => p.ndcStatus === "ALERT" || p.ndcStatus === "BREACHED").length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No NDC alerts — all participants within limits</p>
                ) : (
                  participantsWithPositions.filter((p) => p.ndcStatus === "ALERT" || p.ndcStatus === "BREACHED").map((p) => (
                    <div key={p.id} className={`flex items-center justify-between p-3 rounded-lg border ${p.ndcStatus === "BREACHED" ? "border-destructive/30 bg-destructive/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
                      <div>
                        <span className="font-medium text-sm">{p.name}</span>
                        <p className="text-xs text-muted-foreground">{p.dfspId}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-32">
                          <NDCBar utilisation={parseFloat(p.currentPosition ?? "0") / parseFloat(p.netDebitCap ?? "1")} status={p.ndcStatus ?? "OK"} />
                        </div>
                        <Badge variant={p.ndcStatus === "BREACHED" ? "destructive" : "outline"} className="text-xs">{p.ndcStatus}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onboarding Tracker Tab */}
        <TabsContent value="onboarding" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Select Participant</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(participants ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No participants found</p>
                  )}
                  {(participants ?? []).map((p) => (
                    <button
                      key={p.id}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedForTracker === p.dfspId ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                      onClick={() => setSelectedForTracker(p.dfspId)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{p.name}</span>
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[p.status] ?? ""}`}>{p.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.dfspId}</p>
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    {selectedForTracker
                      ? `Onboarding Progress — ${(participants ?? []).find((p) => p.dfspId === selectedForTracker)?.name ?? selectedForTracker}`
                      : "Select a participant to view onboarding progress"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedForTracker ? (
                    <OnboardingTracker completedSteps={trackerCompletedSteps} />
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">Select a participant from the list to view their onboarding progress</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Limits Dialog */}
      <Dialog open={limitsOpen} onOpenChange={setLimitsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Configure Limits — {selectedParticipant}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {[
              { label: "Net Debit Cap (NDC)", key: "netDebitCap", placeholder: "e.g. 5000000" },
              { label: "Liquidity Cover", key: "liquidityCover", placeholder: "e.g. 1000000" },
              { label: "Alert Threshold (0–1)", key: "alertThreshold", placeholder: "e.g. 0.8" },
            ].map(({ label, key, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Input placeholder={placeholder} value={(limitsForm as any)[key]} onChange={(e) => setLimitsForm((p) => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setLimitsOpen(false)}>Cancel</Button>
            <Button
              onClick={() => setLimits.mutate({ dfspId: selectedParticipant!, currency, ...limitsForm, netDebitCap: parseFloat(limitsForm.netDebitCap), liquidityCover: parseFloat(limitsForm.liquidityCover), alertThreshold: parseFloat(limitsForm.alertThreshold) })}
              disabled={!limitsForm.netDebitCap || setLimits.isPending}
            >
              {setLimits.isPending ? "Saving…" : "Save Limits"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
