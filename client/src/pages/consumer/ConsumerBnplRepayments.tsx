// @ts-nocheck
/**
 * ConsumerBnplRepayments — BNPL repayment schedule calendar with
 * instalment tracking, overdue alerts, and pay-now button.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  TrendingDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", color: "bg-blue-100 text-blue-700", icon: <Clock className="h-3 w-3" /> },
  paid: { label: "Paid", color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="h-3 w-3" /> },
  overdue: { label: "Overdue", color: "bg-red-100 text-red-700", icon: <AlertTriangle className="h-3 w-3" /> },
  upcoming: { label: "Upcoming", color: "bg-gray-100 text-gray-700", icon: <Calendar className="h-3 w-3" /> },
};

export default function ConsumerBnplRepayments() {
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [payingInstalment, setPayingInstalment] = useState<string | null>(null);

  const { data: bnplData, refetch } = trpc.newFeatures.bnpl.getActiveLoans.useQuery();
  const payMutation = trpc.newFeatures.bnpl.payInstalment.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Payment of ${formatKobo(d.amountKobo ?? 0)} processed successfully!`);
      setPayingInstalment(null);
      refetch();
    },
    onError: (e: any) => {
      toast.error(e.message ?? "Payment failed");
      setPayingInstalment(null);
    },
  });

  const loans = bnplData?.loans ?? [];
  const formatKobo = (k: number) =>
    `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  const totalOutstanding = loans.reduce(
    (s: number, l: any) => s + (l.outstandingKobo ?? 0),
    0,
  );
  const overdueCount = loans.reduce(
    (s: number, l: any) =>
      s + (l.instalments ?? []).filter((i: any) => i.status === "overdue").length,
    0,
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <CreditCard className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">BNPL Repayments</h1>
          <p className="text-muted-foreground">Track and pay your Buy Now Pay Later instalments</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{loans.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Active Loans</div>
          </CardContent>
        </Card>
        <Card className={overdueCount > 0 ? "border-red-300 bg-red-50" : ""}>
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold ${overdueCount > 0 ? "text-red-600" : ""}`}>
              {overdueCount}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Overdue Instalments</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{formatKobo(totalOutstanding)}</div>
            <div className="text-xs text-muted-foreground mt-1">Total Outstanding</div>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Alert */}
      {overdueCount > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-red-700">
              {overdueCount} overdue instalment{overdueCount > 1 ? "s" : ""}
            </div>
            <div className="text-sm text-red-600 mt-0.5">
              Late payments attract a 2% daily penalty. Please pay immediately to avoid further
              charges and credit score impact.
            </div>
          </div>
        </div>
      )}

      {/* Loans List */}
      {loans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No active BNPL loans</p>
            <p className="text-sm text-muted-foreground mt-1">
              Use BNPL at checkout to split payments into instalments
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {loans.map((loan: any) => {
            const paidInstalments = (loan.instalments ?? []).filter(
              (i: any) => i.status === "paid",
            ).length;
            const totalInstalments = loan.instalments?.length ?? 0;
            const progress = totalInstalments > 0 ? (paidInstalments / totalInstalments) * 100 : 0;
            const isExpanded = expandedLoan === loan.loanId;

            return (
              <Card key={loan.loanId} className="overflow-hidden">
                <CardContent className="p-4">
                  {/* Loan Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">{loan.merchantName ?? "BNPL Purchase"}</div>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        Loan #{loan.loanId?.slice(-8)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {paidInstalments}/{totalInstalments} instalments paid
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatKobo(loan.outstandingKobo ?? 0)}</div>
                      <div className="text-xs text-muted-foreground">outstanding</div>
                      <div className="text-xs text-muted-foreground">
                        of {formatKobo(loan.principalKobo ?? 0)}
                      </div>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mt-3">
                    <Progress value={progress} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{progress.toFixed(0)}% repaid</span>
                      <span>
                        Next due:{" "}
                        {loan.nextDueDate
                          ? new Date(loan.nextDueDate).toLocaleDateString("en-NG", {
                              day: "numeric",
                              month: "short",
                            })
                          : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Toggle */}
                  <button
                    onClick={() => setExpandedLoan(isExpanded ? null : loan.loanId)}
                    className="mt-3 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3 w-3" /> Hide schedule
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" /> View instalment schedule
                      </>
                    )}
                  </button>

                  {/* Instalment Schedule */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      <div className="text-sm font-medium mb-3">Repayment Schedule</div>
                      {(loan.instalments ?? []).map((inst: any, idx: number) => {
                        const cfg = STATUS_CONFIG[inst.status] ?? STATUS_CONFIG.upcoming;
                        const isOverdue = inst.status === "overdue";
                        const isPending = inst.status === "pending";

                        return (
                          <div
                            key={idx}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              isOverdue ? "bg-red-50 border-red-200" : "bg-muted/30"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                                  inst.status === "paid"
                                    ? "bg-green-500 text-white"
                                    : isOverdue
                                    ? "bg-red-500 text-white"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {idx + 1}
                              </div>
                              <div>
                                <div className="text-sm font-medium">
                                  Instalment {idx + 1} of {totalInstalments}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Due:{" "}
                                  {inst.dueDate
                                    ? new Date(inst.dueDate).toLocaleDateString("en-NG", {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      })
                                    : "—"}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="font-medium">{formatKobo(inst.amountKobo ?? 0)}</div>
                                <Badge className={`text-xs ${cfg.color}`}>
                                  <span className="mr-1">{cfg.icon}</span>
                                  {cfg.label}
                                </Badge>
                              </div>
                              {(isPending || isOverdue) && (
                                <Button
                                  size="sm"
                                  variant={isOverdue ? "destructive" : "default"}
                                  disabled={payingInstalment === inst.instalmentId}
                                  onClick={() => {
                                    setPayingInstalment(inst.instalmentId);
                                    payMutation.mutate({
                                      loanId: loan.loanId,
                                      instalmentId: inst.instalmentId,
                                    });
                                  }}
                                >
                                  {payingInstalment === inst.instalmentId ? "Paying..." : "Pay Now"}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Amortisation Summary */}
                      <div className="mt-3 p-3 bg-muted rounded-lg text-sm">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="text-muted-foreground text-xs">Principal</div>
                            <div className="font-medium">{formatKobo(loan.principalKobo ?? 0)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">Interest</div>
                            <div className="font-medium text-amber-600">
                              {formatKobo(loan.interestKobo ?? 0)}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">Total Cost</div>
                            <div className="font-medium">
                              {formatKobo((loan.principalKobo ?? 0) + (loan.interestKobo ?? 0))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
