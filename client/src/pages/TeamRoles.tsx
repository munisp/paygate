import { useState } from "react";
import { Users, UserPlus, Trash2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const ROLE_COLORS: Record<string, string> = {
  admin:     "bg-purple-50 text-purple-700 border-purple-200",
  developer: "bg-blue-50 text-blue-700 border-blue-200",
  viewer:    "bg-muted text-muted-foreground border-border",
};

const STATUS_COLORS: Record<string, string> = {
  active:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  invited:  "bg-amber-50 text-amber-700 border-amber-200",
  disabled: "bg-muted text-muted-foreground border-border",
};

export default function TeamRoles() {
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "viewer" as "admin" | "developer" | "viewer" });
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.team.list.useQuery(undefined, { staleTime: 60_000 });
  const invite = trpc.team.invite.useMutation({
    onSuccess: () => { toast.success("Invitation sent"); setShowInvite(false); setForm({ email: "", name: "", role: "viewer" }); utils.team.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.team.remove.useMutation({
    onSuccess: () => { toast.success("Member removed"); utils.team.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const members = data ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Team & Roles</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{members.length} team members</p>
        </div>
        <Button size="sm" onClick={() => setShowInvite(true)}><UserPlus className="w-4 h-4 mr-1.5" />Invite Member</Button>
      </div>

      {showInvite && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h3 className="font-semibold">Invite Team Member</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email *</label>
              <input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="colleague@company.com"
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
              <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name"
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Role</label>
              <select value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value as any }))}
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none">
                <option value="viewer">Viewer</option>
                <option value="developer">Developer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => invite.mutate(form)} disabled={!form.email || invite.isPending}>
              {invite.isPending ? "Sending..." : "Send Invitation"}
            </Button>
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {["Member", "Role", "Status", "Joined", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? Array(4).fill(0).map((_, i) => (
              <tr key={i}><td colSpan={5} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
            )) : members.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-3 opacity-40" />
                No team members yet
              </td></tr>
            ) : members.map((m) => (
              <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                      {(m.name ?? m.email)[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{m.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{m.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${ROLE_COLORS[m.role]}`}>{m.role}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${STATUS_COLORS[m.status]}`}>{m.status}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "Pending"}</td>
                <td className="px-4 py-3">
                  <button onClick={() => remove.mutate({ id: m.id })} className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
