// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Activity, CheckCircle, XCircle, RefreshCw, Zap, Globe, Phone, Shield, CreditCard } from "lucide-react";
import { useIdempotencyKey } from "@/hooks/useIdempotencyKey";

// Maps the VTPass test-panel service ids to real consumerBills categories/biller codes.
const VTPASS_SERVICE_MAP: Record<string, { category: string; billerCode: string }> = {
  mtn: { category: "airtime", billerCode: "mtn-airtime" },
  airtel: { category: "airtime", billerCode: "airtel-airtime" },
  glo: { category: "airtime", billerCode: "glo-airtime" },
  "9mobile": { category: "airtime", billerCode: "9mobile-airtime" },
  dstv: { category: "cable_tv", billerCode: "dstv" },
  ikedc: { category: "electricity", billerCode: "ikedc" },
};

const INTEGRATIONS = [
  { id: "nibss", name: "NIBSS NIP", description: "Nigeria Interbank Settlement System — instant transfers", icon: <CreditCard className="w-5 h-5" />, color: "bg-green-50 border-green-200" },
  { id: "mojaloop", name: "Mojaloop", description: "Open-source interoperability for financial services", icon: <Globe className="w-5 h-5" />, color: "bg-blue-50 border-blue-200" },
  { id: "vtpass", name: "VTPass", description: "Airtime, data, utility bill payments", icon: <Zap className="w-5 h-5" />, color: "bg-purple-50 border-purple-200" },
  { id: "termii", name: "Termii", description: "SMS/OTP delivery and messaging gateway", icon: <Phone className="w-5 h-5" />, color: "bg-orange-50 border-orange-200" },
  { id: "youverify", name: "Youverify", description: "KYC/AML identity verification", icon: <Shield className="w-5 h-5" />, color: "bg-teal-50 border-teal-200" },
  { id: "ussd", name: "USSD Gateway", description: "Unstructured Supplementary Service Data for feature phones", icon: <Phone className="w-5 h-5" />, color: "bg-amber-50 border-amber-200" },
];

