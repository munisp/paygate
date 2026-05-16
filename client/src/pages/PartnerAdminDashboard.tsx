// @ts-nocheck
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Building2, Plus, CheckCircle2, Clock, AlertTriangle, TrendingUp, Users, DollarSign, Globe, Search, ExternalLink, RefreshCw } from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { toast } from "sonner";
import { useLocation } from "wouter";

// MOCK_PARTNERS removed — data now comes from trpc.partnerOnboarding.list

// REVENUE_DATA is now fetched from partnerOnboarding.revenueData

const TIER_STYLES: Record<string, { label: string; color: string }> = {
  bronze: { label: "Bronze", color: "bg-amber-100 text-amber-700" },
  silver: { label: "Silver", color: "bg-slate-100 text-slate-600" },
  gold: { label: "Gold", color: "bg-yellow-100 text-yellow-700" },
  platinum: { label: "Platinum", color: "bg-purple-100 text-purple-700" },
};

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-emerald-100 text-emerald-700" },
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700" },
  suspended: { label: "Suspended", color: "bg-red-100 text-red-700" },
};

const COUNTRY_FLAGS: Record<string, string> = { NG: "🇳🇬", GH: "🇬🇭", KE: "🇰🇪", ZA: "🇿🇦", UG: "🇺🇬" };

export default function PartnerAdminDashboard() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending" | "suspended">("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCompany, setInviteCompany] = useState("");
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // Real tRPC data
  const { data: partnerData, isLoading, refetch } = trpc.partnerOnboarding.list.useQuery(
    { search: search || undefined, status: statusFilter },
    { staleTime: 30_000 }
  );
  const { data: revenueData = [] } = (trpc.partnerOnboarding.revenueData.useQuery({ months: 6 }, { staleTime: 30_000 }) as any);

  const updateStatusMutation = trpc.partnerOnboarding.updateStatus.useMutation({
    onSuccess: (d) => {
      toast.success(`Partner status updated to ${d.status}`);
      utils.partnerOnboarding.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const inviteMutation = trpc.partnerOnboarding.start.useMutation({
    onSuccess: (data) => {
      toast.success(`Partner onboarding session ${data.sessionId} started`);
      setInviteOpen(false);
      utils.partnerOnboarding.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const partners = partnerData?.partners ?? [];
  const filteredPartners = partners;
  const totalRevenue = partnerData?.totalRevenue ?? 0;
  const totalMerchants = partnerData?.totalMerchants ?? 0;
  const activePartners = partners.filter((p) => p.status === "active").length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-600" />
            Partner Admin Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage partner network, onboarding, and revenue sharing</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()} disabled={isLoading}><RefreshCw/> Refresh
          </Button>
          <Button onClick={() => setInviteOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> Invite Partner
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Partners", value: isLoading ? "…" : String(activePartners), icon: Building2, color: "text-indigo-600" },
          { label: "Total Merchants", value: isLoading ? "…" : String(totalMerchants), icon: Users, color: "text-emerald-600" },
          { label: "Partner Revenue", value: isLoading ? "…" : `₦${(totalRevenue / 1_000_000).toFixed(2)}M`, icon: DollarSign, color: "text-blue-600" },
          { label: "Total Partners", value: isLoading ? "…" : String(partners.length), icon: Globe, color: "text-purple-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="partners">
        <TabsList>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="partners">
          <Card>
            <CardHeader className="pb-2">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search partners..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Merchants</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse w-16" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredPartners.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No partners found</TableCell></TableRow>
                  ) : filteredPartners.map((p) => {
                    const tier = TIER_STYLES[p.tier] ?? TIER_STYLES.bronze;
                    const st = STATUS_STYLES[p.status] ?? STATUS_STYLES.pending;
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{p.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{p.slug}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-lg">{COUNTRY_FLAGS[p.country] ?? "🌍"}</span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${tier.color}`}>{tier.label}</span>
                        </TableCell>
                        <TableCell className="text-right font-semibold">₦{((p.revenueNGN ?? p.revenue ?? 0) / 1000).toFixed(0)}k</TableCell>
                        <TableCell className="text-right">{p.merchantCount ?? p.merchants ?? 0}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.joinedAt ?? p.joinDate}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}>{st.label}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {p.status === "active" ? (
                              <Button size="sm" variant="outline" className="text-xs text-red-600" disabled={updateStatusMutation.isPending}
                                onClick={() => updateStatusMutation.mutate({ partnerId: p.id, status: "suspended" })}>
                                Suspend
                              </Button>
                            ) : p.status === "suspended" ? (
                              <Button size="sm" variant="outline" className="text-xs text-emerald-600" disabled={updateStatusMutation.isPending}
                                onClick={() => updateStatusMutation.mutate({ partnerId: p.id, status: "active" })}>
                                Activate
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" className="text-xs text-indigo-600" disabled={updateStatusMutation.isPending}
                                onClick={() => updateStatusMutation.mutate({ partnerId: p.id, status: "active" })}>
                                Approve
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/tenant/${p.id}`)}>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Partner Revenue Trend (6 months)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revenueData.length > 0 ? revenueData : []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₦${(v / 1_000_000).toFixed(1)}M`} />
                  <Tooltip formatter={(v: number) => `₦${v.toLocaleString("en-NG")}`} />
                  <Bar dataKey="revenue" fill="#6366f1" name="Revenue" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="onboarding">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {partners.filter((p) => p.status === "pending").map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-4 border rounded-lg bg-amber-50 border-amber-200">
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-amber-600" />
                      <div>
                        <p className="font-semibold text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.contactEmail ?? p.contact} · Applied {p.joinedAt ?? p.joinDate}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="text-xs text-emerald-600" disabled={updateStatusMutation.isPending}
                        onClick={() => updateStatusMutation.mutate({ partnerId: p.id, status: "active" })}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs text-red-600" disabled={updateStatusMutation.isPending}
                        onClick={() => updateStatusMutation.mutate({ partnerId: p.id, status: "suspended" })}>
                        <AlertTriangle className="w-3 h-3 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                ))}
                {partners.filter((p) => p.status === "pending").length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                    <p className="text-sm">No pending applications</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite New Partner</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Company Name</label>
              <Input value={inviteCompany} onChange={(e) => setInviteCompany(e.target.value)} placeholder="Company name" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Contact Email</label>
              <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="partner@company.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={() => inviteMutation.mutate({ inviteCode: undefined })} disabled={inviteMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {inviteMutation.isPending ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
