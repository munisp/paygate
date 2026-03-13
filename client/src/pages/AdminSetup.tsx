import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  Crown,
  RefreshCw,
  Shield,
  UserCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminSetup() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: adminCountData, isLoading: countLoading, refetch: refetchCount } = trpc.adminMgmt.getAdminCount.useQuery();
  const { data: usersData, isLoading: usersLoading } = trpc.adminMgmt.listUsers.useQuery(undefined, {
    retry: false, // will 403 if not admin yet
  });

  const promoteMutation = trpc.adminMgmt.promoteOwnerToAdmin.useMutation({
    onSuccess: () => {
      toast.success("You have been promoted to admin!", { description: "Refresh the page to see your new permissions." });
      utils.adminMgmt.getAdminCount.invalidate();
      utils.adminMgmt.listUsers.invalidate();
    },
    onError: (err) => {
      toast.error("Promotion failed", { description: err.message });
    },
  });

  const setRoleMutation = trpc.adminMgmt.setUserRole.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`User role updated to ${vars.role}`);
      utils.adminMgmt.listUsers.invalidate();
    },
    onError: (err) => {
      toast.error("Role update failed", { description: err.message });
    },
  });

  const adminCount = adminCountData?.count ?? 0;
  const noAdmins = adminCount === 0;
  const isAdmin = user?.role === "admin";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Setup</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage administrator access and user roles for the PayGate merchant portal.
        </p>
      </div>

      {/* Status banner */}
      {noAdmins && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle>No admin users exist</AlertTitle>
          <AlertDescription>
            The platform has no admin users yet. Promote yourself to admin to unlock admin-only features, including role management, audit logs, and system configuration.
          </AlertDescription>
        </Alert>
      )}

      {!noAdmins && !isAdmin && (
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertTitle>Admin already configured</AlertTitle>
          <AlertDescription>
            {adminCount} admin user(s) exist. Contact an existing admin to change your role.
          </AlertDescription>
        </Alert>
      )}

      {/* Self-promotion card */}
      {noAdmins && (
        <Card className="border-2 border-amber-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              <CardTitle>Become the First Admin</CardTitle>
            </div>
            <CardDescription>
              This action is only available when no admins exist. Once you promote yourself, this option disappears and role changes must be made through the user table below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4 text-sm space-y-2">
              <p className="font-medium">What admin access enables:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>View and manage all merchant accounts</li>
                <li>Access audit logs and compliance reports</li>
                <li>Manage user roles and permissions</li>
                <li>Configure system-wide settings</li>
                <li>Access the admin panel portal</li>
              </ul>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <UserCheck className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{user?.name ?? "Current user"}</p>
                <p className="text-xs text-muted-foreground">{user?.email ?? ""}</p>
              </div>
              <Badge variant="outline">Will become admin</Badge>
            </div>
            <Button
              className="w-full"
              onClick={() => promoteMutation.mutate()}
              disabled={promoteMutation.isPending}
            >
              {promoteMutation.isPending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Promoting…</>
              ) : (
                <><Crown className="h-4 w-4 mr-2" />Promote Me to Admin</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* User management table — only visible to admins */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <CardTitle>User Roles</CardTitle>
              </div>
              <Badge className="bg-green-100 text-green-800 border-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {adminCount} admin(s)
              </Badge>
            </div>
            <CardDescription>
              Manage roles for all registered users. Changes take effect immediately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                Loading users…
              </div>
            ) : !usersData || usersData.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                No users found.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersData.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{u.email || "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={u.role === "admin" ? "bg-purple-50 text-purple-800 border-purple-200" : ""}
                        >
                          {u.role === "admin" && <Crown className="h-3 w-3 mr-1" />}
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {String(u.id) !== String(user?.id) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setRoleMutation.mutate({
                                userId: u.id,
                                role: u.role === "admin" ? "user" : "admin",
                              })
                            }
                            disabled={setRoleMutation.isPending}
                          >
                            {u.role === "admin" ? "Demote" : "Make Admin"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">You</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
