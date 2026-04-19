import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Star, RefreshCw, Search, Edit, TrendingUp, Users, Award } from "lucide-react";
import { useForm } from "react-hook-form";

const TIER_COLORS: Record<string, string> = {
  bronze: "bg-amber-100 text-amber-800",
  silver: "bg-gray-100 text-gray-700",
  gold: "bg-yellow-100 text-yellow-800",
  platinum: "bg-purple-100 text-purple-800",
};

export default function AdminLoyaltyTierEngine() {
  const [search, setSearch] = useState("");
  const [editingTier, setEditingTier] = useState<any>(null);
  const { register, handleSubmit, reset, setValue } = useForm();

  const { data, isLoading, refetch } = trpc.wave27.loyaltyTiers.list.useQuery({ search: search || undefined });

  const updateMutation = trpc.wave27.loyaltyTiers.update.useMutation({
    onSuccess: () => { toast.success("Tier configuration updated"); refetch(); setEditingTier(null); reset(); },
    onError: (e) => toast.error(e.message),
  });

  const recalcMutation = trpc.wave27.loyaltyTiers.recalculateAll.useMutation({
    onSuccess: (d) => { toast.success(`${d.updated} consumer tiers recalculated`); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const tiers = data?.tiers ?? [];
  const stats = data?.stats ?? { totalConsumers: 0, bronzeCount: 0, silverCount: 0, goldCount: 0, platinumCount: 0 };

  const handleEdit = (tier: any) => {
    setEditingTier(tier);
    setValue("minPoints", tier.min_points);
    setValue("maxPoints", tier.max_points);
    setValue("cashbackRate", tier.cashback_rate);
    setValue("bonusMultiplier", tier.bonus_multiplier);
    setValue("perksDescription", tier.perks_description);
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Loyalty Tier Engine</h1>
            <p className="text-gray-500 text-sm mt-1">Configure loyalty tiers, point thresholds, and cashback rates</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
            <Button size="sm" onClick={() => recalcMutation.mutate()} disabled={recalcMutation.isPending}>
              <TrendingUp className="w-4 h-4 mr-2" />
              {recalcMutation.isPending ? "Recalculating..." : "Recalculate All Tiers"}
            </Button>
          </div>
        </div>

        {/* Distribution Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><Users className="w-4 h-4 text-gray-500" /><span className="text-sm text-gray-500">Total</span></div>
              <div className="text-2xl font-bold">{stats.totalConsumers}</div>
            </CardContent>
          </Card>
          {[
            { tier: "bronze", count: stats.bronzeCount, color: "text-amber-600" },
            { tier: "silver", count: stats.silverCount, color: "text-gray-600" },
            { tier: "gold", count: stats.goldCount, color: "text-yellow-600" },
            { tier: "platinum", count: stats.platinumCount, color: "text-purple-600" },
          ].map(({ tier, count, color }) => (
            <Card key={tier}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1"><Star className={`w-4 h-4 ${color}`} /><span className="text-sm text-gray-500 capitalize">{tier}</span></div>
                <div className={`text-2xl font-bold ${color}`}>{count}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search tier configuration..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Tier Configurations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isLoading ? (
            <div className="col-span-2 text-center py-8 text-gray-500">Loading tier configurations...</div>
          ) : tiers.length === 0 ? (
            <div className="col-span-2 text-center py-8 text-gray-500">No tier configurations found</div>
          ) : (
            tiers.map((tier: any) => (
              <Card key={tier.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Award className="w-5 h-5" />
                      <span className="capitalize">{tier.tier_name}</span>
                      <Badge className={TIER_COLORS[tier.tier_name] ?? "bg-gray-100 text-gray-700"}>{tier.tier_name}</Badge>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleEdit(tier)}>
                      <Edit className="w-3 h-3 mr-1" />Edit
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-gray-50 rounded">
                      <div className="text-xs text-gray-500">Min Points</div>
                      <div className="font-bold">{Number(tier.min_points || 0).toLocaleString()}</div>
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <div className="text-xs text-gray-500">Max Points</div>
                      <div className="font-bold">{tier.max_points ? Number(tier.max_points).toLocaleString() : "Unlimited"}</div>
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <div className="text-xs text-gray-500">Cashback Rate</div>
                      <div className="font-bold text-green-600">{tier.cashback_rate}%</div>
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <div className="text-xs text-gray-500">Bonus Multiplier</div>
                      <div className="font-bold text-purple-600">{tier.bonus_multiplier}x</div>
                    </div>
                  </div>
                  {tier.perks_description && (
                    <div className="p-2 bg-blue-50 rounded text-xs text-blue-700">{tier.perks_description}</div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Edit Tier Dialog */}
        <Dialog open={!!editingTier} onOpenChange={() => setEditingTier(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit {editingTier?.tier_name?.toUpperCase()} Tier</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit((data) => updateMutation.mutate({ tierId: editingTier?.id, ...data } as any))} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Min Points</label>
                  <Input type="number" {...register("minPoints", { required: true, min: 0 })} />
                </div>
                <div>
                  <label className="text-sm font-medium">Max Points (blank = unlimited)</label>
                  <Input type="number" {...register("maxPoints")} />
                </div>
                <div>
                  <label className="text-sm font-medium">Cashback Rate (%)</label>
                  <Input type="number" step="0.1" {...register("cashbackRate", { required: true, min: 0, max: 100 })} />
                </div>
                <div>
                  <label className="text-sm font-medium">Bonus Multiplier</label>
                  <Input type="number" step="0.1" {...register("bonusMultiplier", { required: true, min: 1 })} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Perks Description</label>
                <Input {...register("perksDescription")} placeholder="e.g. Free transfers, priority support..." />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingTier(null)}>Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
