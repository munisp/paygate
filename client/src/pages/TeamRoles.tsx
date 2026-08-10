import { useState } from "react";
import {
  Users, UserPlus, Trash2, Shield, Eye, Code2, Crown,
  ChevronDown, Check, X, Clock, RefreshCw, Mail, Lock, Unlock
} from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const ROLES = {
  admin: {
    label: "Admin", icon: Crown,
    color: "bg-purple-50 text-purple-700 border-purple-200",
    badgeClass: "bg-purple-100 text-purple-800",
    description: "Full access to all features and settings",
    permissions: {
      "View Transactions": true, "Export Data": true, "Manage Payouts": true,
      "Approve Payouts": true, "Manage API Keys": true, "Manage Webhooks": true,
      "View Analytics": true, "Manage Team": true, "Manage Settings": true,
      "View Disputes": true, "Resolve Disputes": true, "Manage Virtual Cards": true,
    },
  },
  developer: {
    label: "Developer", icon: Code2,
    color: "bg-blue-50 text-blue-700 border-blue-200",
    badgeClass: "bg-blue-100 text-blue-800",
    description: "API keys, webhooks, and technical features",
    permissions: {
      "View Transactions": true, "Export Data": true, "Manage Payouts": false,
      "Approve Payouts": false, "Manage API Keys": true, "Manage Webhooks": true,
      "View Analytics": true, "Manage Team": false, "Manage Settings": false,
      "View Disputes": true, "Resolve Disputes": false, "Manage Virtual Cards": true,
    },
  },
  viewer: {
    label: "Viewer", icon: Eye,
    color: "bg-slate-50 text-slate-600 border-slate-200",
    badgeClass: "bg-slate-100 text-slate-700",
    description: "Read-only access to transactions and analytics",
    permissions: {
      "View Transactions": true, "Export Data": false, "Manage Payouts": false,
      "Approve Payouts": false, "Manage API Keys": false, "Manage Webhooks": false,
      "View Analytics": true, "Manage Team": false, "Manage Settings": false,
      "View Disputes": true, "Resolve Disputes": false, "Manage Virtual Cards": false,
    },
  },
} as const;

type RoleKey = keyof typeof ROLES;

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  invited: "bg-amber-50 text-amber-700 border-amber-200",
  disabled: "bg-red-50 text-red-600 border-red-200",
};

