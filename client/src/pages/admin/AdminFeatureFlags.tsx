// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Plus, Flag, Trash2, Edit, Search, Filter } from "lucide-react";
import { format } from "date-fns";

type FeatureFlag = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  rolloutPercentage: number;
  category: string;
  environment: string;
  createdBy?: string | null;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const CATEGORY_COLORS: Record<string, string> = {
  feature: "bg-blue-100 text-blue-700",
  experiment: "bg-purple-100 text-purple-700",
  "kill-switch": "bg-red-100 text-red-700",
};

export default function AdminFeatureFlags() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editFlag, setEditFlag] = useState<FeatureFlag | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    key: "", name: "", description: "", enabled: false,
    rolloutPercentage: 0, category: "feature" as const,
    environment: "production" as const, expiresAt: "",
  });

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.wave24.featureFlags.list.useQuery({
    category: categoryFilter !== "all" ? categoryFilter : undefined,
  });

  const createMutation = trpc.wave24.featureFlags.create.useMutation({
    onSuccess: () => {
      toast.success("Feature flag created");
      utils.wave24.featureFlags.list.invalidate();
      setShowCreate(false);
      setForm({ key: "", name: "", description: "", enabled: false, rolloutPercentage: 0, category: "feature", environment: "production", expiresAt: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = trpc.wave24.featureFlags.toggle.useMutation({
    onSuccess: () => utils.wave24.featureFlags.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.wave24.featureFlags.update.useMutation({
    onSuccess: () => {
      toast.success("Feature flag updated");
      utils.wave24.featureFlags.list.invalidate();
      setEditFlag(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.wave24.featureFlags.delete.useMutation({
    onSuccess: () => {
      toast.success("Feature flag deleted");
      utils.wave24.featureFlags.list.invalidate();
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (data ?? []).filter(f =>
    !search || f.key.includes(search.toLowerCase()) || f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Flag className="w-6 h-6" /> Feature Flags</h1>
            <p className="text-muted-foreground text-sm mt-1">Control feature rollouts, experiments, and kill-switches across the platform</p>
          </div>
          <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />New Flag</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Flags", value: data?.length ?? 0, color: "text-foreground" },
            { label: "Enabled", value: data?.filter(f => f.enabled).length ?? 0, color: "text-green-600" },
            { label: "Experiments", value: data?.filter(f => f.category === "experiment").length ?? 0, color: "text-purple-600" },
            { label: "Kill-Switches", value: data?.filter(f => f.category === "kill-switch").length ?? 0, color: "text-red-600" },
          ].map(stat => (
            <Card key={stat.label}>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search flags..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40"><Filter className="w-4 h-4 mr-2" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="feature">Feature</SelectItem>
              <SelectItem value="experiment">Experiment</SelectItem>
              <SelectItem value="kill-switch">Kill-Switch</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Flags Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading feature flags...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Flag className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No feature flags found</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="text-left p-3 font-medium">Flag Key</th>
                    <th className="text-left p-3 font-medium">Category</th>
                    <th className="text-left p-3 font-medium">Rollout</th>
                    <th className="text-left p-3 font-medium">Environment</th>
                    <th className="text-left p-3 font-medium">Expires</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(flag => (
                    <tr key={flag.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="p-3">
                        <div className="font-mono font-medium text-xs">{flag.key}</div>
                        <div className="text-muted-foreground text-xs">{flag.name}</div>
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[flag.category] ?? ""}`}>
                          {flag.category}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${flag.rolloutPercentage}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{flag.rolloutPercentage}%</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-xs">{flag.environment}</Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {flag.expiresAt ? format(new Date(flag.expiresAt), "MMM d, yyyy") : "—"}
                      </td>
                      <td className="p-3">
                        <Switch
                          checked={flag.enabled}
                          onCheckedChange={(enabled) => toggleMutation.mutate({ id: flag.id, enabled })}
                        />
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditFlag(flag)}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(flag.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Feature Flag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Flag Key *</Label>
                <Input placeholder="e.g. new_checkout_ui" value={form.key}
                  onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") }))} />
                <p className="text-xs text-muted-foreground">Lowercase letters, numbers, hyphens, underscores</p>
              </div>
              <div className="space-y-1.5">
                <Label>Display Name *</Label>
                <Input placeholder="New Checkout UI" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea placeholder="What does this flag control?" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v: typeof form.category) => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="feature">Feature</SelectItem>
                    <SelectItem value="experiment">Experiment</SelectItem>
                    <SelectItem value="kill-switch">Kill-Switch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Environment</Label>
                <Select value={form.environment} onValueChange={(v: typeof form.environment) => setForm(f => ({ ...f, environment: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Rollout Percentage: {form.rolloutPercentage}%</Label>
              <Slider min={0} max={100} step={5} value={[form.rolloutPercentage]}
                onValueChange={([v]) => setForm(f => ({ ...f, rolloutPercentage: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Expiry Date (optional)</Label>
              <Input type="datetime-local" value={form.expiresAt}
                onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.enabled} onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))} />
              <Label>Enable immediately</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate({
                ...form,
                expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
              })}
              disabled={!form.key || !form.name || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Flag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editFlag} onOpenChange={() => setEditFlag(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Feature Flag</DialogTitle>
            <DialogDescription className="font-mono text-xs">{editFlag?.key}</DialogDescription>
          </DialogHeader>
          {editFlag && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Display Name</Label>
                <Input value={editFlag.name} onChange={e => setEditFlag(f => f ? { ...f, name: e.target.value } : null)} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={editFlag.description ?? ""} onChange={e => setEditFlag(f => f ? { ...f, description: e.target.value } : null)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Rollout Percentage: {editFlag.rolloutPercentage}%</Label>
                <Slider min={0} max={100} step={5} value={[editFlag.rolloutPercentage]}
                  onValueChange={([v]) => setEditFlag(f => f ? { ...f, rolloutPercentage: v } : null)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditFlag(null)}>Cancel</Button>
            <Button
              onClick={() => editFlag && updateMutation.mutate({
                id: editFlag.id,
                name: editFlag.name,
                description: editFlag.description ?? undefined,
                rolloutPercentage: editFlag.rolloutPercentage,
              })}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Feature Flag</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone. The flag will be permanently removed.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
              disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
