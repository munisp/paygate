// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Building2, Plus, CheckCircle2, Clock, AlertTriangle, TrendingUp, Users, DollarSign, Globe, Search, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const MOCK_PARTNERS = [
  { id: "PTR-001", name: "FinTech Solutions Ltd", slug: "fintech-solutions", status: "active", tier: "gold", revenue: 1_250_000, merchants: 45, joinDate: "2025-11-15", country: "NG", contact: "ceo@fintechsolutions.ng" },
  { id: "PTR-002", name: "PayEasy Africa", slug: "payeasy-africa", status: "active", tier: "silver", revenue: 680_000, merchants: 22, joinDate: "2025-12-01", country: "GH", contact: "admin@payeasy.africa" },
  { id: "PTR-003", name: "QuickPay Kenya", slug: "quickpay-kenya", status: "pending", tier: "bronze", revenue: 0, merchants: 0, joinDate: "2026-04-10", country: "KE", contact: "info@quickpay.ke" },
  { id: "PTR-004", name: "SecurePay SA", slug: "securepay-sa", status: "active", tier: "platinum", revenue: 3_800_000, merchants: 120, joinDate: "2025-09-01", country: "ZA", contact: "partners@securepay.co.za" },
  { id: "PTR-005", name: "MobileMoney Uganda", slug: "mobilemoney-ug", status: "suspended", tier: "bronze", revenue: 45_000, merchants: 3, joinDate: "2026-01-20", country: "UG", contact: "ops@mobilemoney.ug" },
];

const REVENUE_DATA = [
  { month: "Nov", revenue: 2_800_000, partners: 3 },
  { month: "Dec", revenue: 3_200_000, partners: 3 },
  { month: "Jan", revenue: 3_800_000, partners: 4 },
  { month: "Feb", revenue: 4_100_000, partners: 4 },
  { month: "Mar", revenue: 4_600_000, partners: 5 },
  { month: "Apr", revenue: 5_730_000, partners: 5 },
];

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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCompany, setInviteCompany] = useState("");
  const [, navigate] = useLocation();

  const inviteMutation = trpc.partnerOnboarding.start.useMutation({
    onSuccess: (data) => {
      toast.success(`Partner onboarding session ${data.sessionId} started`);
      setInviteOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredPartners = MOCK_PARTNERS.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.slug.includes(search.toLowerCase())
  );

  const totalRevenue = MOCK_PARTNERS.reduce((s, p) => s + p.revenue, 0);
  const totalMerchants = MOCK_PARTNERS.reduce((s, p) => s + p.merchants, 0);
  const activePartners = MOCK_PARTNERS.filter((p) => p.status === "active").length;

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
          <Button variant="outline" size="sm" onClick={() => navigate("/partner/onboard/wizard")}>
            <ExternalLink className="w-4 h-4 mr-1" /> Onboarding Wizard
          </Button>
          <Button onClick={() => setInviteOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> Invite Partner
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Partners", value: String(activePartners), icon: Building2, color: "text-indigo-600" },
          { label: "Total Merchants", value: String(totalMerchants), icon: Users, color: "text-emerald-600" },
          { label: "Partner Revenue (All Time)", value: `₦${(totalRevenue / 1_000_000).toFixed(2)}M`, icon: DollarSign, color: "text-blue-600" },
          { label: "Countries", value: "5", icon: Globe, color: "text-purple-600" },
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
                  {filteredPartners.map((p) => {
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
                        <TableCell className="text-right font-semibold">₦{(p.revenue / 1000).toFixed(0)}k</TableCell>
                        <TableCell className="text-right">{p.merchants}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.joinDate}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}>{st.label}</span>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => toast.info(`Viewing ${p.name} details`)}>
                            View
                          </Button>
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
                <BarChart data={REVENUE_DATA}>
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
                {MOCK_PARTNERS.filter((p) => p.status === "pending").map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-4 border rounded-lg bg-amber-50 border-amber-200">
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-amber-600" />
                      <div>
                        <p className="font-semibold text-sm">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.contact} · Applied {p.joinDate}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="text-xs text-emerald-600" onClick={() => toast.success(`${p.name} approved`)}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs text-red-600" onClick={() => toast.error(`${p.name} rejected`)}>
                        <AlertTriangle className="w-3 h-3 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                ))}
                {MOCK_PARTNERS.filter((p) => p.status === "pending").length === 0 && (
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
            <Button onClick={() => inviteMutation.mutate({ inviteCode: undefined })} disabled={inviteMutation.isLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {inviteMutation.isLoading ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
