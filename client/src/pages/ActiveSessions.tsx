import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, RefreshCw, LogOut, Monitor, Search, AlertTriangle, Settings2, Globe, Download, Mail, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";

function formatRelativeTime(ms: number) {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ActiveSessions() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [userIdFilter, setUserIdFilter] = useState("");
  const [sessionToLogout, setSessionToLogout] = useState<string | null>(null);
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [configWindow, setConfigWindow] = useState(15);
  const [configThreshold, setConfigThreshold] = useState(5);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditPage, setAuditPage] = useState(0);
  const [notifEmail, setNotifEmail] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const PAGE_SIZE = 10;
  // Global anomaly config
  const globalConfigQuery = trpc.middleware.keycloak.getGlobalAnomalyConfig.useQuery(undefined, {
    enabled: isAdmin,
  }, { staleTime: 30_000 });
  const auditLogQuery = trpc.middleware.keycloak.getAnomalyConfigAuditLog.useQuery(undefined, {
    enabled: isAdmin && showConfigForm,
  }, { staleTime: 30_000 });
  const auditLogFullQuery = trpc.middleware.keycloak.getAnomalyConfigAuditLogFull.useQuery(
    { limit: PAGE_SIZE, offset: auditPage * PAGE_SIZE },
    { enabled: isAdmin && showAuditModal , staleTime: 30_000 })
  const notifEmailQuery = trpc.middleware.keycloak.getNotificationEmail.useQuery(undefined, {
    enabled: isAdmin && showConfigForm,
    onSuccess: (d: any) => { if (!editingEmail) setNotifEmail(d.notificationEmail ?? ""); },
    staleTime: 30_000,
  });

  const saveGlobalAnomalyConfig = trpc.middleware.keycloak.setGlobalAnomalyConfig.useMutation({
    onSuccess: () => {
      toast.success("Global anomaly config saved as default for all admins");
      globalConfigQuery.refetch();
    },
    onError: (err) => toast.error(`Failed to save global config: ${err.message}`),
  });

  const setNotifEmailMutation = trpc.middleware.keycloak.setNotificationEmail.useMutation({
    onSuccess: () => {
      toast.success("Notification email updated");
      setEditingEmail(false);
      notifEmailQuery.refetch();
    },
    onError: (err) => toast.error(`Failed to update email: ${err.message}`),
  });

  const exportSessionsQuery = trpc.middleware.keycloak.exportSessions.useQuery(undefined, {
    enabled: false, // manual trigger only
  }, { staleTime: 30_000 });

  function handleExportCSV() {
    exportSessionsQuery.refetch().then((res) => {
      if (!res.data) return;
      const blob = new Blob([res.data.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Session list exported");
    }).catch(() => toast.error("Export failed"));
  }

  const { data, isLoading, refetch, isFetching } = trpc.middleware.keycloak.listActiveSessions.useQuery(
    { userId: userIdFilter.trim() || undefined, limit: 100 },
    { refetchInterval: 30000 } // auto-refresh every 30s
  );

  // Load anomaly config from DB
  const anomalyConfigQuery = trpc.middleware.keycloak.getAnomalyConfig.useQuery(undefined, {
    onSuccess: (cfg: any) => {
      setConfigWindow(cfg.loginAnomalyWindowMinutes);
      setConfigThreshold(cfg.loginAnomalyThreshold);
    },
    staleTime: 30_000,
  });

  const saveAnomalyConfig = trpc.middleware.keycloak.setAnomalyConfig.useMutation({
    onSuccess: (result) => {
      toast.success(`Anomaly config saved: ${result.windowMinutes}m window, threshold ${result.threshold}`);
      setShowConfigForm(false);
      anomalyConfigQuery.refetch();
    },
    onError: (err) => toast.error(`Failed to save config: ${err.message}`),
  });

  const anomalyQuery = trpc.middleware.keycloak.checkLoginAnomalies.useQuery(
    { windowMinutes: anomalyConfigQuery.data?.loginAnomalyWindowMinutes ?? 15, threshold: anomalyConfigQuery.data?.loginAnomalyThreshold ?? 5 },
    { refetchInterval: 60000 , staleTime: 30_000 })

  const forceLogout = trpc.middleware.keycloak.forceLogoutSession.useMutation({
    onSuccess: (result) => {
      toast.success(`Session ${result.sessionId.slice(0, 8)}… terminated`);
      refetch();
    },
    onError: (err) => {
      toast.error(`Failed to terminate session: ${err.message}`);
    },
  });

  const sessions = (data?.sessions ?? []) as Array<{
    id: string;
    userId: string;
    username: string;
    ipAddress: string;
    start: number;
    lastAccess: number;
    clients?: Record<string, string>;
    isNewCountry?: boolean;
    geoCountry?: string | null;
  }>;

  if (!isAdmin) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <Shield className="w-12 h-12 mx-auto text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">Admin access required to view active sessions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Monitor className="w-6 h-6 text-primary" />
            Active Sessions
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live Keycloak SSO sessions — force-logout suspicious or stale sessions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowConfigForm(v => !v)} className="gap-2">
            <Settings2 className="w-4 h-4" />
            Configure
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={exportSessionsQuery.isFetching} className="gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()} disabled={isFetching} className="gap-2"><RefreshCw/>
            Refresh
          </Button>
        </div>
      </div>

      {/* Anomaly alert banner */}
      {anomalyQuery.data?.exceeded && (
        <Card className="border-red-300 bg-red-50 dark:bg-red-950/20">
          <CardContent className="pt-4 pb-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-red-700 dark:text-red-400">Login Anomaly Detected</p>
              <p className="text-sm text-red-600 dark:text-red-300">
                {anomalyQuery.data.count} login failures in the last {anomalyQuery.data.windowMinutes} minutes
                (threshold: {anomalyQuery.data.threshold}). Review the Auth Events log for details.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Anomaly threshold config form */}
      {showConfigForm && (
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              Anomaly Detection Config
            </CardTitle>
            <CardDescription>Set the time window and failure count threshold for login anomaly alerts.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <Label htmlFor="configWindow">Window (minutes)</Label>
                <Input
                  id="configWindow"
                  type="number"
                  min={1}
                  max={1440}
                  value={configWindow}
                  onChange={e => setConfigWindow(Number(e.target.value))}
                  className="w-32"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="configThreshold">Failure threshold</Label>
                <Input
                  id="configThreshold"
                  type="number"
                  min={1}
                  max={1000}
                  value={configThreshold}
                  onChange={e => setConfigThreshold(Number(e.target.value))}
                  className="w-32"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={() => saveAnomalyConfig.mutate({ windowMinutes: configWindow, threshold: configThreshold })}
                  disabled={saveAnomalyConfig.isPending}
                >
                  {saveAnomalyConfig.isPending ? "Saving…" : "Save for me"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => saveGlobalAnomalyConfig.mutate({ windowMinutes: configWindow, threshold: configThreshold })}
                  disabled={saveGlobalAnomalyConfig.isPending}
                  title="Set these values as the global default for all admins"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {saveGlobalAnomalyConfig.isPending ? "Saving…" : "Set as Global Default"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowConfigForm(false)}>Cancel</Button>
              </div>
            </div>
            {/* Notification email config */}
            <div className="mt-4 border-t pt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" /> Alert Email
              </p>
              {editingEmail ? (
                <div className="flex gap-2 items-center">
                  <Input
                    type="email"
                    placeholder="alert@example.com"
                    value={notifEmail}
                    onChange={e => setNotifEmail(e.target.value)}
                    className="w-64 h-8 text-sm"
                  />
                  <Button size="sm" className="h-8" onClick={() => setNotifEmailMutation.mutate({ email: notifEmail || null })} disabled={setNotifEmailMutation.isPending}>
                    {setNotifEmailMutation.isPending ? "Saving…" : "Save"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => { setEditingEmail(false); setNotifEmail(notifEmailQuery.data?.notificationEmail ?? ""); }}>Cancel</Button>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground">{notifEmailQuery.data?.notificationEmail ?? <em>Not set — using SMTP_USER</em>}</span>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingEmail(true)}>Edit</Button>
                </div>
              )}
            </div>
            {/* Audit log */}
            {auditLogQuery.data && auditLogQuery.data.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground">Recent Changes</p>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setShowAuditModal(true); setAuditPage(0); }}>View all</Button>
                </div>
                <div className="space-y-1">
                  {auditLogQuery.data.map((entry) => (
                    <div key={entry.id} className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="font-mono">{new Date(entry.changedAt).toLocaleString()}</span>
                      <span>{entry.isGlobal ? "(global)" : `(user ${entry.changedByUserId})`}</span>
                      <span>
                        {entry.oldWindowMinutes != null ? `${entry.oldWindowMinutes}m/${entry.oldThreshold}` : "default"}
                        {" → "}
                        {entry.newWindowMinutes}m/{entry.newThreshold}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Active Sessions</p>
            <p className="text-2xl font-bold mt-1">{data?.total ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Login Failures (15m)</p>
            <p className={`text-2xl font-bold mt-1 ${(anomalyQuery.data?.count ?? 0) >= 5 ? "text-red-500" : ""}`}>
              {anomalyQuery.data?.count ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Auto-refresh</p>
            <p className="text-sm font-medium mt-1 text-muted-foreground">Every 30s</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter</CardTitle>
          <CardDescription>Filter sessions by Keycloak user ID</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Filter by Keycloak user ID…"
              value={userIdFilter}
              onChange={e => setUserIdFilter(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sessions table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Session List</CardTitle>
          <CardDescription>
            {isLoading ? "Loading…" : `${sessions.length} session${sessions.length !== 1 ? "s" : ""} shown`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session ID</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead>Clients</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      <Monitor className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      {userIdFilter ? "No sessions found for this user." : "No active sessions. Sessions appear here once users log in via Keycloak."}
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map(session => (
                    <TableRow key={session.id}>
                      <TableCell className="text-xs font-mono">
                        <div className="flex items-center gap-1.5">
                          {session.id.slice(0, 12)}…
                          {session.isNewCountry && (
                            <a
                              href={`/auth-events?userId=${encodeURIComponent(session.userId)}&newCountryOnly=true`}
                              title="New country login detected — click to review geo alerts"
                              className="inline-flex items-center"
                            >
                              <Globe className="w-3.5 h-3.5 text-amber-500 hover:text-amber-600" />
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {session.username ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {session.ipAddress ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {session.geoCountry ? (
                          <span className="flex items-center gap-1">
                            {session.isNewCountry && <Globe className="w-3 h-3 text-amber-500 shrink-0" />}
                            {session.geoCountry}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {session.start ? formatRelativeTime(session.start) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {session.lastAccess ? formatRelativeTime(session.lastAccess) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {session.clients ? (
                          <div className="flex flex-wrap gap-1">
                            {Object.values(session.clients).slice(0, 3).map((c, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{c}</Badge>
                            ))}
                            {Object.keys(session.clients).length > 3 && (
                              <Badge variant="outline" className="text-xs">+{Object.keys(session.clients).length - 3}</Badge>
                            )}
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                              onClick={() => setSessionToLogout(session.id)}
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              Force Logout
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Force logout session?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will immediately terminate the session for <strong>{session.username}</strong> (IP: {session.ipAddress}).
                                They will be required to log in again. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => forceLogout.mutate({ sessionId: session.id })}
                              >
                                Force Logout
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      {/* Audit Log Full Modal */}
      <Dialog open={showAuditModal} onOpenChange={setShowAuditModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Anomaly Config Audit Log</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {auditLogFullQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
            ) : (auditLogFullQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No audit entries found.</p>
            ) : (
              (auditLogFullQuery.data ?? []).map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 text-sm border rounded px-3 py-2">
                  <span className="font-mono text-xs text-muted-foreground w-40 shrink-0">{new Date(entry.changedAt).toLocaleString()}</span>
                  <Badge variant={entry.isGlobal ? "default" : "outline"} className="text-xs shrink-0">{entry.isGlobal ? "Global" : `User ${entry.changedByUserId}`}</Badge>
                  <span className="text-xs">
                    {entry.oldWindowMinutes != null ? `${entry.oldWindowMinutes}m / ${entry.oldThreshold} fails` : "(default)"}
                    {" → "}
                    <strong>{entry.newWindowMinutes}m / {entry.newThreshold} fails</strong>
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <Button size="sm" variant="outline" onClick={() => setAuditPage(p => Math.max(0, p - 1))} disabled={auditPage === 0 || auditLogFullQuery.isLoading}>
              <ChevronLeft className="w-4 h-4" /> Prev
            </Button>
            <span className="text-xs text-muted-foreground">Page {auditPage + 1}</span>
            <Button size="sm" variant="outline" onClick={() => setAuditPage(p => p + 1)} disabled={(auditLogFullQuery.data?.length ?? 0) < PAGE_SIZE || auditLogFullQuery.isLoading}>
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
