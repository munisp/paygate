import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Globe, Plus, RefreshCw, CheckCircle, XCircle, AlertTriangle, Activity } from "lucide-react";

const PARTY_ID_TYPES = ["MSISDN", "IBAN", "BVN", "EMAIL", "ALIAS", "ACCOUNT_ID", "PERSONAL_ID"] as const;

function HealthBadge({ status }: { status: string }) {
  if (status === "HEALTHY") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" />Healthy</Badge>;
  if (status === "DEGRADED") return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><AlertTriangle className="w-3 h-3 mr-1" />Degraded</Badge>;
  if (status === "UNHEALTHY") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />Unhealthy</Badge>;
  return <Badge variant="secondary">Unknown</Badge>;
}

function RegisterOracleDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", partyIdType: "MSISDN" as typeof PARTY_ID_TYPES[number], endpoint: "", currency: "", isDefault: false });
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const register = trpc.nexthubOracles.register.useMutation({
    onSuccess: () => {
      toast({ title: "Oracle registered", description: `${form.name} is now active` });
      utils.nexthubOracles.list.invalidate();
      utils.nexthubOracles.stats.invalidate();
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast({ title: "Registration failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="w-4 h-4 mr-2" />Register Oracle
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-700 text-gray-100 max-w-md">
        <DialogHeader>
          <DialogTitle>Register New Oracle</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Oracle Name</Label>
            <Input placeholder="e.g. MSISDN Oracle NG" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-gray-800 border-gray-600 text-gray-100 mt-1" />
          </div>
          <div>
            <Label>Party ID Type</Label>
            <Select value={form.partyIdType} onValueChange={(v) => setForm({ ...form, partyIdType: v as typeof PARTY_ID_TYPES[number] })}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-gray-100 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                {PARTY_ID_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Endpoint URL</Label>
            <Input placeholder="http://oracle-service:4003" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
              className="bg-gray-800 border-gray-600 text-gray-100 mt-1" />
          </div>
          <div>
            <Label>Currency (optional)</Label>
            <Input placeholder="NGN" maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              className="bg-gray-800 border-gray-600 text-gray-100 mt-1" />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.isDefault} onCheckedChange={(v) => setForm({ ...form, isDefault: v })} />
            <Label>Set as default for this party ID type</Label>
          </div>
          <Button className="w-full bg-blue-600 hover:bg-blue-700" disabled={!form.name || !form.endpoint || register.isPending}
            onClick={() => register.mutate(form)}>
            {register.isPending ? "Registering..." : "Register Oracle"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function OracleManagement() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<string>("");

  const { data: oracles = [], isLoading } = trpc.nexthubOracles.list.useQuery();
  const { data: stats } = trpc.nexthubOracles.stats.useQuery();

  const healthCheck = trpc.nexthubOracles.healthCheck.useMutation({
    onSuccess: (r) => {
      toast({ title: "Health check complete", description: `${r.oracleId}: ${r.healthStatus}` });
      utils.nexthubOracles.list.invalidate();
    },
    onError: (e) => toast({ title: "Health check failed", description: e.message, variant: "destructive" }),
  });

  const deregister = trpc.nexthubOracles.deregister.useMutation({
    onSuccess: () => {
      toast({ title: "Oracle deregistered" });
      utils.nexthubOracles.list.invalidate();
      utils.nexthubOracles.stats.invalidate();
    },
    onError: (e) => toast({ title: "Deregister failed", description: e.message, variant: "destructive" }),
  });

  const filtered = oracles.filter((o) =>
    !filter || o.partyIdType === filter || o.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 bg-gray-950 min-h-screen text-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Globe className="w-6 h-6 text-blue-400" />Oracle Management
          </h1>
          <p className="text-gray-400 text-sm mt-1">Account Lookup Service (ALS) oracle registry — FSPIOP v1.1</p>
        </div>
        <RegisterOracleDialog onSuccess={() => {}} />
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Total", value: stats.total, color: "text-white" },
            { label: "Active", value: stats.active, color: "text-blue-400" },
            { label: "Healthy", value: stats.healthy, color: "text-green-400" },
            { label: "Degraded", value: stats.degraded, color: "text-yellow-400" },
            { label: "Unhealthy", value: stats.unhealthy, color: "text-red-400" },
          ].map((s) => (
            <Card key={s.label} className="bg-gray-900 border-gray-700">
              <CardContent className="p-4 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-400 mt-1">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-3 items-center">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48 bg-gray-800 border-gray-600 text-gray-100">
            <SelectValue placeholder="All party ID types" />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700">
            <SelectItem value="">All types</SelectItem>
            {PARTY_ID_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-gray-400 text-sm">{filtered.length} oracle{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Oracle Table */}
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base">Registered Oracles</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading oracles...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No oracles registered yet.</p>
              <p className="text-sm mt-1">Register your first ALS oracle to enable party lookup.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="text-left py-3 px-2">Oracle ID</th>
                    <th className="text-left py-3 px-2">Name</th>
                    <th className="text-left py-3 px-2">Party ID Type</th>
                    <th className="text-left py-3 px-2">Currency</th>
                    <th className="text-left py-3 px-2">Endpoint</th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-left py-3 px-2">Health</th>
                    <th className="text-left py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((oracle) => (
                    <tr key={oracle.oracleId} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="py-3 px-2 font-mono text-xs text-blue-300">{oracle.oracleId}</td>
                      <td className="py-3 px-2 text-white font-medium">
                        {oracle.name}
                        {oracle.isDefault === 1 && <Badge className="ml-2 text-xs bg-purple-500/20 text-purple-300 border-purple-500/30">Default</Badge>}
                      </td>
                      <td className="py-3 px-2"><Badge variant="outline" className="border-gray-600 text-gray-300">{oracle.partyIdType}</Badge></td>
                      <td className="py-3 px-2 text-gray-300">{oracle.currency ?? "—"}</td>
                      <td className="py-3 px-2 font-mono text-xs text-gray-400 max-w-xs truncate">{oracle.endpoint}</td>
                      <td className="py-3 px-2">
                        {oracle.isActive === 1
                          ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
                          : <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">Inactive</Badge>}
                      </td>
                      <td className="py-3 px-2"><HealthBadge status={oracle.healthStatus} /></td>
                      <td className="py-3 px-2">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-7 px-2"
                            disabled={healthCheck.isPending}
                            onClick={() => healthCheck.mutate({ oracleId: oracle.oracleId })}>
                            <Activity className="w-3 h-3 mr-1" />Check
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2"
                            disabled={deregister.isPending}
                            onClick={() => deregister.mutate({ oracleId: oracle.oracleId })}>
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
