// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, Zap, CreditCard, FileText, AlertTriangle, Plus, RefreshCw } from "lucide-react";

export default function PSPManagement() {
  const [activeTab, setActiveTab] = useState("velocity");
  const [newLimitOpen, setNewLimitOpen] = useState(false);
  const [newLimitForm, setNewLimitForm] = useState({
    merchantId: "", channel: "nip", limitType: "count", windowSeconds: 3600,
    maxCount: 100, maxAmountKobo: 10000000,
  });

  // Velocity limits
  const { data: limitsData, isLoading, refetch: refetchLimits } = trpc.velocityLimits.list.useQuery({ page: 1, pageSize: 20 });
  const createLimit = trpc.velocityLimits.create.useMutation({
    onSuccess: () => { toast.success("Velocity limit created"); setNewLimitOpen(false); refetchLimits(); },
    onError: (e) => toast.error(e.message),
  });

  // Interchange schedule
  const { data: scheduleData } = trpc.interchange.getSchedule.useQuery({});

  // Scheme membership
  const { data: schemeData } = trpc.schemeMembership.list.useQuery({});

  // STR records
  const { data: strData } = trpc.str.list.useQuery({ page: 1, pageSize: 20 });

  // CBN reports
  const { data: reportsData } = trpc.regulatoryReports.list.useQuery({ page: 1, pageSize: 20 });
  const generateReport = trpc.regulatoryReports.generate.useMutation({
    onSuccess: () => toast.success("Report generation queued"),
    onError: (e) => toast.error(e.message),
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">PSP Management</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage PSP licence obligations: velocity limits, interchange, scheme membership, STR, and CBN reports
            </p>
          </div>
          <Badge variant="outline" className="text-green-600 border-green-600">
            <Shield className="w-3 h-3 mr-1" /> CBN Licensed PSP
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="velocity"><Zap className="w-3 h-3 mr-1" />Velocity</TabsTrigger>
            <TabsTrigger value="interchange"><CreditCard className="w-3 h-3 mr-1" />Interchange</TabsTrigger>
            <TabsTrigger value="scheme">Scheme</TabsTrigger>
            <TabsTrigger value="str"><AlertTriangle className="w-3 h-3 mr-1" />STR</TabsTrigger>
            <TabsTrigger value="reports"><FileText className="w-3 h-3 mr-1" />CBN Reports</TabsTrigger>
          </TabsList>

          {/* Velocity Limits Tab */}
          <TabsContent value="velocity" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Sub-Merchant Velocity Limits</h2>
              <Dialog open={newLimitOpen} onOpenChange={setNewLimitOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="w-4 h-4 mr-1" />New Limit</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Create Velocity Limit</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Merchant ID</Label>
                      <Input value={newLimitForm.merchantId} onChange={e => setNewLimitForm(f => ({ ...f, merchantId: e.target.value }))} placeholder="merchant-uuid" />
                    </div>
                    <div>
                      <Label>Channel</Label>
                      <Select value={newLimitForm.channel} onValueChange={v => setNewLimitForm(f => ({ ...f, channel: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nip">NIP</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                          <SelectItem value="ussd">USSD</SelectItem>
                          <SelectItem value="mojaloop">Mojaloop</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Window (seconds)</Label>
                      <Input type="number" value={newLimitForm.windowSeconds} onChange={e => setNewLimitForm(f => ({ ...f, windowSeconds: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <Label>Max Count</Label>
                      <Input type="number" value={newLimitForm.maxCount} onChange={e => setNewLimitForm(f => ({ ...f, maxCount: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <Label>Max Amount (Kobo)</Label>
                      <Input type="number" value={newLimitForm.maxAmountKobo} onChange={e => setNewLimitForm(f => ({ ...f, maxAmountKobo: Number(e.target.value) }))} />
                    </div>
                    <Button className="w-full" onClick={() => createLimit.mutate(newLimitForm)} disabled={createLimit.isPending}>
                      {createLimit.isPending ? "Creating..." : "Create Limit"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="space-y-2">
              {limitsData?.limits?.map((limit: any) => (
                <Card key={limit.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{limit.merchantId}</p>
                      <p className="text-xs text-muted-foreground">
                        {limit.channel.toUpperCase()} · {limit.windowSeconds}s window · max {limit.maxCount} txns · max ₦{((limit.maxAmountKobo ?? 0) / 100).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={limit.isActive ? "default" : "secondary"}>{limit.isActive ? "Active" : "Inactive"}</Badge>
                  </CardContent>
                </Card>
              ))}
              {!limitsData?.limits?.length && (
                <div className="text-center py-8 text-muted-foreground text-sm">No velocity limits configured. Add one to protect sub-merchants.</div>
              )}
            </div>
          </TabsContent>

          {/* Interchange Tab */}
          <TabsContent value="interchange" className="space-y-4">
            <h2 className="text-lg font-semibold">Interchange Fee Schedule</h2>
            <div className="space-y-2">
              {scheduleData?.schedules?.map((s: any) => (
                <Card key={s.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{s.network} · {s.cardType} · {s.transactionType}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.feeType === "percentage" ? `${s.feeValue}%` : `₦${(s.feeValue / 100).toFixed(2)} flat`}
                        {s.capKobo ? ` (cap ₦${(s.capKobo / 100).toLocaleString()})` : ""}
                      </p>
                    </div>
                    <Badge variant="outline">{s.rail}</Badge>
                  </CardContent>
                </Card>
              ))}
              {!scheduleData?.schedules?.length && (
                <div className="text-center py-8 text-muted-foreground text-sm">No interchange schedules configured.</div>
              )}
            </div>
          </TabsContent>

          {/* Scheme Membership Tab */}
          <TabsContent value="scheme" className="space-y-4">
            <h2 className="text-lg font-semibold">Scheme Membership & BIN Sponsorship</h2>
            <div className="space-y-2">
              {schemeData?.memberships?.map((m: any) => (
                <Card key={m.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{m.schemeName} · {m.membershipType}</p>
                      <p className="text-xs text-muted-foreground">
                        BIN Range: {m.binRangeStart}–{m.binRangeEnd} · Principal: {m.principalMemberId ?? "N/A"}
                      </p>
                    </div>
                    <Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status}</Badge>
                  </CardContent>
                </Card>
              ))}
              {!schemeData?.memberships?.length && (
                <div className="text-center py-8 text-muted-foreground text-sm">No scheme memberships registered.</div>
              )}
            </div>
          </TabsContent>

          {/* STR Tab */}
          <TabsContent value="str" className="space-y-4">
            <h2 className="text-lg font-semibold">Suspicious Transaction Reports (STR)</h2>
            <p className="text-xs text-muted-foreground">CBN/NFIU requires STR submission within 24 hours of detection.</p>
            <div className="space-y-2">
              {strData?.reports?.map((r: any) => (
                <Card key={r.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">STR-{r.id.slice(0, 8).toUpperCase()}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.suspiciousActivityType} · ₦{((r.transactionAmountKobo ?? 0) / 100).toLocaleString()} · {new Date(r.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={r.status === "submitted" ? "default" : r.status === "pending" ? "secondary" : "destructive"}>
                      {r.status}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
              {!strData?.reports?.length && (
                <div className="text-center py-8 text-muted-foreground text-sm">No STRs filed. All transactions appear compliant.</div>
              )}
            </div>
          </TabsContent>

          {/* CBN Reports Tab */}
          <TabsContent value="reports" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">CBN Regulatory Reports</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => generateReport.mutate({ reportType: "form_a", periodStart: new Date(Date.now() - 30*24*60*60*1000).toISOString(), periodEnd: new Date().toISOString() })}>
                  Generate Form A
                </Button>
                <Button size="sm" variant="outline" onClick={() => generateReport.mutate({ reportType: "form_b", periodStart: new Date(Date.now() - 30*24*60*60*1000).toISOString(), periodEnd: new Date().toISOString() })}>
                  Generate Form B
                </Button>
                <Button size="sm" variant="outline" onClick={() => generateReport.mutate({ reportType: "form_c", periodStart: new Date(Date.now() - 30*24*60*60*1000).toISOString(), periodEnd: new Date().toISOString() })}>
                  Generate Form C
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {reportsData?.reports?.map((r: any) => (
                <Card key={r.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{r.reportType.toUpperCase().replace("_", " ")} · {r.reportingPeriod}</p>
                      <p className="text-xs text-muted-foreground">
                        Generated: {new Date(r.createdAt).toLocaleDateString()} · {r.fileUrl ? "PDF ready" : "Generating..."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={r.status === "submitted" ? "default" : "secondary"}>{r.status}</Badge>
                      {r.fileUrl && (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={r.fileUrl} target="_blank" rel="noopener noreferrer">Download</a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!reportsData?.reports?.length && (
                <div className="text-center py-8 text-muted-foreground text-sm">No reports generated yet. Use the buttons above to generate CBN Form A/B/C.</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
