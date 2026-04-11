import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Ban, AlertTriangle, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function AdminFraudOversight() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"open" | "acknowledged" | "resolved" | "all">("open");
  const [minScore, setMinScore] = useState(0);
  const [banDialog, setBanDialog] = useState<{ open: boolean; merchantId: string } | null>(null);
  const [banReason, setBanReason] = useState("");

  const utils = trpc.useUtils();
  const statsQuery = trpc.admin.fraud.getPlatformFraudStats.useQuery();
  const listQuery = trpc.admin.fraud.listAlerts.useQuery({ page, limit: 20, status: statusFilter, minScore });

  const banMutation = trpc.admin.fraud.banMerchant.useMutation({
    onSuccess: () => { utils.admin.fraud.listAlerts.invalidate(); setBanDialog(null); setBanReason(""); toast.success("Merchant banned"); },
    onError: (e: any) => toast.error(e.message),
  });

  const stats = statsQuery.data as any;
  const alerts = (listQuery.data as any)?.alerts ?? [];
  const total = (listQuery.data as any)?.total ?? 0;

  const scoreColor = (score: number) => score >= 80 ? "text-red-400" : score >= 50 ? "text-amber-400" : "text-green-400";

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Fraud Oversight</h1>
          <p className="text-slate-400 text-sm mt-1">Platform-wide fraud monitoring and risk management</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Alerts (30d)", value: stats?.totalAlerts ?? 0, icon: AlertTriangle, color: "text-amber-400" },
            { label: "High Risk", value: stats?.highRiskCount ?? 0, icon: Shield, color: "text-red-400" },
            { label: "Blocked Transactions", value: stats?.blockedTransactions ?? 0, icon: TrendingDown, color: "text-orange-400" },
          ].map((s: any) => (
            <Card key={s.label} className="bg-slate-900 border-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                {statsQuery.isLoading ? <Skeleton className="h-12 w-full bg-slate-800" /> : (
                  <>
                    <s.icon className={`w-6 h-6 ${s.color}`} />
                    <div>
                      <p className="text-xs text-slate-400">{s.label}</p>
                      <p className="text-xl font-bold text-white">{s.value.toLocaleString()}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v as any); setPage(1); }}>
            <SelectTrigger className="w-44 bg-slate-800 border-slate-700 text-white"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Label className="text-slate-400 text-sm">Min Score:</Label>
            <Input type="number" min={0} max={100} value={minScore} onChange={(e: any) => setMinScore(parseInt(e.target.value) || 0)}
              className="w-20 bg-slate-800 border-slate-700 text-white" />
          </div>
        </div>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><Shield className="w-4 h-4 text-red-400" /> Fraud Alerts ({total})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {listQuery.isLoading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-slate-800" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">ID</TableHead>
                    <TableHead className="text-slate-400">Merchant</TableHead>
                    <TableHead className="text-slate-400">Risk Score</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Created</TableHead>
                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map((a: any) => (
                    <TableRow key={a.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-slate-400 text-xs font-mono">{a.id?.slice(0, 12)}...</TableCell>
                      <TableCell className="text-slate-300 text-xs font-mono">{a.merchantId?.slice(0, 12)}...</TableCell>
                      <TableCell>
                        <span className={cn("font-bold text-lg", scoreColor(a.riskScore ?? 0))}>{a.riskScore ?? 0}</span>
                        <span className="text-slate-500 text-xs">/100</span>
                      </TableCell>
                      <TableCell><Badge className="text-xs bg-slate-700 text-slate-300">{a.status}</Badge></TableCell>
                      <TableCell className="text-slate-400 text-xs">{new Date(a.createdAt).toLocaleDateString("en-NG")}</TableCell>
                      <TableCell className="text-right">
                        {(a.riskScore ?? 0) >= 80 && (
                          <Button size="sm" variant="outline" className="h-7 text-xs border-red-700 text-red-400 hover:bg-red-900/30"
                            onClick={() => setBanDialog({ open: true, merchantId: a.merchantId })}>
                            <Ban className="w-3 h-3 mr-1" /> Ban Merchant
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {alerts.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-slate-500 py-8">No fraud alerts found</TableCell></TableRow>}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      {banDialog && (
        <Dialog open={banDialog.open} onOpenChange={() => { setBanDialog(null); setBanReason(""); }}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader><DialogTitle className="text-red-400">Ban Merchant</DialogTitle></DialogHeader>
            <p className="text-slate-400 text-sm">This will permanently suspend the merchant and block all transactions.</p>
            <div className="py-2">
              <Label className="text-slate-300">Reason for Ban</Label>
              <Input value={banReason} onChange={(e: any) => setBanReason(e.target.value)} className="mt-1 bg-slate-800 border-slate-700 text-white" placeholder="Reason..." />
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => { setBanDialog(null); setBanReason(""); }}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={banMutation.isPending || !banReason.trim()}
                onClick={() => banMutation.mutate({ merchantId: banDialog.merchantId, reason: banReason })}>
                Confirm Ban
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AdminLayout>
  );
}
