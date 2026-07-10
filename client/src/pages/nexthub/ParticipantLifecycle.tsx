import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Users, Shield, Activity, AlertTriangle, CheckCircle, XCircle, Plus, Settings, RefreshCw, Wallet } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-500/10 text-green-400 border-green-500/20",
  SUSPENDED: "bg-red-500/10 text-red-400 border-red-500/20",
  PENDING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  OFFBOARDED: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const NDC_STATUS_COLORS: Record<string, string> = {
  OK: "text-green-400",
  ALERT: "text-yellow-400",
  BREACHED: "text-red-400",
  SUSPENDED: "text-red-500",
};

function NDCBar({ utilisation, status }: { utilisation: number; status: string }) {
  const pct = Math.min(utilisation * 100, 100);
  const color = status === "BREACHED" ? "bg-red-500" : status === "ALERT" ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono w-12 text-right ${NDC_STATUS_COLORS[status] ?? "text-muted-foreground"}`}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

export default function ParticipantLifecycle() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [currency, setCurrency] = useState("NGN");
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);

  // Onboard form state
  const [onboardForm, setOnboardForm] = useState({
    name: "", dfspId: "", currency: "NGN", schemeType: "FSPIOP", endpointUrl: "",
  });

  // Limits form state
  const [limitsForm, setLimitsForm] = useState({
    netDebitCap: "", liquidityCover: "", alertThreshold: "0.8", suspendOnBreach: true,
  });

  const { data: statsData } = trpc.nexthubParticipants.getParticipantStats.useQuery();
  const { data: participantsData, refetch: refetchParticipants } = trpc.nexthubParticipants.listParticipants.useQuery({
    status: statusFilter !== "ALL" ? (statusFilter as any) : undefined,
    currency: currency !== "ALL" ? currency : undefined,
    limit: 100,
    offset: 0,
  });
  const { data: positionsData, refetch: refetchPositions } = trpc.nexthubParticipants.getPositions.useQuery({
    currency,
    status: "ALL",
  });

  const onboardMutation = trpc.nexthubParticipants.onboardParticipant.useMutation({
    onSuccess: (data) => {
      toast({ title: "Participant onboarded", description: `ID: ${data.participantId}` });
      setOnboardOpen(false);
      refetchParticipants();
    },
    onError: (err) => toast({ title: "Onboard failed", description: err.message, variant: "destructive" }),
  });

  const suspendMutation = trpc.nexthubParticipants.suspendParticipant.useMutation({
    onSuccess: () => { toast({ title: "Participant suspended" }); refetchParticipants(); refetchPositions(); },
  });

  const reactivateMutation = trpc.nexthubParticipants.reactivateParticipant.useMutation({
    onSuccess: () => { toast({ title: "Participant reactivated" }); refetchParticipants(); refetchPositions(); },
  });

  const setLimitsMutation = trpc.nexthubParticipants.setLimits.useMutation({
    onSuccess: () => {
      toast({ title: "Limits updated" });
      setLimitsOpen(false);
    },
    onError: (err) => toast({ title: "Limits update failed", description: err.message, variant: "destructive" }),
  });

  const stats = statsData?.participants as any;
  const positions = (positionsData?.positions ?? []) as any[];
  const participants = (participantsData?.participants ?? []) as any[];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-400" />
            Participant Lifecycle
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            DFSP onboarding, position limits, net debit cap enforcement, and liquidity management
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchParticipants(); refetchPositions(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Dialog open={onboardOpen} onOpenChange={setOnboardOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-4 h-4 mr-1" /> Onboard DFSP
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Onboard New DFSP Participant</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Institution Name</Label>
                    <Input placeholder="e.g. GTBank" value={onboardForm.name}
                      onChange={e => setOnboardForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>DFSP ID</Label>
                    <Input placeholder="e.g. GTBANK" value={onboardForm.dfspId}
                      onChange={e => setOnboardForm(f => ({ ...f, dfspId: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Currency</Label>
                    <Select value={onboardForm.currency} onValueChange={v => setOnboardForm(f => ({ ...f, currency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["NGN", "USD", "GHS", "KES", "ZAR"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Scheme Type</Label>
                    <Select value={onboardForm.schemeType} onValueChange={v => setOnboardForm(f => ({ ...f, schemeType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FSPIOP">FSPIOP</SelectItem>
                        <SelectItem value="ISO20022">ISO 20022</SelectItem>
                        <SelectItem value="BOTH">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>FSPIOP Endpoint URL</Label>
                  <Input placeholder="https://dfsp.example.com/fspiop/v2.0" value={onboardForm.endpointUrl}
                    onChange={e => setOnboardForm(f => ({ ...f, endpointUrl: e.target.value }))} />
                </div>
                <Button className="w-full" onClick={() => onboardMutation.mutate(onboardForm as any)}
                  disabled={onboardMutation.isPending}>
                  {onboardMutation.isPending ? "Onboarding..." : "Onboard Participant"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active DFSPs", value: stats?.active_count ?? "—", icon: CheckCircle, color: "text-green-400" },
          { label: "Suspended", value: stats?.suspended_count ?? "—", icon: XCircle, color: "text-red-400" },
          { label: "Pending", value: stats?.pending_count ?? "—", icon: AlertTriangle, color: "text-yellow-400" },
          { label: "NDC Configured", value: stats?.limits_configured ?? "—", icon: Shield, color: "text-indigo-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-card/50">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold mt-1">{value}</p>
                </div>
                <Icon className={`w-8 h-8 ${color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="participants">
        <TabsList>
          <TabsTrigger value="participants">Participants</TabsTrigger>
          <TabsTrigger value="positions">NDC Positions</TabsTrigger>
          <TabsTrigger value="liquidity">Liquidity Windows</TabsTrigger>
        </TabsList>

        {/* Participants Tab */}
        <TabsContent value="participants" className="space-y-4">
          <div className="flex gap-3 items-center">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {["ALL", "ACTIVE", "SUSPENDED", "PENDING", "OFFBOARDED"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["NGN", "USD", "GHS", "KES"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DFSP ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Scheme</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {participants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No participants found
                      </TableCell>
                    </TableRow>
                  ) : participants.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.dfsp_id}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.currency}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{p.scheme_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs border ${STATUS_COLORS[p.status] ?? ""}`}>
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm"
                            onClick={() => { setSelectedParticipant(p.id); setLimitsOpen(true); }}>
                            <Settings className="w-3 h-3" />
                          </Button>
                          {p.status === "ACTIVE" ? (
                            <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300"
                              onClick={() => suspendMutation.mutate({ participantId: p.id, reason: "Manual suspension" })}>
                              <XCircle className="w-3 h-3" />
                            </Button>
                          ) : p.status === "SUSPENDED" ? (
                            <Button variant="ghost" size="sm" className="text-green-400 hover:text-green-300"
                              onClick={() => reactivateMutation.mutate({ participantId: p.id })}>
                              <CheckCircle className="w-3 h-3" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* NDC Positions Tab */}
        <TabsContent value="positions" className="space-y-4">
          <div className="flex gap-2 items-center">
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["NGN", "USD", "GHS", "KES"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {positionsData?.summary && (
                <>
                  {positionsData.summary.breached} breached · {positionsData.summary.alert} alert · {positionsData.summary.ok} OK
                </>
              )}
            </p>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>DFSP</TableHead>
                    <TableHead>Current Position</TableHead>
                    <TableHead>Reserved</TableHead>
                    <TableHead>NDC Cap</TableHead>
                    <TableHead className="w-48">NDC Utilisation</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No position data — configure NDC limits first
                      </TableCell>
                    </TableRow>
                  ) : positions.map((pos: any) => (
                    <TableRow key={pos.participant_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{pos.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{pos.dfsp_id}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {Number(pos.current_value).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-yellow-400">
                        {Number(pos.reserved_value).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {Number(pos.net_debit_cap).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <NDCBar utilisation={Number(pos.ndc_utilisation)} status={pos.position_status} />
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-semibold ${NDC_STATUS_COLORS[pos.position_status] ?? ""}`}>
                          {pos.position_status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Liquidity Windows Tab */}
        <TabsContent value="liquidity">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="w-4 h-4 text-indigo-400" />
                Active Liquidity Windows
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Select a participant from the Participants tab and click the settings icon to manage their liquidity windows.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Set Limits Dialog */}
      <Dialog open={limitsOpen} onOpenChange={setLimitsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Position Limits — {selectedParticipant}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Net Debit Cap (minor units)</Label>
                <Input type="number" placeholder="e.g. 50000000" value={limitsForm.netDebitCap}
                  onChange={e => setLimitsForm(f => ({ ...f, netDebitCap: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Liquidity Cover (minor units)</Label>
                <Input type="number" placeholder="e.g. 10000000" value={limitsForm.liquidityCover}
                  onChange={e => setLimitsForm(f => ({ ...f, liquidityCover: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Alert Threshold (0.0 – 1.0)</Label>
              <Input type="number" step="0.05" min="0" max="1" value={limitsForm.alertThreshold}
                onChange={e => setLimitsForm(f => ({ ...f, alertThreshold: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Alert fires when NDC utilisation exceeds this fraction</p>
            </div>
            <Button className="w-full" onClick={() => {
              if (!selectedParticipant) return;
              setLimitsMutation.mutate({
                participantId: selectedParticipant,
                currency,
                netDebitCap: Number(limitsForm.netDebitCap),
                liquidityCover: Number(limitsForm.liquidityCover),
                alertThreshold: Number(limitsForm.alertThreshold),
                suspendOnBreach: limitsForm.suspendOnBreach,
              });
            }} disabled={setLimitsMutation.isPending}>
              {setLimitsMutation.isPending ? "Saving..." : "Save Limits"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
