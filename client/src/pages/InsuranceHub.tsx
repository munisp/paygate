// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Plus, CheckCircle2, Clock, AlertTriangle, FileText, Umbrella, Heart, Smartphone, Plane, Building2 } from "lucide-react";
import { toast } from "sonner";

const PRODUCT_ICONS: Record<string, any> = {
  life: Heart, health: Heart, device: Smartphone, travel: Plane, business: Building2,
};

const STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  active: { badge: "bg-emerald-100 text-emerald-700", label: "Active" },
  expired: { badge: "bg-slate-100 text-slate-600", label: "Expired" },
  cancelled: { badge: "bg-red-100 text-red-700", label: "Cancelled" },
  pending: { badge: "bg-amber-100 text-amber-700", label: "Pending" },
};

const CLAIM_STATUS: Record<string, { badge: string; label: string }> = {
  submitted: { badge: "bg-blue-100 text-blue-700", label: "Submitted" },
  under_review: { badge: "bg-amber-100 text-amber-700", label: "Under Review" },
  approved: { badge: "bg-emerald-100 text-emerald-700", label: "Approved" },
  rejected: { badge: "bg-red-100 text-red-700", label: "Rejected" },
  paid: { badge: "bg-purple-100 text-purple-700", label: "Paid" },
};

// MOCK data removed — now fetched from insuranceMw.listPolicies and insuranceMw.listClaims

