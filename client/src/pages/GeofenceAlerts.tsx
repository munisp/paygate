import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, RefreshCw, MapPin, ShieldAlert, Trash2 } from "lucide-react";

export default function GeofenceAlerts() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    centerLat: "",
    centerLng: "",
    radiusMeters: "500",
    active: true,
  });

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.geofence.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const upsert = trpc.geofence.upsert.useMutation({
    onSuccess: () => {
      utils.geofence.list.invalidate();
      setOpen(false);
      setForm({ name: "", centerLat: "", centerLng: "", radiusMeters: "500", active: true });
      toast.success("Geofence rule saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = trpc.geofence.delete.useMutation({
    onSuccess: () => {
      utils.geofence.list.invalidate();
      toast.success("Geofence rule deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rules: any[] = data ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6" /> Geofence Alerts
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Fire fraud alerts when a terminal processes a transaction outside its registered zone
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add Rule</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Geofence Rule</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <Input placeholder="Rule name (e.g. Lagos HQ Zone)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" placeholder="Center Latitude" value={form.centerLat} onChange={(e) => setForm({ ...form, centerLat: e.target.value })} />
                  <Input type="number" placeholder="Center Longitude" value={form.centerLng} onChange={(e) => setForm({ ...form, centerLng: e.target.value })} />
                </div>
                <div>
                  <Input type="number" placeholder="Radius (metres)" value={form.radiusMeters} onChange={(e) => setForm({ ...form, radiusMeters: e.target.value })} />
                  <p className="text-xs text-muted-foreground mt-1">Min 50m — Max 50,000m</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                  <span className="text-sm">Active</span>
                </div>
                <Button
                  className="w-full"
                  disabled={!form.name || !form.centerLat || !form.centerLng}
                  onClick={() => upsert.mutate({
                    name: form.name,
                    centerLat: parseFloat(form.centerLat),
                    centerLng: parseFloat(form.centerLng),
                    radiusMeters: parseFloat(form.radiusMeters) || 500,
                    active: form.active,
                  })}
                >
                  Save Rule
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
        <MapPin className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-blue-800">
          <p className="font-medium">How geofencing works</p>
          <p className="mt-0.5">When a terminal's GPS coordinates (set in Terminal Map) fall outside a geofence zone during a transaction, the Go bridge fires a fraud alert via the owner notification channel and flags the transaction for review.</p>
        </div>
      </div>

      {/* Rules list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading rules…</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No geofence rules yet.</p>
          <p className="text-sm">Add a rule to start monitoring terminal locations.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rules.map((rule: any) => (
            <Card key={rule.id} className={`border-l-4 ${rule.active ? "border-l-green-500" : "border-l-gray-300"}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{rule.name}</CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                    onClick={() => remove.mutate({ id: rule.id })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{rule.centerLat?.toFixed(4)}, {rule.centerLng?.toFixed(4)}</span>
                </div>
                <div className="text-muted-foreground">
                  Radius: <span className="text-foreground font-medium">{rule.radiusMeters?.toLocaleString()} m</span>
                </div>
                {rule.terminalId && (
                  <div className="text-muted-foreground">
                    Terminal: <span className="text-foreground font-mono text-xs">{rule.terminalId}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 pt-1">
                  <div className={`w-2 h-2 rounded-full ${rule.active ? "bg-green-500" : "bg-gray-400"}`} />
                  <span className={rule.active ? "text-green-700" : "text-gray-500"}>
                    {rule.active ? "Active" : "Inactive"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
