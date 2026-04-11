/**
 * Request Money / Pay-Me (Consumer) - Wave 68
 * Create a money request, share a link, and view incoming/outgoing requests.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Share2, CheckCircle, XCircle, Clock, Loader2, Copy, Link } from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";

function PinDialog({ open, onClose, onConfirm, isPending, amount, requesterName }: {
  open: boolean; onClose: () => void; onConfirm: (pin: string) => void;
  isPending: boolean; amount: number; requesterName: string;
}) {
  const [pin, setPin] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o: any) => { if (!o) { onClose(); setPin(""); } }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader><DialogTitle>Pay Request</DialogTitle></DialogHeader>
        <div className="py-2 space-y-3">
          <div className="text-center">
            <p className="text-2xl font-bold">&#8358;{(amount / 100).toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">requested by {requesterName}</p>
          </div>
          <Input type="password" inputMode="numeric" maxLength={4} placeholder="Enter PIN (••••)"
            className="text-center text-2xl tracking-widest" value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setPin(""); }} disabled={isPending}>Cancel</Button>
          <Button onClick={() => { if (pin.length !== 4) return; onConfirm(pin); setPin(""); }} disabled={pin.length !== 4 || isPending}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Pay Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RequestMoney() {
  useOnboardingGate();
  const [, navigate] = useLocation();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [createdRequest, setCreatedRequest] = useState<{ id: string; shareUrl: string; amountKobo: number } | null>(null);
  const [payingRequest, setPayingRequest] = useState<{ id: string; amountKobo: number; requesterName: string } | null>(null);
  const [pinOpen, setPinOpen] = useState(false);

  const utils = trpc.useUtils();
  const { data: myRequestsData, isLoading } = trpc.moneyRequest.list.useQuery({ limit: 20 }, { staleTime: 30_000 });
  const myRequests = myRequestsData?.rows ?? [];
  const incomingRequests: any[] = []; // Incoming requests shown via pay-request link

  const createRequest = trpc.moneyRequest.create.useMutation({
    onSuccess: (data) => {
      setCreatedRequest({ id: data.id, shareUrl: `${window.location.origin}/consumer/pay-request/${data.id}`, amountKobo: data.amountKobo });
      utils.moneyRequest.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const payRequest = trpc.moneyRequest.pay.useMutation({
    onSuccess: () => {
      toast.success("Payment sent!");
      setPinOpen(false);
      setPayingRequest(null);
      utils.moneyRequest.list.invalidate();
      utils.consumerWallet.getBalance.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelRequest = trpc.moneyRequest.cancel.useMutation({
    onSuccess: () => { toast.success("Request cancelled"); utils.moneyRequest.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!amount || parseFloat(amount) < 10) { toast.error("Minimum request is ₦10"); return; }
    createRequest.mutate({
      amountKobo: Math.round(parseFloat(amount) * 100),
      note: note || undefined,
    });
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => toast.success("Link copied!")).catch(() => toast.error("Failed to copy"));
  };

  const shareLink = (url: string, amount: number) => {
    if (navigator.share) {
      navigator.share({ title: "Money Request", text: `Please pay me ₦${(amount/100).toLocaleString()} via PayGate`, url });
    } else {
      copyLink(url);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: "default" | "secondary" | "destructive"; label: string }> = {
      pending: { variant: "secondary", label: "Pending" },
      paid: { variant: "default", label: "Paid" },
      cancelled: { variant: "destructive", label: "Cancelled" },
      expired: { variant: "destructive", label: "Expired" },
    };
    const s = map[status] ?? { variant: "secondary", label: status };
    return <Badge variant={s.variant} className="text-[10px]">{s.label}</Badge>;
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/consumer")}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-lg font-semibold">Request Money</h1>
      </div>

      {createdRequest ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6 space-y-4">
            <div className="text-center space-y-1">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Link className="w-7 h-7 text-primary" />
              </div>
              <p className="font-bold text-lg">Request Created!</p>
              <p className="text-2xl font-bold">&#8358;{(createdRequest.amountKobo / 100).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground break-all">{createdRequest.shareUrl}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => copyLink(createdRequest.shareUrl)}>
                <Copy className="w-4 h-4 mr-2" />Copy Link
              </Button>
              <Button className="flex-1" onClick={() => shareLink(createdRequest.shareUrl, createdRequest.amountKobo)}>
                <Share2 className="w-4 h-4 mr-2" />Share
              </Button>
            </div>
            <Button variant="ghost" className="w-full text-sm" onClick={() => { setCreatedRequest(null); setAmount(""); setNote(""); }}>
              Create Another Request
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">New Request</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Amount (NGN)</Label>
              <Input type="number" placeholder="e.g. 5000" min={10} value={amount} onChange={e => setAmount(e.target.value)} />
              <div className="flex gap-2 flex-wrap">
                {[500, 1000, 2000, 5000].map(v => (
                  <button key={v} onClick={() => setAmount(String(v))} className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-muted/80 transition-colors">
                    &#8358;{v.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input placeholder="What's this for?" value={note} onChange={e => setNote(e.target.value)} maxLength={100} />
            </div>
            <Button className="w-full" onClick={handleCreate} disabled={!amount || createRequest.isPending}>
              {createRequest.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Link className="w-4 h-4 mr-2" />}
              Generate Payment Link
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="sent">
        <TabsList className="w-full">
          <TabsTrigger value="sent" className="flex-1">Sent</TabsTrigger>
          <TabsTrigger value="received" className="flex-1">Received</TabsTrigger>
        </TabsList>

        <TabsContent value="sent" className="mt-3 space-y-2">
          {isLoading ? [1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />) :
            !(myRequests?.length) ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No requests sent yet</div>
            ) : (
              (myRequests as any[]).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                  <div>
                    <p className="text-sm font-medium">&#8358;{(r.amountKobo / 100).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{r.note ?? "No note"} · {new Date(r.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(r.status)}
                    {r.status === "pending" && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyLink(r.shareUrl ?? "")}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => cancelRequest.mutate({ id: r.id })}>
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )
          }
        </TabsContent>

        <TabsContent value="received" className="mt-3 space-y-2">
          {!incomingRequests.length ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Share your request link for others to pay you</div>
          ) : (
            incomingRequests.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                <div>
                  <p className="text-sm font-medium">&#8358;{(r.amountKobo / 100).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{r.note ?? "No note"} · {new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(r.status)}
                  {r.status === "pending" && (
                    <Button size="sm" onClick={() => { setPayingRequest({ id: r.id, amountKobo: r.amountKobo, requesterName: r.requesterName ?? "Someone" }); setPinOpen(true); }}>
                      Pay
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {payingRequest && (
        <PinDialog
          open={pinOpen}
          onClose={() => { setPinOpen(false); setPayingRequest(null); }}
          onConfirm={(pin) => payRequest.mutate({ id: payingRequest.id, pin })}
          isPending={payRequest.isPending}
          amount={payingRequest.amountKobo}
          requesterName={payingRequest.requesterName}
        />
      )}
    </div>
  );
}
