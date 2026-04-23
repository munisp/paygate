// @ts-nocheck
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Calculator, TrendingDown, DollarSign, Calendar, CheckCircle2, Clock, AlertTriangle, Download, Share2 } from "lucide-react";
import { toast } from "sonner";

const fmt = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
const fmtShort = (kobo: number) => `₦${((kobo / 100) / 1000).toFixed(1)}k`;

const PLAN_PRESETS = [
  { label: "3 months", months: 3, rate: 0 },
  { label: "6 months", months: 6, rate: 3.5 },
  { label: "12 months", months: 12, rate: 5.0 },
  { label: "18 months", months: 18, rate: 7.5 },
  { label: "24 months", months: 24, rate: 9.0 },
];

export default function BNPLCalculator() {
  const [principal, setPrincipal] = useState(500_000_00); // kobo
  const [months, setMonths] = useState(12);
  const [rate, setRate] = useState(5.0);
  const [principalInput, setPrincipalInput] = useState("500000");
  const [activePreset, setActivePreset] = useState(2);

  const { data: schedule, isLoading } = trpc.bnplAmortisation.calculateSchedule.useQuery({
    principalKobo: principal,
    months,
    annualInterestRatePct: rate,
  }, { keepPreviousData: true });

  const handlePrincipalChange = (val: string) => {
    setPrincipalInput(val);
    const num = parseFloat(val.replace(/,/g, ""));
    if (!isNaN(num) && num > 0) {
      setPrincipal(Math.round(num * 100));
    }
  };

  const handlePreset = (idx: number) => {
    setActivePreset(idx);
    setMonths(PLAN_PRESETS[idx].months);
    setRate(PLAN_PRESETS[idx].rate);
  };

  const chartData = useMemo(() => {
    if (!schedule?.schedule) return [];
    return schedule.schedule.map((row) => ({
      month: `M${row.instalment}`,
      principal: row.principalKobo / 100,
      interest: row.interestKobo / 100,
      balance: row.outstandingKobo / 100,
    }));
  }, [schedule]);

  const pieData = schedule ? [
    { name: "Principal", value: principal / 100, color: "#6366f1" },
    { name: "Interest", value: schedule.totalInterestKobo / 100, color: "#f59e0b" },
  ] : [];

  const handleDownload = () => {
    if (!schedule) return;
    const csv = [
      "Instalment,Due Date,EMI,Principal,Interest,Outstanding Balance,Status",
      ...schedule.schedule.map((r) =>
        `${r.instalment},${r.dueDate},${(r.emiKobo / 100).toFixed(2)},${(r.principalKobo / 100).toFixed(2)},${(r.interestKobo / 100).toFixed(2)},${(r.outstandingKobo / 100).toFixed(2)},${r.status}`
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bnpl-schedule-${months}m-${rate}pct.csv`;
    a.click();
    toast.success("Schedule downloaded as CSV");
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="w-6 h-6 text-indigo-600" />
            BNPL Amortisation Calculator
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Calculate instalment schedules with full amortisation breakdown</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={!schedule}>
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); }}>
            <Share2 className="w-4 h-4 mr-1" /> Share
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calculator Inputs */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Loan Parameters</CardTitle>
            <CardDescription>Adjust to see real-time schedule</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Loan Amount (₦)</Label>
              <Input
                value={principalInput}
                onChange={(e) => handlePrincipalChange(e.target.value)}
                placeholder="500000"
                className="font-mono"
              />
              <Slider
                min={10000}
                max={5000000}
                step={10000}
                value={[principal / 100]}
                onValueChange={([v]) => { setPrincipal(v * 100); setPrincipalInput(String(v)); }}
                className="mt-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>₦10,000</span><span>₦5,000,000</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Repayment Plan</Label>
              <div className="grid grid-cols-3 gap-2">
                {PLAN_PRESETS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => handlePreset(i)}
                    className={`text-xs py-2 px-1 rounded-lg border font-medium transition-all ${
                      activePreset === i
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "border-border hover:border-indigo-400 hover:text-indigo-600"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Annual Interest Rate: <span className="font-bold text-indigo-600">{rate}%</span></Label>
              <Slider
                min={0}
                max={30}
                step={0.5}
                value={[rate]}
                onValueChange={([v]) => setRate(v)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0% (0% APR)</span><span>30% APR</span>
              </div>
            </div>

            {/* Summary Cards */}
            {schedule && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Monthly EMI</span>
                  <span className="font-bold text-indigo-600">{fmt(schedule.emiKobo)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Payable</span>
                  <span className="font-semibold">{fmt(schedule.totalPayableKobo)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Interest</span>
                  <span className="font-semibold text-amber-600">{fmt(schedule.totalInterestKobo)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Effective APR</span>
                  <span className="font-semibold">{schedule.effectiveAnnualRatePct}%</span>
                </div>
                <Progress
                  value={(schedule.totalInterestKobo / schedule.totalPayableKobo) * 100}
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground">
                  Interest is {((schedule.totalInterestKobo / schedule.totalPayableKobo) * 100).toFixed(1)}% of total cost
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Charts + Table */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="chart">
            <TabsList>
              <TabsTrigger value="chart">Visualisation</TabsTrigger>
              <TabsTrigger value="schedule">Full Schedule</TabsTrigger>
              <TabsTrigger value="breakdown">Cost Breakdown</TabsTrigger>
            </TabsList>

            <TabsContent value="chart" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Principal vs Interest Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} barSize={months > 12 ? 8 : 16}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => `₦${v.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`} />
                      <Bar dataKey="principal" stackId="a" fill="#6366f1" name="Principal" />
                      <Bar dataKey="interest" stackId="a" fill="#f59e0b" name="Interest" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Outstanding Balance Curve</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => `₦${v.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`} />
                      <Area type="monotone" dataKey="balance" stroke="#6366f1" fill="url(#balGrad)" name="Outstanding" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="schedule">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Amortisation Schedule ({months} instalments)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[420px]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead className="text-right">EMI</TableHead>
                          <TableHead className="text-right">Principal</TableHead>
                          <TableHead className="text-right">Interest</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {schedule?.schedule.map((row) => (
                          <TableRow key={row.instalment} className="text-sm">
                            <TableCell className="font-mono text-xs">{row.instalment}</TableCell>
                            <TableCell className="font-mono text-xs">{row.dueDate}</TableCell>
                            <TableCell className="text-right font-semibold">{fmt(row.emiKobo)}</TableCell>
                            <TableCell className="text-right text-indigo-600">{fmt(row.principalKobo)}</TableCell>
                            <TableCell className="text-right text-amber-600">{fmt(row.interestKobo)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{fmt(row.outstandingKobo)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                <Clock className="w-3 h-3 mr-1" /> Pending
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="breakdown">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Cost Composition</CardTitle></CardHeader>
                  <CardContent className="flex items-center justify-center">
                    <PieChart width={220} height={220}>
                      <Pie data={pieData} cx={110} cy={110} innerRadius={60} outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => `₦${v.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`} />
                    </PieChart>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Key Metrics</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {schedule && [
                      { label: "Principal Amount", value: fmt(principal), icon: DollarSign, color: "text-indigo-600" },
                      { label: "Total Interest", value: fmt(schedule.totalInterestKobo), icon: TrendingDown, color: "text-amber-600" },
                      { label: "Monthly EMI", value: fmt(schedule.emiKobo), icon: Calendar, color: "text-emerald-600" },
                      { label: "Total Payable", value: fmt(schedule.totalPayableKobo), icon: CheckCircle2, color: "text-blue-600" },
                    ].map((m) => (
                      <div key={m.label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <m.icon className={`w-4 h-4 ${m.color}`} />
                          <span className="text-sm text-muted-foreground">{m.label}</span>
                        </div>
                        <span className={`font-bold text-sm ${m.color}`}>{m.value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
