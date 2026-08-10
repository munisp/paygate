// @ts-nocheck
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { TrendingUp, Plus, RefreshCw, DollarSign, Search } from "lucide-react";
import { useForm } from "react-hook-form";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  expired: "bg-gray-100 text-gray-700",
  closed: "bg-red-100 text-red-800",
  cancelled: "bg-orange-100 text-orange-800",
};

export default function AdminFxHedging() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const { data, isLoading, refetch } = trpc.wave27.fxHedge.list.useQuery({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  }, { staleTime: 30_000 });

  const createMutation = trpc.wave27.fxHedge.create.useMutation({
    onSuccess: () => { toast.success("Hedge position created"); refetch(); setShowCreate(false); reset(); },
    onError: (e) => toast.error(e.message),
  });

  const closeMutation = trpc.wave27.fxHedge.close.useMutation({
    onSuccess: () => { toast.success("Hedge position closed"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const positions = data?.positions ?? [];
  const summary = data?.summary ?? { totalNotional: 0, activeCount: 0, expiredCount: 0, avgHedgeRate: 0 };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">FX Hedging Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">Manage cross-border FX hedge positions and exposure</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>Refresh</Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />New Hedge</Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-4">
            <div className="text-sm text-gray-500">Total Notional</div>
            <div className="text-2xl font-bold mt-1">₦{(summary.totalNotional / 1000000).toFixed(1)}M</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-sm text-gray-500">Active Positions</div>
            <div className="text-2xl font-bold mt-1 text-green-600">{summary.activeCount}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-sm text-gray-500">Expired Positions</div>
            <div className="text-2xl font-bold mt-1 text-gray-500">{summary.expiredCount}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-sm text-gray-500">Avg Hedge Rate</div>
            <div className="text-2xl font-bold mt-1">{summary.avgHedgeRate?.toFixed(6) ?? "—"}</div>
          </CardContent></Card>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Search by merchant or reference..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Positions Table */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" />Hedge Positions ({positions.length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading positions...</div>
            ) : positions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No hedge positions found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="text-left py-3 px-2">Reference</th>
                      <th className="text-left py-3 px-2">Merchant</th>
                      <th className="text-left py-3 px-2">Pair</th>
                      <th className="text-right py-3 px-2">Notional</th>
                      <th className="text-right py-3 px-2">Hedge Rate</th>
                      <th className="text-left py-3 px-2">Type</th>
                      <th className="text-left py-3 px-2">Expiry</th>
                      <th className="text-left py-3 px-2">Status</th>
                      <th className="text-left py-3 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p: any) => (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-2 font-mono text-xs">{p.reference}</td>
                        <td className="py-3 px-2">{p.merchant_id}</td>
                        <td className="py-3 px-2 font-medium">{p.base_currency}/{p.quote_currency}</td>
                        <td className="py-3 px-2 text-right">₦{Number(p.notional_amount).toLocaleString()}</td>
                        <td className="py-3 px-2 text-right font-mono">{Number(p.hedge_rate).toFixed(6)}</td>
                        <td className="py-3 px-2 capitalize">{p.hedge_type}</td>
                        <td className="py-3 px-2">{p.expiry_date ? new Date(p.expiry_date).toLocaleDateString() : "—"}</td>
                        <td className="py-3 px-2">
                          <Badge className={STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-700"}>{p.status}</Badge>
                        </td>
                        <td className="py-3 px-2">
                          {p.status === "active" && (
                            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => closeMutation.mutate({ id: p.id })}>Close</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Hedge Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Create Hedge Position</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit((data) => createMutation.mutate(data as any))} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Merchant ID</label>
                  <Input {...register("merchantId", { required: true })} placeholder="merch-001" />
                </div>
                <div>
                  <label className="text-sm font-medium">Notional (NGN)</label>
                  <Input type="number" {...register("notionalAmount", { required: true, min: 1 })} placeholder="5000000" />
                </div>
                <div>
                  <label className="text-sm font-medium">Quote Currency</label>
                  <Select onValueChange={(v) => (register("quoteCurrency").onChange as any)({ target: { value: v } })}>
                    <SelectTrigger><SelectValue placeholder="USD" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Hedge Rate</label>
                  <Input type="number" step="0.000001" {...register("hedgeRate", { required: true })} placeholder="0.000625" />
                </div>
                <div>
                  <label className="text-sm font-medium">Expiry Date</label>
                  <Input type="date" {...register("expiryDate", { required: true })} />
                </div>
                <div>
                  <label className="text-sm font-medium">Hedge Type</label>
                  <Select onValueChange={(v) => (register("hedgeType").onChange as any)({ target: { value: v } })}>
                    <SelectTrigger><SelectValue placeholder="Forward" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="forward">Forward</SelectItem>
                      <SelectItem value="option">Option</SelectItem>
                      <SelectItem value="swap">Swap</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Position"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
