/**
 * ollama.ts — Local Ollama LLM integration helper
 *
 * Provides streaming and non-streaming chat completion, embeddings,
 * model listing, and health checks against a local Ollama instance.
 *
 * Default model: llama3.2 (3B) — lightweight, fast, runs on CPU.
 * Override via OLLAMA_DEFAULT_MODEL env var.
 *
 * Production deployment: run Ollama as a sidecar container or
 * separate K8s pod; set OLLAMA_BASE_URL to the service URL.
 */

export const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL ?? "http://ollama:11434";

export const OLLAMA_DEFAULT_MODEL =
  process.env.OLLAMA_DEFAULT_MODEL ?? "llama3.2";

export const OLLAMA_TIMEOUT_MS = parseInt(
  process.env.OLLAMA_TIMEOUT_MS ?? "120000",
  10
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaChatRequest {
  model?: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_ctx?: number;
    num_predict?: number;
    stop?: string[];
  };
  system?: string;
  format?: "json" | "";
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaEmbedRequest {
  model?: string;
  input: string | string[];
}

export interface OllamaEmbedResponse {
  model: string;
  embeddings: number[][];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
}

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaListResponse {
  models: OllamaModel[];
}

export interface OllamaHealthStatus {
  available: boolean;
  version?: string;
  models?: string[];
  error?: string;
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export async function checkOllamaHealth(): Promise<OllamaHealthStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${OLLAMA_BASE_URL}/api/version`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return { available: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { version: string };
    // Also list models
    const modelsRes = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const modelsData = modelsRes.ok
      ? ((await modelsRes.json()) as OllamaListResponse)
      : { models: [] };
    return {
      available: true,
      version: data.version,
      models: modelsData.models.map((m) => m.name),
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ─── List Models ──────────────────────────────────────────────────────────────

export async function listOllamaModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Ollama list models failed: HTTP ${res.status}`);
  const data = (await res.json()) as OllamaListResponse;
  return data.models;
}

// ─── Non-streaming Chat ───────────────────────────────────────────────────────

export async function ollamaChat(
  req: OllamaChatRequest
): Promise<OllamaChatResponse> {
  const body: OllamaChatRequest = {
    model: req.model ?? OLLAMA_DEFAULT_MODEL,
    messages: req.messages,
    stream: false,
    options: req.options,
    system: req.system,
    format: req.format,
  };

  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama chat failed: HTTP ${res.status} — ${text}`);
  }

  return (await res.json()) as OllamaChatResponse;
}

// ─── Streaming Chat ───────────────────────────────────────────────────────────

export async function* ollamaChatStream(
  req: OllamaChatRequest
): AsyncGenerator<string> {
  const body: OllamaChatRequest = {
    model: req.model ?? OLLAMA_DEFAULT_MODEL,
    messages: req.messages,
    stream: true,
    options: req.options,
    system: req.system,
    format: req.format,
  };

  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama stream failed: HTTP ${res.status} — ${text}`);
  }

  if (!res.body) throw new Error("Ollama stream: no response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line) as OllamaChatResponse;
        if (chunk.message?.content) {
          yield chunk.message.content;
        }
        if (chunk.done) return;
      } catch {
        // skip malformed JSON lines
      }
    }
  }
}

// ─── Embeddings ───────────────────────────────────────────────────────────────

export async function ollamaEmbed(
  req: OllamaEmbedRequest
): Promise<OllamaEmbedResponse> {
  const body = {
    model: req.model ?? OLLAMA_DEFAULT_MODEL,
    input: req.input,
  };

  const res = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama embed failed: HTTP ${res.status} — ${text}`);
  }

  return (await res.json()) as OllamaEmbedResponse;
}

// ─── Pull Model ───────────────────────────────────────────────────────────────

export async function pullOllamaModel(modelName: string): Promise<void> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: modelName, stream: false }),
    signal: AbortSignal.timeout(300000), // 5 min for model download
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama pull failed: HTTP ${res.status} — ${text}`);
  }
}

// ─── Convenience: PayGate Financial Assistant ─────────────────────────────────

export const PAYGATE_SYSTEM_PROMPT = `You are PayGate AI, a helpful financial assistant for the PayGate merchant payment platform. 
You help merchants understand their transactions, analytics, fraud alerts, settlements, and payment operations.
You have deep knowledge of Nigerian payment infrastructure including NIP (NIBSS Instant Payment), USSD, POS terminals, 
mobile money, virtual accounts, and regulatory compliance (CBN, NDIC, FIRS).
Always be concise, accurate, and professional. Format monetary amounts in Naira (₦) or Kobo as appropriate.
Do not make up transaction data — only analyze data provided to you in the conversation.`;

export async function askPayGateAI(
  userMessage: string,
  context?: string,
  history?: OllamaMessage[]
): Promise<string> {
  const messages: OllamaMessage[] = [
    ...(history ?? []),
    {
      role: "user",
      content: context
        ? `Context:\n${context}\n\nQuestion: ${userMessage}`
        : userMessage,
    },
  ];

  const response = await ollamaChat({
    messages,
    system: PAYGATE_SYSTEM_PROMPT,
    options: { temperature: 0.3, num_predict: 1024 },
  });

  return response.message.content;
}
