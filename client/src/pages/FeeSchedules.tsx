import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Search, RefreshCw, DollarSign, Percent, Edit2, Trash2 } from "lucide-react";

export default function FeeSchedules() {
  const [search, setSearch] = useState("");
  const [feeType, setFeeType] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);

  const { data, isLoading, refetch } = trpc.feeSchedules.list.useQuery({
    page,
    limit: 20,
    feeType,
    search: search || undefined,
  });

  const createMutation = trpc.feeSchedules.create.useMutation({
    onSuccess: () => { toast.success("Fee schedule created"); setCreateOpen(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.feeSchedules.update.useMutation({
    onSuccess: () => { toast.success("Fee schedule updated"); setEditTarget(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.feeSchedules.delete.useMutation({
    onSuccess: () => { toast.success("Fee schedule deleted"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const feeTypes = ["flat", "percentage", "tiered", "blended", "interchange_plus"];

  function FeeForm({ initial, onSubmit, loading }: { initial?: any; onSubmit: (v: any) => void; loading: boolean }) {
    const [form, setForm] = useState({
      name: initial?.name ?? "",
      feeType: initial?.feeType ?? "flat",
      flatAmount: initial?.flatAmount ?? 0,
      percentageRate: initial?.percentageRate ?? "0",
      minFee: initial?.minFee ?? 0,
      maxFee: initial?.maxFee ?? undefined,
      currency: initial?.currency ?? "NGN",
      channel: initial?.channel ?? "",
      transactionType: initial?.transactionType ?? "",
      isActive: initial?.isActive ?? true,
    });
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Standard Card Fee" />
          </div>
          <div>
            <Label>Fee Type</Label>
            <Select value={form.feeType} onValueChange={v => setForm(f => ({ ...f, feeType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {feeTypes.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Flat Amount (kobo)</Label>
            <Input type="number" value={form.flatAmount} onChange={e => setForm(f => ({ ...f, flatAmount: Number(e.target.value) }))} />
          </div>
          <div>
            <Label>Percentage Rate (%)</Label>
            <Input value={form.percentageRate} onChange={e => setForm(f => ({ ...f, percentageRate: e.target.value }))} placeholder="e.g. 1.5" />
          </div>
          <div>
            <Label>Min Fee (kobo)</Label>
            <Input type="number" value={form.minFee} onChange={e => setForm(f => ({ ...f, minFee: Number(e.target.value) }))} />
          </div>
          <div>
            <Label>Max Fee (kobo)</Label>
            <Input type="number" value={form.maxFee ?? ""} onChange={e => setForm(f => ({ ...f, maxFee: e.target.value ? Number(e.target.value) : undefined }))} placeholder="No cap" />
          </div>
          <div>
            <Label>Currency</Label>
            <Input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} />
          </div>
          <div>
            <Label>Channel (optional)</Label>
            <Input value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} placeholder="card, bank, ussd…" />
          </div>
        </div>
        <Button className="w-full" onClick={() => onSubmit(form)} disabled={loading}>
          {loading ? "Saving…" : "Save Fee Schedule"}
        </Button>
      </div>
    );
  }

  const schedules = data?.schedules ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fee Schedules</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage transaction fee structures across channels and types</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />New Fee Schedule</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create Fee Schedule</DialogTitle></DialogHeader>
            <FeeForm onSubmit={v => createMutation.mutate(v)} loading={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><DollarSign className="w-5 h-5 text-blue-600" /></div>
              <div><p className="text-sm text-muted-foreground">Total Schedules</p><p className="text-2xl font-bold">{total}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg"><Percent className="w-5 h-5 text-green-600" /></div>
              <div><p className="text-sm text-muted-foreground">Active</p><p className="text-2xl font-bold">{schedules.filter(s => s.isActive).length}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg"><DollarSign className="w-5 h-5 text-orange-600" /></div>
              <div><p className="text-sm text-muted-foreground">Inactive</p><p className="text-2xl font-bold">{schedules.filter(s => !s.isActive).length}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search fee schedules…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Select value={feeType ?? "all"} onValueChange={v => { setFeeType(v === "all" ? undefined : v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Fee Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {feeTypes.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader><CardTitle>Fee Schedules ({total})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No fee schedules found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-2">Name</th>
                    <th className="text-left py-3 px-2">Type</th>
                    <th className="text-right py-3 px-2">Flat (kobo)</th>
                    <th className="text-right py-3 px-2">Rate (%)</th>
                    <th className="text-right py-3 px-2">Min</th>
                    <th className="text-right py-3 px-2">Max</th>
                    <th className="text-left py-3 px-2">Channel</th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-right py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s: any) => (
                    <tr key={s.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-2 font-medium">{s.name}</td>
                      <td className="py-3 px-2"><Badge variant="outline">{s.feeType?.replace(/_/g, " ")}</Badge></td>
                      <td className="py-3 px-2 text-right">{(s.flatAmount / 100).toFixed(2)}</td>
                      <td className="py-3 px-2 text-right">{s.percentageRate ?? "—"}</td>
                      <td className="py-3 px-2 text-right">{s.minFee ? (s.minFee / 100).toFixed(2) : "—"}</td>
                      <td className="py-3 px-2 text-right">{s.maxFee ? (s.maxFee / 100).toFixed(2) : "No cap"}</td>
                      <td className="py-3 px-2">{s.channel ?? "All"}</td>
                      <td className="py-3 px-2">
                        <Badge variant={s.isActive ? "default" : "secondary"}>{s.isActive ? "Active" : "Inactive"}</Badge>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditTarget(s)}><Edit2 className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                            if (confirm("Delete this fee schedule?")) deleteMutation.mutate({ id: s.id });
                          }}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Pagination */}
          {total > 20 && (
            <div className="flex justify-between items-center mt-4">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(total / 20)}</span>
              <Button variant="outline" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={v => !v && setEditTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Fee Schedule</DialogTitle></DialogHeader>
          {editTarget && (
            <FeeForm initial={editTarget} onSubmit={v => updateMutation.mutate({ id: editTarget.id, ...v })} loading={updateMutation.isPending} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
