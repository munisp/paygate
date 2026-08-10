import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Leaf, Plus, RefreshCw, TrendingUp } from "lucide-react";

export default function CarbonCredits() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const limit = 20;

  const { data, isLoading, refetch } = trpc.carbonCredits.list.useQuery({
    limit,
    offset,
    status: statusFilter !== "all" ? statusFilter : undefined,
  }, { staleTime: 30_000 });

  const { data: stats } = trpc.carbonCredits.stats.useQuery();

  const retire = trpc.carbonCredits.retire.useMutation({
    onSuccess: () => { toast.success("Credit retired"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const create = trpc.carbonCredits.create.useMutation({
    onSuccess: () => { toast.success("Carbon credit created"); setOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    merchantId: "",
    projectId: "",
    projectName: "",
    tonnes: "1",
    pricePerTonneKobo: 500000,
    totalKobo: 500000,
    vintage: new Date().getFullYear().toString(),
    standard: "VCS",
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Leaf className="h-6 w-6 text-green-600" /> Carbon Credits
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Track and retire carbon offset credits</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Issue Credit</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Issue Carbon Credit</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Merchant ID</Label>
                  <Input value={form.merchantId} onChange={e => setForm(f => ({ ...f, merchantId: e.target.value }))} />
                </div>
                <div><Label>Project ID</Label>
                  <Input value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))} />
                </div>
              </div>
              <div><Label>Project Name</Label>
                <Input value={form.projectName} onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Tonnes</Label>
                  <Input value={form.tonnes} onChange={e => setForm(f => ({ ...f, tonnes: e.target.value }))} />
                </div>
                <div><Label>Price/Tonne (₦)</Label>
                  <Input type="number" value={form.pricePerTonneKobo / 100} onChange={e => setForm(f => ({ ...f, pricePerTonneKobo: Number(e.target.value) * 100 }))} />
                </div>
                <div><Label>Standard</Label>
                  <Select value={form.standard} onValueChange={v => setForm(f => ({ ...f, standard: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["VCS", "Gold Standard", "CDM", "ACR", "CAR"].map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full" onClick={() => create.mutate({
                ...form,
                totalKobo: form.pricePerTonneKobo * parseFloat(form.tonnes || "1"),
              })} disabled={create.isPending}>
                {create.isPending ? "Issuing..." : "Issue Credit"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.total ?? 0}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" />Total Credits</div>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{stats.active ?? 0}</div>
            <div className="text-sm text-muted-foreground">Active</div>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <div className="text-2xl font-bold text-gray-500">{stats.retired ?? 0}</div>
            <div className="text-sm text-muted-foreground">Retired</div>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">₦{((stats.totalKobo ?? 0) / 100).toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Total Value</div>
          </CardContent></Card>
        </div>
      )}

      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="retired">Retired</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/></Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Carbon Credits ({data?.total ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (data?.rows ?? []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No carbon credits found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Credit ID</th>
                    <th className="pb-2 font-medium">Project</th>
                    <th className="pb-2 font-medium">Tonnes</th>
                    <th className="pb-2 font-medium">Standard</th>
                    <th className="pb-2 font-medium">Total Value</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data?.rows ?? []).map(row => (
                    <tr key={row.creditId} className="hover:bg-muted/30">
                      <td className="py-2 font-mono text-xs">{row.creditId}</td>
                      <td className="py-2">{row.projectName}</td>
                      <td className="py-2">{row.tonnes} tCO₂e</td>
                      <td className="py-2"><Badge variant="outline">{row.standard}</Badge></td>
                      <td className="py-2">₦{(row.totalKobo / 100).toLocaleString()}</td>
                      <td className="py-2">
                        <Badge variant={row.status === "active" ? "default" : row.status === "retired" ? "secondary" : "outline"}>
                          {row.status}
                        </Badge>
                      </td>
                      <td className="py-2">
                        {row.status === "active" && (
                          <Button size="sm" variant="outline" onClick={() => retire.mutate({ id: row.creditId })}>
                            Retire
                          </Button>
                        )}
                        {row.status === "retired" && (
                          <span className="text-xs text-muted-foreground">
                            {row.retiredAt ? new Date(row.retiredAt).toLocaleDateString() : "Retired"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(data?.total ?? 0) > limit && (
            <div className="flex justify-between items-center mt-4">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - limit))}>Previous</Button>
              <span className="text-sm text-muted-foreground">{offset + 1}–{Math.min(offset + limit, data?.total ?? 0)} of {data?.total ?? 0}</span>
              <Button variant="outline" size="sm" disabled={offset + limit >= (data?.total ?? 0)} onClick={() => setOffset(o => o + limit)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
