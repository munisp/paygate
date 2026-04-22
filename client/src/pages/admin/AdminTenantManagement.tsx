// @ts-nocheck
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Building2, Plus, Search, RefreshCw, Ban, CheckCircle2,
  Settings, Globe, Layers, Users, ChevronRight, AlertTriangle,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  suspended: "bg-red-100 text-red-800",
  banned: "bg-gray-100 text-gray-800",
};

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-blue-100 text-blue-800",
  growth: "bg-purple-100 text-purple-800",
  enterprise: "bg-indigo-100 text-indigo-800",
};

export default function AdminTenantManagement() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<string | null>(null);
  const [showSuspend, setShowSuspend] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.wave26.tenantManagement.list.useQuery({
    page,
    limit: 20,
    status: statusFilter !== "all" ? (statusFilter as "pending" | "active" | "suspended" | "banned") : undefined,
    plan: planFilter !== "all" ? (planFilter as "starter" | "growth" | "enterprise") : undefined,
    search: search || undefined,
  });

  const { data: stats } = trpc.wave26.tenantManagement.getStats.useQuery();

  const createMutation = trpc.wave26.tenantManagement.create.useMutation({
    onSuccess: () => { toast.success("Tenant created successfully"); setShowCreate(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const activateMutation = trpc.wave26.tenantManagement.activate.useMutation({
    onSuccess: () => { toast.success("Tenant activated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const suspendMutation = trpc.wave26.tenantManagement.suspend.useMutation({
    onSuccess: () => { toast.success("Tenant suspended"); setShowSuspend(null); setSuspendReason(""); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // Create form state
  const [createForm, setCreateForm] = useState({
    name: "", slug: "", email: "", phone: "", country: "NG",
    plan: "starter" as "starter" | "growth" | "enterprise",
    primaryColor: "#6366f1",
    maxMerchants: 10, maxConsumers: 10000,
    bnplEnabled: false, crossBorderEnabled: false, virtualCardsEnabled: false,
  });

  const filteredRows = data?.rows ?? [];

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="w-6 h-6 text-indigo-600" />
              Tenant Management
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage white-label tenants, plans, and feature provisioning
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New Tenant
          </Button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Total", value: stats.total, color: "text-gray-900" },
              { label: "Active", value: stats.active, color: "text-emerald-600" },
              { label: "Pending", value: stats.pending, color: "text-amber-600" },
              { label: "Suspended", value: stats.suspended, color: "text-red-600" },
              { label: "Enterprise", value: stats.enterprise, color: "text-indigo-600" },
            ].map(s => (
              <Card key={s.label} className="text-center">
                <CardContent className="pt-4 pb-3">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name, slug, or email..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Select value={planFilter} onValueChange={v => { setPlanFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="growth">Growth</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Tenant List */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-gray-400">Loading tenants...</div>
            ) : filteredRows.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                No tenants found
              </div>
            ) : (
              <div className="divide-y">
                {filteredRows.map(tenant => (
                  <div key={tenant.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
                    {/* Logo */}
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                      style={{ backgroundColor: tenant.primaryColor ?? "#6366f1" }}
                    >
                      {tenant.logoUrl
                        ? <img src={tenant.logoUrl} alt={tenant.name} className="w-10 h-10 rounded-lg object-cover" />
                        : tenant.name.slice(0, 2).toUpperCase()
                      }
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">{tenant.name}</span>
                        <Badge className={`text-xs ${STATUS_COLORS[tenant.status ?? "pending"]}`}>
                          {tenant.status}
                        </Badge>
                        <Badge className={`text-xs ${PLAN_COLORS[tenant.plan ?? "starter"]}`}>
                          {tenant.plan}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-3">
                        <span>/{tenant.slug}</span>
                        <span>{tenant.email}</span>
                        <span>{tenant.country}</span>
                        {tenant.bnplEnabled && <span className="text-purple-600">BNPL</span>}
                        {tenant.virtualCardsEnabled && <span className="text-blue-600">Cards</span>}
                        {tenant.crossBorderEnabled && <span className="text-green-600">FX</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {tenant.status === "suspended" && (
                        <Button
                          size="sm" variant="outline"
                          className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                          onClick={() => activateMutation.mutate({ id: tenant.id })}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Activate
                        </Button>
                      )}
                      {tenant.status === "active" && (
                        <Button
                          size="sm" variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => setShowSuspend(tenant.id)}
                        >
                          <Ban className="w-3 h-3 mr-1" /> Suspend
                        </Button>
                      )}
                      {tenant.status === "pending" && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => activateMutation.mutate({ id: tenant.id })}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                        </Button>
                      )}
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => setShowEdit(tenant.id)}
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {data && data.total > 20 && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} of {data.total}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page * 20 >= data.total} onClick={() => setPage(p => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Create Tenant Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Tenant</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-1">
                <Label>Tenant Name *</Label>
                <Input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Payments" />
              </div>
              <div className="space-y-1">
                <Label>Slug * (URL-safe)</Label>
                <Input value={createForm.slug} onChange={e => setCreateForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} placeholder="acme-payments" />
              </div>
              <div className="space-y-1">
                <Label>Email *</Label>
                <Input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} placeholder="admin@acme.com" />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))} placeholder="+2348012345678" />
              </div>
              <div className="space-y-1">
                <Label>Country</Label>
                <Select value={createForm.country} onValueChange={v => setCreateForm(f => ({ ...f, country: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["NG", "GH", "KE", "ZA", "TZ", "UG", "RW", "ET"].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Plan</Label>
                <Select value={createForm.plan} onValueChange={v => setCreateForm(f => ({ ...f, plan: v as typeof createForm.plan }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Max Merchants</Label>
                <Input type="number" value={createForm.maxMerchants} onChange={e => setCreateForm(f => ({ ...f, maxMerchants: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>Max Consumers</Label>
                <Input type="number" value={createForm.maxConsumers} onChange={e => setCreateForm(f => ({ ...f, maxConsumers: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>Brand Color</Label>
                <div className="flex gap-2">
                  <input type="color" value={createForm.primaryColor} onChange={e => setCreateForm(f => ({ ...f, primaryColor: e.target.value }))} className="w-10 h-10 rounded cursor-pointer border" />
                  <Input value={createForm.primaryColor} onChange={e => setCreateForm(f => ({ ...f, primaryColor: e.target.value }))} className="font-mono" />
                </div>
              </div>
              <div className="space-y-3 col-span-2">
                <Label className="text-sm font-medium">Feature Provisioning</Label>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { key: "bnplEnabled", label: "BNPL Lending" },
                    { key: "virtualCardsEnabled", label: "Virtual Cards" },
                    { key: "crossBorderEnabled", label: "Cross-Border FX" },
                  ].map(f => (
                    <div key={f.key} className="flex items-center gap-2">
                      <Switch
                        checked={(createForm as Record<string, unknown>)[f.key] as boolean}
                        onCheckedChange={v => setCreateForm(prev => ({ ...prev, [f.key]: v }))}
                      />
                      <Label className="text-sm">{f.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(createForm)}
                disabled={createMutation.isPending || !createForm.name || !createForm.slug || !createForm.email}
              >
                {createMutation.isPending ? "Creating..." : "Create Tenant"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Suspend Dialog */}
        <Dialog open={!!showSuspend} onOpenChange={() => setShowSuspend(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" /> Suspend Tenant
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <p className="text-sm text-gray-600">
                This will immediately suspend all merchant and consumer access for this tenant.
                Provide a reason for the suspension record.
              </p>
              <div className="space-y-1">
                <Label>Suspension Reason *</Label>
                <Input
                  value={suspendReason}
                  onChange={e => setSuspendReason(e.target.value)}
                  placeholder="e.g. Compliance violation — AML flag triggered"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSuspend(null)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={!suspendReason.trim() || suspendMutation.isPending}
                onClick={() => showSuspend && suspendMutation.mutate({ id: showSuspend, reason: suspendReason })}
              >
                {suspendMutation.isPending ? "Suspending..." : "Confirm Suspension"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
