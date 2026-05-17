import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { DollarSign, TrendingUp, CreditCard, RefreshCw, CheckCircle, Star } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function MerchantLending() {
  const { user } = useAuth();
  const [requestAmount, setRequestAmount] = useState("");
  const [repaymentDays, setRepaymentDays] = useState(90);
  const [purpose, setPurpose] = useState<"inventory" | "equipment" | "working_capital" | "expansion" | "other">("working_capital");
  const [notes, setNotes] = useState("");
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);

  const creditScoreQuery = trpc.merchantLending.getCreditScore.useQuery(undefined, { enabled: !!user }, { staleTime: 30_000 });
  const applicationsQuery = trpc.merchantLending.getLoanApplications.useQuery(undefined, { enabled: !!user }, { staleTime: 30_000 });
  const offersQuery = trpc.merchantLending.getLoanOffers.useQuery(
    { applicationId: selectedApplicationId! },
    { enabled: !!selectedApplicationId }, staleTime: 30_000})

  const applyMutation = trpc.merchantLending.applyForLoan.useMutation({
    onSuccess: (data: any) => {
      toast("Loan application submitted", { description: `Application ID: ${data.applicationId ?? data.id}` });
      applicationsQuery.refetch();
      setRequestAmount("");
      setNotes("");
    },
    onError: (e: any) => toast("Application failed", { description: e.message }),
  });

  const acceptMutation = trpc.merchantLending.acceptLoanOffer.useMutation({
    onSuccess: () => {
      toast("Loan offer accepted — disbursement in progress");
      applicationsQuery.refetch();
      setSelectedApplicationId(null);
    },
    onError: (e: any) => toast("Failed to accept offer", { description: e.message }),
  });

  const creditScore = creditScoreQuery.data as any;
  const applications = (applicationsQuery.data as any)?.applications ?? (Array.isArray(applicationsQuery.data) ? applicationsQuery.data : []);
  const offers = (offersQuery.data as any)?.offers ?? (Array.isArray(offersQuery.data) ? offersQuery.data : []);

  const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    pending: "secondary",
    under_review: "secondary",
    approved: "default",
    rejected: "destructive",
    disbursed: "default",
    completed: "outline",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Merchant Lending</h1>
          <p className="text-muted-foreground">Access working capital loans based on your transaction history</p>
        </div>
        <Button aria-label="Refresh" onClick={() => { creditScoreQuery.refetch(); applicationsQuery.refetch(); }} variant="outline" size="sm"><RefreshCw/> Refresh
        </Button>
      </div>

      {/* Credit Score */}
      <Card className={creditScore?.score >= 600 ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-orange-300 bg-orange-50 dark:bg-orange-950/20"}>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <Star className={`h-10 w-10 flex-shrink-0 ${creditScore?.score >= 600 ? "text-green-500" : "text-orange-500"}`} />
            <div className="flex-1">
              <h3 className="font-bold text-lg">Credit Score: {creditScore?.score ?? "—"} / 850</h3>
              {creditScore && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Max Loan</p>
                    <p className="font-bold">₦{((creditScore.maxLoanAmountKobo ?? 0) / 100).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Interest Rate</p>
                    <p className="font-bold">{creditScore.baseInterestRatePercent ?? "—"}% p.a.</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Rating</p>
                    <p className="font-bold">{creditScore.rating ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Eligible</p>
                    <p className="font-bold">{creditScore.eligible ? "Yes" : "No"}</p>
                  </div>
                </div>
              )}
              {!creditScore?.eligible && (
                <p className="text-sm text-muted-foreground mt-1">{creditScore?.reason ?? "Process more transactions to unlock lending."}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Apply for Loan */}
      <Card>
        <CardHeader>
          <CardTitle>Apply for a Loan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Loan Amount (₦)</label>
              <Input
                type="number"
                placeholder="e.g. 500000"
                value={requestAmount}
                onChange={(e: any) => setRequestAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Repayment Period (days)</label>
              <select
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                value={repaymentDays}
                onChange={(e: any) => setRepaymentDays(parseInt(e.target.value))}
              >
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>365 days</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Purpose</label>
              <select
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                value={purpose}
                onChange={(e: any) => setPurpose(e.target.value as any)}
              >
                <option value="working_capital">Working Capital</option>
                <option value="inventory">Inventory Purchase</option>
                <option value="equipment">Equipment</option>
                <option value="expansion">Business Expansion</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Notes (optional)</label>
            <Input placeholder="Additional context for your application..." value={notes} onChange={(e: any) => setNotes(e.target.value)} className="mt-1" />
          </div>
          <Button
            onClick={() => applyMutation.mutate({ requestedAmountKobo: Math.round(parseFloat(requestAmount) * 100), purposeCode: purpose, repaymentDays, notes: notes || undefined })}
            disabled={!requestAmount || parseFloat(requestAmount) <= 0 || applyMutation.isPending}
          >
            {applyMutation.isPending ? "Submitting..." : "Apply Now"}
          </Button>
        </CardContent>
      </Card>

      {/* Loan Offers */}
      {selectedApplicationId && offers.length > 0 && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle>Loan Offers for Application</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {offers.map((offer: any) => (
              <div key={offer.offerId ?? offer.id} className="p-4 border rounded-lg space-y-2">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Amount</p>
                    <p className="font-bold">₦{((offer.approvedAmountKobo ?? 0) / 100).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Interest</p>
                    <p className="font-bold">{offer.interestRatePercent}% p.a.</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tenor</p>
                    <p className="font-bold">{offer.repaymentDays} days</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => acceptMutation.mutate({ offerId: offer.offerId ?? offer.id, applicationId: selectedApplicationId })} disabled={acceptMutation.isPending}>
                    Accept Offer
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSelectedApplicationId(null)}>Cancel</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Applications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" /> Loan Applications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {applicationsQuery.isLoading ? (
            <p className="text-muted-foreground text-center py-8">Loading applications...</p>
          ) : applications.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No loan applications yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Application ID</th>
                    <th className="text-right py-2 px-3">Amount</th>
                    <th className="text-left py-2 px-3">Purpose</th>
                    <th className="text-left py-2 px-3">Tenor</th>
                    <th className="text-center py-2 px-3">Status</th>
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-center py-2 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app: any) => (
                    <tr key={app.applicationId ?? app.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-3 font-mono text-xs">{(app.applicationId ?? app.id)?.slice(0, 10)}...</td>
                      <td className="py-2 px-3 text-right font-mono">₦{((app.requestedAmountKobo ?? 0) / 100).toLocaleString()}</td>
                      <td className="py-2 px-3 text-muted-foreground">{app.purposeCode}</td>
                      <td className="py-2 px-3">{app.repaymentDays} days</td>
                      <td className="py-2 px-3 text-center">
                        <Badge variant={statusColors[app.status] ?? "outline"}>{app.status}</Badge>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{new Date(app.createdAt).toLocaleDateString()}</td>
                      <td className="py-2 px-3 text-center">
                        {app.status === "approved" && (
                          <Button size="sm" variant="outline" onClick={() => setSelectedApplicationId(app.applicationId ?? app.id)}>
                            View Offers
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
