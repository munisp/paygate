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
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { CreditCard, Plus, Calendar, DollarSign, TrendingDown, CheckCircle2, Clock, AlertTriangle, BarChart2 } from "lucide-react";
import { toast } from "sonner";

const EMI_PLANS = [
  { id: "emi_3m", name: "3 Months", months: 3, interestRate: 0, processingFee: 1.0, minAmount: 10_000, maxAmount: 500_000 },
  { id: "emi_6m", name: "6 Months", months: 6, interestRate: 3.5, processingFee: 1.5, minAmount: 20_000, maxAmount: 1_000_000 },
  { id: "emi_12m", name: "12 Months", months: 12, interestRate: 5.0, processingFee: 2.0, minAmount: 50_000, maxAmount: 2_000_000 },
  { id: "emi_18m", name: "18 Months", months: 18, interestRate: 7.5, processingFee: 2.5, minAmount: 100_000, maxAmount: 5_000_000 },
  { id: "emi_24m", name: "24 Months", months: 24, interestRate: 9.0, processingFee: 3.0, minAmount: 200_000, maxAmount: 10_000_000 },
];

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-emerald-100 text-emerald-700" },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-700" },
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700" },
  completed: { label: "Completed", color: "bg-slate-100 text-slate-700" },
  defaulted: { label: "Defaulted", color: "bg-red-100 text-red-700" },
};

const STATUS_COLORS: Record<string, string> = {
  paid: "#10b981",
  due: "#f59e0b",
  upcoming: "#6366f1",
};

