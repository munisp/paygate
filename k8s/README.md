# PayGate Kubernetes Manifests

This directory (plus `infra/k8s/`) contains the Kubernetes manifests for all
PayGate services. `infra/k8s/base/` is a Kustomize base
(`kubectl apply -k infra/k8s/base`).

## Image tag convention (release-managed)

All first-party images (`paygate/*`, `your-registry/paygate-*`) are pinned to an
explicit version tag. `:latest` is **not used anywhere** in these manifests.

- Current pinned release tag: **`:1.0.0`** — every first-party image reference.
- `imagePullPolicy: IfNotPresent` is the required policy for first-party
  images (explicitly set, or defaulted by Kubernetes for non-`:latest` tags).
  `Always` must not be used with a pinned tag.
- Releases are managed by bumping the tag uniformly (e.g. `1.0.0` → `1.1.0`)
  in the same commit that cuts the release:

  ```sh
  grep -rl 'paygate/' k8s infra/k8s --include='*.yaml' --include='*.template' \
    | xargs sed -i 's/\(paygate[^ :]*\):1\.0\.0/\1:1.1.0/g'
  ```

- Two deployments are env-templated for CI overrides and default to the same
  release tag:
  - `paygate/wallet-ffi:${WALLET_FFI_VERSION:-1.0.0}`
  - `paygate/tigerbeetle-recon:${TB_RECON_VERSION:-1.0.0}`

  Set the env var at deploy time to override without editing manifests.

- Third-party images (postgres, redis, keycloak, trino, minio, spark, ollama,
  temporalio, bitnami) keep their upstream pinned versions; do not retag them.

## Applying

```sh
# Kustomize base (core platform)
kubectl apply -k infra/k8s/base

# Extended service sets (plain manifests)
kubectl apply -f k8s/
```
