import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, Plus, CheckCircle, Clock, AlertTriangle } from "lucide-react";

const PRODUCTS = [
  { id: "device_insurance", name: "Device Insurance", description: "Protect your phone and electronics", premiumKobo: 50000, coverageKobo: 15_000_000, duration: 30 },
  { id: "health_insurance", name: "Health Insurance", description: "Basic health cover for you and family", premiumKobo: 200000, coverageKobo: 50_000_000, duration: 30 },
  { id: "life_insurance", name: "Life Insurance", description: "Term life cover for peace of mind", premiumKobo: 150000, coverageKobo: 100_000_000, duration: 30 },
  { id: "travel_insurance", name: "Travel Insurance", description: "Cover for domestic and international travel", premiumKobo: 75000, coverageKobo: 20_000_000, duration: 7 },
  { id: "business_insurance", name: "Business Insurance", description: "Protect your business assets", premiumKobo: 500000, coverageKobo: 200_000_000, duration: 30 },
];

export default function InsurancePage() {
  const [showBuy, setShowBuy] = useState<typeof PRODUCTS[0] | null>(null);
  const [beneficiary, setBeneficiary] = useState({ name: "", phone: "", relationship: "spouse" });

  const { data, isLoading, refetch } = trpc.consumerFinancial.insurancePolicies.useQuery();

  const buyPolicy = trpc.consumerFinancial.buyInsurance.useMutation({
    onSuccess: () => { toast.success("Insurance policy activated!"); refetch(); setShowBuy(null); },
    onError: (e) => toast.error(e.message),
  });

  const formatNaira = (kobo: number) => `₦${(kobo / 100).toLocaleString()}`;

  const statusIcon = (s: string) => {
    if (s === "active") return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (s === "expired") return <AlertTriangle className="w-4 h-4 text-orange-500" />;
    return <Clock className="w-4 h-4 text-yellow-500" />;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 text-green-600" />
          Micro-Insurance
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Affordable insurance products starting from ₦500/month
        </p>
      </div>

      {/* Available Products */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Available Products</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRODUCTS.map(product => (
            <Card key={product.id} className="hover:border-primary transition-colors">
              <CardContent className="pt-4 space-y-3">
                <div>
                  <div className="font-semibold">{product.name}</div>
                  <div className="text-sm text-muted-foreground">{product.description}</div>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Premium</span>
                    <span className="font-semibold text-primary">{formatNaira(product.premiumKobo)}/{product.duration === 30 ? "month" : "trip"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Coverage</span>
                    <span className="font-semibold">{formatNaira(product.coverageKobo)}</span>
                  </div>
                </div>
                <Button className="w-full" size="sm" onClick={() => setShowBuy(product)}>
                  <Plus className="w-4 h-4 mr-2" /> Buy Policy
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* My Policies */}
      <div>
        <h2 className="text-lg font-semibold mb-4">My Policies</h2>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading policies...</div>
        ) : (data?.policies ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No active policies. Buy your first policy above.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(data?.policies ?? []).map((policy: any) => (
              <Card key={policy.id}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {statusIcon(policy.status)}
                      <span className="font-semibold">{policy.product_type}</span>
                    </div>
                    <Badge variant={policy.status === "active" ? "default" : "secondary"}>{policy.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Coverage</div>
                      <div className="font-semibold">{formatNaira(policy.coverage_amount_kobo)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Premium</div>
                      <div className="font-semibold">{formatNaira(policy.premium_kobo)}/mo</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Expires</div>
                      <div className="font-semibold">{new Date(policy.expires_at).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Policy ID</div>
                      <div className="font-mono text-xs truncate">{policy.id.slice(0, 12)}...</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Buy Dialog */}
      <Dialog open={!!showBuy} onOpenChange={() => setShowBuy(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buy {showBuy?.name}</DialogTitle>
          </DialogHeader>
          {showBuy && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Premium</span>
                  <span className="font-bold">{formatNaira(showBuy.premiumKobo)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Coverage</span>
                  <span className="font-bold">{formatNaira(showBuy.coverageKobo)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-bold">{showBuy.duration} days</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Beneficiary Name</Label>
                <Input value={beneficiary.name} onChange={e => setBeneficiary(b => ({ ...b, name: e.target.value }))} placeholder="Full name" />
              </div>
              <div className="space-y-2">
                <Label>Beneficiary Phone</Label>
                <Input value={beneficiary.phone} onChange={e => setBeneficiary(b => ({ ...b, phone: e.target.value }))} placeholder="+234..." />
              </div>
              <div className="space-y-2">
                <Label>Relationship</Label>
                <Select value={beneficiary.relationship} onValueChange={v => setBeneficiary(b => ({ ...b, relationship: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["spouse", "parent", "child", "sibling", "friend", "self"].map(r => (
                      <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBuy(null)}>Cancel</Button>
            <Button
              disabled={!beneficiary.name || !beneficiary.phone || buyPolicy.isPending}
              onClick={() => showBuy && buyPolicy.mutate({
                productType: showBuy.id,
                premiumKobo: showBuy.premiumKobo,
                coverageKobo: showBuy.coverageKobo,
                durationDays: showBuy.duration,
                beneficiaryName: beneficiary.name,
                beneficiaryPhone: beneficiary.phone,
                beneficiaryRelationship: beneficiary.relationship,
              })}
            >
              Confirm Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
