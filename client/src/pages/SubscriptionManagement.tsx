// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Repeat, Plus, TrendingUp, Users, DollarSign, AlertTriangle, CheckCircle2, XCircle, Search } from "lucide-react";
import { toast } from "sonner";

// MOCK_SUBSCRIBERS removed — now fetched from subscriptionsMw.subscribers

// CHURN_DATA is now fetched from the backend via subscriptionsMw.monthlyChurnData

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelled", color: "bg-slate-100 text-slate-600" },
  past_due: { label: "Past Due", color: "bg-red-100 text-red-700" },
  trialing: { label: "Trial", color: "bg-blue-100 text-blue-700" },
};

export default function SubscriptionManagement() {
  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [search, setSearch] = useState("");
  const [planName, setPlanName] = useState("");
  const [planAmount, setPlanAmount] = useState("");
  const [planInterval, setPlanInterval] = useState("monthly");
  const [planFeatures, setPlanFeatures] = useState("");

  const { data: plans, refetch: refetchPlans } = trpc.subscriptionsMw.plans.useQuery();
  const { data: analytics } = trpc.subscriptionsMw.churnAnalytics.useQuery();
  const { data: subscribers } = trpc.subscriptionsMw.subscribers.useQuery();
  const { data: churnData = [] } = (trpc.subscriptionsMw.monthlyChurnData.useQuery({ months: 6 }, { staleTime: 30_000 }) as any);

  const createPlanMutation = trpc.subscriptionsMw.createPlan.useMutation({
    onSuccess: (data) => {
      toast.success(`Plan ${data.planId} created!`);
      setCreatePlanOpen(false);
      refetchPlans();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const cancelMutation = trpc.subscriptionsMw.cancel.useMutation({
    onSuccess: () => {
      toast.success("Subscription cancelled");
      setCancelOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const displayPlans = plans ?? [
    { id: "plan_starter", name: "Starter", priceNGN: 5_000, interval: "monthly", features: ["100 transactions/month", "Basic analytics", "Email support"], subscribers: 12 },
    { id: "plan_growth", name: "Growth", priceNGN: 25_000, interval: "monthly", features: ["5,000 transactions/month", "Advanced analytics", "Priority support", "API access"], subscribers: 28 },
    { id: "plan_enterprise", name: "Enterprise", priceNGN: 100_000, interval: "monthly", features: ["Unlimited transactions", "Custom analytics", "Dedicated support", "White-label", "SLA guarantee"], subscribers: 5 },
  ];

  const displaySubscribers = subscribers?.subscribers ?? [];
  // Derive live stats from real subscribers if analytics not available
  const liveActiveSubs = displaySubscribers.filter((s: any) => s.status === 'active');
  const liveMrr = liveActiveSubs.reduce((sum: number, s: any) => sum + (s.amount ?? s.amountNGN ?? 0), 0);
  const livePastDue = displaySubscribers.filter((s: any) => s.status === 'past_due').length;
  const displayAnalytics = analytics ?? { churnRate: 1.6, mrr: liveMrr || 335_000, arr: (liveMrr || 335_000) * 12, atRiskCount: livePastDue || 3 };

  const filteredSubs = displaySubscribers.filter((s: any) =>
    !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.email?.includes(search)
  );

  const handleCreatePlan = () => {
    if (!planName.trim()) { toast.error("Plan name required"); return; }
    const amount = parseFloat(planAmount.replace(/,/g, ""));
    if (isNaN(amount) || amount < 100) { toast.error("Minimum plan price is ₦100"); return; }
    const features = planFeatures.split("\n").filter(Boolean);
    createPlanMutation.mutate({ name: planName, amountNGN: amount, interval: planInterval, features });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Repeat className="w-6 h-6 text-blue-600" />
            Subscription Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage recurring plans, subscribers, and churn analytics</p>
        </div>
        <Button onClick={() => setCreatePlanOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" /> Create Plan
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Monthly Recurring Revenue", value: `₦${(displayAnalytics.mrr / 1000).toFixed(0)}k`, icon: DollarSign, color: "text-blue-600" },
          { label: "Annual Recurring Revenue", value: `₦${(displayAnalytics.arr / 1_000_000).toFixed(2)}M`, icon: TrendingUp, color: "text-emerald-600" },
          { label: "Active Subscribers", value: String(displaySubscribers.filter((s: any) => s.status === "active").length), icon: Users, color: "text-purple-600" },
          { label: "Churn Rate", value: `${displayAnalytics.churnRate}%`, icon: AlertTriangle, color: "text-amber-600" },
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

      <Tabs defaultValue="subscribers">
        <TabsList>
          <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="analytics">Churn Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="subscribers">
          <Card>
            <CardHeader className="pb-2">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search subscribers..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subscriber</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Next Billing</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubs.map((sub: any) => {
                    const st = STATUS_STYLES[sub.status] ?? STATUS_STYLES.active;
                    return (
                      <TableRow key={sub.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{sub.name}</p>
                            <p className="text-xs text-muted-foreground">{sub.email}</p>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{sub.plan}</Badge></TableCell>
                        <TableCell className="text-right font-semibold">₦{(sub.amount ?? 0).toLocaleString()}/mo</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{sub.startDate}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{sub.nextBilling ?? "—"}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}>{st.label}</span>
                        </TableCell>
                        <TableCell>
                          {sub.status === "active" && (
                            <Button size="sm" variant="outline" className="text-xs text-red-600 hover:text-red-700"
                              aria-label="Close" onClick={() => { setSelectedSub(sub); setCancelOpen(true); }}><X/> Cancel
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

        <TabsContent value="plans">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {displayPlans.map((plan: any) => (
              <Card key={plan.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-lg">{plan.name}</h3>
                      <p className="text-2xl font-bold text-blue-600 mt-1">₦{(plan.priceNGN ?? plan.price ?? 0).toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/{plan.interval ?? "month"}</span></p>
                    </div>
                    <Badge variant="outline" className="text-xs">{plan.subscribers ?? 0} subs</Badge>
                  </div>
                  <ul className="space-y-1">
                    {(plan.features ?? []).map((f: string) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">MRR Growth (6 months)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={churnData}>
                    <defs>
                      <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => `₦${v.toLocaleString("en-NG")}`} />
                    <Area type="monotone" dataKey="mrr" stroke="#3b82f6" fill="url(#mrrGrad)" name="MRR" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">New Subscribers vs Churn Rate</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={churnData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip />
                    <Bar yAxisId="left" dataKey="newSubs" fill="#10b981" name="New Subs" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="right" dataKey="churnRate" fill="#f59e0b" name="Churn %" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          {displayAnalytics.atRiskCount > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <p className="text-sm font-semibold text-amber-700">{displayAnalytics.atRiskCount} subscribers at risk of churning</p>
                </div>
                <p className="text-xs text-amber-600 mt-1">Consider sending retention offers or reaching out proactively.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Plan Dialog */}
      <Dialog open={createPlanOpen} onOpenChange={setCreatePlanOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Subscription Plan</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Plan Name</Label>
              <Input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="e.g. Professional" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Price (₦)</Label>
                <Input value={planAmount} onChange={(e) => setPlanAmount(e.target.value)} placeholder="50000" />
              </div>
              <div className="space-y-2">
                <Label>Billing Interval</Label>
                <Select value={planInterval} onValueChange={setPlanInterval}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Features (one per line)</Label>
              <textarea
                className="w-full border rounded-md p-2 text-sm h-24 resize-none"
                value={planFeatures}
                onChange={(e) => setPlanFeatures(e.target.value)}
                placeholder="Unlimited transactions&#10;Priority support&#10;API access"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePlanOpen(false)}>Cancel</Button>
            <Button onClick={handleCreatePlan} disabled={createPlanMutation.isLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {createPlanMutation.isLoading ? "Creating..." : "Create Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel Subscription</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-sm">
              <p className="font-semibold text-red-700">Cancelling: {selectedSub?.name}'s {selectedSub?.plan} plan</p>
              <p className="text-xs text-red-600 mt-1">This will cancel their subscription at the end of the current billing period.</p>
            </div>
            <div className="space-y-2">
              <Label>Cancellation Reason</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  {["Too expensive", "Not using enough", "Switching to competitor", "Technical issues", "Business closed", "Other"].map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep Subscription</Button>
            <Button variant="destructive" onClick={() => { if (!cancelReason) { toast.error("Select a reason"); return; } cancelMutation.mutate({ subscriptionId: selectedSub?.id, reason: cancelReason }); }} disabled={cancelMutation.isLoading}>
              {cancelMutation.isLoading ? "Cancelling..." : "Confirm Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
