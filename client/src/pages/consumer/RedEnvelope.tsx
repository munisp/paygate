/**
 * Red Envelope (Gift Money) Page — Consumer
 * Create a red envelope to share with friends, or claim one via a link.
 * Uses real redEnvelope tRPC procedures.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Gift, Share2, CheckCircle, Loader2, ArrowLeft, Copy, Clock } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";

// ─── Claim View (when visiting /consumer/red-envelope/:id) ───────────────────
function ClaimView({ envelopeId }: { envelopeId: string }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: envelope, isLoading } = trpc.redEnvelope.status.useQuery(
    { envelopeId },
    { staleTime: 10_000 }
  );

  const claim = trpc.redEnvelope.claim.useMutation({
    onSuccess: (data) => {
      toast.success(`🎉 You received ₦${(data.amountKobo / 100).toLocaleString()}!`);
      utils.consumerWallet.getBalance.invalidate();
      utils.consumerWallet.history.invalidate();
      utils.redEnvelope.status.invalidate({ envelopeId });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="w-24 h-24 rounded-full bg-red-100 flex items-center justify-center mx-auto animate-pulse">
            <Gift className="w-12 h-12 text-red-500" />
          </div>
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!envelope) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Red envelope not found or has expired.</p>
          <Button onClick={() => navigate("/consumer")}>Go Home</Button>
        </div>
      </div>
    );
  }

  const isExpired = new Date() > new Date(envelope.expiresAt);
  const isFull = envelope.claimedSlots >= envelope.slots;
  const canClaim = envelope.status === "active" && !isExpired && !isFull;
  const perSlotAvg = (envelope.totalAmountKobo / envelope.slots / 100).toFixed(0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-red-500 to-red-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        {/* Envelope card */}
        <Card className="bg-white shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-b from-red-500 to-red-600 p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-yellow-400 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Gift className="w-10 h-10 text-red-600" />
            </div>
            <p className="text-white font-bold text-lg">Red Envelope</p>
            {envelope.message && (
              <p className="text-white/80 text-sm mt-1 italic">"{envelope.message}"</p>
            )}
          </div>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-2xl font-bold text-foreground">₦{(envelope.totalAmountKobo / 100).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Amount</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-2xl font-bold text-foreground">{envelope.slots - envelope.claimedSlots}</p>
                <p className="text-xs text-muted-foreground">Slots Left</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Expires {new Date(envelope.expiresAt).toLocaleString()}</span>
            </div>

            {!canClaim && (
              <Badge variant={isExpired ? "secondary" : "destructive"} className="w-full justify-center py-1.5">
                {isExpired ? "Expired" : isFull ? "All slots claimed" : "Inactive"}
              </Badge>
            )}

            {canClaim && (
              <Button
                className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-6 text-lg"
                onClick={() => claim.mutate({ envelopeId })}
                disabled={claim.isPending}
              >
                {claim.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Gift className="w-5 h-5 mr-2" />}
                {claim.isPending ? "Opening…" : `Open Envelope (~₦${perSlotAvg})`}
              </Button>
            )}

            {claim.isSuccess && (
              <div className="text-center p-4 bg-emerald-50 rounded-lg">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-bold text-emerald-700">You received ₦{((claim.data?.amountKobo ?? 0) / 100).toLocaleString()}!</p>
                <p className="text-xs text-emerald-600 mt-1">Added to your wallet</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Button
          variant="ghost"
          className="w-full text-white hover:bg-white/20"
          onClick={() => navigate("/consumer")}
        >
          Back to Wallet
        </Button>
      </div>
    </div>
  );
}

// ─── Create View ─────────────────────────────────────────────────────────────
export default function RedEnvelope() {
  useOnboardingGate();
  const params = useParams<{ id?: string }>();
  const [, navigate] = useLocation();

  // If we have an envelope ID in the URL, show the claim view
  if (params.id) {
    return <ClaimView envelopeId={params.id} />;
  }

  const [amount, setAmount] = useState("");
  const [slots, setSlots] = useState("5");
  const [message, setMessage] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const create = trpc.redEnvelope.create.useMutation({
    onSuccess: (data) => {
      const url = `${window.location.origin}${data.shareUrl}`;
      setShareUrl(url);
      utils.consumerWallet.getBalance.invalidate();
      utils.consumerWallet.history.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleCreate = () => {
    const amountKobo = Math.round(parseFloat(amount) * 100);
    const slotsNum = parseInt(slots, 10);
    if (!amount || amountKobo < 100) { toast.error("Minimum ₦1"); return; }
    if (!slotsNum || slotsNum < 1) { toast.error("At least 1 slot"); return; }
    create.mutate({
      totalAmountKobo: amountKobo,
      currency: "NGN",
      slots: slotsNum,
      message: message || undefined,
      expiresInHours: 24,
    });
  };

  const handleCopy = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard!");
    }
  };

  if (shareUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-red-500 to-red-700">
        <Card className="w-full max-w-sm bg-white shadow-2xl">
          <CardContent className="p-8 text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-yellow-400 flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-red-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Red Envelope Created!</h2>
              <p className="text-muted-foreground text-sm mt-1">Share the link with your friends</p>
            </div>
            <div className="bg-muted rounded-lg p-3 text-sm font-mono break-all text-left">
              {shareUrl}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleCopy}>
                <Copy className="w-4 h-4 mr-2" />
                Copy Link
              </Button>
              <Button className="flex-1 bg-red-500 hover:bg-red-600 text-white" onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: "Red Envelope 🧧", url: shareUrl });
                } else {
                  handleCopy();
                }
              }}>
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => navigate("/consumer")}>
              Back to Wallet
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 pt-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/consumer")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            🧧 Red Envelope
          </h1>
          <p className="text-sm text-muted-foreground">Send money as a gift to friends</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="w-5 h-5 text-red-500" />
            Create Red Envelope
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Total Amount (NGN)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₦</span>
              <Input
                type="number"
                placeholder="e.g. 5000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="pl-7"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[500, 1000, 5000, 10000].map(v => (
                <button
                  key={v}
                  onClick={() => setAmount(String(v))}
                  className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                >
                  ₦{v.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Number of Slots (recipients)</Label>
            <Input
              type="number"
              placeholder="e.g. 5"
              value={slots}
              onChange={e => setSlots(e.target.value)}
              min={1}
              max={100}
            />
            {amount && slots && (
              <p className="text-xs text-muted-foreground">
                ~₦{(parseFloat(amount) / parseInt(slots, 10)).toLocaleString()} per person on average
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Message (optional)</Label>
            <Input
              placeholder="Happy Birthday! 🎉"
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={200}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            The envelope expires in 24 hours. Unclaimed funds will be refunded to your wallet.
          </p>

          <Button
            className="w-full bg-red-500 hover:bg-red-600 text-white"
            onClick={handleCreate}
            disabled={create.isPending}
          >
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Gift className="w-4 h-4 mr-2" />}
            {create.isPending ? "Creating…" : "Create Red Envelope"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
