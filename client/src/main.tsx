import { trpc, TrpcMainContext } from "@/lib/trpc";
import { trpc2, TrpcContext2 } from "@/lib/trpc2";
import { trpc3, TrpcContext3 } from "@/lib/trpc3";
import { trpc4, TrpcContext4 } from "@/lib/trpc4";
import { trpc5, TrpcContext5 } from "@/lib/trpc5";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import superjson from "superjson";
import App from "./App";
import "./index.css";

// ── Rate-limit toast deduplication ────────────────────────────────────────────
let rateLimitToastActive = false;

function showRateLimitToast(message: string) {
  if (rateLimitToastActive) return;
  rateLimitToastActive = true;
  const match = message.match(/Retry after (\d+)s/);
  const retrySec = match ? parseInt(match[1], 10) : 60;
  toast.warning(`⚡ Rate limit reached — please slow down`, {
    description: `You can retry in ${retrySec}s. ${message}`,
    duration: Math.min(retrySec * 1000, 15_000),
    onDismiss: () => { rateLimitToastActive = false; },
    onAutoClose: () => { rateLimitToastActive = false; },
  });
}

// ── Each tRPC client gets its own QueryClient to prevent context collision ────
// When multiple tRPC providers share the same queryClient, the innermost
// provider's client wins for ALL hooks — causing wrong endpoint routing.
const queryClient = new QueryClient();
const queryClient2 = new QueryClient();
const queryClient3 = new QueryClient();
const queryClient4 = new QueryClient();
const queryClient5 = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (!isUnauthorized) return;
  const currentPath = window.location.pathname;
  if (currentPath !== "/" && currentPath !== "/login") {
    window.location.href = "/";
  }
};

function handleGlobalError(error: unknown) {
  if (!(error instanceof TRPCClientError)) return;
  redirectToLoginIfUnauthorized(error);
  if (error.data?.code === "TOO_MANY_REQUESTS" || error.message?.includes("Rate limit exceeded")) {
    showRateLimitToast(error.message);
  }
}

// Attach error handlers to the primary queryClient only
queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    handleGlobalError(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    handleGlobalError(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [httpBatchLink({ url: "/api/trpc", transformer: superjson, fetch(input, init) { return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" }); } })],
});
const trpc2Client = trpc2.createClient({
  links: [httpBatchLink({ url: "/api/trpc2", transformer: superjson, fetch(input, init) { return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" }); } })],
});
const trpc3Client = trpc3.createClient({
  links: [httpBatchLink({ url: "/api/trpc3", transformer: superjson, fetch(input, init) { return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" }); } })],
});
const trpc4Client = trpc4.createClient({
  links: [httpBatchLink({ url: "/api/trpc4", transformer: superjson, fetch(input, init) { return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" }); } })],
});
const trpc5Client = trpc5.createClient({
  links: [httpBatchLink({ url: "/api/trpc5", transformer: superjson, fetch(input, init) { return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" }); } })],
});

createRoot(document.getElementById("root")!).render(
  // Each provider uses its own QueryClient to prevent context collision.
  // The primary QueryClientProvider (queryClient) is the one used by useQuery/useMutation
  // directly (not via tRPC) and by the main trpc client.
  <QueryClientProvider client={queryClient}>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <trpc2.Provider client={trpc2Client} queryClient={queryClient2}>
        <trpc3.Provider client={trpc3Client} queryClient={queryClient3}>
          <trpc4.Provider client={trpc4Client} queryClient={queryClient4}>
            <trpc5.Provider client={trpc5Client} queryClient={queryClient5}>
              <App />
            </trpc5.Provider>
          </trpc4.Provider>
        </trpc3.Provider>
      </trpc2.Provider>
    </trpc.Provider>
  </QueryClientProvider>
);
