import { useState } from "react";
import Layout from "@/components/Layout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RotateCcw, Search, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

function formatKobo(kobo: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(kobo / 100);
}

export default function RefundWorkflow() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedTx, setSelectedTx] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [showDialog, setShowDialog] = useState(false);

  const { data, isLoading, refetch } = trpc.wave25.refunds.listRefundableTransactions.useQuery({
    page,
    limit: 20,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const { data: refundHistory } = trpc.wave25.refunds.listRefunds.useQuery({ page: 1, limit: 20 });

  const createRefund = trpc.wave25.refunds.createRefund.useMutation({
    onSuccess: () => {
      toast.success("Refund initiated successfully");
      setShowDialog(false);
      setSelectedTx(null);
      setRefundAmount("");
      setRefundReason("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleRefund = (txId: string) => {
    setSelectedTx(txId);
    setShowDialog(true);
  };

  const submitRefund = () => {
    if (!selectedTx || !refundReason) {
      toast.error("Please fill in all required fields");
      return;
    }
    const tx = data?.rows.find(r => r.id === selectedTx);
    const amountKobo = refundAmount
      ? Math.round(parseFloat(refundAmount) * 100)
      : tx?.amountKobo ?? 0;
    createRefund.mutate({
      transactionId: selectedTx,
      amountKobo,
      reason: refundReason,
    });
  };

  const filtered = data?.rows.filter(r =>
    !search || r.id?.toLowerCase().includes(search.toLowerCase()) ||
    r.reference?.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const statusBadge = (status: string) => {
    switch (status) {
      case "success": case "completed": return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Success</Badge>;
      case "failed": return <Badge variant="destructive" className="text-xs"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default: return <Badge variant="secondary" className="text-xs"><Clock className="h-3 w-3 mr-1" />{status}</Badge>;
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <RotateCcw className="h-6 w-6 text-primary" />
            Refund Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Initiate and track refunds for completed transactions
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ID or reference..."
              className="pl-8"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Refundable Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Refundable Transactions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No refundable transactions found</TableCell></TableRow>
                ) : filtered.map(tx => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-mono text-xs">{tx.reference ?? tx.id?.slice(0, 12)}</TableCell>
                    <TableCell className="font-semibold">{formatKobo(tx.amountKobo ?? 0, tx.currency ?? "NGN")}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs capitalize">{tx.type}</Badge></TableCell>
                    <TableCell>{statusBadge(tx.status ?? "")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => handleRefund(tx.id!)}>
                        <RotateCcw className="h-3 w-3 mr-1" /> Refund
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Refund History */}
        {refundHistory && refundHistory.rows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Refund History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Refund ID</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {refundHistory.rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.id?.slice(0, 12)}</TableCell>
                      <TableCell className="font-mono text-xs">{r.transactionId?.slice(0, 12)}</TableCell>
                      <TableCell className="font-semibold">{formatKobo(r.amountKobo ?? 0)}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{r.reason}</TableCell>
                      <TableCell>{statusBadge(r.status ?? "pending")}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {data && data.total > 20 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, data.total)} of {data.total}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page * 20 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Refund Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Initiate Refund</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Refund Amount (NGN)</label>
              <Input
                placeholder="Leave blank for full refund"
                value={refundAmount}
                onChange={e => setRefundAmount(e.target.value)}
                type="number"
                min="0"
              />
              <p className="text-xs text-muted-foreground mt-1">Leave blank to refund the full amount</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Reason <span className="text-red-500">*</span></label>
              <Textarea
                placeholder="Describe the reason for this refund..."
                value={refundReason}
                onChange={e => setRefundReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              onClick={submitRefund}
              disabled={createRefund.isPending || !refundReason}
            >
              {createRefund.isPending ? "Processing..." : "Confirm Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
