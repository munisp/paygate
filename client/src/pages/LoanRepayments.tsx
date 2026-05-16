import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Banknote, CheckCircle, Clock, AlertTriangle, TrendingUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  partial: "bg-yellow-100 text-yellow-800",
  waived: "bg-gray-100 text-gray-600",
};

export default function LoanRepayments() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loanIdFilter, setLoanIdFilter] = useState("");

  const limit = 25;
  const utils = trpc.useUtils();

  const { data, isLoading, isError, refetch } = trpc.loanRepayments.list.useQuery({
    limit,
    offset: page * limit,
    status: statusFilter === "all" ? undefined : statusFilter,
    loanId: loanIdFilter ? Number(loanIdFilter) : undefined,
  });

  const { data: stats } = trpc.loanRepayments.stats.useQuery();

  const markPaidMutation = trpc.loanRepayments.markPaid.useMutation({
    onSuccess: () => {
      toast.success("Repayment marked as paid");
      utils.loanRepayments.list.invalidate();
      utils.loanRepayments.stats.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  const overdueCount = data?.rows?.filter((r: any) => r.status === "overdue").length ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Loan Repayments</h1>
          <p className="text-muted-foreground text-sm mt-1">Scheduled and completed loan repayment installments</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Overdue Alert */}
      {overdueCount > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800 font-medium">{overdueCount} overdue repayment{overdueCount > 1 ? "s" : ""} on this page require attention.</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Repayments", value: stats?.total ?? 0, icon: Banknote, color: "text-blue-600" },
          { label: "Paid", value: stats?.paid ?? 0, icon: CheckCircle, color: "text-green-600" },
          { label: "Overdue", value: stats?.overdue ?? 0, icon: AlertTriangle, color: "text-red-600" },
          { label: "Total Collected", value: formatKobo(stats?.totalCollectedKobo ?? 0), icon: TrendingUp, color: "text-purple-600" },
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
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="waived">Waived</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Filter by Loan ID…"
          value={loanIdFilter}
          onChange={(e) => { setLoanIdFilter(e.target.value); setPage(0); }}
          className="max-w-xs"
          type="number"
        />
        <span className="text-sm text-muted-foreground self-center ml-auto">{data?.total ?? 0} repayments</span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="p-8 text-center text-destructive">Failed to load repayments.</div>
          ) : isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loan ID</TableHead>
                  <TableHead>Installment #</TableHead>
                  <TableHead>Due Amount</TableHead>
                  <TableHead>Paid Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Paid Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No repayments found</TableCell>
                  </TableRow>
                )}
                {data?.rows.map((r: any) => (
                  <TableRow key={r.id} className={r.status === "overdue" ? "bg-red-50/50" : ""}>
                    <TableCell className="font-mono text-xs">{r.loanId}</TableCell>
                    <TableCell className="font-semibold">#{r.installmentNumber ?? r.id}</TableCell>
                    <TableCell>{formatKobo(r.amountKobo)}</TableCell>
                    <TableCell>{r.paidAmountKobo ? formatKobo(r.paidAmountKobo) : "—"}</TableCell>
                    <TableCell className={`text-sm ${r.status === "overdue" ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                      {r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.paidAt ? new Date(r.paidAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {(r.status === "scheduled" || r.status === "overdue") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => markPaidMutation.mutate({ id: r.id, paidAmountKobo: r.amountKobo })}
                          disabled={markPaidMutation.isPending}
                        >
                          Mark Paid
                        </Button>
                      )}
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
    </div>
  );
}
