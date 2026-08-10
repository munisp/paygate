import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Banknote, TrendingUp, Clock, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

export default function MerchantLending() {
  const [applying, setApplying] = useState(false);

  const { data: eligibility, isLoading, refetch } = trpc.merchantLending.getCreditScore.useQuery();
  const { data: loans, isLoading: loansLoading } = trpc.merchantLending.getLoanApplications.useQuery();

  const applyMutation = trpc.merchantLending.applyForLoan.useMutation({
    onSuccess: () => {
      toast.success("Loan application submitted! You will receive a decision within 24 hours.");
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const acceptMutation = trpc.merchantLending.acceptLoanOffer.useMutation({
    onSuccess: () => {
      toast.success("Loan offer accepted! Funds will be disbursed within 2 hours.");
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const statusColor: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    active: "bg-blue-100 text-blue-800",
    rejected: "bg-red-100 text-red-800",
    completed: "bg-gray-100 text-gray-800",
  };

  if (!isLoading && !loans) {
    return (
      <DashboardLayout>
        <BridgeEmptyState
          variant="offline"
          onRetry={() => window.location.reload()}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Merchant Lending</h1>
            <p className="text-muted-foreground text-sm mt-1">Working capital loans based on your transaction history</p>
          </div>
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
          </Button>
        </div>

        {/* Eligibility Card */}
        {isLoading ? (
          <Card className="animate-pulse h-40" />
        ) : eligibility ? (
          <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-primary" />
                Your Credit Profile
              </CardTitle>
              <CardDescription>Based on your last 90 days of transaction history</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Credit Score</p>
                  <p className="text-2xl font-bold text-primary">{eligibility.creditScore}</p>
                  <Progress value={(eligibility.creditScore / 850) * 100} className="h-1.5" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Max Loan Amount</p>
                  <p className="text-2xl font-bold">{formatNGN(eligibility.maxLoanAmountKobo)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Interest Rate</p>
                  <p className="text-2xl font-bold">{eligibility.interestRatePct}%</p>
                  <p className="text-xs text-muted-foreground">per annum</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Eligible</p>
                  {eligibility.eligible ? (
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-semibold">Yes</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-red-500">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-semibold">Not yet</span>
                    </div>
                  )}
                </div>
              </div>

              {eligibility.eligible && (
                <div className="pt-2">
                  <Button
                    onClick={() => {
                      setApplying(true);
                      applyMutation.mutate({
                        requestedAmountKobo: eligibility.maxLoanAmountKobo ?? 5000000,
                        purposeCode: "working_capital",
                        repaymentDays: 90,
                        notes: "Working capital",
                      });
                    }}
                    disabled={applyMutation.isPending || applying}
                    className="w-full md:w-auto"
                  >
                    {applyMutation.isPending ? "Submitting..." : "Apply for Working Capital Loan"}
                  </Button>
                </div>
              )}

              {!eligibility.eligible && eligibility.reason && (
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                  <strong>Why not eligible:</strong> {eligibility.reason}
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Active & Historical Loans */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Your Loans</h2>
          {loansLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Card key={i} className="animate-pulse h-24" />)}
            </div>
          ) : !loans?.length ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <Banknote className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No loans yet. Apply for working capital above.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {loans.map((loan: any) => (
                <Card key={loan.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{formatNGN(loan.principalKobo)}</span>
                          <Badge className={statusColor[loan.status] ?? "bg-gray-100 text-gray-800"}>
                            {loan.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" /> {loan.interestRatePct}% p.a.
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {loan.tenorDays} days
                          </span>
                          {loan.dueDate && (
                            <span>Due: {new Date(loan.dueDate).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      {loan.status === "active" && (
                        <div className="text-right space-y-1">
                          <p className="text-xs text-muted-foreground">Outstanding</p>
                          <p className="font-semibold text-red-600">{formatNGN(loan.outstandingKobo)}</p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => acceptMutation.mutate({ offerId: loan.offerId ?? loan.id, applicationId: loan.id })}
                            disabled={acceptMutation.isPending}
                          >
                            Accept Offer
                          </Button>
                        </div>
                      )}
                    </div>
                    {loan.status === "active" && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Repayment progress</span>
                          <span>{Math.round(((loan.principalKobo - loan.outstandingKobo) / loan.principalKobo) * 100)}%</span>
                        </div>
                        <Progress value={((loan.principalKobo - loan.outstandingKobo) / loan.principalKobo) * 100} className="h-2" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
