import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CreditCard, TrendingUp, FileText, CheckCircle, AlertCircle, Zap } from "lucide-react";

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-700",
  growth: "bg-blue-100 text-blue-700",
  scale: "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
};

const PLAN_PRICES: Record<string, { price: string; apiCalls: string; txLimit: string }> = {
  starter: { price: "$49/mo", apiCalls: "50K API calls", txLimit: "500 transactions" },
  growth: { price: "$199/mo", apiCalls: "500K API calls", txLimit: "5,000 transactions" },
  scale: { price: "$499/mo", apiCalls: "2M API calls", txLimit: "20,000 transactions" },
  enterprise: { price: "Custom", apiCalls: "Unlimited", txLimit: "Unlimited" },
};

export default function TenantStripeBilling() {
  const tenantId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"; // demo tenant
  const [showUpgrade, setShowUpgrade] = useState(false);

  const { data: customer, isLoading } = trpc.wave30.tenantStripeBilling.getCustomer.useQuery({ tenantId });
  const { data: invoices } = trpc.wave30.tenantStripeBilling.getInvoiceHistory.useQuery({ tenantId, limit: 12 });
  const { data: pricing } = trpc.wave30.tenantStripeBilling.getPlanPricing.useQuery();

  const generateInvoice = trpc.wave30.tenantStripeBilling.generateMonthlyInvoice.useMutation({
    onSuccess: (data) => {
      toast.success(`Invoice generated: $${data.totalAmount.toFixed(2)}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const markPaid = trpc.wave30.tenantStripeBilling.markInvoicePaid.useMutation({
    onSuccess: () => toast.success("Invoice marked as paid"),
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
    </div>
  );

  const currentPlan = customer?.plan ?? "starter";
  const planInfo = PLAN_PRICES[currentPlan];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing & Subscription</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your plan, invoices, and payment methods</p>
        </div>
        <Dialog open={showUpgrade} onOpenChange={setShowUpgrade}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Zap className="w-4 h-4 mr-2" /> Upgrade Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Choose Your Plan</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 mt-4">
              {Object.entries(PLAN_PRICES).map(([plan, info]) => (
                <div key={plan} className={`p-4 rounded-lg border-2 ${plan === currentPlan ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold capitalize text-gray-900">{plan}</h3>
                    {plan === currentPlan && <Badge className="bg-indigo-100 text-indigo-700">Current</Badge>}
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mb-3">{info.price}</p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>✓ {info.apiCalls}</li>
                    <li>✓ {info.txLimit}</li>
                    <li>✓ Sub-domain routing</li>
                    <li>✓ SSO integration</li>
                    {(plan === 'scale' || plan === 'enterprise') && <li>✓ Dedicated support</li>}
                    {plan === 'enterprise' && <li>✓ Custom SLA</li>}
                  </ul>
                  {plan !== currentPlan && (
                    <Button className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white" size="sm"
                      onClick={() => { toast.success(`Upgrade to ${plan} plan initiated`); setShowUpgrade(false); }}>
                      Upgrade to {plan}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Current Plan Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-gray-700">Current Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className={`px-4 py-2 rounded-lg font-semibold capitalize text-lg ${PLAN_COLORS[currentPlan]}`}>
                {currentPlan}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{planInfo.price}</p>
                <p className="text-sm text-gray-500">{planInfo.apiCalls} · {planInfo.txLimit}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Billing Email</p>
                <p className="font-medium text-gray-900">{customer?.billing_email ?? "—"}</p>
              </div>
              <div>
                <p className="text-gray-500">Next Invoice Date</p>
                <p className="font-medium text-gray-900">
                  {customer?.next_invoice_date ? new Date(customer.next_invoice_date).toLocaleDateString() : "—"}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Stripe Customer ID</p>
                <p className="font-mono text-xs text-gray-700">{customer?.stripe_customer_id ?? "—"}</p>
              </div>
              <div>
                <p className="text-gray-500">Subscription ID</p>
                <p className="font-mono text-xs text-gray-700">{customer?.stripe_subscription_id ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-gray-700">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" size="sm"
              onClick={() => generateInvoice.mutate({ tenantId, year: new Date().getFullYear(), month: new Date().getMonth() + 1 })}>
              <FileText className="w-4 h-4 mr-2" /> Generate Invoice
            </Button>
            <Button variant="outline" className="w-full justify-start" size="sm"
              onClick={() => toast.info("Redirecting to Stripe portal...")}>
              <CreditCard className="w-4 h-4 mr-2" /> Update Payment Method
            </Button>
            <Button variant="outline" className="w-full justify-start" size="sm"
              onClick={() => toast.info("Usage report downloaded")}>
              <TrendingUp className="w-4 h-4 mr-2" /> Download Usage Report
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Invoice History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-gray-700">Invoice History</CardTitle>
        </CardHeader>
        <CardContent>
          {!invoices?.length ? (
            <div className="text-center py-8 text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No invoices yet. Generate your first invoice above.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead>Overage</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.id}</TableCell>
                    <TableCell>{inv.period_year}/{String(inv.period_month).padStart(2,'0')}</TableCell>
                    <TableCell><span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${PLAN_COLORS[inv.plan]}`}>{inv.plan}</span></TableCell>
                    <TableCell>${parseFloat(inv.base_amount ?? 0).toFixed(2)}</TableCell>
                    <TableCell>${parseFloat(inv.overage_amount ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="font-semibold">${parseFloat(inv.total_amount ?? 0).toFixed(2)}</TableCell>
                    <TableCell>
                      {inv.status === 'paid' ? (
                        <Badge className="bg-green-100 text-green-700"><CheckCircle className="w-3 h-3 mr-1" />Paid</Badge>
                      ) : (
                        <Badge className="bg-yellow-100 text-yellow-700"><AlertCircle className="w-3 h-3 mr-1" />Unpaid</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {inv.status !== 'paid' && (
                        <Button size="sm" variant="outline" className="text-xs"
                          onClick={() => markPaid.mutate({ invoiceId: inv.id })}>
                          Mark Paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Plan Pricing Table */}
      {pricing && pricing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-gray-700">Plan Limits Reference</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Monthly Price (USD)</TableHead>
                  <TableHead>API Calls Limit</TableHead>
                  <TableHead>Transaction Limit</TableHead>
                  <TableHead>Storage (GB)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricing.map((p: any) => (
                  <TableRow key={p.plan} className={p.plan === currentPlan ? 'bg-indigo-50' : ''}>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${PLAN_COLORS[p.plan]}`}>{p.plan}</span>
                      {p.plan === currentPlan && <span className="ml-2 text-xs text-indigo-600">← Current</span>}
                    </TableCell>
                    <TableCell>${parseFloat(p.monthly_price_usd ?? 0).toFixed(2)}</TableCell>
                    <TableCell>{Number(p.api_calls_limit ?? 0).toLocaleString()}</TableCell>
                    <TableCell>{Number(p.tx_limit ?? 0).toLocaleString()}</TableCell>
                    <TableCell>{p.storage_gb_limit ?? "—"} GB</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
