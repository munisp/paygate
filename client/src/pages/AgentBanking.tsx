import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdaptiveInterval } from "@/lib/networkQuality";
import { toast } from "sonner";
import {
  Users, TrendingUp, Wallet, Plus, RefreshCw,
  MapPin, Banknote, Search, ChevronDown, ChevronUp,
  Activity, CheckCircle2, XCircle, AlertTriangle, Building2
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 border-green-200",
  suspended: "bg-red-100 text-red-700 border-red-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
};

// ── Enroll Agent Dialog ───────────────────────────────────────────────────────
function EnrollDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    agentName: "", agentCode: "", phone: "", locationState: "", locationLga: "", commissionRate: "1.5",
  });
  const f = (k: string, v: string) => setForm((p: any) => ({ ...p, [k]: v }));

  const createAgent = trpc.agentBanking.addSubAgent.useMutation({
    onSuccess: () => {
      toast.success("Sub-agent enrolled successfully");
      onSuccess();
      onClose();
      setForm({ agentName: "", agentCode: "", phone: "", locationState: "", locationLga: "", commissionRate: "1.5" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Enroll New Sub-Agent</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Agent Name *</label>
              <Input placeholder="Full name" value={form.agentName} onChange={(e: any) => f("agentName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Agent Code *</label>
              <Input placeholder="Unique code" value={form.agentCode} onChange={(e: any) => f("agentCode", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Phone Number</label>
            <Input placeholder="+234 800 000 0000" value={form.phone} onChange={(e: any) => f("phone", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">State</label>
              <Input placeholder="Lagos" value={form.locationState} onChange={(e: any) => f("locationState", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">LGA</label>
              <Input placeholder="Ikeja" value={form.locationLga} onChange={(e: any) => f("locationLga", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Commission Rate (%)</label>
            <Input type="number" min={0} max={10} step={0.1} value={form.commissionRate} onChange={(e: any) => f("commissionRate", e.target.value)} />
            <p className="text-xs text-muted-foreground">% of transaction value credited to agent</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!form.agentName || !form.agentCode || createAgent.isPending}
            onClick={() => createAgent.mutate({ subAgentMerchantId: form.agentCode, status: "active" })}
          >
            {createAgent.isPending ? "Enrolling…" : "Enroll Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Agent Detail Drawer ───────────────────────────────────────────────────────
function AgentDetailDialog({ agent, onClose }: { agent: any; onClose: () => void }) {
  const utils = trpc.useUtils();

  const updateStatus = trpc.agentBanking.addSubAgent.useMutation({
    onSuccess: () => {
      utils.agentBanking.listSubAgents.invalidate();
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!agent) return null;

  const commissionValue = ((agent.commissionKobo ?? 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 });
  const volumeValue = ((agent.totalVolumeKobo ?? 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 });

  return (
    <Dialog open={!!agent} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-muted-foreground" />
            {agent.agentName || agent.subAgentMerchantId}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-green-600">₦{volumeValue}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Total Volume</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-amber-600">₦{commissionValue}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Commission Owed</div>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1.5 border-b">
              <span className="text-muted-foreground">Agent Code</span>
              <span className="font-mono font-medium">{agent.subAgentMerchantId}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b">
              <span className="text-muted-foreground">Phone</span>
              <span>{agent.phone || "—"}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b">
              <span className="text-muted-foreground">Location</span>
              <span>{[agent.locationLga, agent.locationState].filter(Boolean).join(", ") || "—"}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b">
              <span className="text-muted-foreground">Transactions</span>
              <span className="font-medium">{(agent.totalTransactions ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b">
              <span className="text-muted-foreground">Enrolled</span>
              <span>{agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : "—"}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Status</label>
            <Select
              value={agent.status}
              onValueChange={(v: any) => updateStatus.mutate({ subAgentMerchantId: agent.subAgentMerchantId, status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AgentBanking() {
  const agentInterval = useAdaptiveInterval(60_000);
  const utils = trpc.useUtils();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"volume" | "commission" | "transactions">("volume");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const { data: agentsData, isLoading, refetch } = trpc.agentBanking.listSubAgents.useQuery(
    undefined,
    { refetchInterval: agentInterval }
  , { staleTime: 30_000 });

  const { data: healthData } = trpc.agentBanking.kioskHealth.useQuery(undefined, { staleTime: 30_000 });

  const disburseMutation = trpc.agentBanking.disburseCommissions.useMutation({
    onSuccess: (res: any) => {
      toast.success(`Disbursed ₦${((res?.totalDisbursedKobo ?? 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })} to ${res?.count ?? 0} agents`);
      utils.agentBanking.listSubAgents.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const agents: any[] = agentsData ?? [];
  const health: any = healthData ?? {};

  // Computed KPIs
  const totalTx = agents.reduce((s: any, a: any) => s + (a.totalTransactions ?? 0), 0);
  const totalVolume = agents.reduce((s: any, a: any) => s + (a.totalVolumeKobo ?? 0), 0);
  const totalCommission = agents.reduce((s: any, a: any) => s + (a.commissionKobo ?? 0), 0);
  const activeCount = agents.filter((a: any) => a.status === "active").length;

  // Filter + sort
  const filtered = useMemo(() => {
    let list = agents;
    if (statusFilter !== "all") list = list.filter((a: any) => a.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a: any) =>
        (a.agentName ?? "").toLowerCase().includes(q) ||
        (a.subAgentMerchantId ?? "").toLowerCase().includes(q) ||
        (a.locationState ?? "").toLowerCase().includes(q) ||
        (a.locationLga ?? "").toLowerCase().includes(q)
      );
    }
    const key = sortBy === "volume" ? "totalVolumeKobo" : sortBy === "commission" ? "commissionKobo" : "totalTransactions";
    list = [...list].sort((a: any, b: any) => sortDir === "desc" ? (b[key] ?? 0) - (a[key] ?? 0) : (a[key] ?? 0) - (b[key] ?? 0));
    return list;
  }, [agents, search, statusFilter, sortBy, sortDir]);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d: any) => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) =>
    sortBy === col
      ? sortDir === "desc" ? <ChevronDown className="w-3 h-3 inline ml-0.5" /> : <ChevronUp className="w-3 h-3 inline ml-0.5" />
      : null;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Agent Banking Network</h1>
            <p className="text-xs text-muted-foreground">
              {activeCount} active · {agents.length} total agents
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-green-700 border-green-300 hover:bg-green-50"
            disabled={disburseMutation.isPending || totalCommission === 0}
            onClick={() => disburseMutation.mutate()}
          >
            <Banknote className="w-3.5 h-3.5 mr-1" />
            {disburseMutation.isPending ? "Disbursing…" : `Disburse ₦${(totalCommission / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`}
          </Button>
          <Button size="sm" onClick={() => setEnrollOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Enroll Agent
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Users, color: "text-blue-500", label: "Active Agents", value: activeCount.toLocaleString() },
          { icon: TrendingUp, color: "text-green-500", label: "Total Transactions", value: totalTx.toLocaleString() },
          { icon: Wallet, color: "text-purple-500", label: "Total Volume", value: `₦${(totalVolume / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}` },
          { icon: Banknote, color: "text-amber-500", label: "Commissions Owed", value: `₦${(totalCommission / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}` },
        ].map(({ icon: Icon, color, label, value }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <div className="text-xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Network Health */}
      {health.online !== undefined && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Network Health</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <div>
                  <div className="font-bold">{health.online ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Online</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <div>
                  <div className="font-bold">{health.degraded ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Degraded</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <div>
                  <div className="font-bold">{health.offline ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Offline</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search agents…" value={search} onChange={(e: any) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} agent{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Agent Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="font-semibold text-muted-foreground">
                {agents.length === 0 ? "No sub-agents enrolled yet" : "No agents match your filters"}
              </p>
              {agents.length === 0 && (
                <Button className="mt-4" size="sm" onClick={() => setEnrollOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Enroll First Agent
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-muted-foreground">
                    <th className="text-left py-3 px-4">Agent</th>
                    <th className="text-left py-3 px-4">Location</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th
                      className="text-right py-3 px-4 cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort("transactions")}
                    >
                      Transactions <SortIcon col="transactions" />
                    </th>
                    <th
                      className="text-right py-3 px-4 cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort("volume")}
                    >
                      Volume (₦) <SortIcon col="volume" />
                    </th>
                    <th
                      className="text-right py-3 px-4 cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort("commission")}
                    >
                      Commission (₦) <SortIcon col="commission" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((agent: any) => (
                    <tr
                      key={agent.id}
                      className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedAgent(agent)}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium">{agent.agentName || agent.subAgentMerchantId}</div>
                        <div className="text-xs text-muted-foreground font-mono">{agent.subAgentMerchantId}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {[agent.locationLga, agent.locationState].filter(Boolean).join(", ") || "—"}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[agent.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {agent.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">{(agent.totalTransactions ?? 0).toLocaleString()}</td>
                      <td className="py-3 px-4 text-right font-mono">
                        {((agent.totalVolumeKobo ?? 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-green-600 font-semibold">
                        {((agent.commissionKobo ?? 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <EnrollDialog
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        onSuccess={() => refetch()}
      />
      <AgentDetailDialog
        agent={selectedAgent}
        onClose={() => setSelectedAgent(null)}
      />
    </div>
  );
}
