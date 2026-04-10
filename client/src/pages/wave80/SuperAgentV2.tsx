import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Network, Users, Wallet, Plus } from "lucide-react";
import { trpc5 } from "@/lib/trpc5";
import { toast } from "sonner";

export default function SuperAgentV2() {
  const [createOpen, setCreateOpen] = useState(false);
  const [networkName, setNetworkName] = useState("");

  const { data, isLoading, refetch } = trpc5.superAgentV2.listNetworks.useQuery();
  const { data: stats } = trpc5.superAgentV2.getNetworkStats.useQuery();

  const createNetwork = trpc5.superAgentV2.createNetwork.useMutation({
    onSuccess: () => { toast.success("Network created"); setCreateOpen(false); setNetworkName(""); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const networks = data?.networks ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Super Agent V2</h1><p className="text-muted-foreground">Manage super agent networks and sub-agent hierarchies</p></div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-2" />Create Network</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Network className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{stats?.networks ?? 0}</p><p className="text-sm text-muted-foreground">Networks</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Users className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">{stats?.totalAgents ?? 0}</p><p className="text-sm text-muted-foreground">Total Agents</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Wallet className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">&#8358;{((stats?.totalFloat ?? 0) / 100).toLocaleString()}</p><p className="text-sm text-muted-foreground">Total Float</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Networks</CardTitle></CardHeader><CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
        networks.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No networks yet. Create your first super agent network.</p></div> : (
          <div className="space-y-3">{networks.map(n => (
            <div key={n.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div><p className="font-medium">{n.networkName}</p><p className="text-sm text-muted-foreground">{n.totalAgents} agents</p></div>
              <Badge variant={n.status === "active" ? "default" : "secondary"}>{n.status}</Badge>
            </div>
          ))}</div>
        )}
      </CardContent></Card>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Network</DialogTitle></DialogHeader>
          <div className="space-y-2"><Label>Network Name</Label><Input value={networkName} onChange={e => setNetworkName(e.target.value)} placeholder="e.g. Lagos South Network" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createNetwork.mutate({ networkName })} disabled={!networkName || createNetwork.isPending}>{createNetwork.isPending ? "Creating..." : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
