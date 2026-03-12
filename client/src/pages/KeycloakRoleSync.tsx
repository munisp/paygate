import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Shield, RefreshCw, Users, CheckCircle2, AlertTriangle,
  Key, ArrowRight, Loader2, Info
} from "lucide-react";

const KEYCLOAK_ROLES = [
  { role: "merchant_admin", permifyRelation: "admin", description: "Full merchant portal access" },
  { role: "payout_approver", permifyRelation: "approve_payouts", description: "Can approve/reject payout requests" },
  { role: "fraud_reviewer", permifyRelation: "review_fraud", description: "Can investigate and resolve fraud alerts" },
  { role: "kyc_reviewer", permifyRelation: "review_kyc", description: "Can approve/reject KYC submissions" },
  { role: "developer", permifyRelation: "manage_api_keys", description: "Can manage API keys and webhooks" },
  { role: "viewer", permifyRelation: "view_only", description: "Read-only access to all data" },
];

export default function KeycloakRoleSync() {
  const [userId, setUserId] = useState("");
  const [syncUserId, setSyncUserId] = useState("");

  // Fetch team members
  const { data: teamData, isLoading: teamLoading, refetch: refetchTeam } =
    trpc.team.list.useQuery();

  // Sync roles for a specific user
  const syncRoles = trpc.middleware.keycloak.syncRoles.useMutation({
    onSuccess: (data: unknown) => {
      const d = data as { synced?: number; roles?: string[] };
      toast.success(`Roles synced: ${d?.synced ?? 0} permissions updated in Permify.`);
      refetchTeam();
    },
    onError: (e: { message: string }) => toast.error(`Sync failed: ${e.message}`),
  });

  // Sync all users
  const syncAll = trpc.middleware.keycloak.syncAllRoles.useMutation({
    onSuccess: (data: unknown) => {
      const d = data as { users?: number; total?: number };
      toast.success(`Bulk sync complete: ${d?.users ?? 0} users, ${d?.total ?? 0} role bindings updated.`);
      refetchTeam();
    },
    onError: (e: { message: string }) => toast.error(`Bulk sync failed: ${e.message}`),
  });

  const handleSyncUser = () => {
    if (!syncUserId.trim()) return;
    syncRoles.mutate({ userId: syncUserId.trim() });
  };

  const members = (teamData as Array<{ id: string; name?: string; email?: string; role?: string; openId?: string }> | undefined) ?? [];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-500" />
            Keycloak → Permify Role Sync
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sync Keycloak role assignments to Permify relationship store for real-time permission enforcement.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={syncAll.isPending}
          onClick={() => syncAll.mutate({})}
        >
          {syncAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Sync All Users
        </Button>
      </div>

      {/* Role mapping reference */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="w-4 h-4" />
            Role Mapping Reference
          </CardTitle>
          <CardDescription>
            How Keycloak roles map to Permify relations for authorization checks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Keycloak Role</th>
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">
                    <ArrowRight className="w-3 h-3 inline mr-1" />
                    Permify Relation
                  </th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {KEYCLOAK_ROLES.map(r => (
                  <tr key={r.role} className="hover:bg-muted/30">
                    <td className="py-2 pr-4">
                      <Badge variant="outline" className="font-mono text-xs">{r.role}</Badge>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary" className="font-mono text-xs">{r.permifyRelation}</Badge>
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">{r.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Manual user sync */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            Sync Individual User
          </CardTitle>
          <CardDescription>
            Immediately push a user's current Keycloak roles to Permify
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="User ID or OpenID..."
              value={syncUserId}
              onChange={e => setSyncUserId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSyncUser()}
              className="font-mono text-sm"
            />
            <Button
              onClick={handleSyncUser}
              disabled={!syncUserId.trim() || syncRoles.isPending}
              className="gap-2"
            >
              {syncRoles.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              Sync
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Info className="w-3 h-3" />
            This calls the Go bridge which reads Keycloak token claims and upserts Permify relationship tuples.
          </p>
        </CardContent>
      </Card>

      {/* Team members with sync status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            Team Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          {teamLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No team members found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {members.map(member => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold">
                      {(member.name ?? member.email ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{member.name ?? member.email ?? member.id}</p>
                      <p className="text-xs text-muted-foreground font-mono">{member.openId ?? member.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={member.role === "admin" ? "default" : "secondary"} className="text-xs">
                      {member.role ?? "user"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      disabled={syncRoles.isPending}
                      onClick={() => {
                        setSyncUserId(member.openId ?? member.id);
                        syncRoles.mutate({ userId: member.openId ?? member.id });
                      }}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Sync
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
        <AlertTriangle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 dark:text-blue-300">
          <p className="font-medium mb-1">Automatic sync on login</p>
          <p className="text-xs opacity-80">
            The Go bridge automatically syncs roles when a user authenticates via Keycloak.
            Manual sync is only needed after role changes in the Keycloak admin console
            that haven't triggered a new login session.
          </p>
        </div>
      </div>
    </div>
  );
}
