import { useState, useRef, useEffect } from "react";
import Layout from "@/components/Layout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Send, User, RefreshCw, Trash2, Cpu, Zap } from "lucide-react";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  model?: string;
  duration?: number;
}

export default function OllamaChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("llama3.2");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const modelsQuery = trpc.ollama.listModels.useQuery(undefined, { retry: false }, { staleTime: 30_000 });
  const chatMutation = trpc.ollama.chat.useMutation({
    onError: (e: any) => {
      toast.error(`Ollama error: ${e.message}`);
      setIsStreaming(false);
    },
  });
  const pullMutation = trpc.ollama.pullModel.useMutation({
    onSuccess: (data) => { toast.success(`Pulled ${data.model} successfully`); modelsQuery.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const models = (modelsQuery.data as any)?.models ?? [];
  const ollamaStatus = (modelsQuery.data as any)?.status ?? "unknown";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);

    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", timestamp: new Date(), model: selectedModel }]);

    const start = Date.now();
    try {
      const result = await chatMutation.mutateAsync({
        model: selectedModel,
        messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
      });
      const duration = Date.now() - start;
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: (result as any).response ?? (result as any).content ?? "No response", duration }
          : m
      ));
    } catch {
      // error handled by onError
    } finally {
      setIsStreaming(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    toast.success("Chat cleared");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const defaultModels = ["llama3.2", "llama3.1", "mistral", "gemma2", "phi3", "qwen2.5", "deepseek-r1"];

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Bot className="w-6 h-6 text-purple-400" /> Ollama AI Chat
            </h1>
            <p className="text-slate-400 text-sm mt-1">Local LLM inference — private, on-premise AI assistant</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={ollamaStatus === "running" ? "bg-green-500/20 text-green-400 border-green-500/30 border" : "bg-red-500/20 text-red-400 border-red-500/30 border"}>
              <Zap className="w-3 h-3 mr-1" />
              {ollamaStatus === "running" ? "Ollama Online" : "Ollama Offline"}
            </Badge>
            <Button size="sm" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" aria-label="Delete" onClick={clearChat}><Trash2/> Clear
            </Button>
          </div>
        </div>

        {/* Model Selection */}
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Cpu className="w-4 h-4 text-purple-400" />
              <span className="text-slate-400 text-sm">Model:</span>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {modelsQuery.isLoading ? (
                    defaultModels.map(m => (
                      <SelectItem key={m} value={m} className="text-white hover:bg-slate-700">{m}</SelectItem>
                    ))
                  ) : models.length > 0 ? (
                    models.map((m: any) => (
                      <SelectItem key={m.name} value={m.name} className="text-white hover:bg-slate-700">
                        {m.name} {m.size ? `(${(m.size / 1e9).toFixed(1)}GB)` : ""}
                      </SelectItem>
                    ))
                  ) : (
                    defaultModels.map(m => (
                      <SelectItem key={m} value={m} className="text-white hover:bg-slate-700">{m}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              {["llama3.2", "mistral", "gemma2"].map(m => (
                <Button
                  key={m}
                  size="sm"
                  variant="outline"
                  className="border-slate-700 text-slate-400 hover:bg-slate-800 text-xs"
                  disabled={pullMutation.isPending}
                  onClick={() => pullMutation.mutate({ modelName: m })}
                >
                  <RefreshCw className="w-3 h-3 mr-1" /> Pull {m}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Chat Window */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">Conversation</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[480px] p-4" ref={scrollRef as any}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <Bot className="w-12 h-12 text-purple-400/40 mb-4" />
                  <p className="text-slate-500 text-sm">Start a conversation with your local AI model.</p>
                  <p className="text-slate-600 text-xs mt-2">All inference runs locally — no data leaves your server.</p>
                  <div className="mt-6 grid grid-cols-2 gap-2 max-w-sm">
                    {[
                      "Summarize today's transaction activity",
                      "Explain our chargeback rate",
                      "Draft a merchant onboarding email",
                      "Analyze fraud patterns",
                    ].map(suggestion => (
                      <Button
                        key={suggestion}
                        size="sm"
                        variant="outline"
                        className="border-slate-700 text-slate-400 hover:bg-slate-800 text-xs text-left h-auto py-2 px-3 whitespace-normal"
                        onClick={() => setInput(suggestion)}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "assistant" && (
                        <div className="w-8 h-8 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0 mt-1">
                          <Bot className="w-4 h-4 text-purple-400" />
                        </div>
                      )}
                      <div className={`max-w-[75%] rounded-xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-slate-800 text-slate-200 border border-slate-700"
                      }`}>
                        {msg.content === "" && msg.role === "assistant" ? (
                          <div className="space-y-2">
                            <Skeleton className="h-3 w-48 bg-slate-700" />
                            <Skeleton className="h-3 w-36 bg-slate-700" />
                          </div>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs opacity-50">{msg.timestamp.toLocaleTimeString("en-NG")}</span>
                          {msg.model && <Badge className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/20 border">{msg.model}</Badge>}
                          {msg.duration && <span className="text-xs opacity-40">{(msg.duration / 1000).toFixed(1)}s</span>}
                        </div>
                      </div>
                      {msg.role === "user" && (
                        <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-1">
                          <User className="w-4 h-4 text-blue-400" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="p-4 border-t border-slate-800 flex gap-3">
              <Input
                value={input}
                onChange={(e: any) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${selectedModel}... (Enter to send)`}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 flex-1"
                disabled={isStreaming}
              />
              <Button
                onClick={sendMessage}
                disabled={isStreaming || !input.trim()}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isStreaming ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Ollama Status Info */}
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <p className="text-slate-400 text-xs">
              <span className="text-slate-300 font-medium">Ollama endpoint:</span>{" "}
              <code className="text-purple-400 font-mono">http://localhost:11434</code> — Run{" "}
              <code className="text-green-400 font-mono">ollama serve</code> on your server to activate local inference.
              Models are stored at <code className="text-purple-400 font-mono">~/.ollama/models</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