export default function EMIManagement() {
  const [applyOpen, setApplyOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState(EMI_PLANS[2]);
  const [loanAmount, setLoanAmount] = useState("500000");
  const [customerId, setCustomerId] = useState("");

  const { data: plans } = trpc.emiMw.plans.useQuery();
  const { data: applicationsData, isLoading: appsLoading, refetch: refetchApps } = trpc.emiMw.listApplications.useQuery();
  const applications = applicationsData ?? [];

  // Fetch repayment schedule for selected app (only when chart/schedule dialog is open)
  const { data: scheduleData, isLoading: scheduleLoading } = trpc.emiMw.repaymentSchedule.useQuery(
    { applicationId: selectedApp?.id ?? "" },
    { enabled: !!(selectedApp?.id, { staleTime: 30_000 }) && (scheduleOpen || chartOpen) }
  );
  const instalments = scheduleData?.instalments ?? [];

  const applyMutation = trpc.emiMw.applyEmi.useMutation({
    onSuccess: (data) => {
      toast.success(`EMI application ${data.applicationId} submitted!`);
      setApplyOpen(false);
      refetchApps();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const calcEMI = (amount: number, months: number, rate: number) => {
    const monthlyRate = rate / 100 / 12;
    if (monthlyRate === 0) return amount / months;
    return (amount * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  };

  const loanAmtNum = parseFloat(loanAmount.replace(/,/g, "")) || 0;
  const emiPreview = calcEMI(loanAmtNum, selectedPlan.months, selectedPlan.interestRate);
  const totalPayable = emiPreview * selectedPlan.months;
  const totalInterest = totalPayable - loanAmtNum;

  const handleApply = () => {
    if (!customerId.trim()) { toast.error("Customer ID required"); return; }
    if (loanAmtNum < selectedPlan.minAmount) { toast.error(`Minimum amount for this plan is ₦${selectedPlan.minAmount.toLocaleString()}`); return; }
    if (loanAmtNum > selectedPlan.maxAmount) { toast.error(`Maximum amount for this plan is ₦${selectedPlan.maxAmount.toLocaleString()}`); return; }
    applyMutation.mutate({ planId: selectedPlan.id, amountNGN: loanAmtNum, purpose: `EMI application by ${customerId}` });
  };

  // Derive live stats from applications
  const activeApps = applications.filter((a: any) => ["active", "approved"].includes(a.status));
  const totalDisbursed = applications.reduce((s: number, a: any) => s + (a.amountNGN ?? a.amount ?? 0), 0);
  const monthlyCollections = activeApps.reduce((s: number, a: any) => s + (a.emiAmountNGN ?? a.emiAmount ?? 0), 0);

  const formatNGN = (v: number) => {
    if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `₦${(v / 1_000).toFixed(0)}k`;
    return `₦${v.toLocaleString()}`;
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-violet-600" />
            EMI Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage instalment plans, applications, and repayment schedules</p>
        </div>
        <Button onClick={() => setApplyOpen(true)} className="bg-violet-600 hover:bg-violet-700">
          <Plus className="w-4 h-4 mr-2" /> New Application
        </Button>
      </div>

      {/* Stats — derived from live applications */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Loans", value: appsLoading ? "…" : String(activeApps.length), icon: CreditCard, color: "text-violet-600" },
          { label: "Total Disbursed", value: appsLoading ? "…" : formatNGN(totalDisbursed), icon: DollarSign, color: "text-emerald-600" },
          { label: "Monthly Collections", value: appsLoading ? "…" : formatNGN(monthlyCollections), icon: Calendar, color: "text-blue-600" },
          { label: "Collection Rate", value: appsLoading ? "…" : (() => { const completed = applications.filter((a: any) => a.status === "completed").length; const total = applications.length; return total > 0 ? `${((completed / total) * 100).toFixed(1)}%` : "N/A"; })(), icon: TrendingDown, color: "text-amber-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
              <p className={`text-2xl font-bold ${s.color} ${appsLoading ? "animate-pulse" : ""}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="applications">
        <TabsList>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="plans">EMI Plans</TabsTrigger>
        </TabsList>

        <TabsContent value="applications">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Application</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Loan Amount</TableHead>
                    <TableHead className="text-right">Monthly EMI</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appsLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : applications.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                        <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        No EMI applications yet.
                      </TableCell>
                    </TableRow>
                  ) : applications.map((app: any) => {
                    const st = STATUS_STYLES[app.status] ?? STATUS_STYLES.pending;
                    const totalInst = app.totalInstalments ?? app.remainingInstallments ?? 0;
                    const paidInst = app.paidInstalments ?? 0;
                    const pct = totalInst > 0 ? (paidInst / totalInst) * 100 : 0;
                    const amount = app.amountNGN ?? app.amount ?? 0;
                    const emiAmt = app.emiAmountNGN ?? app.emiAmount ?? 0;
                    return (
                      <TableRow key={app.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono text-xs">{app.id}</TableCell>
                        <TableCell className="font-medium text-sm">{app.customerName ?? app.customerId ?? "—"}</TableCell>
                        <TableCell className="text-sm">{app.planName ?? app.planId}</TableCell>
                        <TableCell className="text-right font-semibold">₦{amount.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-semibold text-violet-600">₦{emiAmt.toLocaleString()}</TableCell>
                        <TableCell className="min-w-[120px]">
                          <div className="space-y-1">
                            <Progress value={pct} className="h-1.5" />
                            <p className="text-xs text-muted-foreground">{paidInst}/{totalInst} paid</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}>{st.label}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="text-xs"
                              onClick={() => { setSelectedApp(app); setScheduleOpen(true); }}>
                              Schedule
                            </Button>
                            <Button size="sm" variant="outline" className="text-xs text-violet-700 border-violet-300"
                              onClick={() => { setSelectedApp(app); setChartOpen(true); }}>
                              <BarChart2 className="w-3 h-3 mr-1" /> Chart
                            </Button>
                          </div>
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
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {EMI_PLANS.map((plan) => (
              <Card key={plan.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-5 text-center">
                  <h3 className="font-bold text-lg text-violet-600">{plan.name}</h3>
                  <p className="text-2xl font-bold mt-2">{plan.interestRate === 0 ? "0%" : `${plan.interestRate}%`}</p>
                  <p className="text-xs text-muted-foreground">Annual Interest</p>
                  <div className="mt-3 space-y-1 text-xs text-left">
                    <div className="flex justify-between"><span className="text-muted-foreground">Processing Fee</span><span>{plan.processingFee}%</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Min Amount</span><span>₦{(plan.minAmount / 1000).toFixed(0)}k</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Max Amount</span><span>₦{(plan.maxAmount / 1_000_000).toFixed(0)}M</span></div>
                  </div>
                  {plan.interestRate === 0 && (
                    <Badge className="mt-3 bg-emerald-100 text-emerald-700 text-xs">Interest Free</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Apply Dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New EMI Application</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Customer ID</Label>
              <Input value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="CUST-001" />
            </div>
            <div className="space-y-2">
              <Label>Loan Amount (₦)</Label>
              <Input value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} placeholder="500000" />
            </div>
            <div className="space-y-2">
              <Label>EMI Plan</Label>
              <Select value={selectedPlan.id} onValueChange={(v) => setSelectedPlan(EMI_PLANS.find((p) => p.id === v) ?? EMI_PLANS[2])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMI_PLANS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — {p.interestRate === 0 ? "0% interest" : `${p.interestRate}% p.a.`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {loanAmtNum > 0 && (
              <div className="p-3 bg-violet-50 rounded-lg border border-violet-200 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Monthly EMI</span><span className="font-bold text-violet-600">₦{Math.round(emiPreview).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Payable</span><span className="font-semibold">₦{Math.round(totalPayable).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Interest</span><span className="text-amber-600">₦{Math.round(totalInterest).toLocaleString()}</span></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button onClick={handleApply} disabled={applyMutation.isLoading} className="bg-violet-600 hover:bg-violet-700 text-white">
              {applyMutation.isLoading ? "Submitting..." : "Submit Application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Repayment Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Repayment Schedule — {selectedApp?.id}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[400px] overflow-auto">
            {scheduleLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading schedule…</div>
            ) : (
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">EMI</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Interest</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instalments.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No schedule data available.</TableCell></TableRow>
                  ) : instalments.map((row: any) => (
                    <TableRow key={row.month} className={row.status === "paid" ? "opacity-50" : ""}>
                      <TableCell className="text-xs">{row.month}</TableCell>
                      <TableCell className="text-xs font-mono">{row.dueDate}</TableCell>
                      <TableCell className="text-right text-xs font-semibold">₦{row.instalment.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-xs text-violet-600">₦{row.principal.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-xs text-amber-600">₦{row.interest.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">₦{row.outstanding.toLocaleString()}</TableCell>
                      <TableCell>
                        {row.status === "paid"
                          ? <Badge className="text-xs bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3 mr-1" />Paid</Badge>
                          : row.status === "due"
                          ? <Badge className="text-xs bg-amber-100 text-amber-700"><AlertTriangle className="w-3 h-3 mr-1" />Due</Badge>
                          : <Badge variant="outline" className="text-xs"><Clock className="w-3 h-3 mr-1" />Upcoming</Badge>
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Repayment Chart Dialog */}
      <Dialog open={chartOpen} onOpenChange={setChartOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-violet-600" />
              Repayment Chart — {selectedApp?.id}
            </DialogTitle>
          </DialogHeader>
          {scheduleLoading ? (
            <div className="h-[300px] bg-muted/40 animate-pulse rounded" />
          ) : instalments.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">No schedule data available.</div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Monthly instalment breakdown vs outstanding balance over the loan tenure.</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={instalments} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} label={{ value: "Month", position: "insideBottom", offset: -2, fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number, name: string) => [`₦${v.toLocaleString("en-NG")}`, name]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="principal" name="Principal" stackId="emi" fill="#6366f1" radius={[0, 0, 0, 0]}>
                    {instalments.map((row: any, i: number) => (
                      <Cell key={i} fill={row.status === "paid" ? "#10b981" : row.status === "due" ? "#f59e0b" : "#6366f1"} />
                    ))}
                  </Bar>
                  <Bar dataKey="interest" name="Interest" stackId="emi" fill="#c4b5fd" />
                  <Bar dataKey="outstanding" name="Outstanding Balance" fill="#e0e7ff" />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 text-xs text-muted-foreground justify-center">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Paid</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> Due</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-500 inline-block" /> Upcoming</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setChartOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
