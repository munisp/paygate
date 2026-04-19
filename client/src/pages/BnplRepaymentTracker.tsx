import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Calculator, CheckCircle, Clock, AlertTriangle, DollarSign } from "lucide-react";

export default function BnplRepaymentTracker() {
  const [applicationId, setApplicationId] = useState("bnpl-001");
  const [genForm, setGenForm] = useState({
    principal: 500000,
    interestRatePct: 18,
    termMonths: 12,
    startDate: new Date().toISOString().split("T")[0],
  });

  const { data: schedule, refetch: refetchSchedule } = trpc.wave29.bnplRepayment.getSchedule.useQuery(
    { applicationId },
    { enabled: !!applicationId }
  );

  const { data: overdue } = trpc.wave29.bnplRepayment.getOverdue.useQuery();

  const generateSchedule = trpc.wave29.bnplRepayment.generateSchedule.useMutation({
    onSuccess: (data) => {
      toast.success(`Generated ${data.generated} instalments. Monthly payment: ₦${(data.monthlyPayment / 100).toLocaleString()}`);
      refetchSchedule();
    },
    onError: (err) => toast.error(err.message),
  });

  const recordPayment = trpc.wave29.bnplRepayment.recordPayment.useMutation({
    onSuccess: () => { toast.success("Payment recorded"); refetchSchedule(); },
    onError: (err) => toast.error(err.message),
  });

  const paid = (schedule ?? []).filter((s: any) => s.status === "paid").length;
  const pending = (schedule ?? []).filter((s: any) => s.status === "pending").length;
  const overdueCount = (schedule ?? []).filter((s: any) => s.status === "pending" && new Date(s.due_date) < new Date()).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">BNPL Repayment Tracker</h1>
        <p className="text-gray-500 mt-1">Generate amortisation schedules and track instalment payments</p>
      </div>

      {/* Overdue Alert */}
      {(overdue ?? []).length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">
              {(overdue ?? []).length} overdue instalment{(overdue ?? []).length > 1 ? "s" : ""}
            </p>
            <p className="text-sm text-red-600">Immediate action required for overdue payments</p>
          </div>
        </div>
      )}

      {/* Generate Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Generate Amortisation Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <Label>Application ID</Label>
              <Input
                value={applicationId}
                onChange={e => setApplicationId(e.target.value)}
                placeholder="bnpl-001"
              />
            </div>
            <div>
              <Label>Principal (kobo)</Label>
              <Input
                type="number"
                value={genForm.principal}
                onChange={e => setGenForm(f => ({ ...f, principal: parseInt(e.target.value) }))}
              />
              <p className="text-xs text-gray-400 mt-1">₦{(genForm.principal / 100).toLocaleString()}</p>
            </div>
            <div>
              <Label>Annual Interest %</Label>
              <Input
                type="number"
                step="0.1"
                value={genForm.interestRatePct}
                onChange={e => setGenForm(f => ({ ...f, interestRatePct: parseFloat(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Term (months)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={genForm.termMonths}
                onChange={e => setGenForm(f => ({ ...f, termMonths: parseInt(e.target.value) }))}
              />
            </div>
          </div>
          <Button
            onClick={() => generateSchedule.mutate({
              applicationId,
              ...genForm,
            })}
            disabled={generateSchedule.isPending}
          >
            <Calculator className="w-4 h-4 mr-2" />
            Generate Schedule
          </Button>
        </CardContent>
      </Card>

      {/* Schedule Stats */}
      {(schedule ?? []).length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{paid}</p>
                  <p className="text-sm text-gray-500">Paid Instalments</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Clock className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{pending}</p>
                  <p className="text-sm text-gray-500">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <DollarSign className="w-8 h-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">
                    ₦{((schedule ?? []).reduce((sum: number, s: any) => sum + (s.status === "pending" ? Number(s.amount) : 0), 0) / 100).toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500">Outstanding</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Amortisation Table */}
      <Card>
        <CardHeader>
          <CardTitle>Repayment Schedule — {applicationId}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Principal</TableHead>
                <TableHead>Interest</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(schedule ?? []).map((inst: any) => {
                const isOverdue = inst.status === "pending" && new Date(inst.due_date) < new Date();
                return (
                  <TableRow key={inst.id} className={isOverdue ? "bg-red-50" : ""}>
                    <TableCell>{inst.instalment_number}</TableCell>
                    <TableCell>
                      <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                        {new Date(inst.due_date).toLocaleDateString()}
                      </span>
                      {isOverdue && <Badge variant="destructive" className="ml-2 text-xs">Overdue</Badge>}
                    </TableCell>
                    <TableCell>₦{(Number(inst.amount) / 100).toLocaleString()}</TableCell>
                    <TableCell className="text-blue-600">₦{(Number(inst.principal_amount) / 100).toLocaleString()}</TableCell>
                    <TableCell className="text-amber-600">₦{(Number(inst.interest_amount) / 100).toLocaleString()}</TableCell>
                    <TableCell>₦{(Number(inst.outstanding_balance) / 100).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={inst.status === "paid" ? "default" : "outline"}>
                        {inst.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {inst.status === "pending" && (
                        <Button
                          size="sm"
                          onClick={() => recordPayment.mutate({
                            scheduleId: inst.id,
                            amountPaid: Number(inst.amount),
                            paymentRef: `PAY-${Date.now()}`,
                          })}
                          disabled={recordPayment.isPending}
                        >
                          Mark Paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(schedule ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-gray-400 py-8">
                    No schedule found. Generate one above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
