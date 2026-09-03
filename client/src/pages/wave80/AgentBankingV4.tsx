import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, Wallet, TrendingUp, Plus, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
export default function AgentBankingV4() {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ agentName: "", phone: "", lga: "", state: "", initialFloat: "0" });
  const { data, isLoading, refetch } = trpc.wave80.agentBankingV4.listAgents.useQuery({}, { staleTime: 30_000 });
  const { data: stats } = trpc.wave80.agentBankingV4.getStats.useQuery();
  const addAgent = trpc.wave80.agentBankingV4.createAgent.useMutation({
    onSuccess: () => { toast.success("Agent added"); setAddOpen(false); setForm({ agentName: "", phone: "", lga: "", state: "", initialFloat: "0" }); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const fundFloat = trpc.wave80.agentBankingV4.topUpFloat.useMutation({
    onSuccess: () => { toast.success("Float funded"); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const agents = data?.agents ?? [];
  const filtered = agents.filter(a => a.agentName.toLowerCase().includes(search.toLowerCase()) || (a.lga ?? "").toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Agent Banking V4</h1><p className="text-muted-foreground">Manage agent network, float, and transactions</p></div>
        <Button onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-2" />Add Agent</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Users className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{stats?.total ?? 0}</p><p className="text-sm text-muted-foreground">Total Agents</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Wallet className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">&#8358;{((stats?.totalFloat ?? 0) / 100).toLocaleString()}</p><p className="text-sm text-muted-foreground">Float Deployed</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">{stats?.active ?? 0}</p><p className="text-sm text-muted-foreground">Active Agents</p></div></div></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Agent Network</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4"><Input placeholder="Search agents..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" /><Button variant="outline"><Search className="w-4 h-4" /></Button></div>
          {isLoading ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
          filtered.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No agents found. Add your first agent.</p></div> : (
            <div className="space-y-3">{filtered.map(a => (
              <div key={a.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div><p className="font-medium">{a.agentName}</p><p className="text-sm text-muted-foreground">{a.lga}, {a.state}</p></div>
                <div className="flex items-center gap-4">
                  <div className="text-right"><p className="font-medium">&#8358;{(a.floatBalance / 100).toLocaleString()}</p><p className="text-xs text-muted-foreground">Float</p></div>
                  <Badge variant={a.status === "active" ? "default" : "secondary"}>{a.status}</Badge>
                  <Button size="sm" variant="outline" onClick={() => fundFloat.mutate({ agentId: a.id, amount: 100000, idempotencyKey: crypto.randomUUID() })}>Fund Float</Button>
                </div>
              </div>
            ))}</div>
          )}
        </CardContent>
      </Card>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Agent</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Agent Name</Label><Input value={form.agentName} onChange={e => setForm(p => ({ ...p, agentName: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>LGA</Label><Input value={form.lga} onChange={e => setForm(p => ({ ...p, lga: e.target.value }))} /></div>
              <div className="space-y-2"><Label>State</Label><Input value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Initial Float (kobo)</Label><Input type="number" value={form.initialFloat} onChange={e => setForm(p => ({ ...p, initialFloat: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => addAgent.mutate({ agentName: form.agentName, phone: form.phone, lga: form.lga, state: form.state })} disabled={addAgent.isPending}>{addAgent.isPending ? "Adding..." : "Add Agent"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
