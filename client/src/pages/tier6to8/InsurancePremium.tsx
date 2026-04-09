import { useState } from "react";
import { trpc3 } from "@/lib/trpc3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, Plus, CreditCard, FileText } from "lucide-react";

export default function InsurancePremium() {
  const [enrollForm, setEnrollForm] = useState({ customerId: "", productId: "", phoneNumber: "", idNumber: "" });
  const { data: products } = trpc3.insurance.getProducts.useQuery();
  const { data: policies } = trpc3.insurance.getPolicies.useQuery({ status: "all" });
  const enrollMutation = trpc3.insurance.enrollCustomer.useMutation({
    onSuccess: () => { toast.success("Customer enrolled successfully"); setEnrollForm({ customerId: "", productId: "", phoneNumber: "", idNumber: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const collectMutation = trpc3.insurance.collectPremium.useMutation({
    onSuccess: () => toast.success("Premium collected"),
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">Insurance Premium Collection</h1>
          <p className="text-muted-foreground">Enroll customers and collect insurance premiums</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Active Policies</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{policies?.policies.filter(p => p.status === "active").length ?? 0}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Products Available</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{products?.products.length ?? 0}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Total Policies</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{policies?.policies.length ?? 0}</p></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="w-4 h-4" />Enroll Customer</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Customer ID" value={enrollForm.customerId} onChange={e => setEnrollForm(f => ({ ...f, customerId: e.target.value }))} />
            <Select value={enrollForm.productId} onValueChange={v => setEnrollForm(f => ({ ...f, productId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select insurance product" /></SelectTrigger>
              <SelectContent>
                {products?.products.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name} — ₦{(p.premiumKobo / 100).toLocaleString()}/mo</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Phone Number" value={enrollForm.phoneNumber} onChange={e => setEnrollForm(f => ({ ...f, phoneNumber: e.target.value }))} />
            <Input placeholder="ID Number (BVN/NIN)" value={enrollForm.idNumber} onChange={e => setEnrollForm(f => ({ ...f, idNumber: e.target.value }))} />
            <Button className="w-full" onClick={() => enrollMutation.mutate(enrollForm)} disabled={enrollMutation.isPending}>
              {enrollMutation.isPending ? "Enrolling..." : "Enroll Customer"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-4 h-4" />Active Policies</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {policies?.policies.map(policy => (
                <div key={policy.policyId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{policy.productName}</p>
                    <p className="text-xs text-muted-foreground">Customer: {policy.customerId}</p>
                    <p className="text-xs text-muted-foreground">Expires: {new Date(policy.expiryDate).toLocaleDateString()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={policy.status === "active" ? "default" : "secondary"}>{policy.status}</Badge>
                    <Button size="sm" variant="outline" onClick={() => collectMutation.mutate({ policyId: policy.policyId, paymentMethod: "wallet" })}>
                      <CreditCard className="w-3 h-3 mr-1" />Collect
                    </Button>
                  </div>
                </div>
              ))}
              {!policies?.policies.length && <p className="text-center text-muted-foreground py-8">No policies yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
