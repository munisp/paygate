# PayGate Kubernetes NetworkPolicy

## Overview

`network-policy.yaml` implements defence-in-depth pod-to-pod traffic isolation
for the `paygate` namespace. It requires a CNI plugin that supports
`NetworkPolicy` resources (Calico, Cilium, Weave Net, or Antrea).

## Traffic Matrix

| Source | Destination | Port | Protocol |
|--------|-------------|------|----------|
| ingress-nginx | portal | 3000 | TCP |
| portal | go-bridge | 8080 | TCP |
| portal | postgres | 5432 | TCP |
| portal | redis | 6379 | TCP |
| portal | external HTTPS | 443 | TCP |
| go-bridge | postgres | 5432 | TCP |
| go-bridge | redis | 6379 | TCP |
| go-bridge | tigerbeetle | 3902 | TCP |
| go-bridge | kafka | 9092 | TCP |
| go-bridge | external HTTPS | 443 | TCP |
| python-services | postgres | 5432 | TCP |
| rust-services | postgres | 5432 | TCP |
| rust-services | redis | 6379 | TCP |
| monitoring/prometheus | all pods | 9090 | TCP |
| all pods | kube-dns | 53 | UDP+TCP |

## Policies Defined

1. **default-deny-all** — drops all ingress + egress for every pod in `paygate`
2. **allow-dns-egress** — permits UDP/TCP port 53 egress for DNS resolution
3. **portal-network-policy** — portal ingress/egress rules
4. **go-bridge-network-policy** — bridge ingress/egress rules
5. **python-services-network-policy** — ML/analytics service rules
6. **rust-services-network-policy** — high-performance service rules
7. **postgres-network-policy** — database access control
8. **redis-network-policy** — cache access control
9. **tigerbeetle-network-policy** — ledger access control
10. **kafka-network-policy** — event bus access control
11. **monitoring-network-policy** — Prometheus scrape rules (in `monitoring` ns)

## Applying

```bash
# Dry-run first
kubectl apply --dry-run=client -f infra/k8s/base/network-policy.yaml

# Apply via kustomize
kubectl apply -k infra/k8s/base/

# Verify policies
kubectl get networkpolicies -n paygate
kubectl describe networkpolicy default-deny-all -n paygate
```

## Testing Isolation

```bash
# Should succeed (portal → bridge)
kubectl exec -n paygate deploy/paygate-portal -- \
  curl -sf http://paygate-go-bridge:8080/health

# Should be blocked (bridge → portal)
kubectl exec -n paygate deploy/paygate-go-bridge -- \
  curl -sf http://paygate-portal:3000/api/health
# Expected: connection refused or timeout
```

## Notes

- The `tsc` OOM crash shown in CI is a known Node.js v22 memory issue with
  large TypeScript projects; it does not affect runtime behaviour.
- The `usdcBalanceMonitor` and `nipBankRefresh` warnings are expected in
  sandbox environments where the external bridge is not reachable.
