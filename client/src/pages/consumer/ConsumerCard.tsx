/**
 * Consumer Virtual Card (Consumer) - Wave 68
 * Issue up to 3 virtual Visa/Mastercard cards, freeze/unfreeze, terminate.
 * Requires KYC approval.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, CreditCard, Snowflake, Trash2, Plus, Loader2, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";

function VirtualCardDisplay({ card, onFreeze, onTerminate, isFreezing, isTerminating }: {
  card: any; onFreeze: () => void; onTerminate: () => void; isFreezing: boolean; isTerminating: boolean;
}) {
  const isVisa = card.cardBrand === "visa";
  const bgClass = isVisa
    ? "bg-gradient-to-br from-blue-600 to-indigo-700"
    : "bg-gradient-to-br from-red-500 to-orange-600";

  return (
    <div className={`relative rounded-2xl p-5 text-white shadow-lg ${bgClass} ${card.isFrozen ? "opacity-70" : ""}`}>
      {card.isFrozen && (
        <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center">
          <div className="text-center">
            <Snowflake className="w-8 h-8 mx-auto mb-1" />
            <p className="text-sm font-bold">FROZEN</p>
          </div>
        </div>
      )}
      <div className="flex justify-between items-start mb-6">
        <div>
          <p className="text-xs opacity-70 uppercase tracking-wider">Virtual Card</p>
          <p className="text-sm font-bold mt-0.5">PayGate</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold italic">{isVisa ? "VISA" : "MC"}</p>
        </div>
      </div>
      <p className="text-lg font-mono tracking-widest mb-4">{card.maskedPan}</p>
      <div className="flex justify-between items-end">
        <div>
          <p className="text-xs opacity-70">CARDHOLDER</p>
          <p className="text-sm font-medium">{card.cardholderName}</p>
        </div>
        <div className="text-right">
          <p className="text-xs opacity-70">EXPIRES</p>
          <p className="text-sm font-medium">{card.expiryMonth}/{card.expiryYear}</p>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <Button size="sm" variant="outline" className="flex-1 bg-white/20 border-white/30 text-white hover:bg-white/30"
          onClick={onFreeze} disabled={isFreezing}>
          {isFreezing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Snowflake className="w-3.5 h-3.5 mr-1" />}
          {card.isFrozen ? "Unfreeze" : "Freeze"}
        </Button>
        <Button size="sm" variant="outline" className="bg-red-500/30 border-red-300/30 text-white hover:bg-red-500/50"
          onClick={onTerminate} disabled={isTerminating}>
          {isTerminating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </Button>
      </div>
    </div>
  );
}

export default function ConsumerCard() {
  useOnboardingGate();
  const [, navigate] = useLocation();
  const [issueOpen, setIssueOpen] = useState(false);
  const [brand, setBrand] = useState<"visa" | "mastercard">("visa");
  const [limitAmount, setLimitAmount] = useState("");
  const [actionCardId, setActionCardId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: cards, isLoading } = trpc.consumerCard.list.useQuery({}, { staleTime: 30_000 });
  const { data: kyc } = trpc.consumerKyc.status.useQuery(undefined, { staleTime: 60_000 });
  const kycApproved = (kyc as any)?.status === "approved";

  const issue = trpc.consumerCard.issue.useMutation({
    onSuccess: () => {
      toast.success("Virtual card issued!");
      setIssueOpen(false);
      utils.consumerCard.list.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const freeze = trpc.consumerCard.freeze.useMutation({
    onSuccess: () => { utils.consumerCard.list.invalidate(); setActionCardId(null); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const terminate = trpc.consumerCard.terminate.useMutation({
    onSuccess: () => { toast.success("Card terminated"); utils.consumerCard.list.invalidate(); setActionCardId(null); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const activeCards = ((cards as any[]) ?? []).filter((c: any) => c.isActive);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/consumer")}><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="text-lg font-semibold">Virtual Cards</h1>
        </div>
        {kycApproved && activeCards.length < 3 && (
          <Button size="sm" onClick={() => setIssueOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />New Card
          </Button>
        )}
      </div>

      {!kycApproved && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-medium">KYC Required</p>
                <p className="text-xs text-muted-foreground">Complete identity verification to issue virtual cards.</p>
              </div>
              <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => navigate("/consumer/kyc")}>
                Verify Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-4">{[1, 2].map(i => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
      ) : !activeCards.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No virtual cards yet</p>
          <p className="text-xs mt-1">{kycApproved ? "Issue your first virtual card above" : "Complete KYC to get started"}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeCards.map((card: any) => (
            <VirtualCardDisplay key={card.id} card={card}
              isFreezing={actionCardId === card.id && freeze.isPending}
              isTerminating={actionCardId === card.id && terminate.isPending}
              onFreeze={() => { setActionCardId(card.id); freeze.mutate({ id: card.id, freeze: !card.isFrozen }); }}
              onTerminate={() => { if (confirm("Terminate this card permanently?")) { setActionCardId(card.id); terminate.mutate({ id: card.id }); } }}
            />
          ))}
          <p className="text-xs text-center text-muted-foreground">{activeCards.length}/3 cards used</p>
        </div>
      )}

      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Issue Virtual Card</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Card Brand</Label>
              <Select value={brand} onValueChange={(v: any) => setBrand(v as "visa" | "mastercard")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="visa">Visa</SelectItem>
                  <SelectItem value="mastercard">Mastercard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Monthly Spending Limit (optional)</Label>
              <Input type="number" placeholder="e.g. 50000" value={limitAmount} onChange={e => setLimitAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>Cancel</Button>
            <Button onClick={() => issue.mutate({
              cardBrand: brand,
              spendingLimitKobo: limitAmount ? Math.round(parseFloat(limitAmount) * 100) : undefined,
            })} disabled={issue.isPending}>
              {issue.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Issue Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
