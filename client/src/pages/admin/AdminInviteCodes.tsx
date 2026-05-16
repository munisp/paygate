import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Copy, Ban, RefreshCw, Key, CheckCircle, XCircle, Clock, Hash } from "lucide-react";

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-700",
  growth: "bg-blue-100 text-blue-700",
  scale: "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
};

const TYPE_LABELS: Record<string, string> = {
  single_use: "Single Use",
  multi_use: "Multi Use",
  unlimited: "Unlimited",
};

export default function AdminInviteCodes() {
  const [showActive, setShowActive] = useState<boolean | undefined>(undefined);
  const [showGenerate, setShowGenerate] = useState(false);
  const [form, setForm] = useState({
    type: "single_use" as "single_use" | "multi_use" | "unlimited",
    maxUses: 10,
    expiresInDays: 30,
    plan: "starter" as "starter" | "growth" | "scale" | "enterprise",
    notes: "",
    prefix: "PG",
  });

  const { data: codes, isLoading, refetch } = trpc.wave28.inviteCode.list.useQuery({
    isActive: showActive,
    limit: 100,
  }, { staleTime: 30_000 });

  const generateMutation = trpc.wave28.inviteCode.generate.useMutation({
    onSuccess: (d) => {
      toast.success(`Code generated: ${d.code}`, { duration: 8000 });
      setShowGenerate(false);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const revokeMutation = trpc.wave28.inviteCode.revoke.useMutation({
    onSuccess: () => { toast.success("Code revoked"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const reactivateMutation = trpc.wave28.inviteCode.reactivate.useMutation({
    onSuccess: () => { toast.success("Code reactivated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied to clipboard");
  };

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/partner/onboard?code=${code}`;
    navigator.clipboard.writeText(url);
    toast.success("Onboarding link copied");
  };

  const codeList = codes ?? [];
  const activeCount = codeList.filter((c: any) => c.is_active).length;
  const usedCount = codeList.filter((c: any) => Number(c.uses_total) > 0).length;
  const expiredCount = codeList.filter((c: any) => c.expires_at && new Date(c.expires_at) < new Date()).length;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Invite Codes</h1>
            <p className="text-gray-500 text-sm mt-1">Generate and manage partner onboarding invite codes</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />Refresh
            </Button>
            <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" />Generate Code
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Generate Invite Code</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Code Prefix</Label>
                    <Input value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase().slice(0, 10) })}
                      placeholder="PG" className="mt-1" />
                    <p className="text-xs text-gray-500 mt-1">Result: {form.prefix || "PG"}-XXXX-XXXX</p>
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single_use">Single Use (1 partner)</SelectItem>
                        <SelectItem value="multi_use">Multi Use (limited partners)</SelectItem>
                        <SelectItem value="unlimited">Unlimited</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.type === "multi_use" && (
                    <div>
                      <Label>Max Uses</Label>
                      <Input type="number" min={1} max={10000} value={form.maxUses}
                        onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })} className="mt-1" />
                    </div>
                  )}
                  <div>
                    <Label>Expires In (days)</Label>
                    <Input type="number" min={1} max={365} value={form.expiresInDays}
                      onChange={(e) => setForm({ ...form, expiresInDays: Number(e.target.value) })} className="mt-1" />
                  </div>
                  <div>
                    <Label>Plan</Label>
                    <Select value={form.plan} onValueChange={(v: any) => setForm({ ...form, plan: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="starter">Starter</SelectItem>
                        <SelectItem value="growth">Growth</SelectItem>
                        <SelectItem value="scale">Scale</SelectItem>
                        <SelectItem value="enterprise">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Notes (optional)</Label>
                    <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="e.g. For Acme Corp partnership" className="mt-1" rows={2} />
                  </div>
                  <Button className="w-full" onClick={() => generateMutation.mutate({
                    type: form.type,
                    maxUses: form.type === "multi_use" ? form.maxUses : undefined,
                    expiresInDays: form.expiresInDays,
                    plan: form.plan,
                    notes: form.notes || undefined,
                    prefix: form.prefix || undefined,
                  })} disabled={generateMutation.isPending}>
                    {generateMutation.isPending ? "Generating..." : "Generate Code"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-gray-500"><Key className="w-4 h-4" />Total Codes</div>
              <div className="text-2xl font-bold mt-1">{codeList.length}</div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-green-700"><CheckCircle className="w-4 h-4" />Active</div>
              <div className="text-2xl font-bold text-green-800 mt-1">{activeCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-gray-500"><Hash className="w-4 h-4" />Used</div>
              <div className="text-2xl font-bold mt-1">{usedCount}</div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-red-700"><Clock className="w-4 h-4" />Expired</div>
              <div className="text-2xl font-bold text-red-800 mt-1">{expiredCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {[
            { label: "All", value: undefined },
            { label: "Active", value: true },
            { label: "Revoked", value: false },
          ].map((f) => (
            <Button key={String(f.value)} size="sm" variant={showActive === f.value ? "default" : "outline"}
              onClick={() => setShowActive(f.value)}>{f.label}</Button>
          ))}
        </div>

        {/* Codes Table */}
        <Card>
          <CardHeader><CardTitle>Invite Codes ({codeList.length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading codes...</div>
            ) : codeList.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No invite codes found. Generate your first code above.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="text-left py-3 px-2">Code</th>
                      <th className="text-left py-3 px-2">Type</th>
                      <th className="text-left py-3 px-2">Plan</th>
                      <th className="text-center py-3 px-2">Uses</th>
                      <th className="text-left py-3 px-2">Expires</th>
                      <th className="text-left py-3 px-2">Status</th>
                      <th className="text-left py-3 px-2">Notes</th>
                      <th className="text-left py-3 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codeList.map((c: any) => {
                      const isExpired = c.expires_at && new Date(c.expires_at) < new Date();
                      const isFullyUsed = c.uses_remaining !== null && Number(c.uses_remaining) <= 0;
                      return (
                        <tr key={c.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <code className="font-mono text-sm font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{c.code}</code>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" aria-label="Copy" onClick={() => copyCode(c.code)}><Copy/>
                              </Button>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-xs text-gray-600">{TYPE_LABELS[c.type] ?? c.type}</td>
                          <td className="py-3 px-2">
                            <Badge className={PLAN_COLORS[c.plan] ?? "bg-gray-100 text-gray-700"}>{c.plan}</Badge>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className="text-gray-700">
                              {Number(c.uses_total)} / {c.max_uses ?? (c.type === "unlimited" ? "∞" : c.uses_remaining !== null ? Number(c.uses_total) + Number(c.uses_remaining) : "∞")}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-xs">
                            {c.expires_at ? (
                              <span className={isExpired ? "text-red-600" : "text-gray-600"}>
                                {new Date(c.expires_at).toLocaleDateString()}
                              </span>
                            ) : <span className="text-gray-400">Never</span>}
                          </td>
                          <td className="py-3 px-2">
                            {!c.is_active ? (
                              <Badge className="bg-red-100 text-red-700">Revoked</Badge>
                            ) : isExpired ? (
                              <Badge className="bg-orange-100 text-orange-700">Expired</Badge>
                            ) : isFullyUsed ? (
                              <Badge className="bg-gray-100 text-gray-700">Exhausted</Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-700">Active</Badge>
                            )}
                          </td>
                          <td className="py-3 px-2 text-xs text-gray-500 max-w-[150px] truncate" title={c.notes ?? ""}>
                            {c.notes ?? "—"}
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="text-xs h-7"
                                aria-label="Copy" onClick={() => copyLink(c.code)} title="Copy onboarding link"><Copy/>Link
                              </Button>
                              {c.is_active ? (
                                <Button size="sm" variant="outline" className="text-red-600 border-red-200 h-7"
                                  onClick={() => revokeMutation.mutate({ code: c.code })}
                                  disabled={revokeMutation.isPending}>
                                  <Ban className="w-3 h-3" />
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" className="text-green-600 border-green-200 h-7"
                                  onClick={() => reactivateMutation.mutate({ code: c.code })}
                                  disabled={reactivateMutation.isPending}>
                                  <CheckCircle className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
