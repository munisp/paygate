import { useState } from "react";
import {
  Users, Plus, Mail, Shield, Trash2, Edit2, Check, X,
  Crown, Code, DollarSign, Headphones, Eye, ChevronDown,
  Clock, CheckCircle2, AlertTriangle, Search, MoreVertical, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const ROLES = [
  {
    id: "admin", name: "Admin", icon: Crown, color: "text-amber-600", bg: "bg-amber-50",
    desc: "Full access to all features and settings",
    permissions: { transactions: "full", payouts: "full", customers: "full", analytics: "full", api_keys: "full", team: "full", settings: "full", fraud: "full", bnpl: "full", fx: "full" }
  },
  {
    id: "finance", name: "Finance", icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50",
    desc: "Access to financial data, payouts, and settlements",
    permissions: { transactions: "full", payouts: "full", customers: "view", analytics: "full", api_keys: "none", team: "none", settings: "none", fraud: "view", bnpl: "full", fx: "full" }
  },
  {
    id: "developer", name: "Developer", icon: Code, color: "text-blue-600", bg: "bg-blue-50",
    desc: "Access to API keys, webhooks, and technical settings",
    permissions: { transactions: "view", payouts: "none", customers: "view", analytics: "view", api_keys: "full", team: "none", settings: "view", fraud: "view", bnpl: "none", fx: "view" }
  },
  {
    id: "support", name: "Support", icon: Headphones, color: "text-violet-600", bg: "bg-violet-50",
    desc: "View transactions and manage customer disputes",
    permissions: { transactions: "view", payouts: "none", customers: "full", analytics: "view", api_keys: "none", team: "none", settings: "none", fraud: "view", bnpl: "view", fx: "none" }
  },
  {
    id: "viewer", name: "Viewer", icon: Eye, color: "text-gray-600", bg: "bg-gray-50",
    desc: "Read-only access to all non-sensitive data",
    permissions: { transactions: "view", payouts: "view", customers: "view", analytics: "view", api_keys: "none", team: "none", settings: "none", fraud: "view", bnpl: "view", fx: "view" }
  },
];

const PERMISSION_AREAS = [
  { key: "transactions", label: "Transactions" },
  { key: "payouts", label: "Payouts" },
  { key: "customers", label: "Customers" },
  { key: "analytics", label: "Analytics" },
  { key: "api_keys", label: "API Keys" },
  { key: "fraud", label: "Fraud & Risk" },
  { key: "bnpl", label: "BNPL" },
  { key: "fx", label: "FX & Rates" },
  { key: "team", label: "Team Management" },
  { key: "settings", label: "Settings" },
];

const INITIAL_MEMBERS = [
  { id: "m1", name: "Adaeze Okonkwo", email: "adaeze@acmecorp.com", role: "admin", status: "active", lastActive: "2 min ago", avatar: "AO" },
  { id: "m2", name: "Chidi Nwosu", email: "chidi@acmecorp.com", role: "finance", status: "active", lastActive: "1 hr ago", avatar: "CN" },
  { id: "m3", name: "Emeka Eze", email: "emeka@acmecorp.com", role: "developer", status: "active", lastActive: "3 hr ago", avatar: "EE" },
  { id: "m4", name: "Ngozi Adeyemi", email: "ngozi@acmecorp.com", role: "support", status: "active", lastActive: "Yesterday", avatar: "NA" },
  { id: "m5", name: "Tunde Bakare", email: "tunde@acmecorp.com", role: "viewer", status: "invited", lastActive: "Never", avatar: "TB" },
];

const PERM_BADGE: Record<string, { label: string; cls: string }> = {
  full: { label: "Full", cls: "bg-emerald-100 text-emerald-700" },
  view: { label: "View", cls: "bg-blue-100 text-blue-700" },
  none: { label: "None", cls: "bg-muted text-muted-foreground" },
};

const AVATAR_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500"];

export default function TeamRoles() {
  const [members, setMembers] = useState(INITIAL_MEMBERS);
  const [tab, setTab] = useState<"members" | "roles" | "activity">("members");
  const [search, setSearch] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [selectedRole, setSelectedRole] = useState("admin");

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleInvite = () => {
    if (!inviteEmail.includes("@")) { toast.error("Enter a valid email address"); return; }
    const name = inviteEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    setMembers(prev => [...prev, {
      id: `m_${Date.now()}`, name, email: inviteEmail, role: inviteRole,
      status: "invited", lastActive: "Never", avatar: name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
    }]);
    toast.success(`Invitation sent to ${inviteEmail}`);
    setInviteEmail(""); setShowInvite(false);
  };

  const handleRoleChange = (memberId: string) => {
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: editRole } : m));
    setEditingMember(null);
    toast.success("Role updated successfully");
  };

  const handleRemove = (memberId: string, name: string) => {
    setMembers(prev => prev.filter(m => m.id !== memberId));
    toast.success(`${name} removed from team`);
  };

  const roleData = ROLES.find(r => r.id === selectedRole)!;

  const ACTIVITY_LOG = [
    { user: "Adaeze Okonkwo", action: "Changed Tunde Bakare's role from Developer to Viewer", time: "10 min ago", type: "role" },
    { user: "Adaeze Okonkwo", action: "Invited ngozi@acmecorp.com as Support", time: "2 hr ago", type: "invite" },
    { user: "Chidi Nwosu", action: "Exported transaction report (Jan 2026)", time: "5 hr ago", type: "export" },
    { user: "Emeka Eze", action: "Rotated production API key", time: "1 day ago", type: "security" },
    { user: "Adaeze Okonkwo", action: "Removed former team member james@acmecorp.com", time: "3 days ago", type: "remove" },
    { user: "Ngozi Adeyemi", action: "Resolved dispute DSP-2847 in favour of merchant", time: "4 days ago", type: "dispute" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Team & Roles</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage team members, assign roles, and control access permissions</p>
        </div>
        <Button size="sm" onClick={() => setShowInvite(true)}>
          <Plus className="w-4 h-4 mr-2" />Invite Member
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Members", value: members.length, sub: `${members.filter(m => m.status === "active").length} active`, icon: Users, cls: "text-primary" },
          { label: "Admins", value: members.filter(m => m.role === "admin").length, sub: "Full access", icon: Crown, cls: "text-amber-600" },
          { label: "Pending Invites", value: members.filter(m => m.status === "invited").length, sub: "Awaiting acceptance", icon: Mail, cls: "text-blue-600" },
          { label: "Roles Defined", value: ROLES.length, sub: "Custom roles available", icon: Shield, cls: "text-violet-600" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.cls}`} />
            </div>
            <p className={`text-2xl font-bold ${s.cls}`} style={{ fontFamily: "Space Grotesk, sans-serif" }}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Invite Panel */}
      {showInvite && (
        <div className="bg-card rounded-xl border border-primary/30 p-5 space-y-4">
          <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Invite New Team Member</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Email Address</label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full pl-9 pr-4 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                  onKeyDown={e => e.key === "Enter" && handleInvite()}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <Button size="sm" onClick={handleInvite}><Send className="w-4 h-4 mr-2" />Send Invitation</Button>
            <Button size="sm" variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
        {(["members", "roles", "activity"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "members" ? "Members" : t === "roles" ? "Role Permissions" : "Activity Log"}
          </button>
        ))}
      </div>

      {/* Members Tab */}
      {tab === "members" && (
        <div className="space-y-4">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members..." className="w-full pl-9 pr-4 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Role</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Last Active</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((member, idx) => {
                  const role = ROLES.find(r => r.id === member.role)!;
                  const isEditing = editingMember === member.id;
                  return (
                    <tr key={member.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full ${AVATAR_COLORS[idx % AVATAR_COLORS.length]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                            {member.avatar}
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{member.name}</p>
                            <p className="text-xs text-muted-foreground">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <select defaultValue={member.role} onChange={e => setEditRole(e.target.value)} className="px-2 py-1.5 text-xs bg-muted rounded-lg border border-border focus:outline-none">
                              {ROLES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                            <button onClick={() => handleRoleChange(member.id)} className="p-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingMember(null)} className="p-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ) : (
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${role.bg} ${role.color}`}>
                            <role.icon className="w-3 h-3" />
                            {role.name}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground">{member.lastActive}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${member.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {member.status === "active" ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {member.status === "active" ? "Active" : "Invited"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => { setEditingMember(member.id); setEditRole(member.role); }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {member.role !== "admin" && (
                            <button onClick={() => handleRemove(member.id, member.name)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Roles Tab */}
      {tab === "roles" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Role selector */}
          <div className="space-y-2">
            {ROLES.map(role => (
              <button key={role.id} onClick={() => setSelectedRole(role.id)} className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${selectedRole === role.id ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/30"}`}>
                <div className={`w-9 h-9 rounded-lg ${role.bg} flex items-center justify-center flex-shrink-0`}>
                  <role.icon className={`w-4 h-4 ${role.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{role.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{role.desc}</p>
                </div>
                <span className="text-xs text-muted-foreground">{members.filter(m => m.role === role.id).length}</span>
              </button>
            ))}
          </div>

          {/* Permission matrix */}
          <div className="md:col-span-2 bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-10 h-10 rounded-xl ${roleData.bg} flex items-center justify-center`}>
                <roleData.icon className={`w-5 h-5 ${roleData.color}`} />
              </div>
              <div>
                <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>{roleData.name} Permissions</h3>
                <p className="text-xs text-muted-foreground">{roleData.desc}</p>
              </div>
            </div>

            <div className="space-y-2">
              {PERMISSION_AREAS.map(area => {
                const perm = roleData.permissions[area.key as keyof typeof roleData.permissions];
                const badge = PERM_BADGE[perm];
                return (
                  <div key={area.key} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <span className="text-sm font-medium">{area.label}</span>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 inline-block" />Full — Create, edit, delete</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100 inline-block" />View — Read only</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-muted inline-block" />None — No access</span>
            </div>
          </div>
        </div>
      )}

      {/* Activity Log Tab */}
      {tab === "activity" && (
        <div className="bg-card rounded-xl border border-border divide-y divide-border">
          {ACTIVITY_LOG.map((entry, i) => (
            <div key={i} className="flex items-start gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
              <div className={`w-8 h-8 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5`}>
                {entry.user.split(" ").map(w => w[0]).join("").slice(0, 2)}
              </div>
              <div className="flex-1">
                <p className="text-sm"><span className="font-semibold">{entry.user}</span> <span className="text-muted-foreground">{entry.action}</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">{entry.time}</p>
              </div>
              <Badge className={`text-xs border-0 flex-shrink-0 ${
                entry.type === "security" ? "bg-red-100 text-red-700" :
                entry.type === "invite" ? "bg-blue-100 text-blue-700" :
                entry.type === "role" ? "bg-amber-100 text-amber-700" :
                "bg-muted text-muted-foreground"
              }`}>{entry.type}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
