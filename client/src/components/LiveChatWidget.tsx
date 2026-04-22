import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageCircle, X, Send, Minimize2, Maximize2,
  Bot, User, Loader2, ChevronRight, HelpCircle,
  CheckCheck
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

const QUICK_REPLIES = [
  { label: "Transaction failed", text: "My transaction failed and I need help resolving it." },
  { label: "Payout not received", text: "I have not received my payout. Can you help?" },
  { label: "API integration help", text: "I need help integrating the PayGate API." },
  { label: "Account verification", text: "I need help with my account verification (KYC/KYB)." },
  { label: "Dispute a charge", text: "I want to dispute a charge on my account." },
  { label: "Webhook not firing", text: "My webhook endpoint is not receiving events." },
];

interface Message {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  createdAt: Date;
  pending?: boolean;
}

export default function LiveChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "agent",
      content: "Hi there! I'm your PayGate support agent. How can I help you today?\n\nFeel free to ask about transactions, payouts, API integration, or any other questions.",
      createdAt: new Date(),
    },
  ]);
  const [unreadCount, setUnreadCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sendMessage = trpc.support.sendMessage.useMutation({
    onSuccess: (response: any) => {
      setMessages(prev => {
        const withoutPending = prev.filter(m => !m.pending);
        const agentMsg: Message = {
          id: `agent_${Date.now()}`,
          role: "agent",
          content: response.agentReply,
          createdAt: new Date(),
        };
        return [...withoutPending, agentMsg];
      });
      if (!open) setUnreadCount(c => c + 1);
    },
    onError: (e: any) => {
      setMessages(prev => prev.filter(m => !m.pending));
      toast.error("Failed to send message: " + e.message);
    },
  });

  const { data: history } = trpc.support.getHistory.useQuery(
    { sessionId },
    { enabled: open, staleTime: 30_000 }
  );

  useEffect(() => {
    if (history && history.length > 0) {
      const histMsgs: Message[] = history.map((m: any) => ({
        id: m.id,
        role: m.role as "user" | "agent" | "system",
        content: m.content,
        createdAt: new Date(m.createdAt),
      }));
      setMessages(prev => {
        const welcomeMsg = prev.find(m => m.id === "welcome");
        const existingIds = new Set(prev.map(m => m.id));
        const newMsgs = histMsgs.filter(m => !existingIds.has(m.id));
        return welcomeMsg ? [welcomeMsg, ...newMsgs] : [...prev, ...newMsgs];
      });
    }
  }, [history]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) {
      setUnreadCount(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSend = useCallback((text?: string) => {
    const content = (text ?? input).trim();
    if (!content) return;

    const userMsg: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date(),
      pending: true,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");

    sendMessage.mutate({
      sessionId,
      content,
      merchantId: (user as any)?.merchantId ?? undefined,
      userId: user?.id?.toString() ?? undefined,
    });
  }, [input, sessionId, user, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
          aria-label="Open support chat"
        >
          <MessageCircle className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div
          className={`fixed bottom-6 right-6 z-50 bg-card border border-border rounded-2xl shadow-2xl flex flex-col transition-all duration-200 ${
            minimized ? "w-72 h-14" : "w-80 sm:w-96 h-[520px]"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary text-primary-foreground rounded-t-2xl shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">PayGate Support</div>
                <div className="text-xs opacity-80 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block" />
                  Online · Typically replies instantly
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMinimized(!minimized)}
                className="p-1.5 rounded-lg hover:bg-primary-foreground/20 transition-colors"
              >
                {minimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-primary-foreground/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      msg.role === "agent" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {msg.role === "agent" ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                    </div>
                    <div className={`max-w-[75%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                      <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted text-foreground rounded-tl-sm"
                      } ${msg.pending ? "opacity-60" : ""}`}>
                        {msg.content}
                        {msg.pending && <Loader2 className="w-3 h-3 animate-spin inline ml-1" />}
                      </div>
                      <span className="text-xs text-muted-foreground px-1">
                        {msg.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {msg.role === "user" && !msg.pending && <CheckCheck className="w-3 h-3 inline ml-1 text-primary" />}
                      </span>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Quick Replies */}
              {messages.length <= 2 && (
                <div className="px-4 pb-2 shrink-0">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <HelpCircle className="w-3 h-3" />Common questions:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_REPLIES.map((qr) => (
                      <button
                        key={qr.label}
                        onClick={() => handleSend(qr.text)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-muted hover:bg-muted/80 rounded-full text-xs text-foreground transition-colors border border-border"
                      >
                        {qr.label}
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="px-4 pb-4 pt-2 border-t border-border shrink-0">
                <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    disabled={sendMessage.isPending}
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || sendMessage.isPending}
                    className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0"
                  >
                    {sendMessage.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Powered by PayGate AI Support
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
