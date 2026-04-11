import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  Crown,
  RefreshCw,
  Search,
  Shield,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function AdminSetup() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState<"admin" | "user">("admin");

  const { data: adminCountData, isLoading: countLoading } = trpc.adminMgmt.getAdminCount.useQuery();
  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = trpc.adminMgmt.listUsers.useQuery(undefined, {
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
      setBulkSelected(new Set());
    },
    onError: (err) => {
      toast.error("Role update failed", { description: err.message });
    },
  });

  const adminCount = adminCountData?.count ?? 0;
  const noAdmins = adminCount === 0;
  const isAdmin = user?.role === "admin";

  // Filtered users based on search
  const filteredUsers = useMemo(() => {
    if (!usersData) return [];
    const q = search.toLowerCase().trim();
    if (!q) return usersData;
    return usersData.filter(
      (u: any) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q)
    );
  }, [usersData, search]);

  const toggleBulkSelect = (id: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const eligible = filteredUsers.filter((u: any) => String(u.id) !== String(user?.id));
    setBulkSelected(new Set(eligible.map((u: any) => String(u.id))));
  };

  const clearSelection = () => setBulkSelected(new Set());

  const applyBulkRole = async () => {
    const ids = Array.from(bulkSelected);
    if (!ids.length) return;
    let successCount = 0;
    for (const userId of ids) {
      try {
        await setRoleMutation.mutateAsync({ userId, role: bulkRole });
        successCount++;
      } catch { /* individual errors already toasted */ }
    }
    toast.success(`Updated ${successCount} of ${ids.length} users to ${bulkRole}`);
    setBulkSelected(new Set());
    refetchUsers();
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Setup</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage administrator access and user roles for the PayGate merchant portal.
        </p>
      </div>

      {/* Status banners */}
      {noAdmins && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle>No admin users exist</AlertTitle>
          <AlertDescription>
            The platform has no admin users yet. Promote yourself to admin to unlock admin-only features,
            including role management, audit logs, and system configuration.
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

      {isAdmin && !noAdmins && (
        <Alert className="border-green-300 bg-green-50 text-green-900">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle>Admin access active</AlertTitle>
          <AlertDescription>
            You have admin access. {adminCount} admin user(s) configured.
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
              This action is only available when no admins exist. Once you promote yourself,
              this option disappears and role changes must be made through the user table below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4 text-sm space-y-2">
              <p className="font-medium">What admin access enables:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-muted-foreground text-xs mt-2">
                {[
                  "View and manage all merchant accounts",
                  "Access audit logs and compliance reports",
                  "Manage user roles and permissions",
                  "Configure system-wide settings",
                  "Access the admin panel portal",
                  "View microservice health and go-live status",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
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
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <CardTitle>User Roles</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {adminCount} admin(s)
                </Badge>
                <Button variant="outline" size="sm" onClick={() => refetchUsers()} disabled={usersLoading}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${usersLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>
            <CardDescription>
              Manage roles for all registered users. Changes take effect immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search + bulk actions */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or role…"
                  className="pl-8 h-8 text-sm"
                  value={search}
                  onChange={(e: any) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setSearch("")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {bulkSelected.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{bulkSelected.size} selected</span>
                  <select
                    className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                    value={bulkRole}
                    onChange={(e: any) => setBulkRole(e.target.value as "admin" | "user")}
                  >
                    <option value="admin">Make Admin</option>
                    <option value="user">Make User</option>
                  </select>
                  <Button size="sm" className="h-8 text-xs" onClick={applyBulkRole} disabled={setRoleMutation.isPending}>
                    Apply
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
              )}
              {bulkSelected.size === 0 && filteredUsers.length > 0 && (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={selectAll}>
                  Select All
                </Button>
              )}
            </div>

            {usersLoading ? (
              <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                Loading users…
              </div>
            ) : !filteredUsers || filteredUsers.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                {search ? "No users match your search." : "No users found."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={bulkSelected.size === filteredUsers.filter((u: any) => String(u.id) !== String(user?.id)).length && filteredUsers.length > 0}
                        onChange={(e: any) => e.target.checked ? selectAll() : clearSelection()}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u: any) => {
                    const isSelf = String(u.id) === String(user?.id);
                    const isSelected = bulkSelected.has(String(u.id));
                    return (
                      <TableRow key={u.id} className={isSelected ? "bg-primary/5" : ""}>
                        <TableCell>
                          {!isSelf && (
                            <input
                              type="checkbox"
                              className="rounded"
                              checked={isSelected}
                              onChange={() => toggleBulkSelect(String(u.id))}
                            />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {u.name || "—"}
                          {isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                        </TableCell>
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
                          {!isSelf ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setRoleMutation.mutate({
                                  userId: String(u.id),
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
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {filteredUsers.length > 0 && (
              <p className="text-xs text-muted-foreground text-right">
                Showing {filteredUsers.length} of {usersData?.length ?? 0} users
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
