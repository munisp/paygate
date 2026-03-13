import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, RefreshCw, Users, Clock, DollarSign, CheckCircle2 } from "lucide-react";

export default function Payroll() {
  const { isAuthenticated } = useAuth();
  const [staffOpen, setStaffOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [staffForm, setStaffForm] = useState({ name: "", role: "cashier", hourlyRateKobo: "", salaryKobo: "", payType: "hourly" });
  const [shiftForm, setShiftForm] = useState({ staffId: "", clockIn: "", clockOut: "", tipsKobo: "" });
  const [runForm, setRunForm] = useState({ periodStart: "", periodEnd: "" });

  const utils = trpc.useUtils();

  const { data: staffData, isLoading, refetch } = trpc.payroll.listStaff.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: runsData } = trpc.payroll.listRuns.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const upsertStaff = trpc.payroll.upsertStaff.useMutation({
    onSuccess: () => {
      utils.payroll.listStaff.invalidate();
      setStaffOpen(false);
      setStaffForm({ name: "", role: "cashier", hourlyRateKobo: "", salaryKobo: "", payType: "hourly" });
      toast.success("Staff member saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const recordShift = trpc.payroll.recordShift.useMutation({
    onSuccess: () => {
      setShiftOpen(false);
      setShiftForm({ staffId: "", clockIn: "", clockOut: "", tipsKobo: "" });
      toast.success("Shift recorded");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const runPayroll = trpc.payroll.runPayroll.useMutation({
    onSuccess: () => {
      utils.payroll.listRuns.invalidate();
      setRunOpen(false);
      setRunForm({ periodStart: "", periodEnd: "" });
      toast.success("Payroll run created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const approveRun = trpc.payroll.approveRun.useMutation({
    onSuccess: () => {
      utils.payroll.listRuns.invalidate();
      toast.success("Payroll approved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const staff: any[] = staffData ?? [];
  const runs: any[] = runsData ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payroll</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage staff, record shifts, and run payroll</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>

          {/* Record shift */}
          <Dialog open={shiftOpen} onOpenChange={setShiftOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Clock className="w-4 h-4 mr-2" /> Record Shift</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Staff Shift</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <Select value={shiftForm.staffId} onValueChange={(v) => setShiftForm({ ...shiftForm, staffId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                  <SelectContent>
                    {staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>)}
                  </SelectContent>
                </Select>
                <div>
                  <label className="text-xs text-muted-foreground">Clock In</label>
                  <Input type="datetime-local" value={shiftForm.clockIn} onChange={(e) => setShiftForm({ ...shiftForm, clockIn: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Clock Out</label>
                  <Input type="datetime-local" value={shiftForm.clockOut} onChange={(e) => setShiftForm({ ...shiftForm, clockOut: e.target.value })} />
                </div>
                <Input type="number" placeholder="Tips (₦, optional)" value={shiftForm.tipsKobo} onChange={(e) => setShiftForm({ ...shiftForm, tipsKobo: e.target.value })} />
                <Button className="w-full" disabled={!shiftForm.staffId || !shiftForm.clockIn || !shiftForm.clockOut}
                  onClick={() => recordShift.mutate({
                    staffId: shiftForm.staffId,
                    clockIn: new Date(shiftForm.clockIn),
                    clockOut: shiftForm.clockOut ? new Date(shiftForm.clockOut) : undefined,
                    tipsKobo: shiftForm.tipsKobo ? Math.round(parseFloat(shiftForm.tipsKobo) * 100) : 0,
                  })}>
                  Save Shift
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Run payroll */}
          <Dialog open={runOpen} onOpenChange={setRunOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><DollarSign className="w-4 h-4 mr-2" /> Run Payroll</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Run Payroll</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-xs text-muted-foreground">Period Start</label>
                  <Input type="date" value={runForm.periodStart} onChange={(e) => setRunForm({ ...runForm, periodStart: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Period End</label>
                  <Input type="date" value={runForm.periodEnd} onChange={(e) => setRunForm({ ...runForm, periodEnd: e.target.value })} />
                </div>
                <Button className="w-full" disabled={!runForm.periodStart || !runForm.periodEnd}
                  onClick={() => runPayroll.mutate({ periodStart: new Date(runForm.periodStart), periodEnd: new Date(runForm.periodEnd) })}>
                  Calculate Payroll
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Add staff */}
          <Dialog open={staffOpen} onOpenChange={setStaffOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add Staff</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Staff Member</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <Input placeholder="Full name" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} />
                <Select value={staffForm.role} onValueChange={(v) => setStaffForm({ ...staffForm, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["cashier", "waiter", "chef", "manager", "cleaner", "security"].map((r) => (
                      <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={staffForm.payType} onValueChange={(v) => setStaffForm({ ...staffForm, payType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="salary">Monthly Salary</SelectItem>
                  </SelectContent>
                </Select>
                {staffForm.payType === "hourly" ? (
                  <Input type="number" placeholder="Hourly rate (₦)" value={staffForm.hourlyRateKobo} onChange={(e) => setStaffForm({ ...staffForm, hourlyRateKobo: e.target.value })} />
                ) : (
                  <Input type="number" placeholder="Monthly salary (₦)" value={staffForm.salaryKobo} onChange={(e) => setStaffForm({ ...staffForm, salaryKobo: e.target.value })} />
                )}
                <Button className="w-full" disabled={!staffForm.name}
                  onClick={() => upsertStaff.mutate({
                    name: staffForm.name,
                    role: staffForm.role,
                    hourlyRateKobo: Math.round(parseFloat(staffForm.hourlyRateKobo || staffForm.salaryKobo) * 100) || 0,
                  })}>
                  Save Staff
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Staff table */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-4 h-4" /> Staff ({staff.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading staff…</div>
          ) : staff.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No staff members yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4">Name</th>
                    <th className="text-left py-2 pr-4">Role</th>
                    <th className="text-left py-2 pr-4">Pay Type</th>
                    <th className="text-right py-2 pr-4">Rate / Salary</th>
                    <th className="text-left py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s: any) => (
                    <tr key={s.id} className="border-b hover:bg-muted/30">
                      <td className="py-3 pr-4 font-medium">{s.name}</td>
                      <td className="py-3 pr-4 capitalize">{s.role}</td>
                      <td className="py-3 pr-4">{s.salaryKobo > 0 ? "Monthly" : "Hourly"}</td>
                      <td className="py-3 pr-4 text-right font-mono">
                        {s.salaryKobo > 0
                          ? `₦${(s.salaryKobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}/mo`
                          : `₦${(s.hourlyRateKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}/hr`}
                      </td>
                      <td className="py-3">
                        <Badge className={s.status === "active" ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-gray-100 text-gray-700 hover:bg-gray-100"}>
                          {s.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payroll runs */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="w-4 h-4" /> Payroll Runs</CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No payroll runs yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4">Period</th>
                    <th className="text-right py-2 pr-4">Total Gross (₦)</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-left py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run: any) => (
                    <tr key={run.id} className="border-b hover:bg-muted/30">
                      <td className="py-3 pr-4">{run.periodStart} → {run.periodEnd}</td>
                      <td className="py-3 pr-4 text-right font-mono">
                        {((run.totalGrossKobo ?? 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge className={run.status === "approved" ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"}>
                          {run.status}
                        </Badge>
                      </td>
                      <td className="py-3">
                        {run.status === "draft" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => approveRun.mutate({ id: run.id })}>
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
