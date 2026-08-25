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
import { Receipt, Search, Plus, RefreshCw, TrendingUp, CheckCircle, XCircle, Clock } from "lucide-react";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export default function BillPayments() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const limit = 20;

  const { data, isLoading, refetch } = trpc.billPayments.list.useQuery({
    limit,
    offset,
    status: statusFilter !== "all" ? statusFilter : undefined,
  }, { staleTime: 30_000 });

  const { data: stats } = trpc.billPayments.stats.useQuery();

  const updateStatus = trpc.billPayments.updateStatus.useMutation({
    onSuccess: () => { toast.success("Status updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const createMutation = trpc.billPayments.create.useMutation({
    onSuccess: () => { toast.success("Bill payment created"); setOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // userId/walletId are no longer accepted by the server — both are resolved
  // server-side from the session (wave124 billPayments.create).
  const [form, setForm] = useState({
    category: "electricity",
    billerCode: "",
    billerName: "",
    customerReference: "",
    amountKobo: 0,
    currency: "NGN",
  });

  const filtered = (data?.rows ?? []).filter(r =>
    !search || r.billerName.toLowerCase().includes(search.toLowerCase()) ||
    r.customerReference.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-blue-600" /> Bill Payments
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage utility and bill payment transactions</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New Bill Payment</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Bill Payment</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Category</Label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["electricity", "water", "cable_tv", "internet", "airtime", "data"].map(c => (
                        <SelectItem key={c} value={c}>{c.replace("_", " ").toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Biller Code</Label>
                  <Input value={form.billerCode} onChange={e => setForm(f => ({ ...f, billerCode: e.target.value }))} placeholder="EKEDC" />
                </div>
              </div>
              <div><Label>Biller Name</Label>
                <Input value={form.billerName} onChange={e => setForm(f => ({ ...f, billerName: e.target.value }))} placeholder="Eko Electricity Distribution" />
              </div>
              <div><Label>Customer Reference</Label>
                <Input value={form.customerReference} onChange={e => setForm(f => ({ ...f, customerReference: e.target.value }))} placeholder="Meter/Account number" />
              </div>
              <div><Label>Amount (Kobo)</Label>
                <Input type="number" value={form.amountKobo} onChange={e => setForm(f => ({ ...f, amountKobo: Number(e.target.value) }))} />
              </div>
              <Button className="w-full" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Bill Payment"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.total ?? 0}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" />Total</div>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{stats.completed ?? 0}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1"><CheckCircle className="h-3 w-3" />Completed</div>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending ?? 0}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Pending</div>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">{stats.failed ?? 0}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1"><XCircle className="h-3 w-3" />Failed</div>
          </CardContent></Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search biller or reference..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/></Button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Transactions ({data?.total ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No bill payments found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Biller</th>
                    <th className="pb-2 font-medium">Category</th>
                    <th className="pb-2 font-medium">Reference</th>
                    <th className="pb-2 font-medium">Amount</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(row => (
                    <tr key={row.id} className="hover:bg-muted/30">
                      <td className="py-2 font-medium">{row.billerName}</td>
                      <td className="py-2">
                        <Badge variant="outline">{row.category}</Badge>
                      </td>
                      <td className="py-2 font-mono text-xs">{row.customerReference}</td>
                      <td className="py-2">₦{(row.amountKobo / 100).toLocaleString()}</td>
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[row.status] ?? ""}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2 text-muted-foreground text-xs">
                        {new Date(row.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2">
                        {row.status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() =>
                            updateStatus.mutate({ id: row.id, status: "processing" })
                          }>Process</Button>
                        )}
                        {row.status === "processing" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="text-green-600" onClick={() =>
                              updateStatus.mutate({ id: row.id, status: "completed" })
                            }>Complete</Button>
                            <Button size="sm" variant="outline" className="text-red-600" onClick={() =>
                              updateStatus.mutate({ id: row.id, status: "failed", failureReason: "Manual failure" })
                            }>Fail</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Pagination */}
          {(data?.total ?? 0) > limit && (
            <div className="flex justify-between items-center mt-4">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - limit))}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                {offset + 1}–{Math.min(offset + limit, data?.total ?? 0)} of {data?.total ?? 0}
              </span>
              <Button variant="outline" size="sm" disabled={offset + limit >= (data?.total ?? 0)} onClick={() => setOffset(o => o + limit)}>
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