export default function InsuranceHub() {
  const [tab, setTab] = useState("products");
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedPolicy, setSelectedPolicy] = useState<any>(null);
  const [coverageAmount, setCoverageAmount] = useState("1000000");
  const [claimType, setClaimType] = useState("");
  const [claimAmount, setClaimAmount] = useState("");
  const [claimDesc, setClaimDesc] = useState("");

  const { data: products } = trpc.insuranceMw.products.useQuery();
  const { data: policiesData, isLoading: policiesLoading, refetch: refetchPolicies } = trpc.insuranceMw.listPolicies.useQuery();
  const { data: claimsData, isLoading: claimsLoading } = trpc.insuranceMw.listClaims.useQuery();
  const policies = policiesData ?? [];
  const claims = claimsData ?? [];
  const purchaseMutation = trpc.insuranceMw.purchase.useMutation({
    onSuccess: (data) => {
      toast.success(`Policy ${data.policyId} activated!`);
      setPurchaseOpen(false);
      refetchPolicies();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const claimMutation = trpc.insuranceMw.fileClaim.useMutation({
    onSuccess: (data) => {
      toast.success(`Claim ${data.claimId} submitted. Estimated payout: ₦${(data.estimatedPayout ?? 0).toLocaleString()}`);
      setClaimOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handlePurchase = () => {
    if (!selectedProduct) return;
    const coverage = parseFloat(coverageAmount.replace(/,/g, ""));
    if (isNaN(coverage) || coverage < 100_000) { toast.error("Minimum coverage is ₦100,000"); return; }
    purchaseMutation.mutate({ productId: selectedProduct.id, coverageAmountKobo: coverage * 100 });
  };

  const handleClaim = () => {
    if (!selectedPolicy) return;
    if (!claimType) { toast.error("Select claim type"); return; }
    const amount = parseFloat(claimAmount.replace(/,/g, ""));
    if (isNaN(amount) || amount < 1_000) { toast.error("Minimum claim is ₦1,000"); return; }
    claimMutation.mutate({
      policyId: selectedPolicy.id,
      claimType,
      amountKobo: amount * 100,
      description: claimDesc,
      documents: [],
    });
  };

  const displayProducts = products ?? [
    { id: "life_term", name: "Term Life Insurance", category: "life", description: "Comprehensive life cover for your family", premiumNGN: 5_000, coverageNGN: 5_000_000, duration: "1 year" },
    { id: "health_basic", name: "Health Insurance", category: "health", description: "Basic health cover including hospitalisation", premiumNGN: 8_000, coverageNGN: 2_000_000, duration: "1 year" },
    { id: "device_cover", name: "Device Insurance", category: "device", description: "Protect your phone and electronics", premiumNGN: 2_500, coverageNGN: 300_000, duration: "1 year" },
    { id: "travel_cover", name: "Travel Insurance", category: "travel", description: "Domestic and international travel cover", premiumNGN: 3_000, coverageNGN: 1_000_000, duration: "7 days" },
    { id: "business_cover", name: "Business Insurance", category: "business", description: "Protect your business assets and operations", premiumNGN: 15_000, coverageNGN: 10_000_000, duration: "1 year" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-600" />
            Insurance Hub
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage policies, file claims, and track coverage</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Policies", value: "3", icon: Shield, color: "text-emerald-600" },
          { label: "Total Coverage", value: "₦7.3M", icon: Umbrella, color: "text-blue-600" },
          { label: "Monthly Premium", value: "₦15,500", icon: FileText, color: "text-purple-600" },
          { label: "Open Claims", value: "1", icon: AlertTriangle, color: "text-amber-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="policies">My Policies</TabsTrigger>
          <TabsTrigger value="claims">Claims</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayProducts.map((p: any) => {
              const Icon = PRODUCT_ICONS[p.category] ?? Shield;
              return (
                <Card key={p.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-emerald-50">
                        <Icon className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{p.name}</h3>
                        <p className="text-xs text-muted-foreground">{p.description}</p>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Premium</span>
                        <span className="font-semibold text-emerald-600">₦{(p.premiumNGN ?? p.premium ?? 0).toLocaleString()}/mo</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Coverage</span>
                        <span className="font-semibold">₦{(p.coverageNGN ?? p.coverage ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Duration</span>
                        <span>{p.duration}</span>
                      </div>
                    </div>
                    <Button size="sm" className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => { setSelectedProduct(p); setPurchaseOpen(true); }}>
                      <Plus className="w-3 h-3 mr-1" /> Get Covered
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="policies">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Policy ID</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Premium</TableHead>
                    <TableHead className="text-right">Sum Assured</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policiesLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading policies...</TableCell></TableRow>
                  ) : policies.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No policies yet. Purchase a product to get started.</TableCell></TableRow>
                  ) : policies.map((p: any) => {
                    const st = STATUS_STYLES[p.status] ?? STATUS_STYLES.pending;
                    const Icon = PRODUCT_ICONS[p.productId?.split('_')[1] ?? p.category ?? 'health'] ?? Shield;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.id}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-emerald-600" />
                            <span className="text-sm font-medium">{p.name ?? p.product}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">₦{((p.premiumKoboPerMonth ?? p.premium ?? 0) / 100).toLocaleString()}/mo</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600">₦{((p.coverageKobo ?? p.sumAssured ?? 0) / 100).toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.endDate}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.badge}`}>{st.label}</span>
                        </TableCell>
                        <TableCell>
                          {p.status === "active" && (
                            <Button size="sm" variant="outline" className="text-xs"
                              onClick={() => { setSelectedPolicy(p); setClaimOpen(true); setTab("claims"); }}>
                              File Claim
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="claims">
          <div className="flex justify-end mb-4">
            <Button size="sm" onClick={() => setClaimOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white">
              <Plus className="w-4 h-4 mr-1" /> New Claim
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim ID</TableHead>
                    <TableHead>Policy</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claimsLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading claims...</TableCell></TableRow>
                  ) : claims.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No claims filed yet.</TableCell></TableRow>
                  ) : claims.map((c: any) => {
                    const st = CLAIM_STATUS[c.status] ?? CLAIM_STATUS.submitted;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.id}</TableCell>
                        <TableCell className="font-mono text-xs">{c.policyId}</TableCell>
                        <TableCell className="text-sm">{c.claimType ?? c.type}</TableCell>
                        <TableCell className="text-right font-semibold">₦{((c.amountKobo ?? c.amount ?? 0) / 100).toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{c.filedAt ?? c.date}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.badge}`}>{st.label}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Purchase Dialog */}
      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purchase {selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedProduct && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm">
                <p className="font-semibold text-emerald-700">{selectedProduct.name}</p>
                <p className="text-muted-foreground text-xs mt-1">{selectedProduct.description}</p>
                <p className="mt-2">Premium: <strong>₦{(selectedProduct.premiumNGN ?? selectedProduct.premium ?? 0).toLocaleString()}/month</strong></p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Coverage Amount (₦)</Label>
              <Input value={coverageAmount} onChange={(e) => setCoverageAmount(e.target.value)} placeholder="1000000" />
              <p className="text-xs text-muted-foreground">Minimum coverage: ₦100,000</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurchaseOpen(false)}>Cancel</Button>
            <Button onClick={handlePurchase} disabled={purchaseMutation.isLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {purchaseMutation.isLoading ? "Processing..." : "Activate Policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Claim Dialog */}
      <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>File Insurance Claim</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Policy</Label>
              <Select value={selectedPolicy?.id ?? ""} onValueChange={(v) => setSelectedPolicy(policies.find((p: any) => p.id === v))}>
                <SelectTrigger><SelectValue placeholder="Select policy" /></SelectTrigger>
                <SelectContent>
                  {policies.filter((p: any) => p.status === "active").map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.id} — {p.name ?? p.product}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Claim Type</Label>
              <Select value={claimType} onValueChange={setClaimType}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {["Medical Expense", "Device Damage", "Travel Delay", "Death Benefit", "Disability", "Property Damage"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Claim Amount (₦)</Label>
              <Input value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)} placeholder="50000" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={claimDesc} onChange={(e) => setClaimDesc(e.target.value)} placeholder="Describe the incident..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClaimOpen(false)}>Cancel</Button>
            <Button onClick={handleClaim} disabled={claimMutation.isLoading} className="bg-amber-600 hover:bg-amber-700 text-white">
              {claimMutation.isLoading ? "Submitting..." : "Submit Claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