function RoleBadge({ role }: { role: string }) {
  const def = ROLES[role as RoleKey] ?? ROLES.viewer;
  const Icon = def.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${def.color}`}>
      <Icon className="w-3 h-3" />{def.label}
    </span>
  );
}

function PermissionsMatrix({ onClose }: { onClose: () => void }) {
  const allPerms = Object.keys(ROLES.admin.permissions);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-auto">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">Permissions Matrix</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
                <X className="w-4 h-4" />
              </Button>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-semibold text-muted-foreground w-1/2">Permission</th>
                {Object.entries(ROLES).map(([key, def]) => {
                  const Icon = def.icon;
                  return (
                    <th key={key} className="text-center py-2 px-4 font-semibold">
                      <div className="flex flex-col items-center gap-1"><Icon className="w-4 h-4" /><span>{def.label}</span></div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {allPerms.map((perm) => (
                <tr key={perm} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2.5 pr-4 text-foreground">{perm}</td>
                  {Object.entries(ROLES).map(([key, def]) => (
                    <td key={key} className="text-center py-2.5 px-4">
                      {def.permissions[perm as keyof typeof def.permissions]
                        ? <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                        : <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RoleDropdown({ memberId, currentRole, onRoleChange }: {
  memberId: number; currentRole: string; onRoleChange: (id: number, role: RoleKey) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted transition-colors text-sm">
        <RoleBadge role={currentRole} />
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-xl shadow-xl w-56 overflow-hidden">
            {Object.entries(ROLES).map(([key, def]) => {
              const Icon = def.icon;
              return (
                <button key={key} onClick={() => { onRoleChange(memberId, key as RoleKey); setOpen(false); }}
                  className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/60 transition-colors text-left ${currentRole === key ? "bg-muted/40" : ""}`}>
                  <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      {def.label}{currentRole === key && <Check className="w-3 h-3 text-primary" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{def.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function TeamRoles() {
  const [showInvite, setShowInvite] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "viewer" as RoleKey });
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.team.list.useQuery(undefined, { staleTime: 60_000 });

  const invite = trpc.team.invite.useMutation({
    onSuccess: () => {
      toast.success("Invitation sent successfully");
      setShowInvite(false); setForm({ email: "", name: "", role: "viewer" });
      utils.team.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = trpc.team.remove.useMutation({
    onSuccess: () => { toast.success("Member removed"); utils.team.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateRole = trpc.team.updateRole.useMutation({
    onSuccess: (updated: any) => {
      toast.success(`Role updated to ${updated?.role ?? "new role"}`);
      utils.team.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const members = data ?? [];
  const MEMBERS_PAGE_SIZE = 10;
  const [membersPage, setMembersPage] = useState(1);
  const totalMembersPages = Math.max(1, Math.ceil(members.length / MEMBERS_PAGE_SIZE));
  const pagedMembers = members.slice((membersPage - 1) * MEMBERS_PAGE_SIZE, membersPage * MEMBERS_PAGE_SIZE);
  const activeCount = members.filter((m: any) => m.status === "active").length;
  const invitedCount = members.filter((m: any) => m.status === "invited").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Team & Roles</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{activeCount} active · {invitedCount} pending invitation</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowMatrix(true)}>
            <Shield className="w-4 h-4 mr-1.5" />Permissions
          </Button>
          <Button size="sm" onClick={() => setShowInvite(true)}>
            <UserPlus className="w-4 h-4 mr-1.5" />Invite Member
          </Button>
        </div>
      </div>

      {/* Role Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(ROLES).map(([key, def]) => {
          const Icon = def.icon;
          const count = members.filter((m: any) => m.role === key).length;
          return (
            <div key={key} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${def.badgeClass}`}><Icon className="w-4 h-4" /></div>
                <span className="font-semibold text-sm">{def.label}</span>
              </div>
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{def.description}</div>
            </div>
          );
        })}
      </div>

      {/* Invite Form */}
      {showInvite && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2"><Mail className="w-4 h-4 text-primary" />Invite Team Member</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowInvite(false)}><X className="w-4 h-4" /></Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email *</label>
              <input type="email" value={form.email} onChange={(e: any) => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="colleague@company.com"
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
              <input value={form.name} onChange={(e: any) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Role</label>
              <select value={form.role} onChange={(e: any) => setForm(f => ({ ...f, role: e.target.value as RoleKey }))}
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:ring-2 focus:ring-primary outline-none">
                {Object.entries(ROLES).map(([key, def]) => (
                  <option key={key} value={key}>{def.label} — {def.description}</option>
                ))}
              </select>
            </div>
          </div>
          {form.role && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <div className="font-medium mb-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-muted-foreground" />{ROLES[form.role].label} permissions:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(ROLES[form.role].permissions).filter(([, v]) => v).map(([perm]) => (
                  <span key={perm} className="px-2 py-0.5 bg-card rounded text-xs border border-border">{perm}</span>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={() => invite.mutate(form)} disabled={!form.email || invite.isPending}>
              {invite.isPending ? <><RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />Sending...</> : <><Mail className="w-4 h-4 mr-1.5" />Send Invitation</>}
            </Button>
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Team Members Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold text-sm">Team Members</span>
          <Badge variant="secondary">{members.length}</Badge>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No team members yet. Invite your first colleague.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {pagedMembers.map((member: any) => (
              <div key={member.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {(member.name ?? member.email ?? "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{member.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[member.status] ?? STATUS_STYLES.disabled}`}>
                    {member.status === "invited" ? <Clock className="w-3 h-3" /> : member.status === "active" ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {member.status}
                  </span>
                  <RoleDropdown memberId={member.id} currentRole={member.role} onRoleChange={(id, role) => updateRole.mutate({ id, role })} />
                  <span className="hidden lg:block text-xs text-muted-foreground whitespace-nowrap">
                    {member.joinedAt ? `Joined ${new Date(member.joinedAt).toLocaleDateString()}` : member.status === "invited" ? `Invited ${new Date(member.createdAt).toLocaleDateString()}` : "—"}
                  </span>
                  <Button variant="ghost" size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                    onClick={() => { if (confirm(`Remove ${member.email} from the team?`)) remove.mutate({ id: member.id }); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )            )}
          </div>
        )}
        {members.length > MEMBERS_PAGE_SIZE && (
          <div className="p-4 border-t">
            <PaginationControls
              page={membersPage}
              totalPages={totalMembersPages}
              onPageChange={setMembersPage}
            />
          </div>
        )}
      </div>
      {showMatrix && <PermissionsMatrix onClose={() => setShowMatrix(false)} />}
    </div>
  );
}
