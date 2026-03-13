import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Users, TrendingUp, Wallet, Plus, RefreshCw, ChevronRight, MapPin } from "lucide-react";

export default function AgentBanking() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ agentName: "", agentCode: "", phone: "", locationState: "", locationLga: "" });

  const { data: agentsData, isLoading, refetch } = trpc.agentBanking.listSubAgents.useQuery(
    undefined,
    { enabled: isAuthenticated, refetchInterval: 60_000 }
  );

  const { data: healthData } = trpc.agentBanking.kioskHealth.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const createAgent = trpc.agentBanking.addSubAgent.useMutation({
    onSuccess: () => {
      toast.success("Sub-agent enrolled successfully");
      refetch();
      setOpen(false);
      setForm({ agentName: "", agentCode: "", phone: "", locationState: "", locationLga: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const agents: any[] = agentsData ?? [];
  const health: any = healthData ?? {};

  const totalVolume = 0;
  const totalTx = agents.reduce((s: number, a: any) => s + (a.totalTransactions ?? 0), 0);
  const activeAgents = health.online ?? 0;
  const avgCommission = 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Banking Network</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage sub-agents, track performance, and monitor commissions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Enroll Agent</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Enroll New Sub-Agent</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <Input placeholder="Agent Name" value={form.agentName} onChange={(e) => setForm({ ...form, agentName: e.target.value })} />
                <Input placeholder="Agent Code (unique)" value={form.agentCode} onChange={(e) => setForm({ ...form, agentCode: e.target.value })} />
                <Input placeholder="Phone Number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <Input placeholder="State" value={form.locationState} onChange={(e) => setForm({ ...form, locationState: e.target.value })} />
                <Input placeholder="LGA" value={form.locationLga} onChange={(e) => setForm({ ...form, locationLga: e.target.value })} />
                <Button
                  className="w-full"
                  disabled={!form.agentName || !form.agentCode}
                  onClick={() => createAgent.mutate({ subAgentMerchantId: form.agentCode, status: "active" })}
                >
                  Enroll Agent
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Active Agents</span>
            </div>
            <div className="text-2xl font-bold">{activeAgents}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Total Transactions</span>
            </div>
            <div className="text-2xl font-bold">{totalTx.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Total Volume</span>
            </div>
            <div className="text-2xl font-bold">₦{(totalVolume / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-muted-foreground">Avg Commission</span>
            </div>
            <div className="text-2xl font-bold">₦{(avgCommission / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}</div>
          </CardContent>
        </Card>
      </div>

      {/* Agent table */}
      <Card>
        <CardHeader>
          <CardTitle>Sub-Agent Network ({agents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading agents…</div>
          ) : agents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No sub-agents enrolled yet.</p>
              <p className="text-sm">Click "Enroll Agent" to add your first sub-agent.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4">Agent</th>
                    <th className="text-left py-2 pr-4">Code</th>
                    <th className="text-left py-2 pr-4">Location</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-right py-2 pr-4">Transactions</th>
                    <th className="text-right py-2 pr-4">Volume (₦)</th>
                    <th className="text-right py-2">Commission (₦)</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent: any) => (
                    <tr key={agent.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="font-medium">{agent.agentName}</div>
                        <div className="text-xs text-muted-foreground">{agent.phone}</div>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">{agent.agentCode}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          {[agent.locationLga, agent.locationState].filter(Boolean).join(", ") || "—"}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={agent.status === "active" ? "default" : "secondary"}>
                          {agent.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-right">{(agent.totalTransactions ?? 0).toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right font-mono">
                        {((agent.totalVolumeKobo ?? 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-3 text-right font-mono text-green-600">
                        {((agent.totalCommissionKobo ?? 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
