import { trpc } from "@/lib/trpc";
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
  // Extract retry-after seconds from message like "Retry after 42s."
  const match = message.match(/Retry after (\d+)s/);
  const retrySec = match ? parseInt(match[1], 10) : 60;
  toast.warning(`⚡ Rate limit reached — please slow down`, {
    description: `You can retry in ${retrySec}s. ${message}`,
    duration: Math.min(retrySec * 1000, 15_000),
    onDismiss: () => { rateLimitToastActive = false; },
    onAutoClose: () => { rateLimitToastActive = false; },
  });
}

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  // Only redirect if not already on the login page to prevent redirect loops
  const currentPath = window.location.pathname;
  if (currentPath !== "/" && currentPath !== "/login") {
    window.location.href = "/";
  }
};

function handleGlobalError(error: unknown) {
  if (!(error instanceof TRPCClientError)) return;
  redirectToLoginIfUnauthorized(error);
  // Show rate-limit toast for TOO_MANY_REQUESTS errors
  if (error.data?.code === "TOO_MANY_REQUESTS" || error.message?.includes("Rate limit exceeded")) {
    showRateLimitToast(error.message);
  }
}

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
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
