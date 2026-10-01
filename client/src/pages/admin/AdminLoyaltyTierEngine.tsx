// @ts-nocheck
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { RefreshCw, Search, Edit, TrendingUp, Award } from "lucide-react";

const TIER_COLORS: Record<string, string> = {
  bronze: "bg-amber-100 text-amber-800",
  silver: "bg-gray-100 text-gray-700",
  gold: "bg-yellow-100 text-yellow-800",
  platinum: "bg-purple-100 text-purple-800",
};

export default function AdminLoyaltyTierEngine() {
  const [search, setSearch] = useState("");

  // Server exposes wave27.loyaltyTier.getTierConfig (read-only). There is no
  // server endpoint for editing tier configuration or recalculating tiers.
  const { data, isLoading, refetch } = trpc.wave27.loyaltyTier.getTierConfig.useQuery(undefined, { staleTime: 30_000 });

  const notAvailable = (action: string) =>
    toast.error(`${action} is not available: the server does not expose this endpoint.`);

  const tiers = data?.tiers ?? [];

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
            <Button size="sm" onClick={() => notAvailable("Recalculate All Tiers")}>
              <TrendingUp className="w-4 h-4 mr-2" />
              Recalculate All Tiers
            </Button>
          </div>
        </div>

        {/* Distribution stats are not exposed by the server (read-only tier config). */}

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
              <Card key={tier.name} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Award className="w-5 h-5" />
                      <span className="capitalize">{tier.name}</span>
                      <Badge className={TIER_COLORS[tier.name?.toLowerCase()] ?? "bg-gray-100 text-gray-700"}>{tier.name}</Badge>
                    </div>
                    <Button size="sm" variant="outline" aria-label="Edit" onClick={() => notAvailable("Tier editing")}><Edit/>Edit
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-gray-50 rounded">
                      <div className="text-xs text-gray-500">Min Points</div>
                      <div className="font-bold">{Number(tier.minPoints || 0).toLocaleString()}</div>
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <div className="text-xs text-gray-500">Max Points</div>
                      <div className="font-bold">{tier.maxPoints ? Number(tier.maxPoints).toLocaleString() : "Unlimited"}</div>
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <div className="text-xs text-gray-500">Cashback Rate</div>
                      <div className="font-bold text-green-600">{tier.cashbackRate}%</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

      </div>
    </AdminLayout>
  );
}
