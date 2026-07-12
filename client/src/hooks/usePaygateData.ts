/**
 * Live data hooks for PayGate monitoring dashboard.
 * Each hook calls the backend proxy (trpc.paygate.*) which forwards to the
 * configured PAYGATE_API_URL and falls back to rich mock data when the
 * backend is unreachable.
 */
import { trpc } from "@/lib/trpc";

export function useGatewayHealth() {
  return trpc.paygate.gatewayHealth.useQuery(undefined, { refetchInterval: false });
}

export function useGatewayRoutes() {
  return trpc.paygate.gatewayRoutes.useQuery(undefined, { refetchInterval: false });
}

export function useGatewayConsumers() {
  return trpc.paygate.gatewayConsumers.useQuery(undefined, { refetchInterval: false });
}

export function useGatewayMetrics() {
  return trpc.paygate.gatewayMetrics.useQuery(undefined, { refetchInterval: false });
}

export function useWorkflows(status?: string) {
  return trpc.paygate.workflows.useQuery(
    status ? { status } : undefined,
    { refetchInterval: false }
  );
}

export function usePool() {
  return trpc.paygate.pool.useQuery(undefined, { refetchInterval: false });
}

export function useKafka() {
  return trpc.paygate.kafka.useQuery(undefined, { refetchInterval: false });
}

export function useRedis() {
  return trpc.paygate.redis.useQuery(undefined, { refetchInterval: false });
}

export function usePaygatePing() {
  return trpc.paygate.ping.useQuery(undefined, { refetchInterval: 30_000 });
}
