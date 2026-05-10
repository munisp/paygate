import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2, Plus, RefreshCw, Search, CheckCircle, Clock, AlertCircle, Play, Eye } from "lucide-react";

export default function TenantProvisioning() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState({
    tenantName: "",
    tenantSlug: "",
    adminEmail: "",
    adminName: "",
    billingTier: "starter",
    country: "NG",
    currency: "NGN",
    enableKeycloak: true,
    enableTigerBeetle: true,
    enableBillingConfig: true,
  });

  const { data, isLoading, refetch } = trpc.tenantProvision.listTenants.useQuery({
    page, limit: 20, status, search: search || undefined,
  });

  const provisionMutation = trpc.tenantProvision.provision.useMutation({
    onSuccess: (result) => {
      toast.success(`Tenant "${form.tenantName}" provisioning started! Workflow ID: ${result.workflowId}`);
      setCreateOpen(false);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const checkStatusMutation = trpc.tenantProvision.checkWorkflowStatus.useMutation({
    onSuccess: (result) => {
      toast.info(`Workflow status: ${result.status}`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const tenants = data?.tenants ?? [];
  const total = data?.total ?? 0;

  const statusIcon = (s: string) => {
    if (s === "active") return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (s === "provisioning") return <Clock className="w-4 h-4 text-blue-600 animate-spin" />;
    if (s === "failed") return <AlertCircle className="w-4 h-4 text-red-600" />;
    return <Clock className="w-4 h-4 text-muted-foreground" />;
  };

  const billingTiers = ["starter", "growth", "business", "enterprise"];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tenant Provisioning</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Provision new tenants via Temporal workflow — atomically creates TigerBeetle accounts, Keycloak realms, and billing configs
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Provision New Tenant</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Provision New Tenant</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tenant Name</Label>
                  <Input value={form.tenantName} onChange={e => setForm(f => ({ ...f, tenantName: e.target.value }))} placeholder="Acme Corp" />
                </div>
                <div>
                  <Label>Slug (unique ID)</Label>
                  <Input value={form.tenantSlug} onChange={e => setForm(f => ({ ...f, tenantSlug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))} placeholder="acme-corp" />
                </div>
                <div>
                  <Label>Admin Email</Label>
                  <Input type="email" value={form.adminEmail} onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))} placeholder="admin@acme.com" />
                </div>
                <div>
                  <Label>Admin Name</Label>
                  <Input value={form.adminName} onChange={e => setForm(f => ({ ...f, adminName: e.target.value }))} placeholder="John Doe" />
                </div>
                <div>
                  <Label>Billing Tier</Label>
                  <Select value={form.billingTier} onValueChange={v => setForm(f => ({ ...f, billingTier: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{billingTiers.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Country</Label>
                  <Select value={form.country} onValueChange={v => setForm(f => ({ ...f, country: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NG">Nigeria (NG)</SelectItem>
                      <SelectItem value="GH">Ghana (GH)</SelectItem>
                      <SelectItem value="KE">Kenya (KE)</SelectItem>
                      <SelectItem value="ZA">South Africa (ZA)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Provisioning Options */}
              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">Provisioning Steps</p>
                {[
                  { key: "enableKeycloak", label: "Create Keycloak Realm", desc: "OAuth2/OIDC identity provider" },
                  { key: "enableTigerBeetle", label: "Create TigerBeetle Accounts", desc: "Double-entry ledger accounts" },
                  { key: "enableBillingConfig", label: "Configure Billing", desc: "Set up billing tier and fee schedules" },
                ].map(opt => (
                  <label key={opt.key} className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={(form as any)[opt.key]}
                      onChange={e => setForm(f => ({ ...f, [opt.key]: e.target.checked }))} />
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              <Button className="w-full" onClick={() => provisionMutation.mutate(form)} disabled={provisionMutation.isPending || !form.tenantName || !form.tenantSlug || !form.adminEmail}>
                {provisionMutation.isPending ? (
                  <><Clock className="w-4 h-4 mr-2 animate-spin" />Starting Temporal Workflow…</>
                ) : (
                  <><Play className="w-4 h-4 mr-2" />Start Provisioning</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                This triggers an atomic Temporal workflow. All steps succeed or none are applied.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Tenants", value: total, icon: Building2, color: "blue" },
          { label: "Active", value: tenants.filter((t: any) => t.status === "active").length, icon: CheckCircle, color: "green" },
          { label: "Provisioning", value: tenants.filter((t: any) => t.status === "provisioning").length, icon: Clock, color: "blue" },
          { label: "Failed", value: tenants.filter((t: any) => t.status === "failed").length, icon: AlertCircle, color: "red" },
        ].map(s => (
          <Card key={s.label}><CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold">{s.value}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Filters */}
      <Card><CardContent className="pt-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search tenants…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={status ?? "all"} onValueChange={v => { setStatus(v === "all" ? undefined : v); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {["pending", "provisioning", "active", "suspended", "failed"].map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </CardContent></Card>

      {/* Table */}
      <Card>
        <CardHeader><CardTitle>Tenants ({total})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
          ) : tenants.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No tenants provisioned yet</p>
              <p className="text-sm mt-1">Click "Provision New Tenant" to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-2">Tenant</th>
                    <th className="text-left py-3 px-2">Slug</th>
                    <th className="text-left py-3 px-2">Billing Tier</th>
                    <th className="text-left py-3 px-2">Country</th>
                    <th className="text-left py-3 px-2">Workflow ID</th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-left py-3 px-2">Provisioned</th>
                    <th className="text-right py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t: any) => (
                    <tr key={t.tenantId} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-2 font-medium">{t.name}</td>
                      <td className="py-3 px-2 font-mono text-xs">{t.slug}</td>
                      <td className="py-3 px-2"><Badge variant="outline" className="capitalize">{t.billingTier}</Badge></td>
                      <td className="py-3 px-2">{t.country}</td>
                      <td className="py-3 px-2 font-mono text-xs">{t.temporalWorkflowId ? `${t.temporalWorkflowId.slice(0, 16)}…` : "—"}</td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-1">
                          {statusIcon(t.status)}
                          <span className="capitalize">{t.status}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-sm">{t.provisionedAt ? new Date(t.provisionedAt).toLocaleDateString() : "—"}</td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setSelected(t)}><Eye className="w-3 h-3" /></Button>
                          {t.temporalWorkflowId && t.status === "provisioning" && (
                            <Button size="sm" variant="ghost" className="text-blue-600" onClick={() => checkStatusMutation.mutate({ workflowId: t.temporalWorkflowId })}>
                              <RefreshCw className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > 20 && (
            <div className="flex justify-between items-center mt-4">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(total / 20)}</span>
              <Button variant="outline" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Tenant Details</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground">Name</p><p className="font-bold">{selected.name}</p></div>
                <div><p className="text-muted-foreground">Status</p>
                  <div className="flex items-center gap-1">{statusIcon(selected.status)}<span className="capitalize">{selected.status}</span></div>
                </div>
                <div><p className="text-muted-foreground">Slug</p><p className="font-mono text-xs">{selected.slug}</p></div>
                <div><p className="text-muted-foreground">Billing Tier</p><p className="capitalize">{selected.billingTier}</p></div>
                <div><p className="text-muted-foreground">Country</p><p>{selected.country}</p></div>
                <div><p className="text-muted-foreground">Currency</p><p>{selected.currency}</p></div>
                {selected.temporalWorkflowId && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Temporal Workflow ID</p>
                    <p className="font-mono text-xs break-all">{selected.temporalWorkflowId}</p>
                  </div>
                )}
                {selected.keycloakRealmId && (
                  <div><p className="text-muted-foreground">Keycloak Realm</p><p className="font-mono text-xs">{selected.keycloakRealmId}</p></div>
                )}
                {selected.tigerBeetleAccountId && (
                  <div><p className="text-muted-foreground">TigerBeetle Account</p><p className="font-mono text-xs">{selected.tigerBeetleAccountId}</p></div>
                )}
              </div>
              {selected.provisioningError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm font-medium text-destructive">Provisioning Error</p>
                  <p className="text-xs text-destructive/80 mt-1">{selected.provisioningError}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
