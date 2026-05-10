import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, RefreshCw, Search, Eye, Play, CheckCircle } from "lucide-react";

export default function KYBVerifications() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);

  const { data, isLoading, refetch } = trpc.kybMgmt.list.useQuery({ page, limit: 20, status, search: search || undefined });
  const startMutation = trpc.kybMgmt.startVerification.useMutation({
    onSuccess: () => { toast.success("KYB verification started"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const approveMutation = trpc.kybMgmt.approve.useMutation({
    onSuccess: () => { toast.success("KYB approved"); setSelected(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const rejectMutation = trpc.kybMgmt.reject.useMutation({
    onSuccess: () => { toast.success("KYB rejected"); setSelected(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const verifications = data?.verifications ?? [];
  const total = data?.total ?? 0;
  const statusColors: Record<string, any> = {
    pending: "outline", in_progress: "secondary", approved: "default",
    rejected: "destructive", requires_review: "outline"
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">KYB Verifications</h1>
          <p className="text-sm text-muted-foreground mt-1">Know Your Business — merchant identity and compliance verification</p>
        </div>
        <Button variant="outline" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total", value: total },
          { label: "Pending", value: verifications.filter((v: any) => v.status === "pending").length },
          { label: "Approved", value: verifications.filter((v: any) => v.status === "approved").length },
          { label: "Rejected", value: verifications.filter((v: any) => v.status === "rejected").length },
        ].map(s => (
          <Card key={s.label}><CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold">{s.value}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card><CardContent className="pt-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by business name, RC number…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={status ?? "all"} onValueChange={v => { setStatus(v === "all" ? undefined : v); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {["pending", "in_progress", "approved", "rejected", "requires_review"].map(s => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      <Card>
        <CardHeader><CardTitle>KYB Verifications ({total})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
          ) : verifications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No KYB verifications found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-2">Business Name</th>
                    <th className="text-left py-3 px-2">RC Number</th>
                    <th className="text-left py-3 px-2">Tax ID</th>
                    <th className="text-left py-3 px-2">Risk Level</th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-left py-3 px-2">Started</th>
                    <th className="text-right py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {verifications.map((v: any) => (
                    <tr key={v.verificationId} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-2 font-medium">{v.businessName}</td>
                      <td className="py-3 px-2 font-mono text-xs">{v.rcNumber ?? "—"}</td>
                      <td className="py-3 px-2 font-mono text-xs">{v.taxId ?? "—"}</td>
                      <td className="py-3 px-2">
                        <Badge variant={v.riskLevel === "high" ? "destructive" : v.riskLevel === "medium" ? "outline" : "secondary"}>
                          {v.riskLevel ?? "—"}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant={statusColors[v.status] ?? "outline"}>{v.status?.replace(/_/g, " ")}</Badge>
                      </td>
                      <td className="py-3 px-2 text-sm">{v.startedAt ? new Date(v.startedAt).toLocaleDateString() : "—"}</td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setSelected(v)}><Eye className="w-3 h-3" /></Button>
                          {v.status === "pending" && (
                            <Button size="sm" variant="ghost" className="text-blue-600" onClick={() => startMutation.mutate({ verificationId: v.verificationId })}>
                              <Play className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>KYB Verification Details</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground">Business Name</p><p className="font-bold">{selected.businessName}</p></div>
                <div><p className="text-muted-foreground">Status</p><Badge variant={statusColors[selected.status] ?? "outline"}>{selected.status}</Badge></div>
                <div><p className="text-muted-foreground">RC Number</p><p>{selected.rcNumber ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Tax ID</p><p>{selected.taxId ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Business Type</p><p>{selected.businessType ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Risk Level</p><p>{selected.riskLevel ?? "—"}</p></div>
              </div>
              {(selected.status === "in_progress" || selected.status === "requires_review") && (
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1" onClick={() => approveMutation.mutate({ verificationId: selected.verificationId })} disabled={approveMutation.isPending}>
                    <CheckCircle className="w-4 h-4 mr-2" />Approve
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={() => {
                    const reason = prompt("Rejection reason:");
                    if (reason) rejectMutation.mutate({ verificationId: selected.verificationId, reason });
                  }} disabled={rejectMutation.isPending}>Reject</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
