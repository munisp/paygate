import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Gift, Star, Zap, Trophy, ArrowRight, CheckCircle2, Lock, Coins } from "lucide-react";

const TIER_COLORS: Record<string, string> = {
  bronze: "text-amber-700 bg-amber-100 border-amber-300",
  silver: "text-slate-600 bg-slate-100 border-slate-300",
  gold: "text-yellow-600 bg-yellow-100 border-yellow-300",
  platinum: "text-purple-600 bg-purple-100 border-purple-300",
  diamond: "text-blue-600 bg-blue-100 border-blue-300",
};

const TIER_ICONS: Record<string, any> = {
  bronze: Star,
  silver: Star,
  gold: Trophy,
  platinum: Zap,
  diamond: Zap,
};

type RedemptionStep = "select" | "confirm" | "pin" | "success";

interface RewardTier {
  id: string;
  name: string;
  pointsCost: number;
  description: string;
  category: string;
  available: boolean;
}

function RedemptionModal({
  reward,
  balance,
  memberId,
  open,
  onClose,
  onSuccess,
}: {
  reward: RewardTier;
  balance: number;
  memberId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<RedemptionStep>("confirm");
  const [pin, setPin] = useState("");
  const [redemptionId, setRedemptionId] = useState<string | null>(null);

  const redeemPoints = trpc.loyaltyRedemption.redeem.useMutation({
    onSuccess: (data) => {
      setRedemptionId(data.redemptionId);
      setStep("success");
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handlePinSubmit = () => {
    if (pin.length !== 4) {
      toast.error("Please enter your 4-digit PIN");
      return;
    }
    redeemPoints.mutate({
      memberId,
      rewardId: reward.id,
      pointsCost: reward.pointsCost,
      pin,
    });
  };

  const canAfford = balance >= reward.pointsCost;

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); setStep("confirm"); setPin(""); }}>
      <DialogContent className="max-w-sm">
        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-primary" />
                Confirm Redemption
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="font-semibold">{reward.name}</div>
                <div className="text-sm text-muted-foreground">{reward.description}</div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm text-muted-foreground">Points required</span>
                  <span className="font-bold text-primary flex items-center gap-1">
                    <Coins className="h-4 w-4" />
                    {reward.pointsCost.toLocaleString()} pts
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Your balance</span>
                  <span className={`font-medium ${canAfford ? "text-green-600" : "text-destructive"}`}>
                    {balance.toLocaleString()} pts
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">After redemption</span>
                  <span className="font-medium">
                    {canAfford ? (balance - reward.pointsCost).toLocaleString() : "—"} pts
                  </span>
                </div>
              </div>
              {!canAfford && (
                <div className="text-sm text-destructive text-center">
                  Insufficient points balance
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => setStep("pin")} disabled={!canAfford}>
                Continue <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "pin" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" />
                Enter PIN
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Enter your 4-digit security PIN to confirm the redemption of{" "}
                <strong>{reward.pointsCost.toLocaleString()} points</strong>
              </p>
              <div className="flex justify-center">
                <div className="space-y-2">
                  <Label className="text-xs text-center block">Security PIN</Label>
                  <Input
                    type="password"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    className="text-center text-2xl tracking-widest w-32 h-12"
                    placeholder="••••"
                    autoFocus
                  />
                  <div className="flex justify-center gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-2 w-2 rounded-full transition-colors ${
                          pin.length > i ? "bg-primary" : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("confirm")}>Back</Button>
              <Button
                onClick={handlePinSubmit}
                disabled={pin.length !== 4 || redeemPoints.isPending}
              >
                {redeemPoints.isPending ? "Processing..." : "Confirm Redemption"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "success" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                Redemption Successful!
              </DialogTitle>
            </DialogHeader>
            <div className="text-center space-y-3 py-4">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <Gift className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <p className="font-semibold">{reward.name}</p>
                <p className="text-sm text-muted-foreground">has been redeemed successfully</p>
              </div>
              {redemptionId && (
                <p className="text-xs text-muted-foreground">
                  Reference: <span className="font-mono">{redemptionId}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                A Kafka event has been published to the rewards fulfillment service.
              </p>
            </div>
            <DialogFooter>
              <Button className="w-full" onClick={() => { onClose(); setStep("confirm"); setPin(""); }}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function LoyaltyRedemption() {
  const { user } = useAuth();
  const merchantId = (user as any)?.merchant?.id ?? "demo-merchant";
  const [selectedReward, setSelectedReward] = useState<RewardTier | null>(null);
  const [filterCategory, setFilterCategory] = useState("all");

  const utils = trpc.useUtils();

  const { data: memberData, isLoading: loadingMember } = trpc.loyaltyRedemption.getBalance.useQuery({
    merchantId,
  });

  const { data: rewards, isLoading: loadingRewards } = trpc.loyaltyRedemption.listRewards.useQuery({
    merchantId,
    category: filterCategory === "all" ? undefined : filterCategory,
  });

  const { data: history, isLoading: loadingHistory } = trpc.loyaltyRedemption.getRedemptionHistory.useQuery({
    merchantId,
    limit: 10,
  });

  const balance = memberData?.pointsBalance ?? 0;
  const tier = memberData?.tier ?? "bronze";
  const TierIcon = TIER_ICONS[tier] ?? Star;
  const nextTierPoints = memberData?.nextTierThreshold ?? 10000;
  const tierProgress = nextTierPoints > 0 ? Math.min(100, Math.round((balance / nextTierPoints) * 100)) : 100;

  const categories = ["all", ...Array.from(new Set((rewards ?? []).map((r: any) => r.category)))];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="h-6 w-6 text-primary" />
          Loyalty Rewards
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Redeem your loyalty points for exclusive rewards
        </p>
      </div>

      {/* Member Card */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="p-5">
          {loadingMember ? (
            <div className="h-20 animate-pulse bg-muted rounded" />
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={`border ${TIER_COLORS[tier] ?? ""}`}>
                    <TierIcon className="h-3 w-3 mr-1" />
                    {tier.charAt(0).toUpperCase() + tier.slice(1)} Member
                  </Badge>
                </div>
                <div className="text-3xl font-bold flex items-center gap-2">
                  <Coins className="h-7 w-7 text-primary" />
                  {balance.toLocaleString()}
                  <span className="text-base font-normal text-muted-foreground">points</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Member since {memberData?.joinedAt ? new Date(memberData.joinedAt).toLocaleDateString() : "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground mb-1">Progress to next tier</p>
                <Progress value={tierProgress} className="w-32 h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {balance.toLocaleString()} / {nextTierPoints.toLocaleString()} pts
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <Button
            key={cat}
            size="sm"
            variant={filterCategory === cat ? "default" : "outline"}
            className="h-7 text-xs capitalize"
            onClick={() => setFilterCategory(cat)}
          >
            {cat}
          </Button>
        ))}
      </div>

      {/* Rewards Grid */}
      <div>
        <h2 className="text-base font-semibold mb-3">Available Rewards</h2>
        {loadingRewards ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 animate-pulse bg-muted rounded-lg" />
            ))}
          </div>
        ) : !rewards?.length ? (
          <div className="text-center py-12 text-muted-foreground">
            <Gift className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No rewards available in this category</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rewards.map((reward: any) => {
              const canAfford = balance >= reward.pointsCost;
              return (
                <Card
                  key={reward.id}
                  className={`transition-all ${canAfford ? "hover:border-primary/50 cursor-pointer" : "opacity-60"}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <Badge variant="outline" className="text-xs capitalize">{reward.category}</Badge>
                      {!reward.available && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Unavailable</Badge>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm mb-1">{reward.name}</h3>
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{reward.description}</p>
                    <Separator className="mb-3" />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-primary font-bold">
                        <Coins className="h-4 w-4" />
                        {reward.pointsCost.toLocaleString()} pts
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!canAfford || !reward.available}
                        onClick={() => setSelectedReward(reward)}
                      >
                        Redeem
                      </Button>
                    </div>
                    {!canAfford && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Need {(reward.pointsCost - balance).toLocaleString()} more pts
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Redemption History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Redemption History</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse bg-muted rounded" />
              ))}
            </div>
          ) : !history?.length ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No redemptions yet
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <div className="text-sm font-medium">{item.rewardName}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(item.redeemedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-destructive">
                      -{item.pointsCost.toLocaleString()} pts
                    </div>
                    <Badge
                      className={`text-xs border ${
                        item.status === "fulfilled"
                          ? "bg-green-500/10 text-green-700 border-green-500/30"
                          : "bg-yellow-500/10 text-yellow-700 border-yellow-500/30"
                      }`}
                    >
                      {item.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Redemption Modal */}
      {selectedReward && (
        <RedemptionModal
          reward={selectedReward}
          balance={balance}
          memberId={merchantId}
          open={!!selectedReward}
          onClose={() => setSelectedReward(null)}
          onSuccess={() => {
            utils.loyaltyRedemption.getBalance.invalidate();
            utils.loyaltyRedemption.getRedemptionHistory.invalidate();
          }}
        />
      )}
    </div>
  );
}
