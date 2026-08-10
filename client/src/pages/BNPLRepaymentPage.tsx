import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, AlertCircle, Clock } from "lucide-react";
import { format, isPast } from "date-fns";
import { useAuth } from "@/_core/hooks/useAuth";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  waived: "bg-gray-100 text-gray-800",
  failed: "bg-yellow-100 text-yellow-800",
};

export default function BNPLRepaymentPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payRef, setPayRef] = useState("");

  const userId = String(user?.id ?? "demo-user");

  const { data, refetch, isLoading } = trpc.wave32.bnplRepayment.getByUser.useQuery({
    userId,
    status: statusFilter !== "all" ? statusFilter as any : undefined,
    page,
    limit: 20,
  }, { staleTime: 30_000 });

  const markPaidMutation = trpc.wave32.bnplRepayment.markPaid.useMutation({
    onSuccess: () => {
      toast({ title: "Instalment marked as paid" });
      setPayingId(null);
      setPayAmount("");
      setPayRef("");
      refetch();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const totalDue = data?.items?.filter(i => i.status === "pending" || i.status === "overdue")
    .reduce((sum, i) => sum + (i.totalDueNgn ?? 0), 0) ?? 0;

  const overdueCount = data?.items?.filter(i => i.status === "overdue").length ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">BNPL Repayment Schedule</h1>
        <p className="text-muted-foreground">View and manage your Buy Now Pay Later instalment schedule.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Clock className="h-8 w-8 text-blue-500" />
            <div>
              <div className="text-2xl font-bold">₦{totalDue.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Total Outstanding</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <div>
              <div className="text-2xl font-bold">{overdueCount}</div>
              <div className="text-sm text-muted-foreground">Overdue Instalments</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div>
              <div className="text-2xl font-bold">{data?.items?.filter(i => i.status === "paid").length ?? 0}</div>
              <div className="text-sm text-muted-foreground">Paid Instalments</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {["pending", "paid", "overdue", "waived", "failed"].map(s => (
              <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                {["Loan ID", "#", "Principal", "Interest", "Total Due", "Late Fee", "Due Date", "Status", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : data?.items?.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No repayment schedules found</td></tr>
              ) : data?.items?.map(s => {
                const isOverdue = s.status === "pending" && isPast(new Date(s.dueDate));
                return (
                  <tr key={s.id} className={`border-b hover:bg-muted/30 ${isOverdue ? "bg-red-50" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs">{s.bnplLoanId.slice(0, 8)}…</td>
                    <td className="px-4 py-3">{s.instalmentNumber}/{s.totalInstalments}</td>
                    <td className="px-4 py-3">₦{s.principalAmountNgn?.toLocaleString()}</td>
                    <td className="px-4 py-3">₦{s.interestAmountNgn?.toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold">₦{s.totalDueNgn?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-red-600">{s.lateFeeNgn ? `₦${s.lateFeeNgn}` : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                        {format(new Date(s.dueDate), "MMM d, yyyy")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[s.status ?? "pending"]}`}>
                        {isOverdue && s.status === "pending" ? "overdue" : s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(s.status === "pending" || isOverdue) && (
                        <Button size="sm" variant="outline" className="text-green-600 border-green-600"
                          onClick={() => { setPayingId(s.id); setPayAmount(String(s.totalDueNgn ?? 0)); }}>
                          Pay Now
                        </Button>
                      )}
                      {s.status === "paid" && s.paidAt && (
                        <span className="text-xs text-muted-foreground">{format(new Date(s.paidAt), "MMM d")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(data.total / 20)}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Pay Dialog */}
      <Dialog open={!!payingId} onOpenChange={() => { setPayingId(null); setPayAmount(""); setPayRef(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pay Instalment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Payment Amount (NGN)</Label>
              <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
            </div>
            <div>
              <Label>Payment Reference (optional)</Label>
              <Input placeholder="TXN-XXXXXXXX" value={payRef} onChange={e => setPayRef(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPayingId(null); setPayAmount(""); setPayRef(""); }}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700"
              onClick={() => markPaidMutation.mutate({
                id: payingId!,
                paidAmountNgn: parseFloat(payAmount),
                paymentReference: payRef || undefined,
              })}
              disabled={markPaidMutation.isPending || !payAmount}>
              {markPaidMutation.isPending ? "Processing..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
