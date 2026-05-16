import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, RefreshCw, Pencil, Trash2, Star } from "lucide-react";
import { toast } from "sonner";

export default function SavedBeneficiaries() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editRow, setEditRow] = useState<any>(null);
  const [form, setForm] = useState({ nickname: "", accountNumber: "", bankCode: "", bankName: "", currency: "NGN" });

  const limit = 20;
  const utils = trpc.useUtils();

  const { data, isLoading, isError, refetch } = trpc.savedBeneficiaries.list.useQuery({
    limit,
    offset: page * limit,
  }, { staleTime: 30_000 });

  const addMutation = trpc.savedBeneficiaries.add.useMutation({
    onSuccess: () => {
      toast.success("Beneficiary saved");
      setShowAdd(false);
      setForm({ nickname: "", accountNumber: "", bankCode: "", bankName: "", currency: "NGN" });
      utils.savedBeneficiaries.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.savedBeneficiaries.update.useMutation({
    onSuccess: () => {
      toast.success("Beneficiary updated");
      setEditRow(null);
      utils.savedBeneficiaries.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.savedBeneficiaries.delete.useMutation({
    onSuccess: () => {
      toast.success("Beneficiary removed");
      utils.savedBeneficiaries.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const filtered = data?.rows?.filter((r: any) =>
    !search || r.nickname?.toLowerCase().includes(search.toLowerCase()) ||
    r.accountNumber?.includes(search) || r.bankName?.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Saved Beneficiaries</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage frequently used payout recipients</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Beneficiary
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <Input
          placeholder="Search by name, account, or bank…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-sm text-muted-foreground self-center ml-auto">
          {data?.total ?? 0} beneficiaries
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="p-8 text-center text-destructive">Failed to load beneficiaries.</div>
          ) : isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nickname</TableHead>
                  <TableHead>Account Number</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Usage Count</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No beneficiaries found
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                          {r.nickname?.[0]?.toUpperCase() ?? "?"}
                        </div>
                        <span className="font-medium">{r.nickname}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">{r.accountNumber}</TableCell>
                    <TableCell>{r.bankName ?? r.bankCode}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.currency ?? "NGN"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-yellow-500" />
                        {r.usageCount ?? 0}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.lastUsedAt ? new Date(r.lastUsedAt).toLocaleDateString() : "Never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEditRow(r); setForm({ nickname: r.nickname, accountNumber: r.accountNumber, bankCode: r.bankCode, bankName: r.bankName ?? "", currency: r.currency ?? "NGN" }); }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          aria-label="Delete" onClick={() => deleteMutation.mutate({ id: r.id })}
                          disabled={deleteMutation.isPending}
                        ><Trash2/>
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

      {/* Add / Edit Dialog */}
      {(showAdd || editRow) && (
        <Dialog open onOpenChange={() => { setShowAdd(false); setEditRow(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editRow ? "Edit Beneficiary" : "Add Beneficiary"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nickname</Label>
                <Input value={form.nickname} onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))} placeholder="e.g. John Doe" />
              </div>
              <div>
                <Label>Account Number</Label>
                <Input value={form.accountNumber} onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))} placeholder="10-digit NUBAN" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Bank Code</Label>
                  <Input value={form.bankCode} onChange={(e) => setForm((f) => ({ ...f, bankCode: e.target.value }))} placeholder="e.g. 044" />
                </div>
                <div>
                  <Label>Bank Name</Label>
                  <Input value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} placeholder="e.g. Access Bank" />
                </div>
              </div>
              <div>
                <Label>Currency</Label>
                <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} placeholder="NGN" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowAdd(false); setEditRow(null); }}>Cancel</Button>
              <Button
                onClick={() => {
                  if (editRow) {
                    updateMutation.mutate({ id: editRow.id, ...form });
                  } else {
                    addMutation.mutate({ userId: 0, ...form } as any);
                  }
                }}
                disabled={addMutation.isPending || updateMutation.isPending}
              >
                {editRow ? "Save Changes" : "Add Beneficiary"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
