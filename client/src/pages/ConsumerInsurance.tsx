import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function ConsumerInsurance() {
  const [typeFilter, setTypeFilter] = useState<"health" | "life" | "shop" | "device" | "travel" | "all">("all");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [claimPolicyId, setClaimPolicyId] = useState<string | null>(null);

  const {isLoading, data: products} = trpc.newFeatures.consumerInsurance.listProducts.useQuery({ type: typeFilter });
  const { data: policies } = trpc.newFeatures.consumerInsurance.getActivePolicies.useQuery();
  const { data: claims } = trpc.newFeatures.consumerInsurance.getClaims.useQuery();

  const purchaseMutation = trpc.newFeatures.consumerInsurance.purchasePolicy.useMutation({
    onSuccess: (d: any) => toast.success(`Policy ${d.policyNumber} purchased`),
    onError: (e: any) => toast.error(e.message),
  });
  const claimMutation = trpc.newFeatures.consumerInsurance.fileClaim.useMutation({
    onSuccess: (d: any) => toast.success(`Claim ${d.claimNumber} filed`),
    onError: (e: any) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const typeColor: Record<string, string> = { health: "bg-green-100 text-green-700", life: "bg-blue-100 text-blue-700", shop: "bg-orange-100 text-orange-700", device: "bg-purple-100 text-purple-700", travel: "bg-cyan-100 text-cyan-700" };

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Insurance</h1>

      {/* Type Filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", "health", "life", "shop", "device", "travel"].map(t => (
          <Button key={t} variant={typeFilter === t ? "default" : "outline"} size="sm" onClick={() => setTypeFilter(t as any)} className="capitalize">{t}</Button>
        ))}
      </div>

      {/* Products */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products?.products?.map(p => (
          <Card key={p.productId} className={`cursor-pointer transition-all ${selectedProduct === p.productId ? "ring-2 ring-primary" : ""}`} onClick={() => setSelectedProduct(p.productId)}>
            <CardContent className="pt-4 space-y-2">
              <div className="flex justify-between items-start">
                <p className="font-semibold text-sm">{p.name}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${typeColor[p.type] ?? "bg-gray-100 text-gray-700"}`}>{p.type}</span>
              </div>
              <p className="text-xs text-muted-foreground">{p.insurer}</p>
              <div className="flex justify-between text-xs">
                <span>Premium: <strong>{formatKobo(p.premiumKobo)}/{p.duration}</strong></span>
                <span>Cover: <strong>{formatKobo(p.coverageKobo)}</strong></span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {p.features?.slice(0, 3).map((f: any, i: any) => <li key={i}>• {f}</li>)}
              </ul>
              {selectedProduct === p.productId && (
                <Button className="w-full mt-2" size="sm" disabled={purchaseMutation.isPending}
                  onClick={(e: any) => { e.stopPropagation(); purchaseMutation.mutate({ productId: p.productId, coverageDetails: {}, paymentSource: "wallet" }); }}>
                  {purchaseMutation.isPending ? "Purchasing..." : "Buy Policy"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Active Policies */}
      <Card>
        <CardHeader><CardTitle>My Policies</CardTitle></CardHeader>
        <CardContent>
          {!policies?.policies?.length ? <p className="text-muted-foreground text-sm">No active policies</p> :
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2">Policy</th><th className="text-left py-2">Type</th><th className="text-right py-2">Premium</th><th className="text-right py-2">Expires</th><th className="text-right py-2">Status</th><th className="text-right py-2">Action</th></tr></thead>
              <tbody>
                {policies.policies.map(p => (
                  <tr key={p.policyId} className="border-b hover:bg-muted/30">
                    <td className="py-2">{p.policyNumber}</td>
                    <td className="capitalize">{p.type}</td>
                    <td className="text-right">{formatKobo(p.premiumKobo)}</td>
                    <td className="text-right">{new Date(p.endDate).toLocaleDateString()}</td>
                    <td className="text-right"><Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge></td>
                    <td className="text-right"><Button size="sm" variant="outline" onClick={() => setClaimPolicyId(p.policyId)}>File Claim</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </CardContent>
      </Card>

      {/* Claims */}
      <Card>
        <CardHeader><CardTitle>Claims History</CardTitle></CardHeader>
        <CardContent>
          {!claims?.claims?.length ? <p className="text-muted-foreground text-sm">No claims filed</p> :
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2">Claim #</th><th className="text-left py-2">Type</th><th className="text-right py-2">Amount</th><th className="text-right py-2">Filed</th><th className="text-right py-2">Status</th></tr></thead>
              <tbody>
                {claims.claims.map(c => (
                  <tr key={c.claimId} className="border-b hover:bg-muted/30">
                    <td className="py-2">{c.claimNumber}</td>
                    <td>{c.type}</td>
                    <td className="text-right">{formatKobo(c.amountKobo)}</td>
                    <td className="text-right">{new Date(c.filedAt).toLocaleDateString()}</td>
                    <td className="text-right"><Badge variant={c.status === "approved" ? "default" : c.status === "rejected" ? "destructive" : "secondary"}>{c.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </CardContent>
      </Card>

      {/* File Claim Modal */}
      {claimPolicyId && (
        <Card className="border-primary">
          <CardHeader><CardTitle className="text-base">File a Claim</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Policy: {claimPolicyId}</p>
            <Button className="w-full" disabled={claimMutation.isPending}
              onClick={() => { claimMutation.mutate({ policyId: claimPolicyId, claimType: "general", description: "Claim filed via portal", amountKobo: 100000 }); setClaimPolicyId(null); }}>
              {claimMutation.isPending ? "Filing..." : "Submit Claim"}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setClaimPolicyId(null)}>Cancel</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
