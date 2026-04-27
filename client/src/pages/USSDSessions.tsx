import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Search, RefreshCw, Clock, CheckCircle, XCircle, AlertCircle, Activity, Languages } from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { color: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  completed: { color: "default", icon: <CheckCircle className="h-4 w-4 text-green-500" /> },
  active: { color: "secondary", icon: <Clock className="h-4 w-4 text-blue-500" /> },
  failed: { color: "destructive", icon: <XCircle className="h-4 w-4 text-red-500" /> },
  timeout: { color: "outline", icon: <AlertCircle className="h-4 w-4 text-yellow-500" /> },
};

type UssdSession = {
  id: string;
  msisdn: string;
  sessionId: string;
  serviceCode: string;
  status: "active" | "completed" | "failed" | "timeout";
  startedAt: Date;
  endedAt: Date | null;
  steps: number;
  lastInput: string | null;
  amountKobo: number | null;
  currency: string;
};

export default function USSDSessions() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedSession, setSelectedSession] = useState<UssdSession | null>(null);
  const [confirmResetPhone, setConfirmResetPhone] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data: sessions = [], isLoading, refetch } = trpc.ussd.list.useQuery(
    {
      status: statusFilter !== "all" ? (statusFilter as "active" | "completed" | "failed" | "timeout") : undefined,
      msisdn: search || undefined,
      limit: 100,
    },
    { staleTime: 15_000 }
  );

  const { data: stats } = trpc.ussd.stats.useQuery(undefined, { staleTime: 30_000 });

  const resetLangPref = trpc.ussd.resetLangPref.useMutation({
    onSuccess: (data) => {
      toast.success(`Language preference cleared for ${data.phone}. They will see the language picker on their next dial.`);
      setConfirmResetPhone(null);
    },
    onError: (err) => {
      toast.error(`Failed to reset language preference: ${err.message}`);
      setConfirmResetPhone(null);
    },
  });

  const handleRefresh = () => {
    refetch();
    utils.ussd.stats.invalidate();
    toast.success("Sessions refreshed");
  };

  const statCards = [
    { label: "Total", value: stats?.total ?? 0, icon: <Activity className="h-5 w-5 text-muted-foreground" /> },
    { label: "Active", value: stats?.active ?? 0, icon: <Clock className="h-5 w-5 text-blue-500" /> },
    { label: "Completed", value: stats?.completed ?? 0, icon: <CheckCircle className="h-5 w-5 text-green-500" /> },
    { label: "Failed / Timeout", value: (stats?.failed ?? 0) + (stats?.timeout ?? 0), icon: <XCircle className="h-5 w-5 text-red-500" /> },
  ];

  const formatAmount = (kobo: number | null, currency: string) => {
    if (!kobo) return "—";
    return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(kobo / 100);
  };

  const durationSec = (s: UssdSession) => {
    if (!s.endedAt) return "ongoing";
    const ms = new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime();
    return `${Math.round(ms / 1000)}s`;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Phone className="h-6 w-6 text-primary" /> USSD Sessions
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Monitor and inspect USSD gateway sessions in real time</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((c: any) => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{c.label}</span>
                {c.icon}
              </div>
              <p className="text-2xl font-bold mt-1">{c.value.toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Session Log</CardTitle>
          <CardDescription>All USSD sessions ingested from the gateway</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by MSISDN or session ID…"
                value={search}
                onChange={(e: any) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="timeout">Timeout</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading sessions…
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Phone className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No USSD sessions found</p>
              <p className="text-sm mt-1">Sessions will appear here once the USSD gateway starts sending data</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MSISDN</TableHead>
                  <TableHead>Service Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Steps</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s: any) => {
                  const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.failed;
                  return (
                    <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedSession(s as UssdSession)}>
                      <TableCell className="font-mono text-sm">{s.msisdn}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{s.serviceCode}</TableCell>
                      <TableCell>
                        <Badge variant={cfg.color} className="flex items-center gap-1 w-fit">
                          {cfg.icon}
                          <span className="capitalize">{s.status}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>{s.steps}</TableCell>
                      <TableCell>{formatAmount(s.amountKobo, s.currency)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{durationSec(s as UssdSession)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{new Date(s.startedAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={(e: any) => { e.stopPropagation(); setSelectedSession(s as UssdSession); }}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Session Detail Dialog */}
      <Dialog open={!!selectedSession} onOpenChange={() => setSelectedSession(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Session Detail</DialogTitle>
            <DialogDescription className="font-mono text-xs">{selectedSession?.sessionId}</DialogDescription>
          </DialogHeader>
          {selectedSession && (
            <>
              <div className="space-y-3 text-sm">
                {[
                  ["MSISDN", selectedSession.msisdn],
                  ["Service Code", selectedSession.serviceCode],
                  ["Status", <Badge variant={STATUS_CONFIG[selectedSession.status]?.color ?? "outline"} className="capitalize">{selectedSession.status}</Badge>],
                  ["Steps Completed", selectedSession.steps],
                  ["Last Input", selectedSession.lastInput || "—"],
                  ["Amount", formatAmount(selectedSession.amountKobo, selectedSession.currency)],
                  ["Started", new Date(selectedSession.startedAt).toLocaleString()],
                  ["Ended", selectedSession.endedAt ? new Date(selectedSession.endedAt).toLocaleString() : "Still active"],
                  ["Duration", durationSec(selectedSession)],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex justify-between border-b pb-2 last:border-0">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-right">{value as React.ReactNode}</span>
                  </div>
                ))}
              </div>
              {/* Support action: reset stored language preference */}
              <div className="mt-4 pt-3 border-t">
                <p className="text-xs text-muted-foreground mb-2">
                  Support actions for <span className="font-mono font-medium">{selectedSession.msisdn}</span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                  onClick={() => setConfirmResetPhone(selectedSession.msisdn)}
                >
                  <Languages className="h-4 w-4" />
                  Reset Language Preference
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Reset Language Preference Dialog */}
      <Dialog open={!!confirmResetPhone} onOpenChange={() => setConfirmResetPhone(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Languages className="h-5 w-5 text-amber-500" />
              Reset Language Preference
            </DialogTitle>
            <DialogDescription>
              This will clear the stored language preference for{" "}
              <span className="font-mono font-medium">{confirmResetPhone}</span>. The customer will see the language
              picker menu on their next USSD dial.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmResetPhone(null)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-amber-600 hover:bg-amber-700"
              disabled={resetLangPref.isPending}
              onClick={() => {
                if (confirmResetPhone) resetLangPref.mutate({ phone: confirmResetPhone });
              }}
            >
              {resetLangPref.isPending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Resetting…</>
              ) : (
                "Yes, Reset"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
