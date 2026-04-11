import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Star, Search, Gift, RefreshCw, Award } from "lucide-react";

export default function RestaurantLoyalty() {
  const { isAuthenticated } = useAuth();
  const [customerId, setCustomerId] = useState("");
  const [lookupId, setLookupId] = useState<number | null>(null);
  const [programForm, setProgramForm] = useState({ earnRate: "1", redeemRate: "100", active: true });
  const [redeemPoints, setRedeemPoints] = useState("");

  const utils = trpc.useUtils();

  const {isLoading, data: program, refetch: refetchProgram} = trpc.restaurant.getLoyaltyProgram.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: account } = trpc.restaurant.getLoyaltyAccount.useQuery(
    { customerId: lookupId! },
    { enabled: !!lookupId }
  );

  const { data: history } = trpc.restaurant.getLoyaltyHistory.useQuery(
    { customerId: lookupId! },
    { enabled: !!lookupId }
  );

  const upsertProgram = trpc.restaurant.upsertLoyaltyProgram.useMutation({
    onSuccess: () => { refetchProgram(); toast.success("Loyalty program saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const earnMutation = trpc.restaurant.earnPoints.useMutation({
    onSuccess: (r: any) => {
      toast.success(`Earned ${r.pointsEarned} points`);
      utils.restaurant.getLoyaltyAccount.invalidate();
      utils.restaurant.getLoyaltyHistory.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const redeemMutation = trpc.restaurant.redeemPoints.useMutation({
    onSuccess: (r: any) => {
      toast.success(`Redeemed ${r.pointsRedeemed} points = ₦${(r.koboValue / 100).toFixed(2)}`);
      utils.restaurant.getLoyaltyAccount.invalidate();
      utils.restaurant.getLoyaltyHistory.invalidate();
      setRedeemPoints("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const prog: any = program ?? {};
  const acct: any = account ?? {};
  const hist: any[] = (history as any) ?? [];

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Loyalty Programme</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure earn/redeem rates and manage customer points</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Programme settings */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Award className="w-4 h-4" /> Programme Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Earn Rate (points per ₦1,000 spent)</label>
              <Input
                type="number"
                className="mt-1"
                value={programForm.earnRate}
                onChange={(e: any) => setProgramForm({ ...programForm, earnRate: e.target.value })}
                placeholder={prog.earnRate?.toString() ?? "1"}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Redeem Rate (kobo per point)</label>
              <Input
                type="number"
                className="mt-1"
                value={programForm.redeemRate}
                onChange={(e: any) => setProgramForm({ ...programForm, redeemRate: e.target.value })}
                placeholder={prog.koboPerPoint?.toString() ?? "100"}
              />
              <p className="text-xs text-muted-foreground mt-1">100 kobo = ₦1 per point</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={programForm.active}
                onCheckedChange={(v: any) => setProgramForm({ ...programForm, active: v })}
              />
              <span className="text-sm">Programme active</span>
            </div>
            <Button
              className="w-full"
              onClick={() => upsertProgram.mutate({
                pointsPerKobo: parseInt(programForm.earnRate) || 1,
                redeemRate: parseInt(programForm.redeemRate) || 100,
                active: programForm.active,
              })}
            >
              Save Programme
            </Button>

            {prog.earnRate && (
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <div className="font-medium">Current Programme</div>
                <div>Earn rate: <span className="font-mono">{prog.earnRate} pts / ₦1,000</span></div>
                <div>Redeem rate: <span className="font-mono">₦{(prog.koboPerPoint / 100).toFixed(2)} / point</span></div>
                <div>Status: <span className={prog.active ? "text-green-600" : "text-red-600"}>{prog.active ? "Active" : "Inactive"}</span></div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer lookup */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Search className="w-4 h-4" /> Customer Lookup</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Customer ID"
                value={customerId}
                onChange={(e: any) => setCustomerId(e.target.value)}
                type="number"
              />
              <Button variant="outline" onClick={() => setLookupId(parseInt(customerId) || null)}>
                <Search className="w-4 h-4" />
              </Button>
            </div>

            {acct.customerId && (
              <div className="space-y-3">
                <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span className="font-bold text-lg">{acct.pointsBalance ?? 0} points</span>
                  </div>
                  <div>Lifetime earned: {acct.lifetimeEarned ?? 0} pts</div>
                  <div>Lifetime redeemed: {acct.lifetimeRedeemed ?? 0} pts</div>
                  <div>Value: ₦{(((acct.pointsBalance ?? 0) * (prog.koboPerPoint ?? 100)) / 100).toFixed(2)}</div>
                </div>

                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Points to redeem"
                    value={redeemPoints}
                    onChange={(e: any) => setRedeemPoints(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={!redeemPoints || parseInt(redeemPoints) <= 0}
                    onClick={() => redeemMutation.mutate({ customerId: lookupId!, points: parseInt(redeemPoints) })}
                  >
                    <Gift className="w-4 h-4 mr-1" /> Redeem
                  </Button>
                </div>

                {/* History */}
                {hist.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Recent Activity</div>
                    {hist.slice(0, 8).map((entry: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs py-1 border-b last:border-0">
                        <span className={entry.entryType === "earn" ? "text-green-600" : "text-red-600"}>
                          {entry.entryType === "earn" ? "+" : ""}{entry.points} pts
                        </span>
                        <span className="text-muted-foreground">{new Date(entry.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
