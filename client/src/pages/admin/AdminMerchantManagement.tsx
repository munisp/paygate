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
import { Search, Building2, Ban, CheckCircle, Settings } from "lucide-react";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  suspended: "bg-red-500/20 text-red-400 border-red-500/30",
  pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

export default function AdminMerchantManagement() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "suspended" | "pending" | "all">("all");
  const [feesDialog, setFeesDialog] = useState<{ open: boolean; merchantId: string; businessName: string } | null>(null);
  const [feePercent, setFeePercent] = useState("1.5");
  const [flatFeeKobo, setFlatFeeKobo] = useState("5000");
  const [feeTier, setFeeTier] = useState<"standard" | "growth" | "enterprise">("standard");

  const utils = trpc.useUtils();
  const listQuery = trpc.admin.merchants.listMerchants.useQuery({ page, limit: 20, search: search || undefined, status: statusFilter }, { staleTime: 30_000 });

  const statusMutation = trpc.admin.merchants.updateMerchantStatus.useMutation({
    onSuccess: () => { utils.admin.merchants.listMerchants.invalidate(); toast.success("Merchant status updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const feesMutation = trpc.admin.merchants.updateMerchantFees.useMutation({
    onSuccess: () => { utils.admin.merchants.listMerchants.invalidate(); setFeesDialog(null); toast.success("Fee configuration updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const merchants = (listQuery.data as any)?.merchants ?? [];
  const total = (listQuery.data as any)?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Merchant Management</h1>
          <p className="text-slate-400 text-sm mt-1">Manage all merchants on the platform</p>
        </div>

        {/* Filters */}
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search merchants..."
                value={search}
                onChange={(e: any) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v as any); setPage(1); }}>
              <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Merchants ({total.toLocaleString()})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {listQuery.isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-slate-800" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Business Name</TableHead>
                    <TableHead className="text-slate-400">Email</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Tier</TableHead>
                    <TableHead className="text-slate-400">Created</TableHead>
                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {merchants.map((m: any) => (
                    <TableRow key={m.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-white font-medium">{m.businessName}</TableCell>
                      <TableCell className="text-slate-400 text-sm">{m.email}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs border ${statusColors[m.status] ?? "bg-slate-700 text-slate-300"}`}>
                          {m.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm capitalize">{m.tier ?? "standard"}</TableCell>
                      <TableCell className="text-slate-400 text-sm">{new Date(m.createdAt).toLocaleDateString("en-NG")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-slate-700 text-slate-300 hover:bg-slate-700"
                            onClick={() => setFeesDialog({ open: true, merchantId: m.id, businessName: m.businessName })}
                          >
                            <Settings className="w-3 h-3 mr-1" /> Fees
                          </Button>
                          {m.status === "active" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-red-700 text-red-400 hover:bg-red-900/30"
                              disabled={statusMutation.isPending}
                              onClick={() => statusMutation.mutate({ merchantId: m.id, status: "suspended", reason: "Admin action" })}
                            >
                              <Ban className="w-3 h-3 mr-1" /> Suspend
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-green-700 text-green-400 hover:bg-green-900/30"
                              disabled={statusMutation.isPending}
                              onClick={() => statusMutation.mutate({ merchantId: m.id, status: "active" })}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" /> Activate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {merchants.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-500 py-8">No merchants found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-slate-400 text-sm">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="border-slate-700 text-slate-300" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button size="sm" variant="outline" className="border-slate-700 text-slate-300" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Fees Dialog */}
      {feesDialog && (
        <Dialog open={feesDialog.open} onOpenChange={() => setFeesDialog(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader>
              <DialogTitle>Update Fees — {feesDialog.businessName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-slate-300">Fee Percent (%)</Label>
                <Input value={feePercent} onChange={(e: any) => setFeePercent(e.target.value)} className="mt-1 bg-slate-800 border-slate-700 text-white" />
              </div>
              <div>
                <Label className="text-slate-300">Flat Fee (Kobo)</Label>
                <Input value={flatFeeKobo} onChange={(e: any) => setFlatFeeKobo(e.target.value)} className="mt-1 bg-slate-800 border-slate-700 text-white" />
              </div>
              <div>
                <Label className="text-slate-300">Tier</Label>
                <Select value={feeTier} onValueChange={(v: any) => setFeeTier(v as any)}>
                  <SelectTrigger className="mt-1 bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => setFeesDialog(null)}>Cancel</Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={feesMutation.isPending}
                onClick={() => feesMutation.mutate({ merchantId: feesDialog.merchantId, feePercent: parseFloat(feePercent), flatFeeKobo: parseInt(flatFeeKobo), tier: feeTier })}
              >
                Update Fees
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AdminLayout>
  );
}
