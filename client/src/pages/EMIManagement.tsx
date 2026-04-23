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
import { CreditCard, Plus, Calendar, DollarSign, TrendingDown, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const EMI_PLANS = [
  { id: "emi_3m", name: "3 Months", months: 3, interestRate: 0, processingFee: 1.0, minAmount: 10_000, maxAmount: 500_000 },
  { id: "emi_6m", name: "6 Months", months: 6, interestRate: 3.5, processingFee: 1.5, minAmount: 20_000, maxAmount: 1_000_000 },
  { id: "emi_12m", name: "12 Months", months: 12, interestRate: 5.0, processingFee: 2.0, minAmount: 50_000, maxAmount: 2_000_000 },
  { id: "emi_18m", name: "18 Months", months: 18, interestRate: 7.5, processingFee: 2.5, minAmount: 100_000, maxAmount: 5_000_000 },
  { id: "emi_24m", name: "24 Months", months: 24, interestRate: 9.0, processingFee: 3.0, minAmount: 200_000, maxAmount: 10_000_000 },
];

const MOCK_APPLICATIONS = [
  { id: "EMI-APP-001", customerId: "CUST-001", customerName: "Adaeze Okonkwo", amount: 500_000, planId: "emi_12m", planName: "12 Months", emiAmount: 44_167, status: "active", disbursedDate: "2026-03-01", nextDueDate: "2026-05-01", paidInstalments: 2, totalInstalments: 12 },
  { id: "EMI-APP-002", customerId: "CUST-002", customerName: "Emeka Nwosu", amount: 200_000, planId: "emi_6m", planName: "6 Months", emiAmount: 34_833, status: "active", disbursedDate: "2026-04-01", nextDueDate: "2026-05-01", paidInstalments: 1, totalInstalments: 6 },
  { id: "EMI-APP-003", customerId: "CUST-003", customerName: "Fatima Aliyu", amount: 1_000_000, planId: "emi_18m", planName: "18 Months", emiAmount: 60_556, status: "pending", disbursedDate: null, nextDueDate: null, paidInstalments: 0, totalInstalments: 18 },
  { id: "EMI-APP-004", customerId: "CUST-004", customerName: "Chukwuemeka Eze", amount: 150_000, planId: "emi_3m", planName: "3 Months", emiAmount: 50_000, status: "completed", disbursedDate: "2026-01-01", nextDueDate: null, paidInstalments: 3, totalInstalments: 3 },
];

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-emerald-100 text-emerald-700" },
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700" },
  completed: { label: "Completed", color: "bg-blue-100 text-blue-700" },
  defaulted: { label: "Defaulted", color: "bg-red-100 text-red-700" },
};

export default function EMIManagement() {
  const [applyOpen, setApplyOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState(EMI_PLANS[2]);
  const [loanAmount, setLoanAmount] = useState("500000");
  const [customerId, setCustomerId] = useState("");

  const { data: plans } = trpc.emiMw.plans.useQuery();
  const applyMutation = trpc.emiMw.applyEmi.useMutation({
    onSuccess: (data) => {
      toast.success(`EMI application ${data.applicationId} submitted!`);
      setApplyOpen(false);
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

  const scheduleForApp = (app: any) => {
    const rate = EMI_PLANS.find((p) => p.id === app.planId)?.interestRate ?? 0;
    const monthlyRate = rate / 100 / 12;
    let balance = app.amount;
    return Array.from({ length: app.totalInstalments }, (_, i) => {
      const interest = Math.round(balance * monthlyRate);
      const principal = Math.round(app.emiAmount - interest);
      balance = Math.max(0, balance - principal);
      const dueDate = app.disbursedDate
        ? new Date(new Date(app.disbursedDate).getTime() + (i + 1) * 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        : `Month ${i + 1}`;
      return { no: i + 1, dueDate, emi: app.emiAmount, principal, interest, balance, paid: i < app.paidInstalments };
    });
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

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Loans", value: "2", icon: CreditCard, color: "text-violet-600" },
          { label: "Total Disbursed", value: "₦700k", icon: DollarSign, color: "text-emerald-600" },
          { label: "Monthly Collections", value: "₦79k", icon: Calendar, color: "text-blue-600" },
          { label: "Collection Rate", value: "98.2%", icon: TrendingDown, color: "text-amber-600" },
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
                  {MOCK_APPLICATIONS.map((app) => {
                    const st = STATUS_STYLES[app.status] ?? STATUS_STYLES.pending;
                    const pct = app.totalInstalments > 0 ? (app.paidInstalments / app.totalInstalments) * 100 : 0;
                    return (
                      <TableRow key={app.id}>
                        <TableCell className="font-mono text-xs">{app.id}</TableCell>
                        <TableCell className="font-medium text-sm">{app.customerName}</TableCell>
                        <TableCell className="text-sm">{app.planName}</TableCell>
                        <TableCell className="text-right font-semibold">₦{app.amount.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-semibold text-violet-600">₦{app.emiAmount.toLocaleString()}</TableCell>
                        <TableCell className="min-w-[120px]">
                          <div className="space-y-1">
                            <Progress value={pct} className="h-1.5" />
                            <p className="text-xs text-muted-foreground">{app.paidInstalments}/{app.totalInstalments} paid</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}>{st.label}</span>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" className="text-xs"
                            onClick={() => { setSelectedApp(app); setScheduleOpen(true); }}>
                            Schedule
                          </Button>
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

      {/* Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Repayment Schedule — {selectedApp?.id}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">EMI</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedApp && scheduleForApp(selectedApp).map((row) => (
                  <TableRow key={row.no} className={row.paid ? "opacity-50" : ""}>
                    <TableCell className="text-xs">{row.no}</TableCell>
                    <TableCell className="text-xs font-mono">{row.dueDate}</TableCell>
                    <TableCell className="text-right text-xs font-semibold">₦{row.emi.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs text-violet-600">₦{row.principal.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs text-amber-600">₦{row.interest.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">₦{row.balance.toLocaleString()}</TableCell>
                    <TableCell>
                      {row.paid
                        ? <Badge className="text-xs bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3 mr-1" />Paid</Badge>
                        : <Badge variant="outline" className="text-xs"><Clock className="w-3 h-3 mr-1" />Pending</Badge>
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
