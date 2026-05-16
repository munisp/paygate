import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  MessageSquare,
  CheckCircle,
  RefreshCw,
  Send,
  Clock,
  Users,
  BarChart2,
  ChevronRight,
  ArrowLeft,
  Bot,
  User,
  ShieldCheck,
} from "lucide-react";

type Session = {
  sessionId: string;
  merchantId: string | null;
  userId: string | null;
  lastMessage: string;
  lastMessageAt: Date;
  messageCount: number;
  userMessageCount: number;
  status: "open" | "resolved";
  firstMessageAt: Date;
};

function formatRelative(date: Date | string) {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function RoleIcon({ role }: { role: string }) {
  if (role === "user") return <User className="w-4 h-4 text-blue-500" />;
  if (role === "admin") return <ShieldCheck className="w-4 h-4 text-purple-500" />;
  if (role === "system") return <RefreshCw className="w-4 h-4 text-gray-400" />;
  return <Bot className="w-4 h-4 text-green-500" />;
}

function SessionThread({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const [reply, setReply] = useState("");
  const utils = trpc.useUtils();

  const { data: session, isLoading } = trpc.support.getSession.useQuery({ sessionId }, { staleTime: 30_000 });

  const adminReply = trpc.support.adminReply.useMutation({
    onSuccess: () => {
      setReply("");
      utils.support.getSession.invalidate({ sessionId });
      toast.success("Reply sent");
    },
    onError: (err) => toast.error(err.message),
  });

  const resolveSession = trpc.support.resolveSession.useMutation({
    onSuccess: () => {
      utils.support.getSession.invalidate({ sessionId });
      utils.support.listSessions.invalidate();
      toast.success("Session resolved");
    },
    onError: (err) => toast.error(err.message),
  });

  const reopenSession = trpc.support.reopenSession.useMutation({
    onSuccess: () => {
      utils.support.getSession.invalidate({ sessionId });
      utils.support.listSessions.invalidate();
      toast.success("Session reopened");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <p className="font-semibold text-sm">
              Session: <span className="font-mono text-xs text-muted-foreground">{sessionId.slice(0, 16)}…</span>
            </p>
            {session.merchantId && (
              <p className="text-xs text-muted-foreground">Merchant: {session.merchantId}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={session.isResolved ? "secondary" : "default"}>
            {session.isResolved ? "Resolved" : "Open"}
          </Badge>
          {session.isResolved ? (
            <Button
              size="sm"
              variant="outline"
              aria-label="Refresh" onClick={() => reopenSession.mutate({ sessionId })}
              disabled={reopenSession.isPending}
            ><RefreshCw/> Reopen
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="text-green-600 border-green-200 hover:bg-green-50"
              onClick={() => resolveSession.mutate({ sessionId })}
              disabled={resolveSession.isPending}
            >
              <CheckCircle className="w-3 h-3 mr-1" /> Resolve
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {session.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${
              msg.role === "user" ? "justify-start" : msg.role === "system" ? "justify-center" : "justify-end"
            }`}
          >
            {msg.role === "system" ? (
              <div className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                {msg.content}
              </div>
            ) : (
              <div
                className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-muted text-foreground"
                    : msg.role === "admin"
                    ? "bg-purple-100 text-purple-900"
                    : "bg-primary/10 text-foreground"
                }`}
              >
                <div className="flex items-center gap-1 mb-1">
                  <RoleIcon role={msg.role} />
                  <span className="text-xs font-medium capitalize text-muted-foreground">
                    {msg.role === "agent" ? "AI Agent" : msg.role === "admin" ? "Support Agent" : "Merchant"}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatRelative(msg.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Reply box */}
      {!session.isResolved && (
        <div className="p-4 border-t space-y-2">
          <Textarea
            placeholder="Type your reply as a human support agent…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => adminReply.mutate({ sessionId, content: reply })}
              disabled={!reply.trim() || adminReply.isPending}
            >
              <Send className="w-3 h-3 mr-1" />
              {adminReply.isPending ? "Sending…" : "Send Reply"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupportAdmin() {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");
  const [search, setSearch] = useState("");

  const { data: stats } = trpc.support.getStats.useQuery();
  const { data: sessionsData, isLoading, refetch } = trpc.support.listSessions.useQuery({
    limit: 50,
    offset: 0,
    status: statusFilter,
  }, { staleTime: 30_000 });

  const sessions = (sessionsData?.sessions ?? []).filter((s: Session) => {
    if (!search) return true;
    return (
      s.sessionId.toLowerCase().includes(search.toLowerCase()) ||
      (s.merchantId ?? "").toLowerCase().includes(search.toLowerCase()) ||
      s.lastMessage.toLowerCase().includes(search.toLowerCase())
    );
  });

  if (selectedSession) {
    return (
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        <SessionThread sessionId={selectedSession} onBack={() => setSelectedSession(null)} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Support Admin</h1>
        <p className="text-muted-foreground text-sm">Manage merchant support conversations</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Sessions", value: stats?.totalSessions ?? 0, icon: MessageSquare, color: "text-blue-500" },
          { label: "Open", value: stats?.openSessions ?? 0, icon: Clock, color: "text-orange-500" },
          { label: "Resolved", value: stats?.resolvedSessions ?? 0, icon: CheckCircle, color: "text-green-500" },
          { label: "Avg Messages", value: stats?.avgMessagesPerSession ?? 0, icon: BarChart2, color: "text-purple-500" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon className={`w-8 h-8 ${stat.color}`} />
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search sessions, merchants…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex gap-1">
          {(["all", "open", "resolved"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={statusFilter === f ? "default" : "outline"}
              onClick={() => setStatusFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>
        </Button>
      </div>

      {/* Sessions list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Sessions ({sessions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No support sessions found</p>
            </div>
          ) : (
            <div className="divide-y">
              {sessions.map((session: Session) => (
                <button
                  key={session.sessionId}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
                  onClick={() => setSelectedSession(session.sessionId)}
                >
                  <div className="flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full mt-1 ${session.status === "open" ? "bg-orange-400" : "bg-green-400"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs text-muted-foreground">
                        {session.sessionId.slice(0, 12)}…
                      </span>
                      {session.merchantId && (
                        <Badge variant="outline" className="text-xs py-0">
                          <Users className="w-2.5 h-2.5 mr-1" />
                          {session.merchantId.slice(0, 8)}…
                        </Badge>
                      )}
                      <Badge
                        variant={session.status === "open" ? "default" : "secondary"}
                        className="text-xs py-0 ml-auto"
                      >
                        {session.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground truncate">{session.lastMessage}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{session.messageCount} messages</span>
                      <span>·</span>
                      <span>{formatRelative(session.lastMessageAt)}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
