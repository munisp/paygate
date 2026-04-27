import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, ArrowRight, TrendingUp, DollarSign, BarChart3, Edit2 } from "lucide-react";

const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR", "XOF", "XAF", "EGP"];

export default function CorridorManagement() {
  const tenantId = "3";
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    sourceCurrency: "NGN",
    destCurrency: "USD",
    fxMarkupPct: 1.5,
    dailyLimitAmount: 5000000,
    isEnabled: true,
  });
  const [editForm, setEditForm] = useState({
    fxMarkupPct: 1.5,
    dailyLimitAmount: 5000000,
  });

  const { data: corridors, refetch } = trpc.wave29.corridorManagement.list.useQuery({ tenantId });
  const { data: heatmap } = trpc.wave29.corridorManagement.getHeatmap.useQuery({ days: 30 });
  const { data: dailyStats } = trpc.wave29.corridorManagement.getDailyStats.useQuery({ tenantId, days: 7 });

  const createCorridor = trpc.wave29.corridorManagement.create.useMutation({
    onSuccess: () => {
      toast.success("Corridor created");
      setShowCreate(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateCorridor = trpc.wave29.corridorManagement.update.useMutation({
    onSuccess: () => {
      toast.success("Corridor updated");
      setEditingId(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleCorridor = trpc.wave29.corridorManagement.toggle.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Corridor Management</h1>
          <p className="text-gray-500 mt-1">Configure FX markup, daily limits, and enable/disable corridors</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Corridor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Corridor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Source Currency</Label>
                  <select
                    className="w-full border rounded px-3 py-2 text-sm mt-1"
                    value={form.sourceCurrency}
                    onChange={e => setForm(f => ({ ...f, sourceCurrency: e.target.value }))}
                  >
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Destination Currency</Label>
                  <select
                    className="w-full border rounded px-3 py-2 text-sm mt-1"
                    value={form.destCurrency}
                    onChange={e => setForm(f => ({ ...f, destCurrency: e.target.value }))}
                  >
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label>FX Markup % (0–10)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={10}
                  value={form.fxMarkupPct}
                  onChange={e => setForm(f => ({ ...f, fxMarkupPct: parseFloat(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Daily Limit (kobo)</Label>
                <Input
                  type="number"
                  value={form.dailyLimitAmount}
                  onChange={e => setForm(f => ({ ...f, dailyLimitAmount: parseInt(e.target.value) }))}
                />
                <p className="text-xs text-gray-400 mt-1">
                  = ₦{(form.dailyLimitAmount / 100).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isEnabled}
                  onCheckedChange={v => setForm(f => ({ ...f, isEnabled: v }))}
                />
                <Label>Enable immediately</Label>
              </div>
              <Button
                className="w-full"
                onClick={() => createCorridor.mutate({ tenantId, ...form })}
                disabled={createCorridor.isPending}
              >
                Create Corridor
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{(corridors ?? []).length}</p>
                <p className="text-sm text-gray-500">Active Corridors</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">
                  {(corridors ?? []).filter((c: any) => c.is_enabled).length}
                </p>
                <p className="text-sm text-gray-500">Enabled</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">
                  {(heatmap ?? []).length}
                </p>
                <p className="text-sm text-gray-500">Global Pairs (30d)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Corridors Table */}
      <Card>
        <CardHeader>
          <CardTitle>Your Corridors</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pair</TableHead>
                <TableHead>FX Markup</TableHead>
                <TableHead>Daily Limit</TableHead>
                <TableHead>7d Volume</TableHead>
                <TableHead>7d Txns</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(corridors ?? []).map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      <span>{c.source_currency}</span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <span>{c.dest_currency}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {editingId === c.id ? (
                      <Input
                        type="number"
                        step="0.1"
                        min={0}
                        max={10}
                        className="w-20"
                        value={editForm.fxMarkupPct}
                        onChange={e => setEditForm(f => ({ ...f, fxMarkupPct: parseFloat(e.target.value) }))}
                      />
                    ) : (
                      <span>{Number(c.fx_markup_pct).toFixed(2)}%</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === c.id ? (
                      <Input
                        type="number"
                        className="w-28"
                        value={editForm.dailyLimitAmount}
                        onChange={e => setEditForm(f => ({ ...f, dailyLimitAmount: parseInt(e.target.value) }))}
                      />
                    ) : (
                      <span>₦{(Number(c.daily_limit_amount) / 100).toLocaleString()}</span>
                    )}
                  </TableCell>
                  <TableCell>₦{(Number(c.week_volume ?? 0) / 100).toLocaleString()}</TableCell>
                  <TableCell>{c.week_tx_count ?? 0}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={c.is_enabled}
                        onCheckedChange={v => toggleCorridor.mutate({ corridorId: c.id, enabled: v })}
                      />
                      <Badge variant={c.is_enabled ? "default" : "outline"}>
                        {c.is_enabled ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    {editingId === c.id ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => updateCorridor.mutate({
                            corridorId: c.id,
                            fxMarkupPct: editForm.fxMarkupPct,
                            dailyLimitAmount: editForm.dailyLimitAmount,
                          })}
                          disabled={updateCorridor.isPending}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditForm({
                            fxMarkupPct: Number(c.fx_markup_pct),
                            dailyLimitAmount: Number(c.daily_limit_amount),
                          });
                        }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(corridors ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                    No corridors configured. Add your first corridor above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Global Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Global Corridor Heatmap (30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pair</TableHead>
                <TableHead>Total Volume</TableHead>
                <TableHead>Total Txns</TableHead>
                <TableHead>Tenants Using</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(heatmap ?? []).slice(0, 10).map((row: any, i: number) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      <span>{row.source_currency}</span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <span>{row.dest_currency}</span>
                    </div>
                  </TableCell>
                  <TableCell>₦{(Number(row.total_volume ?? 0) / 100).toLocaleString()}</TableCell>
                  <TableCell>{row.total_count ?? 0}</TableCell>
                  <TableCell>{row.tenant_count ?? 0}</TableCell>
                </TableRow>
              ))}
              {(heatmap ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-gray-400 py-8">
                    No corridor activity in the last 30 days.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
