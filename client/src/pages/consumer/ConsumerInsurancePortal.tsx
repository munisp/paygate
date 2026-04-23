// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, FileText, AlertCircle, CheckCircle } from "lucide-react";

export default function ConsumerInsurancePortal() {
  const [typeFilter, setTypeFilter] = useState<"all" | "health" | "life" | "device" | "travel">("all");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [claimPolicyId, setClaimPolicyId] = useState<string | null>(null);
  const [claimDescription, setClaimDescription] = useState("");
  const [claimAmount, setClaimAmount] = useState("");

  const { data: products, isLoading } = trpc.newFeatures.consumerInsurance.listProducts.useQuery({ type: typeFilter });
  const { data: policies, refetch: refetchPolicies } = trpc.newFeatures.consumerInsurance.getActivePolicies.useQuery();
  const { data: claims, refetch: refetchClaims } = trpc.newFeatures.consumerInsurance.getClaims.useQuery();

  const purchaseMutation = trpc.newFeatures.consumerInsurance.purchasePolicy.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Policy ${d.policyNumber} purchased`);
      setSelectedProduct(null);
      refetchPolicies();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const claimMutation = trpc.newFeatures.consumerInsurance.fileClaim.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Claim ${d.claimNumber} filed`);
      setClaimPolicyId(null);
      setClaimDescription("");
      setClaimAmount("");
      refetchClaims();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  const typeColors: Record<string, string> = {
    health: "bg-green-100 text-green-700",
    life: "bg-blue-100 text-blue-700",
    device: "bg-purple-100 text-purple-700",
    travel: "bg-cyan-100 text-cyan-700",
    shop: "bg-orange-100 text-orange-700",
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-green-600" />
        <div>
          <h1 className="text-2xl font-bold">Insurance Portal</h1>
          <p className="text-muted-foreground">Protect yourself with affordable insurance products</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {["all", "health", "life", "device", "travel"].map((t) => (
          <Button
            key={t}
            variant={typeFilter === t ? "default" : "outline"}
            size="sm"
            onClick={() => setTypeFilter(t as any)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>

      {/* Products */}
      <Card>
        <CardHeader>
          <CardTitle>Available Products</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-4">Loading products...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(products?.products ?? []).map((p: any) => (
                <div
                  key={p.productId}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedProduct === p.productId ? "border-primary bg-primary/5" : "hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedProduct(p.productId === selectedProduct ? null : p.productId)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <Badge className={`text-xs mt-1 ${typeColors[p.type] ?? ""}`}>{p.type}</Badge>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatKobo(p.premiumKobo ?? 0)}</div>
                      <div className="text-xs text-muted-foreground">per {p.duration ?? "month"}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Coverage: <strong>{formatKobo(p.coverageKobo ?? 0)}</strong>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{p.insurer}</div>

                  {selectedProduct === p.productId && (
                    <div className="mt-3 pt-3 border-t">
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          purchaseMutation.mutate({ productId: p.productId });
                        }}
                        disabled={purchaseMutation.isPending}
                      >
                        {purchaseMutation.isPending ? "Purchasing..." : "Purchase Policy"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {!products?.products?.length && (
                <p className="text-muted-foreground col-span-2 text-center py-4">No products available</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Policies */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" /> My Policies
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!policies?.policies?.length ? (
            <p className="text-muted-foreground text-center py-4">No active policies</p>
          ) : (
            <div className="space-y-3">
              {policies.policies.map((pol: any) => (
                <div key={pol.policyId} className="p-3 rounded-lg border">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{pol.productName}</div>
                      <div className="text-xs text-muted-foreground">Policy #: {pol.policyNumber}</div>
                    </div>
                    <Badge variant={pol.status === "active" ? "default" : "secondary"}>{pol.status}</Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>Premium: {formatKobo(pol.premiumKobo ?? 0)}</div>
                    <div>Coverage: {formatKobo(pol.coverageKobo ?? 0)}</div>
                    <div>Expires: {pol.endDate ? new Date(pol.endDate).toLocaleDateString() : "—"}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => setClaimPolicyId(pol.policyId === claimPolicyId ? null : pol.policyId)}
                  >
                    <AlertCircle className="h-3 w-3 mr-1" /> File Claim
                  </Button>

                  {claimPolicyId === pol.policyId && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                      <div>
                        <Label>Claim Description</Label>
                        <Input
                          placeholder="Describe the incident..."
                          value={claimDescription}
                          onChange={(e) => setClaimDescription(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Claim Amount (₦)</Label>
                        <Input
                          type="number"
                          placeholder="e.g. 50000"
                          value={claimAmount}
                          onChange={(e) => setClaimAmount(e.target.value)}
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => claimMutation.mutate({
                          policyId: pol.policyId,
                          description: claimDescription,
                          claimAmountKobo: parseFloat(claimAmount) * 100,
                        })}
                        disabled={!claimDescription || !claimAmount || claimMutation.isPending}
                      >
                        {claimMutation.isPending ? "Filing..." : "Submit Claim"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Claims History */}
      {claims?.claims?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Claims History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {claims.claims.map((c: any, i: number) => (
                <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                  <div>
                    <div className="font-medium">Claim #{c.claimNumber}</div>
                    <div className="text-sm text-muted-foreground">{c.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatKobo(c.claimAmountKobo ?? 0)}</div>
                    <Badge variant={c.status === "approved" ? "default" : c.status === "rejected" ? "destructive" : "secondary"}>
                      {c.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
