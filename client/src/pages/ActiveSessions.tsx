import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Shield, RefreshCw, LogOut, Monitor, Search, AlertTriangle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

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

  const { data, isLoading, refetch, isFetching } = trpc.middleware.keycloak.listActiveSessions.useQuery(
    { userId: userIdFilter.trim() || undefined, limit: 100 },
    { refetchInterval: 30000 } // auto-refresh every 30s
  );

  const anomalyQuery = trpc.middleware.keycloak.checkLoginAnomalies.useQuery(
    { windowMinutes: 15, threshold: 5 },
    { refetchInterval: 60000 }
  );

  const forceLogout = trpc.middleware.keycloak.forceLogoutSession.useMutation({
    onSuccess: (result) => {
      toast.success(`Session ${result.sessionId.slice(0, 8)}… terminated`);
      refetch();
    },
    onError: (err) => {
      toast.error(`Failed to terminate session: ${err.message}`);
    },
  });

  const sessions = data?.sessions ?? [];

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
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
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
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Monitor className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      {userIdFilter ? "No sessions found for this user." : "No active sessions. Sessions appear here once users log in via Keycloak."}
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map(session => (
                    <TableRow key={session.id}>
                      <TableCell className="text-xs font-mono">
                        {session.id.slice(0, 12)}…
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {session.username ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {session.ipAddress ?? <span className="text-muted-foreground">—</span>}
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
    </div>
  );
}
