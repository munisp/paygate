import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Users, Settings, Globe, DollarSign, RefreshCw, Plus, Trash2,
  Edit, CheckCircle, XCircle, Eye, Building2, ArrowLeft, CreditCard, BarChart3
} from "lucide-react";

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-amber-100 text-amber-700",
  admin: "bg-purple-100 text-purple-700",
  member: "bg-blue-100 text-blue-700",
  viewer: "bg-gray-100 text-gray-700",
};

const TRANSACTION_TYPES = ["transfer", "payment_link", "virtual_card", "bnpl", "fx"];

export default function TenantAdminDashboard() {
  const [location] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const tenantId = params.get("tenantId") ?? "";

  const [activeTab, setActiveTab] = useState("overview");
  const [showInviteUser, setShowInviteUser] = useState(false);
  const [showEditBranding, setShowEditBranding] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", name: "", role: "member" as "admin" | "member" | "viewer" });
  const [brandingForm, setBrandingForm] = useState({
    primaryColor: "#6366f1", accentColor: "#8b5cf6", fontFamily: "Inter",
    footerText: "", supportEmail: "", customDomain: "", logoUrl: "",
  });

  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } =
    trpc.wave28.tenantAdmin.getOverview.useQuery({ tenantId }, { enabled: !!tenantId }, { staleTime: 30_000 });

  const { data: users, refetch: refetchUsers } =
    trpc.wave28.tenantAdmin.listUsers.useQuery({ tenantId }, { enabled: !!tenantId && activeTab === "users" }, { staleTime: 30_000 });

  const { data: corridors, refetch: refetchCorridors } =
    trpc.wave28.tenantAdmin.getCorridors.useQuery({ tenantId }, { enabled: !!tenantId && activeTab === "corridors" }, { staleTime: 30_000 });

  const { data: feeOverrides, refetch: refetchFees } =
    trpc.wave28.tenantAdmin.getFeeOverrides.useQuery({ tenantId }, { enabled: !!tenantId && activeTab === "fees" }, { staleTime: 30_000 });

  const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
  const { data: usageData } =
    trpc.usageMetering.getUsage.useQuery({ tenantId, period: currentPeriod }, { enabled: !!tenantId && activeTab === "billing" }, { staleTime: 30_000 });

  const { data: quotaData } =
    trpc.usageMetering.checkQuota.useQuery({ tenantId }, { enabled: !!tenantId && activeTab === "billing" }, { staleTime: 30_000 });

  const { data: invoices } =
    trpc.usageMetering.getInvoices.useQuery({ tenantId }, { enabled: !!tenantId && activeTab === "billing" }, { staleTime: 30_000 });

  const inviteUserMutation = trpc.wave28.tenantAdmin.inviteUser.useMutation({
    onSuccess: () => { toast.success("User invited"); setShowInviteUser(false); refetchUsers(); },
    onError: (e) => toast.error(e.message),
  });

  const removeUserMutation = trpc.wave28.tenantAdmin.removeUser.useMutation({
    onSuccess: () => { toast.success("User removed"); refetchUsers(); },
    onError: (e) => toast.error(e.message),
  });

  const updateRoleMutation = trpc.wave28.tenantAdmin.updateUserRole.useMutation({
    onSuccess: () => { toast.success("Role updated"); refetchUsers(); },
    onError: (e) => toast.error(e.message),
  });

  const updateCorridorMutation = trpc.wave28.tenantAdmin.updateCorridor.useMutation({
    onSuccess: () => { toast.success("Corridor updated"); refetchCorridors(); },
    onError: (e) => toast.error(e.message),
  });

  const updateFeeMutation = trpc.wave28.tenantAdmin.updateFeeOverride.useMutation({
    onSuccess: () => { toast.success("Fee updated"); refetchFees(); },
    onError: (e) => toast.error(e.message),
  });

  const updateBrandingMutation = trpc.wave28.tenantAdmin.updateBranding.useMutation({
    onSuccess: () => { toast.success("Branding updated"); setShowEditBranding(false); refetchOverview(); },
    onError: (e) => toast.error(e.message),
  });

  if (!tenantId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full text-center p-8">
          <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-700">No Tenant Selected</h2>
          <p className="text-gray-500 mt-2">Please provide a tenantId in the URL query parameter.</p>
          <Button className="mt-4" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />Go Back
          </Button>
        </Card>
      </div>
    );
  }

  const tenant = overview?.tenant;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt="logo" className="w-8 h-8 rounded object-contain" />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
              style={{ backgroundColor: tenant?.primary_color ?? "#6366f1" }}>
              {tenant?.name?.charAt(0) ?? "T"}
            </div>
          )}
          <div>
            <h1 className="font-bold text-gray-900">{tenant?.name ?? "Tenant Dashboard"}</h1>
            <div className="flex items-center gap-2">
              <Badge className="bg-indigo-100 text-indigo-700 text-xs capitalize">{tenant?.plan ?? "starter"}</Badge>
              <Badge className={tenant?.status === "active" ? "bg-green-100 text-green-700 text-xs" : "bg-red-100 text-red-700 text-xs"}>
                {tenant?.status ?? "unknown"}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/partner/preview?tenantId=${tenantId}`, "_blank")}>
            <Eye className="w-4 h-4 mr-2" />Preview
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetchOverview()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview"><Building2 className="w-4 h-4 mr-2" />Overview</TabsTrigger>
            <TabsTrigger value="users"><Users className="w-4 h-4 mr-2" />Users</TabsTrigger>
            <TabsTrigger value="corridors"><Globe className="w-4 h-4 mr-2" />Corridors</TabsTrigger>
            <TabsTrigger value="fees"><DollarSign className="w-4 h-4 mr-2" />Fees</TabsTrigger>
            <TabsTrigger value="branding"><Settings className="w-4 h-4 mr-2" />Branding</TabsTrigger>
            <TabsTrigger value="billing"><CreditCard className="w-4 h-4 mr-2" />Billing</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            {overviewLoading ? (
              <div className="text-center py-8 text-gray-500">Loading overview...</div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-gray-500">Sub-Users</div>
                      <div className="text-2xl font-bold mt-1">{tenant?.user_count ?? 0}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-gray-500">Active Corridors</div>
                      <div className="text-2xl font-bold mt-1">{tenant?.corridor_count ?? 0}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-gray-500">Fee Overrides</div>
                      <div className="text-2xl font-bold mt-1">{tenant?.fee_override_count ?? 0}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm text-gray-500">Plan</div>
                      <div className="text-2xl font-bold mt-1 capitalize">{tenant?.plan ?? "—"}</div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader><CardTitle>Tenant Details</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-gray-500">Tenant ID:</span> <code className="font-mono text-xs bg-gray-100 px-1 rounded">{tenantId}</code></div>
                      <div><span className="text-gray-500">Slug:</span> <span className="font-medium">{tenant?.slug}</span></div>
                      <div><span className="text-gray-500">Email:</span> <span>{tenant?.email}</span></div>
                      <div><span className="text-gray-500">Country:</span> <span>{tenant?.country}</span></div>
                      <div><span className="text-gray-500">Custom Domain:</span> <span>{tenant?.custom_domain ?? "Not configured"}</span></div>
                      <div><span className="text-gray-500">Support Email:</span> <span>{tenant?.support_email ?? "—"}</span></div>
                    </div>
                  </CardContent>
                </Card>

                {overview?.recentActivity && overview.recentActivity.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {overview.recentActivity.map((a: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                            <span className="font-mono text-xs text-gray-600">{a.action}</span>
                            <span className="text-gray-400 text-xs">{new Date(a.created_at).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Sub-Users ({(users ?? []).length})</h2>
                <Dialog open={showInviteUser} onOpenChange={setShowInviteUser}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="w-4 h-4 mr-2" />Invite User</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
                    <div className="space-y-3 pt-2">
                      <div>
                        <Label>Name</Label>
                        <Input value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} className="mt-1" />
                      </div>
                      <div>
                        <Label>Email</Label>
                        <Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} className="mt-1" />
                      </div>
                      <div>
                        <Label>Role</Label>
                        <Select value={inviteForm.role} onValueChange={(v: any) => setInviteForm({ ...inviteForm, role: v })}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button className="w-full" onClick={() => inviteUserMutation.mutate({ tenantId, ...inviteForm })}
                        disabled={!inviteForm.email || !inviteForm.name || inviteUserMutation.isPending}>
                        {inviteUserMutation.isPending ? "Inviting..." : "Send Invite"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <Card>
                <CardContent className="p-0">
                  {(users ?? []).length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No users yet. Invite your first team member.</div>
                  ) : (
                    <div className="overflow-x-auto"><table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-gray-500">
                          <th className="text-left py-3 px-4">Name</th>
                          <th className="text-left py-3 px-4">Email</th>
                          <th className="text-left py-3 px-4">Role</th>
                          <th className="text-left py-3 px-4">Status</th>
                          <th className="text-left py-3 px-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(users ?? []).map((u: any) => (
                          <tr key={u.id} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4 font-medium">{u.name}</td>
                            <td className="py-3 px-4 text-gray-600">{u.email}</td>
                            <td className="py-3 px-4">
                              <Select value={u.role} onValueChange={(v: any) => updateRoleMutation.mutate({ tenantId, email: u.email, role: v })}>
                                <SelectTrigger className="w-28 h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="owner">Owner</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="member">Member</SelectItem>
                                  <SelectItem value="viewer">Viewer</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="py-3 px-4">
                              <Badge className={u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                                {u.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <Button size="sm" variant="outline" className="text-red-600 border-red-200 h-7"
                                aria-label="Delete" onClick={() => removeUserMutation.mutate({ tenantId, email: u.email })}
                                disabled={u.role === "owner"}><Trash2/>
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Corridors Tab */}
          <TabsContent value="corridors">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Currency Corridors ({(corridors ?? []).length})</h2>
              <Card>
                <CardContent className="p-0">
                  {(corridors ?? []).length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No corridors configured.</div>
                  ) : (
                    <div className="overflow-x-auto"><table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-gray-500">
                          <th className="text-left py-3 px-4">Corridor</th>
                          <th className="text-center py-3 px-4">Fee %</th>
                          <th className="text-center py-3 px-4">Min Amount</th>
                          <th className="text-center py-3 px-4">Max Amount</th>
                          <th className="text-center py-3 px-4">Status</th>
                          <th className="text-left py-3 px-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(corridors ?? []).map((c: any) => (
                          <tr key={c.id} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4 font-medium">{c.source_currency} → {c.dest_currency}</td>
                            <td className="py-3 px-4 text-center">
                              <Input type="number" step="0.1" min="0" max="20"
                                defaultValue={c.fee_pct}
                                className="w-20 h-7 text-center text-xs"
                                onBlur={(e) => updateCorridorMutation.mutate({
                                  tenantId, sourceCurrency: c.source_currency, destCurrency: c.dest_currency,
                                  isEnabled: c.is_enabled, feePct: Number(e.target.value),
                                })} />
                            </td>
                            <td className="py-3 px-4 text-center text-gray-600">{Number(c.min_amount).toLocaleString()}</td>
                            <td className="py-3 px-4 text-center text-gray-600">{c.max_amount ? Number(c.max_amount).toLocaleString() : "Unlimited"}</td>
                            <td className="py-3 px-4 text-center">
                              <Badge className={c.is_enabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                                {c.is_enabled ? "Active" : "Disabled"}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <Button size="sm" variant="outline" className="h-7"
                                onClick={() => updateCorridorMutation.mutate({
                                  tenantId, sourceCurrency: c.source_currency, destCurrency: c.dest_currency,
                                  isEnabled: !c.is_enabled, feePct: Number(c.fee_pct),
                                })}>
                                {c.is_enabled ? <XCircle className="w-3 h-3 text-red-500" /> : <CheckCircle className="w-3 h-3 text-green-500" />}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Fees Tab */}
          <TabsContent value="fees">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Fee Overrides</h2>
              <Card>
                <CardContent className="p-4">
                  {(feeOverrides ?? []).length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No fee overrides configured.</div>
                  ) : (
                    <div className="space-y-3">
                      {TRANSACTION_TYPES.map((type) => {
                        const override = (feeOverrides ?? []).find((f: any) => f.transaction_type === type);
                        return (
                          <div key={type} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                            <div className="w-32 font-medium text-sm capitalize">{type.replace("_", " ")}</div>
                            <div className="flex items-center gap-2">
                              <Select
                                defaultValue={override?.fee_type ?? "percentage"}
                                onValueChange={(v: any) => override && updateFeeMutation.mutate({
                                  tenantId, transactionType: type, feeType: v, feeValue: Number(override.fee_value),
                                })}>
                                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="percentage">Percentage</SelectItem>
                                  <SelectItem value="flat">Flat</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="number" step="0.1" min="0"
                                defaultValue={override?.fee_value ?? 1.5}
                                className="w-24 h-8 text-sm"
                                onBlur={(e) => updateFeeMutation.mutate({
                                  tenantId, transactionType: type,
                                  feeType: override?.fee_type ?? "percentage",
                                  feeValue: Number(e.target.value),
                                })} />
                              <span className="text-xs text-gray-500">{override?.fee_type === "flat" ? "NGN" : "%"}</span>
                            </div>
                            {override && (
                              <Badge className={override.is_active ? "bg-green-100 text-green-700 text-xs" : "bg-gray-100 text-gray-600 text-xs"}>
                                {override.is_active ? "Active" : "Inactive"}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Branding Tab */}
          <TabsContent value="branding">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Branding Settings</h2>
                <Button size="sm" onClick={() => {
                  setBrandingForm({
                    primaryColor: tenant?.primary_color ?? "#6366f1",
                    accentColor: tenant?.accent_color ?? "#8b5cf6",
                    fontFamily: tenant?.font_family ?? "Inter",
                    footerText: tenant?.footer_text ?? "",
                    supportEmail: tenant?.support_email ?? "",
                    customDomain: tenant?.custom_domain ?? "",
                    logoUrl: tenant?.logo_url ?? "",
                  });
                  setShowEditBranding(true);
                }}>
                  <Edit className="w-4 h-4 mr-2" />Edit Branding
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">Current Branding</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg" style={{ backgroundColor: tenant?.primary_color ?? "#6366f1" }} />
                      <div>
                        <div className="text-xs text-gray-500">Primary Color</div>
                        <div className="font-mono text-sm">{tenant?.primary_color ?? "#6366f1"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg" style={{ backgroundColor: tenant?.accent_color ?? "#8b5cf6" }} />
                      <div>
                        <div className="text-xs text-gray-500">Accent Color</div>
                        <div className="font-mono text-sm">{tenant?.accent_color ?? "#8b5cf6"}</div>
                      </div>
                    </div>
                    <div className="text-sm"><span className="text-gray-500">Font: </span>{tenant?.font_family ?? "Inter"}</div>
                    <div className="text-sm"><span className="text-gray-500">Domain: </span>{tenant?.custom_domain ?? "Not set"}</div>
                    <div className="text-sm"><span className="text-gray-500">Support: </span>{tenant?.support_email ?? "Not set"}</div>
                  </CardContent>
                </Card>

                {/* Live Preview */}
                <Card>
                  <CardHeader><CardTitle className="text-base">Live Preview</CardTitle></CardHeader>
                  <CardContent>
                    <div className="border rounded-lg p-4 bg-white" style={{ borderColor: tenant?.primary_color ?? "#6366f1" }}>
                      <div className="flex items-center gap-2 mb-3">
                        {tenant?.logo_url ? (
                          <img src={tenant.logo_url} alt="logo" className="w-7 h-7 rounded object-contain" />
                        ) : (
                          <div className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold"
                            style={{ backgroundColor: tenant?.primary_color ?? "#6366f1" }}>
                            {tenant?.name?.charAt(0) ?? "T"}
                          </div>
                        )}
                        <span className="font-semibold text-sm" style={{ color: tenant?.primary_color ?? "#6366f1", fontFamily: tenant?.font_family ?? "Inter" }}>
                          {tenant?.name ?? "Your Brand"}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="h-8 rounded flex items-center justify-center text-white text-xs font-medium"
                          style={{ backgroundColor: tenant?.primary_color ?? "#6366f1" }}>Send Money</div>
                        <div className="h-8 rounded flex items-center justify-center text-xs font-medium border"
                          style={{ color: tenant?.accent_color ?? "#8b5cf6", borderColor: tenant?.accent_color ?? "#8b5cf6" }}>
                          View Transactions
                        </div>
                      </div>
                      {tenant?.footer_text && (
                        <p className="text-xs text-gray-400 text-center mt-3">{tenant.footer_text}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Edit Branding Dialog */}
              <Dialog open={showEditBranding} onOpenChange={setShowEditBranding}>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>Edit Branding</DialogTitle></DialogHeader>
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Primary Color</Label>
                        <div className="flex gap-2 mt-1">
                          <input type="color" value={brandingForm.primaryColor}
                            onChange={(e) => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })}
                            className="w-10 h-9 rounded border cursor-pointer" />
                          <Input value={brandingForm.primaryColor} onChange={(e) => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })}
                            className="font-mono text-xs" maxLength={7} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Accent Color</Label>
                        <div className="flex gap-2 mt-1">
                          <input type="color" value={brandingForm.accentColor}
                            onChange={(e) => setBrandingForm({ ...brandingForm, accentColor: e.target.value })}
                            className="w-10 h-9 rounded border cursor-pointer" />
                          <Input value={brandingForm.accentColor} onChange={(e) => setBrandingForm({ ...brandingForm, accentColor: e.target.value })}
                            className="font-mono text-xs" maxLength={7} />
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Logo URL</Label>
                      <Input value={brandingForm.logoUrl} onChange={(e) => setBrandingForm({ ...brandingForm, logoUrl: e.target.value })}
                        placeholder="https://cdn.example.com/logo.png" className="mt-1 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">Custom Domain</Label>
                      <Input value={brandingForm.customDomain} onChange={(e) => setBrandingForm({ ...brandingForm, customDomain: e.target.value })}
                        placeholder="pay.yourcompany.com" className="mt-1 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">Support Email</Label>
                      <Input type="email" value={brandingForm.supportEmail} onChange={(e) => setBrandingForm({ ...brandingForm, supportEmail: e.target.value })}
                        placeholder="support@yourcompany.com" className="mt-1 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">Footer Text</Label>
                      <Input value={brandingForm.footerText} onChange={(e) => setBrandingForm({ ...brandingForm, footerText: e.target.value })}
                        placeholder="© 2026 Your Company. All rights reserved." className="mt-1 text-xs" />
                    </div>
                    <Button className="w-full" onClick={() => updateBrandingMutation.mutate({
                      tenantId,
                      primaryColor: brandingForm.primaryColor,
                      accentColor: brandingForm.accentColor,
                      logoUrl: brandingForm.logoUrl || undefined,
                      customDomain: brandingForm.customDomain || undefined,
                      supportEmail: brandingForm.supportEmail || undefined,
                      footerText: brandingForm.footerText || undefined,
                    })} disabled={updateBrandingMutation.isPending}>
                      {updateBrandingMutation.isPending ? "Saving..." : "Save Branding"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">API Calls (This Month)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{usageData?.apiCalls?.toLocaleString() ?? "—"}</div>
                    <div className="text-xs text-muted-foreground mt-1">Quota: {quotaData?.limits?.maxApiCalls?.toLocaleString() ?? "—"}</div>
                    {quotaData && quotaData.limits.maxApiCalls > 0 && (
                      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, quotaData.quotaStatus.apiCallsPct)}%` }} />
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Transaction Volume</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{usageData?.txVolume != null ? `₦${(usageData.txVolume / 100).toLocaleString()}` : "—"}</div>
                    <div className="text-xs text-muted-foreground mt-1">Transactions: {usageData?.txCount?.toLocaleString() ?? "—"}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Current Plan</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold capitalize">{overview?.tenant?.plan ?? "—"}</div>
                    <div className="text-xs text-muted-foreground mt-1">Webhooks: {(usageData as any)?.webhookDeliveries?.toLocaleString() ?? "—"}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-4 h-4" />Invoice History</CardTitle></CardHeader>
                <CardContent>
                  {!invoices || invoices.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">No invoices yet.</div>
                  ) : (
                    <div className="overflow-x-auto"><table className="w-full text-sm">
                      <thead><tr className="border-b"><th className="text-left py-2">Period</th><th className="text-left py-2">Amount</th><th className="text-left py-2">Status</th><th className="text-left py-2">Due</th></tr></thead>
                      <tbody>
                        {invoices.map((inv: any) => (
                          <tr key={inv.id} className="border-b last:border-0">
                            <td className="py-2">{inv.billingPeriodStart ? new Date(inv.billingPeriodStart).toLocaleDateString() : "—"}</td>
                            <td className="py-2">₦{((inv.totalAmountKobo ?? 0) / 100).toLocaleString()}</td>
                            <td className="py-2"><Badge variant={inv.status === "paid" ? "default" : "secondary"} className="capitalize">{inv.status}</Badge></td>
                            <td className="py-2">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
