// @ts-nocheck
import { useState } from "react";
import Layout from "@/components/Layout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Layers, Search, Play, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";

function formatKobo(kobo: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(kobo / 100);
}

export default function PayoutBatching() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = trpc.wave25.payoutBatch.listPendingPayouts.useQuery({ page, limit: 30 }, { staleTime: 30_000 });
  const { data: batches } = trpc.wave25.payoutBatch.listBatches.useQuery({ page: 1, limit: 10 }, { staleTime: 30_000 });

  const createBatch = trpc.wave25.payoutBatch.createBatch.useMutation({
    onSuccess: (res) => {
      toast.success(`Batch created: ${res.batchId} (${res.count} payouts, ${formatKobo(res.totalAmountKobo)})`);
      setShowConfirm(false);
      setSelected([]);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const filtered = data?.rows.filter(r =>
    !search || r.reference?.toLowerCase().includes(search.toLowerCase()) ||
    r.id?.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selected.length === filtered.length) setSelected([]);
    else setSelected(filtered.map(r => r.id!).filter(Boolean));
  };

  const selectedTotal = filtered
    .filter(r => selected.includes(r.id!))
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);

  const statusBadge = (status: string) => {
    switch (status) {
      case "approved": return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case "pending": return <Badge variant="secondary" className="text-xs"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "failed": return <Badge variant="destructive" className="text-xs"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default: return <Badge variant="outline" className="text-xs capitalize">{status}</Badge>;
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            Payout Batching
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Select multiple pending payouts and process them as a single batch
          </p>
        </div>

        {/* Selection Summary */}
        {selected.length > 0 && (
          <Card className="border-primary">
            <CardContent className="pt-4 flex items-center justify-between">
              <div>
                <span className="font-semibold">{selected.length} payouts selected</span>
                <span className="text-muted-foreground ml-2">— Total: {formatKobo(selectedTotal)}</span>
              </div>
              <Button onClick={() => setShowConfirm(true)}>
                <Play className="h-4 w-4 mr-2" /> Create Batch
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by reference or ID..."
            className="pl-8"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Pending Payouts Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending Payouts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selected.length === filtered.length && filtered.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No pending payouts</TableCell></TableRow>
                ) : filtered.map(payout => (
                  <TableRow key={payout.id} className={selected.includes(payout.id!) ? "bg-primary/5" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(payout.id!)}
                        onCheckedChange={() => toggleSelect(payout.id!)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{payout.reference ?? payout.id?.slice(0, 12)}</TableCell>
                    <TableCell className="font-semibold">{formatKobo(payout.amount ?? 0, payout.currency ?? "NGN")}</TableCell>
                    <TableCell className="text-sm">{payout.bankCode ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{payout.accountNumber ?? "—"}</TableCell>
                    <TableCell>{statusBadge(payout.status ?? "pending")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {payout.createdAt ? new Date(payout.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Batch History */}
        {batches && batches.rows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Batches</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch ID</TableHead>
                    <TableHead>Count</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.rows.map(b => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">{b.id?.slice(0, 16)}</TableCell>
                      <TableCell>{(b as any).payoutCount}</TableCell>
                      <TableCell className="font-semibold">{formatKobo(b.totalAmountKobo ?? 0)}</TableCell>
                      <TableCell>{statusBadge(b.status ?? "pending")}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {b.createdAt ? new Date(b.createdAt).toLocaleString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {data && data.total > 30 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {((page - 1) * 30) + 1}–{Math.min(page * 30, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page * 30 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Batch Payout</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payouts in batch:</span>
              <span className="font-semibold">{selected.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total amount:</span>
              <span className="font-bold text-lg">{formatKobo(selectedTotal)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              This will queue all selected payouts for processing. This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button
              onClick={() => createBatch.mutate({ payoutIds: selected })}
              disabled={createBatch.isPending}
            >
              {createBatch.isPending ? "Creating..." : "Create Batch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
