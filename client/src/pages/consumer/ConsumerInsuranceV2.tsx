// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Umbrella, Shield, FileText, Plus } from "lucide-react";
import { useIdempotencyKey } from "@/hooks/useIdempotencyKey";

const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

const PRODUCTS = [
  { id: "ins_life_term", name: "Term Life Insurance", category: "life", premiumKoboPerMonth: 150_000, coverageKobo: 10_000_000_000, provider: "AXA Mansard", icon: "❤️" },
  { id: "ins_health_basic", name: "Basic Health Insurance", category: "health", premiumKoboPerMonth: 250_000, coverageKobo: 5_000_000_000, provider: "Hygeia HMO", icon: "🏥" },
  { id: "ins_device", name: "Device Insurance", category: "device", premiumKoboPerMonth: 50_000, coverageKobo: 500_000_000, provider: "Leadway Assurance", icon: "📱" },
  { id: "ins_travel", name: "Travel Insurance", category: "travel", premiumKoboPerMonth: 30_000, coverageKobo: 200_000_000, provider: "AIICO Insurance", icon: "✈️" },
  { id: "ins_auto", name: "Auto Insurance (Third Party)", category: "auto", premiumKoboPerMonth: 200_000, coverageKobo: 1_000_000_000, provider: "Custodian Insurance", icon: "🚗" },
];

export default function ConsumerInsuranceV2() {
  const [purchaseDialog, setPurchaseDialog] = useState<typeof PRODUCTS[0] | null>(null);
  const [claimDialog, setClaimDialog] = useState<any | null>(null);
  const [claimDesc, setClaimDesc] = useState("");
  const [claimAmount, setClaimAmount] = useState("");

  const { data: policyData, refetch: refetchPolicies, isLoading } = trpc.consumerFinancial.insurance.getPolicies.useQuery();

  const purchaseKey = useIdempotencyKey();
  const purchaseMutation = trpc.consumerFinancial.insurance.purchase.useMutation({
    onSuccess: (d: any) => {
      purchaseKey.reset();
      toast.success(`Policy ${d.policyId} activated`);
      setPurchaseDialog(null);
      refetchPolicies();
    },
    onError: (e: any) => { purchaseKey.reset(); toast.error(e.message); },
  });

  const claimMutation = trpc.consumerFinancial.insurance.fileClaim.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Claim ${d.claimId} filed successfully`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: claimsData } = trpc.consumerFinancial.insurance.getClaims.useQuery();

  const policyList = (policyData as any)?.policies ?? [];
  const claimList = (claimsData as any)?.claims ?? [];

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Umbrella className="w-5 h-5 text-blue-500" /> Insurance
      </h1>

      {/* Active Policies */}
      {policyList.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" /> My Policies
          </CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {policyList.map((p: any) => {
                const product = PRODUCTS.find(pr => pr.id === p.productId);
                return (
                  <div key={p.id} className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{product?.name ?? p.productId}</p>
                      <p className="text-xs text-muted-foreground">
                        Expires: {p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setClaimDialog(p)}
                      >
                        File Claim
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Products */}
      <div>
        <h2 className="text-base font-semibold mb-3">Available Plans</h2>
        <div className="space-y-3">
          {PRODUCTS.map((product) => {
            const hasPolicy = policyList.some((p: any) => p.productId === product.id && p.status === "active");
            return (
              <Card key={product.id} className="hover:border-primary transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{product.icon}</span>
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.provider}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Coverage: {formatKobo(product.coverageKobo)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{formatKobo(product.premiumKoboPerMonth)}</p>
                      <p className="text-xs text-muted-foreground">/month</p>
                      {hasPolicy ? (
                        <Badge variant="default" className="mt-2 text-xs">Active</Badge>
                      ) : (
                        <Button size="sm" className="mt-2" onClick={() => setPurchaseDialog(product)}>
                          <Plus className="w-3 h-3 mr-1" /> Buy
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Claims History */}
      {claimList.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" /> Claims History
          </CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {claimList.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium font-mono">{c.claimNumber}</p>
                    <p className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{formatKobo(c.claimAmountKobo ?? 0)}</p>
                    <Badge variant={c.status === "approved" ? "default" : c.status === "rejected" ? "destructive" : "secondary"} className="text-xs">
                      {c.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Purchase Dialog */}
      <Dialog open={!!purchaseDialog} onOpenChange={(o) => !o && setPurchaseDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Purchase {purchaseDialog?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Provider</span>
                <span>{purchaseDialog?.provider}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monthly Premium</span>
                <span className="font-bold">{formatKobo(purchaseDialog?.premiumKoboPerMonth ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Coverage</span>
                <span>{formatKobo(purchaseDialog?.coverageKobo ?? 0)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              By purchasing, you agree to the terms and conditions of {purchaseDialog?.provider}.
              Premium will be deducted monthly from your wallet.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurchaseDialog(null)}>Cancel</Button>
            <Button
              disabled={purchaseMutation.isPending}
              onClick={() => purchaseDialog && purchaseMutation.mutate({ productId: purchaseDialog.id, coverageMonths: 12, idempotencyKey: purchaseKey.getKey() })}
            >
              {purchaseMutation.isPending ? "Processing..." : "Confirm Purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Claim Dialog */}
      <Dialog open={!!claimDialog} onOpenChange={(o) => !o && setClaimDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>File Insurance Claim</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Policy: {claimDialog?.id}</p>
            <div>
              <label className="text-sm font-medium">Claim Amount (₦)</label>
              <Input type="number" placeholder="Amount" value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea placeholder="Describe the incident..." value={claimDesc} onChange={(e) => setClaimDesc(e.target.value)} rows={3} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClaimDialog(null)}>Cancel</Button>
            <Button
              disabled={!claimAmount || !claimDesc || claimMutation.isPending}
              onClick={() => claimDialog && claimMutation.mutate({
                policyId: claimDialog.id,
                claimAmountKobo: Math.round(Number(claimAmount) * 100),
                description: claimDesc,
              })}
            >
              {claimMutation.isPending ? "Submitting..." : "Submit Claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
