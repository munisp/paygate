// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, PiggyBank, FileText, Building2 } from "lucide-react";
import { useIdempotencyKey } from "@/hooks/useIdempotencyKey";

export default function ConsumerPension() {
  const [contributionAmount, setContributionAmount] = useState("");
  const [openPFACode, setOpenPFACode] = useState("");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());

  const { data: account, isLoading, refetch } = trpc.newFeatures.pension.getAccount.useQuery();
  const { data: pfas } = trpc.newFeatures.pension.listPFAs.useQuery();
  const { data: statements } = trpc.newFeatures.pension.getStatements.useQuery({ year: parseInt(selectedYear, { staleTime: 30_000 }) });

  const openMutation = trpc.newFeatures.pension.openAccount.useMutation({
    onSuccess: () => {
      toast.success("Pension account opened successfully");
      setOpenPFACode("");
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Server: wave34 consumerFinancial.pension.contribute — requires an
  // idempotency key (reused across retries of the same logical contribution).
  const contributeKey = useIdempotencyKey();
  const contributeMutation = trpc.consumerFinancial.pension.contribute.useMutation({
    onSuccess: (d: any) => {
      contributeKey.reset();
      toast.success(`Contributed ₦${(d.amountKobo / 100).toLocaleString()} to pension`);
      setContributionAmount("");
      refetch();
    },
    onError: (e: any) => { contributeKey.reset(); toast.error(e.message); },
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">Pension Account</h1>
          <p className="text-muted-foreground">Manage your Contributory Pension Scheme (CPS) account</p>
        </div>
      </div>

      {!account?.accountId ? (
        /* Open Pension Account */
        <Card>
          <CardHeader>
            <CardTitle>Open Pension Account</CardTitle>
            <p className="text-sm text-muted-foreground">Select a Pension Fund Administrator (PFA) to get started</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(pfas?.pfas ?? []).map((pfa: any) => (
                <div
                  key={pfa.code}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    openPFACode === pfa.code ? "border-primary bg-primary/5" : "hover:border-primary/50"
                  }`}
                  onClick={() => setOpenPFACode(pfa.code)}
                >
                  <div className="font-medium">{pfa.name}</div>
                  <div className="text-sm text-muted-foreground">{pfa.code}</div>
                  <div className="text-xs text-muted-foreground mt-1">AUM: {formatKobo(pfa.aumKobo ?? 0)}</div>
                </div>
              ))}
            </div>
            <Button
              className="w-full"
              onClick={() => openMutation.mutate({ pfaCode: openPFACode })}
              disabled={!openPFACode || openMutation.isPending}
            >
              {openMutation.isPending ? "Opening..." : "Open Pension Account"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Account Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <PiggyBank className="h-4 w-4" /> Total Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatKobo(account.balanceKobo ?? 0)}</div>
                <p className="text-xs text-muted-foreground">RSA Balance</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">PFA</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold">{account.pfaName ?? "—"}</div>
                <div className="text-xs text-muted-foreground">RSA PIN: {account.rsaPin ?? "—"}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Account Status</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={account.status === "active" ? "default" : "secondary"} className="text-sm">
                  {account.status ?? "active"}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  Opened: {account.openedAt ? new Date(account.openedAt).toLocaleDateString() : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Make Contribution */}
          <Card>
            <CardHeader>
              <CardTitle>Make Voluntary Contribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label>Amount (₦)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 50000"
                    value={contributionAmount}
                    onChange={(e) => setContributionAmount(e.target.value)}
                    min="1000"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Minimum: ₦1,000</p>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => contributeMutation.mutate({ amountKobo: parseFloat(contributionAmount) * 100, idempotencyKey: contributeKey.getKey() })}
                    disabled={!contributionAmount || contributeMutation.isPending}
                  >
                    {contributeMutation.isPending ? "Processing..." : "Contribute"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Statements */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" /> Annual Statements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                {[2026, 2025, 2024, 2023].map((yr) => (
                  <Button
                    key={yr}
                    variant={selectedYear === yr.toString() ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedYear(yr.toString())}
                  >
                    {yr}
                  </Button>
                ))}
              </div>
              {!statements?.statements?.length ? (
                <p className="text-muted-foreground text-center py-4">No statements for {selectedYear}</p>
              ) : (
                <div className="space-y-2">
                  {statements.statements.map((s: any, i: number) => (
                    <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                      <div>
                        <div className="font-medium">{s.period}</div>
                        <div className="text-sm text-muted-foreground">{s.type}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatKobo(s.amountKobo ?? 0)}</div>
                        <Badge variant="outline" className="text-xs">{s.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
