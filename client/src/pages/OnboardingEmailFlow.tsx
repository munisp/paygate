import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Mail, CheckCircle, XCircle, RefreshCw, Send, Clock, BarChart2 } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
  bounced: "bg-orange-100 text-orange-700",
};

const EMAIL_TYPE_LABELS: Record<string, string> = {
  welcome: "Welcome",
  go_live: "Go-Live Checklist",
  api_key: "API Key",
  reminder: "Reminder",
};

export default function OnboardingEmailFlow() {
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTenant, setFilterTenant] = useState("");
  const [sendForm, setSendForm] = useState({ tenantId: "", email: "", tenantName: "", type: "welcome" });

  const { data: emails, refetch } = trpc.wave30.onboardingEmail.listEmails.useQuery({
    status: filterStatus || undefined,
    tenantId: filterTenant || undefined,
    limit: 100,
  });

  const { data: stats } = trpc.wave30.onboardingEmail.getStats.useQuery();

  const sendWelcome = trpc.wave30.onboardingEmail.sendWelcomeEmail.useMutation({
    onSuccess: () => { toast.success("Welcome email sent"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const sendGoLive = trpc.wave30.onboardingEmail.sendGoLiveChecklist.useMutation({
    onSuccess: () => { toast.success("Go-Live checklist sent"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const retryFailed = trpc.wave30.onboardingEmail.retryFailed.useMutation({
    onSuccess: () => { toast.success("Email retry queued"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  // Aggregate stats
  const statsByType = stats?.reduce((acc: any, s: any) => {
    if (!acc[s.email_type]) acc[s.email_type] = { sent: 0, failed: 0, pending: 0 };
    acc[s.email_type][s.status] = parseInt(s.count);
    return acc;
  }, {}) ?? {};

  const totalSent = stats?.filter((s: any) => s.status === 'sent').reduce((a: number, s: any) => a + parseInt(s.count), 0) ?? 0;
  const totalFailed = stats?.filter((s: any) => s.status === 'failed').reduce((a: number, s: any) => a + parseInt(s.count), 0) ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Onboarding Email Flow</h1>
          <p className="text-gray-500 text-sm mt-1">Transactional emails for partner onboarding lifecycle</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Sent", value: totalSent, icon: <CheckCircle className="w-5 h-5 text-green-500" />, color: "text-green-600" },
          { label: "Failed", value: totalFailed, icon: <XCircle className="w-5 h-5 text-red-500" />, color: "text-red-600" },
          { label: "Welcome Emails", value: statsByType.welcome?.sent ?? 0, icon: <Mail className="w-5 h-5 text-blue-500" />, color: "text-blue-600" },
          { label: "Go-Live Sent", value: statsByType.go_live?.sent ?? 0, icon: <Send className="w-5 h-5 text-purple-500" />, color: "text-purple-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                {s.icon}
                <div>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Send Email Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-gray-700">Send Onboarding Email</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Input placeholder="Tenant ID" value={sendForm.tenantId}
              onChange={(e) => setSendForm({ ...sendForm, tenantId: e.target.value })} />
            <Input placeholder="Recipient Email" value={sendForm.email}
              onChange={(e) => setSendForm({ ...sendForm, email: e.target.value })} />
            <Input placeholder="Tenant Name" value={sendForm.tenantName}
              onChange={(e) => setSendForm({ ...sendForm, tenantName: e.target.value })} />
            <div className="flex gap-2">
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white flex-1" size="sm"
                onClick={() => {
                  if (!sendForm.tenantId || !sendForm.email) return toast.error("Fill in Tenant ID and Email");
                  sendWelcome.mutate({ tenantId: sendForm.tenantId, recipientEmail: sendForm.email, tenantName: sendForm.tenantName || "Partner" });
                }}>
                <Mail className="w-4 h-4 mr-1" /> Welcome
              </Button>
              <Button variant="outline" size="sm"
                onClick={() => {
                  if (!sendForm.tenantId || !sendForm.email) return toast.error("Fill in Tenant ID and Email");
                  sendGoLive.mutate({ tenantId: sendForm.tenantId, recipientEmail: sendForm.email });
                }}>
                <Send className="w-4 h-4 mr-1" /> Go-Live
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filter + Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-gray-700">Email Log</CardTitle>
            <div className="flex gap-2">
              <Input placeholder="Filter by tenant ID" className="w-48 h-8 text-sm" value={filterTenant}
                onChange={(e) => setFilterTenant(e.target.value)} />
              <select className="border rounded px-2 py-1 text-sm text-gray-700"
                value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">All Status</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!emails?.length ? (
            <div className="text-center py-8 text-gray-400">
              <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No emails found. Send your first onboarding email above.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((email: any) => (
                  <TableRow key={email.id}>
                    <TableCell>
                      <Badge className="bg-blue-100 text-blue-700 text-xs">
                        {EMAIL_TYPE_LABELS[email.email_type] ?? email.email_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{email.recipient_email}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{email.subject}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${STATUS_COLORS[email.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {email.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {email.sent_at ? new Date(email.sent_at).toLocaleString() : <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Pending</span>}
                    </TableCell>
                    <TableCell className="text-center">{email.retry_count ?? 0}</TableCell>
                    <TableCell>
                      {email.status === 'failed' && (
                        <Button size="sm" variant="outline" className="text-xs"
                          onClick={() => retryFailed.mutate({ emailId: email.id })}>
                          <RefreshCw className="w-3 h-3 mr-1" /> Retry
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Email Type Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-gray-700">
            <BarChart2 className="w-4 h-4 inline mr-2" />Delivery Stats by Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(EMAIL_TYPE_LABELS).map(([type, label]) => {
              const s = statsByType[type] ?? {};
              const total = (s.sent ?? 0) + (s.failed ?? 0) + (s.pending ?? 0);
              const rate = total > 0 ? Math.round((s.sent ?? 0) * 100 / total) : 0;
              return (
                <div key={type} className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-600 mb-2">{label}</p>
                  <p className="text-xl font-bold text-gray-900">{s.sent ?? 0}</p>
                  <p className="text-xs text-gray-500">sent · {rate}% delivery rate</p>
                  {(s.failed ?? 0) > 0 && (
                    <p className="text-xs text-red-500 mt-1">{s.failed} failed</p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
