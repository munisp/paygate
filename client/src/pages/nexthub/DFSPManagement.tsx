import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { RefreshCw, Plus, Building2, Smartphone, Zap, Coins } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 border-emerald-200",
  SUSPENDED: "bg-amber-100 text-amber-700 border-amber-200",
  OFFBOARDED: "bg-slate-100 text-slate-500 border-slate-200",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  bank: <Building2 className="w-3 h-3" />,
  mno: <Smartphone className="w-3 h-3" />,
  fintech: <Zap className="w-3 h-3" />,
  cbdc: <Coins className="w-3 h-3" />,
};

function koboToNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

export default function DFSPManagement() {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [onboardForm, setOnboardForm] = useState({
    dfspId: "", dfspName: "", dfspType: "bank" as any, callbackUrl: "", liquidityLimitKobo: 0,
  });

  const { data: stats, refetch: refetchStats } = trpc.nexthubDfsps.getStats.useQuery();
  const { data, isLoading, refetch } = trpc.nexthubDfsps.listDfsps.useQuery({
    page, pageSize: 20,
    status: statusFilter as any,
    dfspType: typeFilter as any,
    search: search || undefined,
  });

  const onboardMutation = trpc.nexthubDfsps.onboardDfsp.useMutation({
    onSuccess: () => {
      toast.success(`DFSP ${onboardForm.dfspId} onboarded successfully`);
      setOnboardForm({ dfspId: "", dfspName: "", dfspType: "bank", callbackUrl: "", liquidityLimitKobo: 0 });
      refetch(); refetchStats();
    },
    onError: (e) => toast.error(e.message),
  });

  const suspendMutation = trpc.nexthubDfsps.updateDfsp.useMutation({
    onSuccess: () => { toast.success("DFSP status updated"); refetch(); refetchStats(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">DFSP Management</h1>
          <p className="text-sm text-slate-500 mt-1">Digital Financial Service Provider registry — onboarding, certificates, and liquidity limits</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchStats(); }}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-4 h-4 mr-2" /> Onboard DFSP
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Onboard New DFSP</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">DFSP ID</label>
                  <Input className="mt-1" placeholder="e.g. ACCESS_BANK_NG" value={onboardForm.dfspId}
                    onChange={e => setOnboardForm(f => ({ ...f, dfspId: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">DFSP Name</label>
                  <Input className="mt-1" placeholder="e.g. Access Bank Nigeria" value={onboardForm.dfspName}
                    onChange={e => setOnboardForm(f => ({ ...f, dfspName: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">DFSP Type</label>
                  <Select value={onboardForm.dfspType} onValueChange={v => setOnboardForm(f => ({ ...f, dfspType: v as any }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank</SelectItem>
                      <SelectItem value="mno">Mobile Network Operator</SelectItem>
                      <SelectItem value="fintech">Fintech</SelectItem>
                      <SelectItem value="cbdc">CBDC Participant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Callback URL (optional)</label>
                  <Input className="mt-1" placeholder="https://dfsp.example.com/callback" value={onboardForm.callbackUrl}
                    onChange={e => setOnboardForm(f => ({ ...f, callbackUrl: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Liquidity Limit (NGN kobo)</label>
                  <Input className="mt-1" type="number" min={0} value={onboardForm.liquidityLimitKobo}
                    onChange={e => setOnboardForm(f => ({ ...f, liquidityLimitKobo: Number(e.target.value) }))} />
                  <p className="text-xs text-slate-400 mt-1">= {koboToNaira(onboardForm.liquidityLimitKobo)}</p>
                </div>
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => onboardMutation.mutate(onboardForm)}
                  disabled={onboardMutation.isPending || !onboardForm.dfspId.trim() || !onboardForm.dfspName.trim()}>
                  {onboardMutation.isPending ? "Onboarding..." : "Onboard DFSP"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg"><Building2 className="w-4 h-4 text-emerald-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Active DFSPs</p>
                <p className="text-xl font-bold text-slate-900">{stats?.active ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><Building2 className="w-4 h-4 text-blue-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Banks</p>
                <p className="text-xl font-bold text-slate-900">{stats?.banks ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg"><Smartphone className="w-4 h-4 text-purple-600" /></div>
              <div>
                <p className="text-xs text-slate-500">MNOs</p>
                <p className="text-xl font-bold text-slate-900">{stats?.mnos ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg"><Zap className="w-4 h-4 text-amber-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Fintechs</p>
                <p className="text-xl font-bold text-slate-900">{stats?.fintechs ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex gap-3 flex-wrap">
            <Input placeholder="Search by name..." className="w-48" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }} />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {["ALL", "ACTIVE", "SUSPENDED", "OFFBOARDED"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                {["ALL", "bank", "mno", "fintech", "cbdc"].map(t => (
                  <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400">Loading DFSPs...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DFSP ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead className="text-right">Liquidity Limit</TableHead>
                  <TableHead>TigerBeetle</TableHead>
                  <TableHead>Cert Expires</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.dfsps ?? []).map((dfsp) => {
                  const certExpiringSoon = dfsp.certificateExpiresAt &&
                    new Date(dfsp.certificateExpiresAt) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                  return (
                    <TableRow key={dfsp.id}>
                      <TableCell className="font-mono text-xs font-medium text-slate-700">{dfsp.dfspId}</TableCell>
                      <TableCell className="font-medium text-sm">{dfsp.dfspName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-slate-600">
                          {TYPE_ICONS[dfsp.dfspType]}
                          {dfsp.dfspType.toUpperCase()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[dfsp.status] ?? ""}`}>
                          {dfsp.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{dfsp.country}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {koboToNaira(dfsp.liquidityLimitKobo ?? 0)}
                      </TableCell>
                      <TableCell>
                        {dfsp.tigerBeetlePositionAccountId ? (
                          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">Provisioned</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-slate-400">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className={`text-xs ${certExpiringSoon ? "text-amber-600 font-medium" : "text-slate-500"}`}>
                        {dfsp.certificateExpiresAt ? new Date(dfsp.certificateExpiresAt).toLocaleDateString() : "—"}
                        {certExpiringSoon && " ⚠"}
                      </TableCell>
                      <TableCell>
                        {dfsp.status === "ACTIVE" && (
                          <Button size="sm" variant="outline" className="text-xs h-7 text-amber-600 border-amber-300"
                            onClick={() => suspendMutation.mutate({ dfspId: dfsp.dfspId, status: "SUSPENDED" })}
                            disabled={suspendMutation.isPending}>
                            Suspend
                          </Button>
                        )}
                        {dfsp.status === "SUSPENDED" && (
                          <Button size="sm" variant="outline" className="text-xs h-7 text-emerald-600 border-emerald-300"
                            onClick={() => suspendMutation.mutate({ dfspId: dfsp.dfspId, status: "ACTIVE" })}
                            disabled={suspendMutation.isPending}>
                            Reinstate
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(data?.dfsps ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-slate-400 py-8">No DFSPs found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(data?.total ?? 0) > 20 && (
        <div className="flex justify-between items-center">
          <p className="text-sm text-slate-500">Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data?.total ?? 0)} of {data?.total ?? 0}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= (data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