export default function MiddlewareIntegrations() {
  const [activeTab, setActiveTab] = useState("nibss");
  const [nibssAccount, setNibssAccount] = useState({ accountNumber: "", bankCode: "" });
  const [vtpassService, setVtpassService] = useState({ serviceId: "mtn", phone: "", amount: "100" });
  const [youverifyBvn, setYouverifyBvn] = useState({ bvn: "", firstName: "", lastName: "" });

  // Per-integration health derived from the real 24h middleware integration log stats.
  const { data: healthStats, isLoading: healthLoading, refetch: refetchHealth } = trpc.wave30.middlewareLogs.getStats.useQuery();
  const healthStatus = (healthStats ?? []).map((s: any) => ({
    service: s.service,
    status: Number(s.failed_calls) > 0 ? "degraded" : "up",
    latency_ms: Math.round(Number(s.avg_duration_ms ?? 0)),
  }));
  const { data: nibssLogs, isLoading: nibssLogsLoading } = trpc.wave30.middlewareLogs.list.useQuery({ service: "nibss", limit: 20 }, { staleTime: 30_000 });
  const { data: vtpassLogs, isLoading: vtpassLogsLoading } = trpc.wave30.middlewareLogs.list.useQuery({ service: "vtpass", limit: 20 }, { staleTime: 30_000 });

  const nibssEnquiry = trpc.nipBanks.nameEnquiry.useMutation({
    onSuccess: (data) => toast.success(`Account: ${data.accountName ?? data.account_name ?? "Resolved"}`),
    onError: (err) => toast.error(err.message),
  });

  const billsPayKey = useIdempotencyKey();
  const vtpassPurchase = trpc.consumerBills.pay.useMutation({
    onSuccess: () => { billsPayKey.reset(); toast.success("VTPass airtime purchase initiated"); },
    onError: (err) => { billsPayKey.reset(); toast.error(err.message); },
  });

  const youverifyCheck = trpc.nibss.verifyBvn.useMutation({
    onSuccess: (data) => toast.success(`BVN verified: ${data.status}`),
    onError: (err) => toast.error(err.message),
  });

  const activeIntegration = INTEGRATIONS.find((i) => i.id === activeTab);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Middleware Integrations</h1>
          <p className="text-gray-500 text-sm mt-1">NIBSS, Mojaloop, VTPass, Termii, Youverify, USSD Gateway</p>
        </div>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetchHealth()}><RefreshCw/> Refresh Health
        </Button>
      </div>

      {/* Health Status Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {healthLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-2 border-gray-200">
              <CardContent className="pt-4 space-y-2">
                <div className="h-5 bg-muted animate-pulse rounded" />
                <div className="h-3 bg-muted animate-pulse rounded w-3/4" />
              </CardContent>
            </Card>
          ))
        ) : INTEGRATIONS.map((intg) => {
          const health = healthStatus?.find((h: any) => h.service === intg.id);
          const isUp = health?.status === 'up' || health?.status === 'healthy';
          return (
            <Card key={intg.id} className={`cursor-pointer border-2 ${activeTab === intg.id ? 'border-indigo-400' : 'border-gray-200'} ${intg.color}`}
              onClick={() => setActiveTab(intg.id)}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {intg.icon}
                    <span className="font-semibold text-sm text-gray-900">{intg.name}</span>
                  </div>
                  {health ? (
                    isUp ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />
                  ) : <Activity className="w-4 h-4 text-gray-400 animate-pulse" />}
                </div>
                <p className="text-xs text-gray-500">{intg.description}</p>
                {health && (
                  <div className="mt-2 flex items-center gap-2">
                    <Badge className={`text-xs ${isUp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {health.status}
                    </Badge>
                    {health.latency_ms && <span className="text-xs text-gray-400">{health.latency_ms}ms</span>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Integration-specific panels */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-gray-700">
            {activeIntegration?.name} — Test & Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeTab === "nibss" && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <Input placeholder="Account Number (10 digits)" value={nibssAccount.accountNumber}
                  onChange={(e) => setNibssAccount({ ...nibssAccount, accountNumber: e.target.value })} />
                <Input placeholder="Bank Code (3 digits)" value={nibssAccount.bankCode}
                  onChange={(e) => setNibssAccount({ ...nibssAccount, bankCode: e.target.value })} />
                <Button className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
                  onClick={() => nibssEnquiry.mutate({ accountNumber: nibssAccount.accountNumber, bankNipCode: nibssAccount.bankCode })}>
                  Name Enquiry
                </Button>
              </div>
              <div className="text-xs text-gray-500">Test: Account 0123456789, Bank Code 058 (GTBank)</div>
              {nibssLogsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-8 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : nibssLogs && nibssLogs.length > 0 ? (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Operation</TableHead><TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead><TableHead>Response</TableHead><TableHead>Time</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {nibssLogs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs">{log.operation}</TableCell>
                        <TableCell className="text-xs">{log.duration_ms != null ? `${log.duration_ms}ms` : "—"}</TableCell>
                        <TableCell><Badge className={`text-xs ${log.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{log.success ? "success" : "failed"}</Badge></TableCell>
                        <TableCell className="text-xs max-w-xs truncate">{log.error_message ?? (log.response_payload ? String(log.response_payload).slice(0, 80) : "—")}</TableCell>
                        <TableCell className="text-xs text-gray-400">{new Date(log.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </div>
          )}

          {activeTab === "vtpass" && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <select className="border rounded px-3 py-2 text-sm text-gray-700"
                  value={vtpassService.serviceId} onChange={(e) => setVtpassService({ ...vtpassService, serviceId: e.target.value })}>
                  <option value="mtn">MTN Airtime</option>
                  <option value="airtel">Airtel Airtime</option>
                  <option value="glo">Glo Airtime</option>
                  <option value="9mobile">9Mobile Airtime</option>
                  <option value="dstv">DStv Subscription</option>
                  <option value="ikedc">IKEDC Electricity</option>
                </select>
                <Input placeholder="Phone number" value={vtpassService.phone}
                  onChange={(e) => setVtpassService({ ...vtpassService, phone: e.target.value })} />
                <Input placeholder="Amount (NGN)" value={vtpassService.amount}
                  onChange={(e) => setVtpassService({ ...vtpassService, amount: e.target.value })} />
                <Button className="bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => {
                    const svc = VTPASS_SERVICE_MAP[vtpassService.serviceId] ?? VTPASS_SERVICE_MAP.mtn;
                    vtpassPurchase.mutate({
                      category: svc.category,
                      billerCode: svc.billerCode,
                      customerReference: vtpassService.phone,
                      amountKobo: Math.round(parseFloat(vtpassService.amount) * 100),
                      idempotencyKey: billsPayKey.getKey(),
                    });
                  }}>
                  Purchase
                </Button>
              </div>
              {vtpassLogsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-8 bg-muted animate-pulse rounded" />
                  ))}
                </div>
              ) : vtpassLogs && vtpassLogs.length > 0 ? (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Operation</TableHead><TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead><TableHead>Response</TableHead><TableHead>Time</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {vtpassLogs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">{log.operation}</TableCell>
                        <TableCell className="text-xs">{log.duration_ms != null ? `${log.duration_ms}ms` : "—"}</TableCell>
                        <TableCell><Badge className={`text-xs ${log.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{log.success ? "success" : "failed"}</Badge></TableCell>
                        <TableCell className="text-xs max-w-xs truncate">{log.error_message ?? (log.response_payload ? String(log.response_payload).slice(0, 80) : "—")}</TableCell>
                        <TableCell className="text-xs text-gray-400">{new Date(log.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </div>
          )}

          {activeTab === "termii" && (
            <div className="p-6 text-center text-gray-400">
              <Phone className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-gray-600">Termii SMS Gateway</p>
              <p className="text-sm mt-1">
                Termii is used internally for OTP/notification delivery — there is no direct
                ad-hoc SMS test endpoint. Delivery activity appears in the middleware
                integration logs above when SMS traffic flows.
              </p>
            </div>
          )}

          {activeTab === "youverify" && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <Input placeholder="BVN (11 digits)" value={youverifyBvn.bvn}
                  onChange={(e) => setYouverifyBvn({ ...youverifyBvn, bvn: e.target.value })} />
                <Input placeholder="First Name" value={youverifyBvn.firstName}
                  onChange={(e) => setYouverifyBvn({ ...youverifyBvn, firstName: e.target.value })} />
                <Input placeholder="Last Name" value={youverifyBvn.lastName}
                  onChange={(e) => setYouverifyBvn({ ...youverifyBvn, lastName: e.target.value })} />
                <Button className="bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={() => youverifyCheck.mutate(youverifyBvn)}>
                  Verify BVN
                </Button>
              </div>
              <p className="text-xs text-gray-400">Test BVN: 22222222222</p>
            </div>
          )}

          {(activeTab === "mojaloop" || activeTab === "ussd") && (
            <div className="p-6 text-center text-gray-400">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-gray-600">{activeIntegration?.name} Integration</p>
              <p className="text-sm mt-1">{activeIntegration?.description}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 max-w-md mx-auto text-left">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-600">Endpoint</p>
                  <p className="text-xs font-mono text-gray-800 mt-1">
                    {activeTab === "mojaloop" ? process.env.MOJALOOP_URL ?? "https://mojaloop.paygate.io" : "https://ussd.paygate.io"}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-600">Status</p>
                  <Badge className="mt-1 bg-green-100 text-green-700 text-xs">Configured</Badge>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
