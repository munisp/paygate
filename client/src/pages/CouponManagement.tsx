import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tag, Plus, RefreshCw, Pencil, Trash2, CheckCircle, XCircle, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function CouponManagement() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"activate" | "deactivate" | "delete" | null>(null);
  const [form, setForm] = useState({
    code: "",
    discountType: "percentage",
    discountValue: "",
    minOrderKobo: "0",
    maxUsageCount: "",
    expiresAt: "",
    description: "",
  });

  const limit = 20;
  const utils = trpc.useUtils();

  const { data, isLoading, isError, refetch } = trpc.couponsMgmt.list.useQuery({
    limit,
    offset: page * limit,
    isActive: activeFilter === "all" ? undefined : activeFilter === "active",
    search: search || undefined,
  });

  const { data: stats } = trpc.couponsMgmt.stats.useQuery();

  const createMutation = trpc.couponsMgmt.create.useMutation({
    onSuccess: () => {
      toast.success("Coupon created");
      setShowCreate(false);
      resetForm();
      utils.couponsMgmt.list.invalidate();
      utils.couponsMgmt.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.couponsMgmt.update.useMutation({
    onSuccess: () => {
      toast.success("Coupon updated");
      setEditRow(null);
      utils.couponsMgmt.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.couponsMgmt.delete.useMutation({
    onSuccess: () => {
      toast.success("Coupon deleted");
      utils.couponsMgmt.list.invalidate();
      utils.couponsMgmt.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetForm = () => setForm({ code: "", discountType: "percentage", discountValue: "", minOrderKobo: "0", maxUsageCount: "", expiresAt: "", description: "" });

  const bulkActivateMutation = trpc.couponsMgmt.bulkActivate.useMutation({
    onSuccess: (r) => { toast.success(`${r.updated} coupon(s) activated`); setSelectedIds(new Set()); utils.couponsMgmt.list.invalidate(); utils.couponsMgmt.stats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const bulkDeactivateMutation = trpc.couponsMgmt.bulkDeactivate.useMutation({
    onSuccess: (r) => { toast.success(`${r.updated} coupon(s) deactivated`); setSelectedIds(new Set()); utils.couponsMgmt.list.invalidate(); utils.couponsMgmt.stats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const bulkDeleteMutation = trpc.couponsMgmt.bulkDelete.useMutation({
    onSuccess: (r) => { toast.success(`${r.deleted} coupon(s) deleted`); setSelectedIds(new Set()); utils.couponsMgmt.list.invalidate(); utils.couponsMgmt.stats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];
  const allSelected = rows.length > 0 && rows.every((r: any) => selectedIds.has(r.id));
  const toggleAll = () => allSelected ? setSelectedIds(new Set()) : setSelectedIds(new Set(rows.map((r: any) => r.id)));
  const toggleOne = (id: string) => { const n = new Set(selectedIds); n.has(id) ? n.delete(id) : n.add(id); setSelectedIds(n); };
  const isBulkLoading = bulkActivateMutation.isPending || bulkDeactivateMutation.isPending || bulkDeleteMutation.isPending;
  const confirmBulk = () => {
    const ids = Array.from(selectedIds);
    if (bulkAction === "activate") bulkActivateMutation.mutate({ ids });
    else if (bulkAction === "deactivate") bulkDeactivateMutation.mutate({ ids });
    else if (bulkAction === "delete") bulkDeleteMutation.mutate({ ids });
    setBulkAction(null);
  };

  const handleSubmit = () => {
    if (!form.code || !form.discountValue) return toast.error("Code and discount value are required");
    const payload = {
      code: form.code.toUpperCase(),
      discountType: form.discountType as "percentage" | "fixed",
      discountValue: Number(form.discountValue),
      minOrderKobo: Number(form.minOrderKobo),
      maxUsageCount: form.maxUsageCount ? Number(form.maxUsageCount) : undefined,
      expiresAt: form.expiresAt || undefined,
      description: form.description || undefined,
    };
    if (editRow) {
      updateMutation.mutate({ id: editRow.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Coupon Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage discount coupons for customers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setShowCreate(true); }}>
            <Plus className="w-4 h-4 mr-2" /> New Coupon
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Coupons", value: stats?.total ?? 0, icon: Tag, color: "text-blue-600" },
          { label: "Active", value: stats?.active ?? 0, icon: CheckCircle, color: "text-green-600" },
          { label: "Expired", value: stats?.expired ?? 0, icon: XCircle, color: "text-red-600" },
          { label: "Total Redemptions", value: stats?.totalRedemptions ?? 0, icon: TrendingUp, color: "text-purple-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <s.icon className={`w-8 h-8 ${s.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold">{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search coupon code…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="max-w-xs"
        />
        <Select value={activeFilter} onValueChange={(v: any) => { setActiveFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center ml-auto">{data?.total ?? 0} coupons</span>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5">
            <span className="text-sm font-medium text-primary">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBulkAction("activate")} disabled={isBulkLoading}><CheckCircle className="w-3 h-3 mr-1" /> Activate</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBulkAction("deactivate")} disabled={isBulkLoading}><XCircle className="w-3 h-3 mr-1" /> Deactivate</Button>
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => setBulkAction("delete")} disabled={isBulkLoading}><Trash2 className="w-3 h-3 mr-1" /> Delete</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="p-8 text-center text-destructive">Failed to load coupons.</div>
          ) : isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Min Order</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No coupons found</TableCell>
                  </TableRow>
                )}
                {rows.map((r: any) => (
                  <TableRow key={r.id} className={selectedIds.has(r.id) ? "bg-primary/5" : ""}>
                    <TableCell><Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleOne(r.id)} /></TableCell>
                    <TableCell className="font-mono font-bold text-sm">{r.code}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.discountType}</Badge>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {r.discountType === "percentage" ? `${r.discountValue}%` : formatKobo(r.discountValue)}
                    </TableCell>
                    <TableCell>{r.minOrderKobo ? formatKobo(r.minOrderKobo) : "—"}</TableCell>
                    <TableCell>
                      {r.usageCount ?? 0}{r.maxUsageCount ? ` / ${r.maxUsageCount}` : ""}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : "Never"}
                    </TableCell>
                    <TableCell>
                      <Badge className={r.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}>
                        {r.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => {
                          setEditRow(r);
                          setForm({
                            code: r.code,
                            discountType: r.discountType,
                            discountValue: String(r.discountValue),
                            minOrderKobo: String(r.minOrderKobo ?? 0),
                            maxUsageCount: r.maxUsageCount ? String(r.maxUsageCount) : "",
                            expiresAt: r.expiresAt ? r.expiresAt.slice(0, 16) : "",
                            description: r.description ?? "",
                          });
                        }}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate({ id: r.id })}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > limit && (
        <div className="flex justify-between items-center">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {Math.ceil(data.total / limit)}</span>
          <Button variant="outline" size="sm" disabled={(page + 1) * limit >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {/* Bulk Confirm Dialog */}
      <Dialog open={!!bulkAction} onOpenChange={(o) => !o && setBulkAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Confirm Bulk {bulkAction === "activate" ? "Activation" : bulkAction === "deactivate" ? "Deactivation" : "Deletion"}</DialogTitle>
            <DialogDescription>You are about to {bulkAction} <strong>{selectedIds.size}</strong> coupon(s).{bulkAction === "delete" ? " This cannot be undone." : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAction(null)}>Cancel</Button>
            <Button variant={bulkAction === "delete" ? "destructive" : "default"} onClick={confirmBulk} disabled={isBulkLoading}>
              {isBulkLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / Edit Dialog */}
      {(showCreate || editRow) && (
        <Dialog open onOpenChange={() => { setShowCreate(false); setEditRow(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editRow ? "Edit Coupon" : "Create Coupon"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Coupon Code</Label>
                <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. SAVE20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Discount Type</Label>
                  <Select value={form.discountType} onValueChange={(v) => setForm((f) => ({ ...f, discountType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Discount Value {form.discountType === "percentage" ? "(%)" : "(Kobo)"}</Label>
                  <Input type="number" value={form.discountValue} onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Min Order (Kobo)</Label>
                  <Input type="number" value={form.minOrderKobo} onChange={(e) => setForm((f) => ({ ...f, minOrderKobo: e.target.value }))} />
                </div>
                <div>
                  <Label>Max Usage Count</Label>
                  <Input type="number" value={form.maxUsageCount} onChange={(e) => setForm((f) => ({ ...f, maxUsageCount: e.target.value }))} placeholder="Unlimited" />
                </div>
              </div>
              <div>
                <Label>Expires At</Label>
                <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowCreate(false); setEditRow(null); }}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                {editRow ? "Save Changes" : "Create Coupon"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
