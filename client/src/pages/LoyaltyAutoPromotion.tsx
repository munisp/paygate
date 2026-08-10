// @ts-nocheck
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Star, TrendingUp, Users, Zap, RefreshCw } from "lucide-react";

const TIER_COLORS: Record<string, string> = {
  bronze: "bg-amber-100 text-amber-800",
  silver: "bg-gray-100 text-gray-700",
  gold: "bg-yellow-100 text-yellow-800",
  platinum: "bg-purple-100 text-purple-800",
};

const TIER_ICONS: Record<string, string> = {
  bronze: "🥉",
  silver: "🥈",
  gold: "🥇",
  platinum: "💎",
};

export default function LoyaltyAutoPromotion() {
  const userId = 1;

  const { data: account, isLoading } = trpc.wave29.loyalty.getConsumerPoints.useQuery({ userId }, { staleTime: 30_000 });
  const { data: history } = trpc.wave29.loyalty.getPromotionHistory.useQuery({ userId }, { staleTime: 30_000 });

  const runPromotion = trpc.wave29.loyalty.runPromotion.useMutation({
    onSuccess: (data) => {
      if (data.promoted) {
        toast.success(`Tier upgraded: ${data.oldTier} → ${data.newTier}`);
      } else {
        toast.info(`No tier change needed (${data.reason})`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const runBatch = trpc.wave29.loyalty.runBatchPromotion.useMutation({
    onSuccess: (data) => {
      toast.success(`Batch promotion complete: ${data.promoted} of ${data.total} users promoted`);
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-4 bg-muted rounded animate-pulse w-full" />
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Loyalty Auto-Promotion</h1>
          <p className="text-gray-500 mt-1">Automatically promote consumers to higher tiers based on points</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runPromotion.mutate({ userId })}
            disabled={runPromotion.isPending}
          >
            <Zap className="w-4 h-4 mr-2" />
            Promote User #{userId}
          </Button>
          <Button
            size="sm"
            aria-label="Refresh" onClick={() => runBatch.mutate()}
            disabled={runBatch.isPending}
          ><RefreshCw/>
            Run Batch Promotion
          </Button>
        </div>
      </div>

      {/* Tier Overview */}
      <div className="grid grid-cols-4 gap-4">
        {["bronze", "silver", "gold", "platinum"].map(tier => (
          <Card key={tier} className={account?.current_tier === tier ? "ring-2 ring-blue-500" : ""}>
            <CardContent className="pt-4 text-center">
              <div className="text-3xl mb-2">{TIER_ICONS[tier]}</div>
              <Badge className={TIER_COLORS[tier]}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</Badge>
              {account?.current_tier === tier && (
                <p className="text-xs text-blue-600 mt-1 font-medium">Current Tier</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Current Account */}
      {account && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" />
              User #{userId} Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500">Current Tier</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xl">{TIER_ICONS[account.current_tier] ?? "⭐"}</span>
                  <Badge className={TIER_COLORS[account.current_tier] ?? ""}>
                    {account.current_tier}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Points</p>
                <p className="text-2xl font-bold mt-1">{Number(account.total_points ?? 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Cashback Rate</p>
                <p className="text-2xl font-bold mt-1 text-green-600">
                  {account.cashback_pct ?? 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Promotion History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Promotion History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Points at Promotion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(history ?? []).map((h: any, i: number) => (
                <TableRow key={i}>
                  <TableCell>{new Date(h.promoted_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge className={TIER_COLORS[h.old_tier] ?? ""}>{h.old_tier}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={TIER_COLORS[h.new_tier] ?? ""}>{h.new_tier}</Badge>
                  </TableCell>
                  <TableCell>{Number(h.points_at_promotion).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {(history ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-gray-400 py-8">
                    No promotion history yet. Run a promotion to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Tier Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle>Tier Thresholds</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { tier: "bronze", min: 0, cashback: 0.5, color: "bg-amber-500" },
              { tier: "silver", min: 1000, cashback: 1.0, color: "bg-gray-400" },
              { tier: "gold", min: 5000, cashback: 1.5, color: "bg-yellow-500" },
              { tier: "platinum", min: 20000, cashback: 2.0, color: "bg-purple-500" },
            ].map(t => (
              <div key={t.tier} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${t.color}`} />
                  <span className="font-medium capitalize">{t.tier}</span>
                </div>
                <div className="flex gap-8 text-sm">
                  <div>
                    <span className="text-gray-500">Min Points: </span>
                    <span className="font-medium">{t.min.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Cashback: </span>
                    <span className="font-medium text-green-600">{t.cashback}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
