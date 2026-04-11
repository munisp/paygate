import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Calendar, Clock, CheckCircle } from "lucide-react";

export default function BulkScheduler() {
  const [name, setName] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [payments, setPayments] = useState("");
  const { data: schedules } = trpc.tier6to8.bulkScheduler.getSchedules.useQuery({ status: "all" });
  const createMutation = trpc.tier6to8.bulkScheduler.createSchedule.useMutation({
    onSuccess: (d: any) => toast.success(`Schedule created: ${d.scheduleId}`),
    onError: (e: any) => toast.error(e.message),
  });
  const cancelMutation = trpc.tier6to8.bulkScheduler.cancelSchedule.useMutation({
    onSuccess: () => toast.success("Schedule cancelled"),
    onError: (e: any) => toast.error(e.message),
  });

  const parsePayments = () => {
    try {
      return JSON.parse(payments);
    } catch {
      return [{ accountNumber: "0123456789", bankCode: "058", amountKobo: 100000, narration: "Test payment", reference: `REF-${Date.now()}` }];
    }
  };

  const statusColor = (s: string): "default" | "destructive" | "secondary" =>
    s === "completed" ? "default" : s === "failed" ? "destructive" : "secondary";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Calendar className="w-8 h-8 text-blue-600" />
        <div><h1 className="text-2xl font-bold">Bulk Payment Scheduler</h1><p className="text-muted-foreground">Schedule and automate bulk payment runs</p></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="w-4 h-4" />New Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Schedule name" value={name} onChange={e => setName(e.target.value)} />
            <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Payments JSON array</label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm font-mono h-32"
                placeholder='[{"accountNumber":"0123456789","bankCode":"058","amountKobo":100000,"narration":"Salary","reference":"REF-001"}]'
                value={payments}
                onChange={e => setPayments(e.target.value)}
              />
            </div>
            <Button className="w-full" disabled={createMutation.isPending || !name || !scheduledAt}
              onClick={() => createMutation.mutate({ name, scheduleType: "one_time", scheduledAt: new Date(scheduledAt).toISOString(), recipients: parsePayments(), currency: "NGN" })}>
              {createMutation.isPending ? "Scheduling..." : "Create Schedule"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Scheduled Runs</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {schedules?.schedules.map((s: any) => (
                <div key={s.id} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.paymentCount} payments — ₦{(s.totalAmountKobo / 100).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Scheduled: {new Date(s.scheduledAt).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={statusColor(s.status)}>{s.status}</Badge>
                      {s.status === "pending" && (
                        <Button size="sm" variant="destructive" onClick={() => cancelMutation.mutate({ scheduleId: s.id })}>Cancel</Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!schedules?.schedules.length && <p className="text-center text-muted-foreground py-8">No schedules yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
