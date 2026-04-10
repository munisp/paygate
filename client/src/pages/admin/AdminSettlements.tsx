import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Banknote, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  processing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function AdminSettlements() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"pending" | "processing" | "completed" | "failed" | "all">("pending");
  const [forceDialog, setForceDialog] = useState<{ open: boolean; settlementId: string; amount: number } | null>(null);

  const utils = trpc.useUtils();
  const statsQuery = trpc.admin.settlements.getSettlementStats.useQuery();
  const listQuery = trpc.admin.settlements.listAll.useQuery({ page, limit: 20, status: statusFilter });

  const forceMutation = trpc.admin.settlements.forceSettle.useMutation({
    onSuccess: () => { utils.admin.settlements.listAll.invalidate(); utils.admin.settlements.getSettlementStats.invalidate(); setForceDialog(null); toast.success("Settlement forced"); },
    onError: (e) => toast.error(e.message),
  });

  const stats = statsQuery.data as any;
  const settlements = (listQuery.data as any)?.settlements ?? [];
  const total = (listQuery.data as any)?.total ?? 0;
  const fmt = (k: number) => (k / 100).toLocaleString("en-NG", { style: "currency", currency: "NGN" });

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Settlement Management</h1>
          <p className="text-slate-400 text-sm mt-1">Monitor and manage platform settlements</p>
        </div>
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {["pending", "processing", "completed", "failed"].map((s) => (
              <Card key={s} className="bg-slate-900 border-slate-800">
                <CardContent className="p-4">
                  <p className="text-xs text-slate-400 capitalize">{s}</p>
                  <p className="text-lg font-bold text-white mt-1">{(stats[s]?.count ?? 0).toLocaleString()}</p>
                  <p className="text-xs text-slate-400 mt-1">{fmt(stats[s]?.amount ?? 0)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(1); }}>
            <SelectTrigger className="w-44 bg-slate-800 border-slate-700 text-white"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-slate-400 text-sm">{total} settlements</p>
        </div>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><Banknote className="w-4 h-4" /> Settlements</CardTitle></CardHeader>
          <CardContent className="p-0">
            {listQuery.isLoading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-slate-800" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Reference</TableHead>
                    <TableHead className="text-slate-400">Merchant</TableHead>
                    <TableHead className="text-slate-400">Amount</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Created</TableHead>
                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlements.map((s: any) => (
                    <TableRow key={s.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-slate-300 text-xs font-mono">{s.reference}</TableCell>
                      <TableCell className="text-slate-400 text-xs font-mono">{s.merchantId?.slice(0, 12)}...</TableCell>
                      <TableCell className="text-white font-medium">{fmt(s.amount)}</TableCell>
                      <TableCell><Badge className={`text-xs border ${statusColors[s.status] ?? "bg-slate-700 text-slate-300"}`}>{s.status}</Badge></TableCell>
                      <TableCell className="text-slate-400 text-xs">{new Date(s.createdAt).toLocaleDateString("en-NG")}</TableCell>
                      <TableCell className="text-right">
                        {(s.status === "pending" || s.status === "failed") && (
                          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => setForceDialog({ open: true, settlementId: s.id, amount: s.amount })}>
                            <CheckCircle className="w-3 h-3 mr-1" /> Force Settle
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {settlements.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">No settlements found</TableCell></TableRow>}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      {forceDialog && (
        <Dialog open={forceDialog.open} onOpenChange={() => setForceDialog(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader><DialogTitle>Force Settle</DialogTitle></DialogHeader>
            <p className="text-slate-400 text-sm">Force settle {fmt(forceDialog.amount)}? This will mark the settlement as completed.</p>
            <DialogFooter>
              <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => setForceDialog(null)}>Cancel</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={forceMutation.isPending}
                onClick={() => forceMutation.mutate({ settlementId: forceDialog.settlementId })}>
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AdminLayout>
  );
}
