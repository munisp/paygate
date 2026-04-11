/**
 * Split Bill (Consumer) - Wave 68
 * Create a split session, share payment links with participants.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Users, Plus, Trash2, Copy, Loader2, Share2 } from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";

interface Participant {
  name: string;
  shareAmount: string;
}

export default function SplitBill() {
  useOnboardingGate();
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([
    { name: "", shareAmount: "" },
    { name: "", shareAmount: "" },
  ]);
  const [createdSession, setCreatedSession] = useState<any>(null);

  const utils = trpc.useUtils();
  const { data: sessions, isLoading } = trpc.splitBill.list.useQuery(undefined, { staleTime: 30_000 });

  const create = trpc.splitBill.create.useMutation({
    onSuccess: (data) => {
      setCreatedSession(data);
      setCreateOpen(false);
      utils.splitBill.list.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const addParticipant = () => setParticipants(p => [...p, { name: "", shareAmount: "" }]);
  const removeParticipant = (i: number) => setParticipants(p => p.filter((_, idx) => idx !== i));
  const updateParticipant = (i: number, field: keyof Participant, val: string) =>
    setParticipants(p => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  const totalAmount = participants.reduce((s: any, p: any) => s + (parseFloat(p.shareAmount) || 0), 0);

  const handleCreate = () => {
    if (!title) { toast.error("Enter a title"); return; }
    const valid = participants.filter(p => p.name && parseFloat(p.shareAmount) > 0);
    if (valid.length < 2) { toast.error("At least 2 participants required"); return; }
    create.mutate({
      title,
      totalAmountKobo: Math.round(totalAmount * 100),
      participants: valid.map(p => ({
        name: p.name,
        shareAmountKobo: Math.round(parseFloat(p.shareAmount) * 100),
      })),
    });
  };

  const copyShareLink = (sessionId: string) => {
    const link = `${window.location.origin}/consumer/split/${sessionId}`;
    navigator.clipboard.writeText(link).then(() => toast.success("Link copied!")).catch(() => {});
  };

  if (!isLoading && !sessions) {
    return (
      <div className="p-6">
        <BridgeEmptyState
          variant="offline"
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/consumer")}><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="text-lg font-semibold">Split Bill</h1>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />New Split
        </Button>
      </div>

      {createdSession && (
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20">
          <CardContent className="pt-4">
            <p className="font-semibold text-emerald-700 dark:text-emerald-300 mb-2">Split Created!</p>
            <p className="text-sm text-muted-foreground mb-3">Share the link with participants so they can pay their share.</p>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => copyShareLink(createdSession.session.id)}>
                <Copy className="w-4 h-4 mr-2" />Copy Link
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCreatedSession(null)}>Dismiss</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : !(sessions as any[])?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No split sessions yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {((sessions as any[]) ?? []).map((s: any) => (
            <Card key={s.id}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Total: &#8358;{(s.totalAmountKobo / 100).toLocaleString()} · {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.status === "settled" ? "default" : "secondary"} className="text-[10px]">
                      {s.status}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyShareLink(s.id)}>
                      <Share2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Split Bill</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input placeholder="e.g. Dinner at Nok" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Participants</Label>
                <Button variant="ghost" size="sm" onClick={addParticipant} className="h-7 text-xs">
                  <Plus className="w-3 h-3 mr-1" />Add
                </Button>
              </div>
              <div className="space-y-2">
                {participants.map((p: any, i: any) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input placeholder="Name" value={p.name} onChange={e => updateParticipant(i, "name", e.target.value)} className="flex-1" />
                    <Input type="number" placeholder="₦ Share" value={p.shareAmount} onChange={e => updateParticipant(i, "shareAmount", e.target.value)} className="w-28" />
                    {participants.length > 2 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={() => removeParticipant(i)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {totalAmount > 0 && (
                <p className="text-xs text-muted-foreground mt-2 text-right">
                  Total: &#8358;{totalAmount.toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
