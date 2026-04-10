import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, Search, RefreshCw, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG = {
  completed: { color: "default", icon: <CheckCircle className="h-4 w-4 text-green-500" /> },
  active: { color: "secondary", icon: <Clock className="h-4 w-4 text-blue-500" /> },
  failed: { color: "destructive", icon: <XCircle className="h-4 w-4 text-red-500" /> },
  timeout: { color: "outline", icon: <AlertCircle className="h-4 w-4 text-yellow-500" /> },
} as const;

// Mock USSD session data — in production this would come from the USSD gateway
const MOCK_SESSIONS = [
  { id: "ussd_001", msisdn: "+2348012345678", sessionId: "sess_abc123", serviceCode: "*737*1#", status: "completed", startedAt: new Date(Date.now() - 3600000), endedAt: new Date(Date.now() - 3540000), steps: 3, lastInput: "1", amount: 5000000, currency: "NGN" },
  { id: "ussd_002", msisdn: "+2348098765432", sessionId: "sess_def456", serviceCode: "*737*2#", status: "active", startedAt: new Date(Date.now() - 120000), endedAt: null, steps: 2, lastInput: "2", amount: null, currency: "NGN" },
  { id: "ussd_003", msisdn: "+2347012345678", sessionId: "sess_ghi789", serviceCode: "*737*1#", status: "timeout", startedAt: new Date(Date.now() - 7200000), endedAt: new Date(Date.now() - 7080000), steps: 1, lastInput: "", amount: null, currency: "NGN" },
  { id: "ussd_004", msisdn: "+2349012345678", sessionId: "sess_jkl012", serviceCode: "*737*3#", status: "failed", startedAt: new Date(Date.now() - 1800000), endedAt: new Date(Date.now() - 1740000), steps: 4, lastInput: "wrong_pin", amount: 10000000, currency: "NGN" },
  { id: "ussd_005", msisdn: "+2348056789012", sessionId: "sess_mno345", serviceCode: "*737*1#", status: "completed", startedAt: new Date(Date.now() - 86400000), endedAt: new Date(Date.now() - 86340000), steps: 5, lastInput: "confirm", amount: 25000000, currency: "NGN" },
];

export default function USSDSessions() {
  const [search, setSearch] = useState("");
  const [selectedSession, setSelectedSession] = useState<typeof MOCK_SESSIONS[0] | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const sessions = MOCK_SESSIONS.filter((s) => {
    const matchSearch = !search || s.msisdn.includes(search) || s.sessionId.includes(search);
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: MOCK_SESSIONS.length,
    active: MOCK_SESSIONS.filter((s) => s.status === "active").length,
    completed: MOCK_SESSIONS.filter((s) => s.status === "completed").length,
    failed: MOCK_SESSIONS.filter((s) => s.status === "failed" || s.status === "timeout").length,
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">USSD Sessions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor and debug USSD payment sessions
          </p>
        </div>
        <Button variant="outline" onClick={() => toast.info("Sessions refreshed")}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Sessions", value: stats.total, icon: <Phone className="h-5 w-5 text-primary" /> },
          { label: "Active", value: stats.active, icon: <Clock className="h-5 w-5 text-blue-500" /> },
          { label: "Completed", value: stats.completed, icon: <CheckCircle className="h-5 w-5 text-green-500" /> },
          { label: "Failed/Timeout", value: stats.failed, icon: <XCircle className="h-5 w-5 text-red-500" /> },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                {stat.icon}
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by phone or session ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              {["all", "active", "completed", "failed", "timeout"].map((s) => (
                <Button
                  key={s}
                  variant={statusFilter === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(s)}
                  className="capitalize"
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions table */}
      <Card>
        <CardHeader>
          <CardTitle>Session Log</CardTitle>
          <CardDescription>{sessions.length} sessions found</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone</TableHead>
                  <TableHead>Session ID</TableHead>
                  <TableHead>Service Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Steps</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => {
                  const statusCfg = STATUS_CONFIG[s.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.failed;
                  const duration = s.endedAt
                    ? Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 1000)
                    : null;
                  return (
                    <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedSession(s)}>
                      <TableCell className="font-mono text-sm">{s.msisdn}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{s.sessionId}</TableCell>
                      <TableCell><Badge variant="outline">{s.serviceCode}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {statusCfg.icon}
                          <span className="text-sm capitalize">{s.status}</span>
                        </div>
                      </TableCell>
                      <TableCell>{s.steps}</TableCell>
                      <TableCell>
                        {s.amount ? `₦${(s.amount / 100).toLocaleString("en-NG")}` : "—"}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {s.startedAt.toLocaleTimeString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {duration !== null ? `${duration}s` : "ongoing"}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">View</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Session detail dialog */}
      <Dialog open={!!selectedSession} onOpenChange={() => setSelectedSession(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Session Details</DialogTitle>
          </DialogHeader>
          {selectedSession && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Session ID", selectedSession.sessionId],
                  ["Phone", selectedSession.msisdn],
                  ["Service Code", selectedSession.serviceCode],
                  ["Status", selectedSession.status],
                  ["Steps Completed", String(selectedSession.steps)],
                  ["Last Input", selectedSession.lastInput || "—"],
                  ["Amount", selectedSession.amount ? `₦${(selectedSession.amount / 100).toLocaleString("en-NG")}` : "—"],
                  ["Started", selectedSession.startedAt.toLocaleString()],
                  ["Ended", selectedSession.endedAt?.toLocaleString() ?? "Still active"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-medium">{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { navigator.clipboard.writeText(selectedSession.sessionId); toast.success("Session ID copied"); }}
                >
                  Copy Session ID
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.info("Session replay — feature coming soon")}
                >
                  Replay Session
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
