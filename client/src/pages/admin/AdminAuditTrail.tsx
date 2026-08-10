import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollText, Download } from "lucide-react";
import { toast } from "sonner";

export default function AdminAuditTrail() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ action: "", merchantId: "", startDate: "", endDate: "" });

  const listQuery = trpc.admin.audit.listAll.useQuery({
    page, limit: 20,
    action: filters.action || undefined,
    merchantId: filters.merchantId || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  }, { staleTime: 30_000 });

  const exportMutation = trpc.admin.audit.exportCSV.useMutation({
    onSuccess: (data: any) => {
      const blob = new Blob([data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.rowCount} rows`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const events = (listQuery.data as any)?.events ?? [];
  const total = (listQuery.data as any)?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Audit Trail</h1>
            <p className="text-slate-400 text-sm mt-1">Platform-wide audit log of all actions</p>
          </div>
          <Button className="bg-slate-700 hover:bg-slate-600 text-white" disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate({ merchantId: filters.merchantId || undefined, startDate: filters.startDate || new Date(Date.now() - 30*24*60*60*1000).toISOString(), endDate: filters.endDate || new Date().toISOString() })}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <Label className="text-slate-400 text-xs">Action Filter</Label>
              <Input value={filters.action} onChange={(e: any) => setFilters(f => ({ ...f, action: e.target.value }))} placeholder="e.g. payment.created" className="mt-1 bg-slate-800 border-slate-700 text-white text-sm" />
            </div>
            <div>
              <Label className="text-slate-400 text-xs">Merchant ID</Label>
              <Input value={filters.merchantId} onChange={(e: any) => setFilters(f => ({ ...f, merchantId: e.target.value }))} className="mt-1 bg-slate-800 border-slate-700 text-white text-sm" />
            </div>
            <div>
              <Label className="text-slate-400 text-xs">Start Date</Label>
              <Input type="date" value={filters.startDate} onChange={(e: any) => setFilters(f => ({ ...f, startDate: e.target.value }))} className="mt-1 bg-slate-800 border-slate-700 text-white text-sm" />
            </div>
            <div>
              <Label className="text-slate-400 text-xs">End Date</Label>
              <Input type="date" value={filters.endDate} onChange={(e: any) => setFilters(f => ({ ...f, endDate: e.target.value }))} className="mt-1 bg-slate-800 border-slate-700 text-white text-sm" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><ScrollText className="w-4 h-4" /> Audit Events ({total.toLocaleString()})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {listQuery.isLoading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-slate-800" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Action</TableHead>
                    <TableHead className="text-slate-400">Merchant</TableHead>
                    <TableHead className="text-slate-400">Resource</TableHead>
                    <TableHead className="text-slate-400">IP Address</TableHead>
                    <TableHead className="text-slate-400">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e: any, i: number) => (
                    <TableRow key={e.id ?? i} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-blue-400 text-xs font-mono">{e.action}</TableCell>
                      <TableCell className="text-slate-400 text-xs font-mono">{e.merchantId?.slice(0, 12)}...</TableCell>
                      <TableCell className="text-slate-300 text-xs">{e.resource} {e.resourceId ? `#${e.resourceId?.slice(0, 8)}` : ""}</TableCell>
                      <TableCell className="text-slate-400 text-xs font-mono">{e.ipAddress ?? "—"}</TableCell>
                      <TableCell className="text-slate-400 text-xs">{new Date(e.createdAt).toLocaleString("en-NG")}</TableCell>
                    </TableRow>
                  ))}
                  {events.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-slate-500 py-8">No audit events found</TableCell></TableRow>}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
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
    </AdminLayout>
  );
}
