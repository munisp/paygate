/**
 * Live data hooks for PayGate monitoring dashboard.
 * Each hook calls the backend proxy (trpc.paygate.*) which forwards to the
 * configured PAYGATE_API_URL and falls back to rich mock data when the
 * backend is unreachable.
 *
 * All hooks read `forceMock` from RefreshContext so the top-bar MOCK/LIVE
 * toggle immediately switches the data source across every page.
 */
import { trpc } from "@/lib/trpc";
import { useRefresh } from "@/contexts/RefreshContext";

export function useGatewayHealth() {
  const { forceMock } = useRefresh();
  return trpc.paygate.gatewayHealth.useQuery({ forceMock }, { refetchInterval: false });
}

export function useGatewayRoutes() {
  const { forceMock } = useRefresh();
  return trpc.paygate.gatewayRoutes.useQuery({ forceMock }, { refetchInterval: false });
}

export function useGatewayConsumers() {
  const { forceMock } = useRefresh();
  return trpc.paygate.gatewayConsumers.useQuery({ forceMock }, { refetchInterval: false });
}

export function useGatewayMetrics() {
  const { forceMock } = useRefresh();
  return trpc.paygate.gatewayMetrics.useQuery({ forceMock }, { refetchInterval: false });
}

export function useWorkflows(status?: string) {
  const { forceMock } = useRefresh();
  return trpc.paygate.workflows.useQuery(
    { status, forceMock },
    { refetchInterval: false }
  );
}

export function usePool() {
  const { forceMock } = useRefresh();
  return trpc.paygate.pool.useQuery({ forceMock }, { refetchInterval: false });
}

export function useKafka() {
  const { forceMock } = useRefresh();
  return trpc.paygate.kafka.useQuery({ forceMock }, { refetchInterval: false });
}

export function useRedis() {
  const { forceMock } = useRefresh();
  return trpc.paygate.redis.useQuery({ forceMock }, { refetchInterval: false });
}

export function usePaygatePing() {
  const { forceMock } = useRefresh();
  return trpc.paygate.ping.useQuery({ forceMock }, { refetchInterval: 30_000 });
}

