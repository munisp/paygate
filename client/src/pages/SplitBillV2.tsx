import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Users2, Plus, DollarSign, Loader2, ChevronRight } from "lucide-react";

export default function SplitBillV2() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", totalAmount: "", currency: "NGN", participantCount: "2" });

  const { data, isLoading } = trpc.splitBillV2.listSessions.useQuery({ page });
  const { data: sharesData } = trpc.splitBillV2.listShares.useQuery(
    { sessionId: selectedSession! },
    { enabled: !!selectedSession }
  );

  const createSession = trpc.splitBillV2.createSession.useMutation({
    onSuccess: () => { utils.splitBillV2.listSessions.invalidate(); setCreateOpen(false); toast({ title: "Split session created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const payShare = trpc.splitBillV2.payShare.useMutation({
    onSuccess: () => { utils.splitBillV2.listShares.invalidate(); toast({ title: "Share paid" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sessions = data?.sessions ?? [];
  const shares = sharesData?.shares ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users2 className="w-6 h-6" /> Split Bill V2</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage bill splitting sessions</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />New Session</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Split Session</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Dinner at Eko Hotel" /></div>
              <div><Label>Total Amount</Label><Input type="number" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))} placeholder="25000" /></div>
              <div><Label>Currency</Label><Input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} placeholder="NGN" /></div>
              <div><Label>Number of Participants</Label><Input type="number" value={form.participantCount} onChange={e => setForm(f => ({ ...f, participantCount: e.target.value }))} min="2" /></div>
              <Button className="w-full" disabled={createSession.isPending} onClick={() => createSession.mutate({ totalAmountKobo: Math.round(Number(form.totalAmount) * 100), participantCount: Number(form.participantCount), splitType: "equal" })}>
                {createSession.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Create Session
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Sessions</p><p className="text-2xl font-bold">{data?.total ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Active</p><p className="text-2xl font-bold text-blue-600">{sessions.filter((s: any) => s.status === "active").length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Completed</p><p className="text-2xl font-bold text-green-600">{sessions.filter((s: any) => s.status === "completed").length}</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sessions */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Sessions</h2>
          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div> :
            sessions.length === 0 ? <Card><CardContent className="py-8 text-center text-muted-foreground">No sessions yet</CardContent></Card> :
            sessions.map((s: any) => (
              <Card key={s.id} className={`cursor-pointer transition-colors ${selectedSession === s.id ? "border-primary" : "hover:border-muted-foreground/30"}`}
                onClick={() => setSelectedSession(s.id)}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">₦{Number(s.totalAmount ?? 0).toLocaleString()} · {s.participantCount} people</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.status === "completed" ? "default" : "secondary"}>{s.status}</Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))
          }
        </div>

        {/* Shares */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {selectedSession ? "Shares" : "Select a session"}
          </h2>
          {!selectedSession ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Click a session to view shares</CardContent></Card>
          ) : shares.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No shares yet</CardContent></Card>
          ) : (
            shares.map((sh: any) => (
              <Card key={sh.id}><CardContent className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{sh.participantName ?? sh.participantId}</p>
                  <p className="text-xs text-muted-foreground">₦{Number(sh.amount ?? 0).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={sh.paid ? "default" : "secondary"}>{sh.paid ? "Paid" : "Pending"}</Badge>
                  {!sh.paid && (
                    <Button size="sm" onClick={() => payShare.mutate({ shareId: sh.id })}>
                      <DollarSign className="w-3.5 h-3.5 mr-1" />Pay
                    </Button>
                  )}
                </div>
              </CardContent></Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
