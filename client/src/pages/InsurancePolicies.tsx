import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, CheckCircle, XCircle, Clock, TrendingUp, RefreshCw, Eye } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  expired: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-800",
  pending: "bg-yellow-100 text-yellow-800",
  claimed: "bg-blue-100 text-blue-800",
};

export default function InsurancePolicies() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<any>(null);

  const limit = 20;
  const utils = trpc.useUtils();

  const { data, isLoading, isError, refetch } = trpc.insurancePolicies.list.useQuery({
    limit,
    offset: page * limit,
    status: statusFilter === "all" ? undefined : statusFilter,
    policyType: typeFilter === "all" ? undefined : typeFilter,
  }, { staleTime: 30_000 });

  const { data: stats } = trpc.insurancePolicies.stats.useQuery();

  const cancelMutation = trpc.insurancePolicies.cancel.useMutation({
    onSuccess: () => {
      toast.success("Policy cancelled");
      utils.insurancePolicies.list.invalidate();
      utils.insurancePolicies.stats.invalidate();
      setSelected(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Insurance Policies</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage consumer insurance policies and claims</p>
        </div>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Policies", value: stats?.total ?? 0, icon: Shield, color: "text-blue-600" },
          { label: "Active", value: stats?.active ?? 0, icon: CheckCircle, color: "text-green-600" },
          { label: "Claimed", value: stats?.claimed ?? 0, icon: Clock, color: "text-yellow-600" },
          { label: "Total Premium", value: formatKobo(stats?.totalPremiumKobo ?? 0), icon: TrendingUp, color: "text-purple-600" },
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
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="claimed">Claimed</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Policy Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="life">Life</SelectItem>
            <SelectItem value="health">Health</SelectItem>
            <SelectItem value="device">Device</SelectItem>
            <SelectItem value="travel">Travel</SelectItem>
            <SelectItem value="auto">Auto</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center ml-auto">{data?.total ?? 0} policies</span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="p-8 text-center text-destructive">Failed to load policies.</div>
          ) : isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy Number</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Premium</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">No policies found</TableCell>
                  </TableRow>
                )}
                {data?.rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.policyNumber ?? r.id}</TableCell>
                    <TableCell>{r.userId}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.policyType}</Badge>
                    </TableCell>
                    <TableCell>{formatKobo(r.premiumKobo)}</TableCell>
                    <TableCell>{r.coverageAmountKobo ? formatKobo(r.coverageAmountKobo) : "—"}</TableCell>
                    <TableCell className="text-sm">{r.startDate ? new Date(r.startDate).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-sm">{r.endDate ? new Date(r.endDate).toLocaleDateString() : "—"}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setSelected(r)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {r.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => cancelMutation.mutate({ id: r.id, reason: "Merchant cancellation" })}
                            disabled={cancelMutation.isPending}
                          >
                            Cancel
                          </Button>
                        )}
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

      {/* Detail Dialog */}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Policy Detail — {selected.policyNumber ?? `#${selected.id}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm max-h-96 overflow-y-auto">
              {Object.entries(selected).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b pb-1">
                  <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                  <span className="font-medium text-right max-w-[60%] break-all">{String(v ?? "—")}</span>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
