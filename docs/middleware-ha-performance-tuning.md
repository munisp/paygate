# Middleware HA & Performance Tuning Guide
## PayGate Production Infrastructure

**Version:** 1.0  
**Date:** 2026-04-16  
**Author:** Manus AI  
**Target:** Production Kubernetes cluster (8+ nodes, 32GB RAM/node, NVMe SSD)

---

## Overview

This document provides production-grade High Availability (HA) and performance tuning configurations for all 12 middleware components in the PayGate platform. Each section covers: current state assessment, HA topology, performance-critical settings, and Go/Rust/Python integration patterns.

---

## 1. Apache Kafka (Message Broker)

### 1.1 HA Topology

Deploy a **3-broker KRaft cluster** (no ZooKeeper) with a dedicated controller quorum. This eliminates the ZooKeeper dependency and reduces failover time from ~30s to ~5s.

```yaml
# infra/k8s/kafka/kafka-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: kafka
  namespace: paygate
spec:
  replicas: 3
  serviceName: kafka-headless
  podManagementPolicy: Parallel
  template:
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - labelSelector:
                matchLabels:
                  app: kafka
              topologyKey: kubernetes.io/hostname  # One broker per node
      containers:
        - name: kafka
          image: apache/kafka:3.8.0
          env:
            - name: KAFKA_PROCESS_ROLES
              value: "broker,controller"
            - name: KAFKA_CONTROLLER_QUORUM_VOTERS
              value: "1@kafka-0:9093,2@kafka-1:9093,3@kafka-2:9093"
            # Performance tuning
            - name: KAFKA_NUM_NETWORK_THREADS
              value: "8"
            - name: KAFKA_NUM_IO_THREADS
              value: "16"
            - name: KAFKA_SOCKET_SEND_BUFFER_BYTES
              value: "1048576"   # 1MB
            - name: KAFKA_SOCKET_RECEIVE_BUFFER_BYTES
              value: "1048576"   # 1MB
            - name: KAFKA_SOCKET_REQUEST_MAX_BYTES
              value: "104857600" # 100MB
            - name: KAFKA_LOG_FLUSH_INTERVAL_MESSAGES
              value: "10000"
            - name: KAFKA_LOG_FLUSH_INTERVAL_MS
              value: "1000"
            - name: KAFKA_LOG_RETENTION_HOURS
              value: "168"       # 7 days default
            - name: KAFKA_LOG_SEGMENT_BYTES
              value: "1073741824" # 1GB segments
            - name: KAFKA_NUM_PARTITIONS
              value: "8"         # Default partitions
            - name: KAFKA_DEFAULT_REPLICATION_FACTOR
              value: "3"
            - name: KAFKA_MIN_INSYNC_REPLICAS
              value: "2"         # Require 2/3 replicas for writes
            - name: KAFKA_UNCLEAN_LEADER_ELECTION_ENABLE
              value: "false"     # Never elect out-of-sync leader
            - name: KAFKA_AUTO_CREATE_TOPICS_ENABLE
              value: "false"     # Explicit topic management only
            - name: KAFKA_COMPRESSION_TYPE
              value: "lz4"       # Fast compression for high throughput
            - name: KAFKA_PRODUCER_MAX_REQUEST_SIZE
              value: "10485760"  # 10MB max message
            # JVM tuning
            - name: KAFKA_HEAP_OPTS
              value: "-Xms4g -Xmx4g -XX:+UseG1GC -XX:MaxGCPauseMillis=20"
          resources:
            requests:
              cpu: 2000m
              memory: 6Gi
            limits:
              cpu: 4000m
              memory: 8Gi
          volumeMounts:
            - name: data
              mountPath: /var/lib/kafka/data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: premium-rwo
        resources:
          requests:
            storage: 500Gi
```

### 1.2 Go Producer (High-Throughput Pattern)

```go
// go-bridge/internal/kafka/ha_producer.go
package kafka

import (
    "context"
    "time"
    "github.com/twmb/franz-go/pkg/kgo"
    "go.uber.org/zap"
)

type HAProducer struct {
    client *kgo.Client
    logger *zap.Logger
}

func NewHAProducer(brokers []string, logger *zap.Logger) (*HAProducer, error) {
    client, err := kgo.NewClient(
        kgo.SeedBrokers(brokers...),
        // Durability: wait for all in-sync replicas
        kgo.RequiredAcks(kgo.AllISRAcks()),
        // Idempotent producer (exactly-once semantics)
        kgo.ProducerBatchMaxBytes(1<<20),       // 1MB batch
        kgo.ProducerLinger(5*time.Millisecond), // 5ms linger for batching
        kgo.RecordRetries(10),
        kgo.RetryBackoffFn(func(tries int) time.Duration {
            return time.Duration(tries*tries) * 100 * time.Millisecond // Exponential back-off
        }),
        kgo.WithLogger(kgo.BasicLogger(nil, kgo.LogLevelWarn, nil)),
        // Compression
        kgo.ProducerBatchCompression(kgo.Lz4Compression()),
        // Metadata refresh
        kgo.MetadataMaxAge(30*time.Second),
        kgo.MetadataMinAge(2*time.Second),
    )
    if err != nil {
        return nil, err
    }
    return &HAProducer{client: client, logger: logger}, nil
}

// ProduceAsync sends a record with fire-and-forget semantics + error callback
func (p *HAProducer) ProduceAsync(ctx context.Context, topic string, key, value []byte) {
    record := &kgo.Record{
        Topic: topic,
        Key:   key,
        Value: value,
        Headers: []kgo.RecordHeader{
            {Key: "source", Value: []byte("go-bridge")},
            {Key: "timestamp", Value: []byte(time.Now().UTC().Format(time.RFC3339Nano))},
        },
    }
    p.client.Produce(ctx, record, func(r *kgo.Record, err error) {
        if err != nil {
            p.logger.Error("kafka produce failed",
                zap.String("topic", topic),
                zap.Error(err),
            )
            // TODO: dead-letter queue or retry via outbox
        }
    })
}
```

### 1.3 Rust Consumer (Zero-Copy Pattern)

```rust
// rust-services/src/kafka/ha_consumer.rs
use rdkafka::config::ClientConfig;
use rdkafka::consumer::{CommitMode, Consumer, StreamConsumer};
use rdkafka::message::Message;
use tokio_stream::StreamExt;

pub fn build_ha_consumer(brokers: &str, group_id: &str, topics: &[&str]) -> StreamConsumer {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("group.id", group_id)
        .set("enable.auto.commit", "false")        // Manual commit for at-least-once
        .set("auto.offset.reset", "earliest")
        .set("max.poll.interval.ms", "300000")     // 5 min max processing time
        .set("session.timeout.ms", "30000")
        .set("heartbeat.interval.ms", "3000")
        .set("fetch.min.bytes", "1048576")         // 1MB min fetch (batching)
        .set("fetch.max.wait.ms", "500")           // 500ms max wait for batch
        .set("max.partition.fetch.bytes", "10485760") // 10MB per partition
        .set("queued.max.messages.kbytes", "65536")   // 64MB consumer queue
        .set("socket.receive.buffer.bytes", "1048576")
        .set("statistics.interval.ms", "5000")     // Prometheus metrics
        .create()
        .expect("Consumer creation failed");

    consumer.subscribe(topics).expect("Topic subscription failed");
    consumer
}

pub async fn consume_loop(consumer: StreamConsumer, handler: impl Fn(&[u8], &[u8]) -> bool) {
    let mut stream = consumer.stream();
    while let Some(result) = stream.next().await {
        match result {
            Ok(msg) => {
                let key = msg.key().unwrap_or_default();
                let payload = msg.payload().unwrap_or_default();
                if handler(key, payload) {
                    // Commit only on successful processing
                    consumer.commit_message(&msg, CommitMode::Async).ok();
                }
            }
            Err(e) => eprintln!("Kafka error: {e}"),
        }
    }
}
```

---

## 2. Redis (Cache & Session Store)

### 2.1 HA Topology: Redis Sentinel + Read Replicas

```yaml
# infra/k8s/redis/redis-ha.yaml
# 1 primary + 2 replicas + 3 Sentinel instances
# Sentinel quorum = 2 (majority of 3)
# Failover time: ~10 seconds

sentinel:
  quorum: 2
  downAfterMilliseconds: 5000
  failoverTimeout: 60000
  parallelSyncs: 1

primary:
  resources:
    requests: { cpu: 500m, memory: 2Gi }
    limits: { cpu: 2000m, memory: 4Gi }
  persistence:
    enabled: true
    size: 20Gi
    storageClass: premium-rwo

replica:
  replicaCount: 2
  resources:
    requests: { cpu: 250m, memory: 1Gi }
    limits: { cpu: 1000m, memory: 2Gi }
```

### 2.2 Enhanced redis.conf (Production)

The existing `infra/redis/redis.conf` is extended with the following critical settings:

```conf
# ─── Cluster / Sentinel ───────────────────────────────────────────────────────
# (Managed by Helm chart — do not set cluster-enabled here)

# ─── Performance ──────────────────────────────────────────────────────────────
hz 20                              # Background task frequency (default: 10)
dynamic-hz yes                     # Adaptive hz under load
aof-rewrite-incremental-fsync yes  # Reduce I/O spikes during AOF rewrite
rdb-save-incremental-fsync yes     # Reduce I/O spikes during RDB save
lazyfree-lazy-eviction yes         # Non-blocking key eviction
lazyfree-lazy-expire yes           # Non-blocking TTL expiry
lazyfree-lazy-server-del yes       # Non-blocking DEL
replica-lazy-flush yes             # Non-blocking replica flush

# ─── Memory ───────────────────────────────────────────────────────────────────
maxmemory 3gb                      # Leave 1GB headroom on 4GB node
maxmemory-policy allkeys-lru
maxmemory-samples 10
active-expire-enabled yes          # Proactively expire keys
active-expire-effort 1             # Low CPU for expiry (1-10)

# ─── Connections ──────────────────────────────────────────────────────────────
maxclients 10000
tcp-backlog 1024
unixsocket /tmp/redis.sock         # Unix socket for local clients (faster)
unixsocketperm 770

# ─── Slow log ─────────────────────────────────────────────────────────────────
slowlog-log-slower-than 5000       # Log commands > 5ms
slowlog-max-len 256

# ─── Latency monitoring ───────────────────────────────────────────────────────
latency-monitor-threshold 100      # Alert on commands > 100ms
latency-tracking yes
latency-tracking-info-percentiles 50 99 99.9
```

### 2.3 Go Redis Client (HA-Aware)

```go
// server/_core/redis_ha.go (Node.js server uses ioredis — this is for Go bridge)
package core

import (
    "context"
    "time"
    "github.com/redis/go-redis/v9"
)

func NewHARedisClient(sentinelAddrs []string, masterName, password string) *redis.Client {
    return redis.NewFailoverClient(&redis.FailoverOptions{
        MasterName:       masterName,
        SentinelAddrs:    sentinelAddrs,
        Password:         password,
        DB:               0,
        PoolSize:         50,              // Connections per node
        MinIdleConns:     10,
        MaxRetries:       3,
        MinRetryBackoff:  8 * time.Millisecond,
        MaxRetryBackoff:  512 * time.Millisecond,
        DialTimeout:      5 * time.Second,
        ReadTimeout:      3 * time.Second,
        WriteTimeout:     3 * time.Second,
        PoolTimeout:      4 * time.Second,
        ConnMaxIdleTime:  5 * time.Minute,
        ConnMaxLifetime:  30 * time.Minute,
    })
}
```

---

## 3. Temporal (Workflow Orchestration)

### 3.1 HA Topology

```yaml
# infra/k8s/temporal/temporal-ha.yaml
# 3 frontend + 3 history + 3 matching + 1 worker service
# PostgreSQL backend with connection pooling via PgBouncer

temporal:
  server:
    frontend:
      replicaCount: 3
      resources:
        requests: { cpu: 500m, memory: 512Mi }
        limits: { cpu: 2000m, memory: 2Gi }
    history:
      replicaCount: 3
      resources:
        requests: { cpu: 1000m, memory: 1Gi }
        limits: { cpu: 4000m, memory: 4Gi }
    matching:
      replicaCount: 3
      resources:
        requests: { cpu: 500m, memory: 512Mi }
        limits: { cpu: 2000m, memory: 2Gi }
    worker:
      replicaCount: 1
      resources:
        requests: { cpu: 250m, memory: 256Mi }
        limits: { cpu: 1000m, memory: 1Gi }

  persistence:
    defaultStore: postgres
    visibilityStore: postgres-visibility
    datastores:
      postgres:
        sql:
          pluginName: postgres12
          databaseName: temporal
          connectAddr: "pgbouncer.paygate.svc:5432"
          connectProtocol: tcp
          user: temporal
          maxConns: 20
          maxIdleConns: 10
          maxConnLifetime: "1h"
```

### 3.2 Go Worker Tuning

```go
// go-bridge/internal/temporal/worker_config.go
package temporal

import (
    "go.temporal.io/sdk/client"
    "go.temporal.io/sdk/worker"
)

func NewOptimisedWorker(c client.Client, taskQueue string) worker.Worker {
    opts := worker.Options{
        // Concurrency
        MaxConcurrentActivityExecutionSize:      100,  // Parallel activities
        MaxConcurrentWorkflowTaskExecutionSize:  50,   // Parallel workflow tasks
        MaxConcurrentLocalActivityExecutionSize: 200,  // Local activities (in-process)

        // Rate limiting
        WorkerActivitiesPerSecond:      1000,  // Activity rate limit
        TaskQueueActivitiesPerSecond:   2000,  // Task queue rate limit

        // Sticky execution (cache workflow state in memory)
        StickyScheduleToStartTimeout: 5,       // Seconds

        // Graceful shutdown
        WorkerStopTimeout: 30,                 // Seconds

        // Metrics
        EnableLoggingInReplay: false,          // Disable in production
    }
    return worker.New(c, taskQueue, opts)
}
```

---

## 4. Keycloak (Identity & Access Management)

### 4.1 HA Topology

```yaml
# infra/k8s/keycloak/keycloak-ha.yaml
# Active-active cluster with Infinispan distributed cache
# 3 replicas minimum, auto-scale to 10

keycloak:
  replicas: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70

  extraEnv:
    # Clustering
    - name: KC_CACHE
      value: ispn                          # Infinispan distributed cache
    - name: KC_CACHE_STACK
      value: kubernetes
    - name: JAVA_OPTS_APPEND
      value: >-
        -Djgroups.dns.query=keycloak-headless.paygate.svc.cluster.local
        -XX:+UseContainerSupport
        -XX:MaxRAMPercentage=75.0
        -XX:+UseG1GC
        -XX:MaxGCPauseMillis=100

    # Performance
    - name: KC_HTTP_MAX_QUEUED_REQUESTS
      value: "1000"
    - name: KC_TRANSACTION_XA_ENABLED
      value: "false"                       # Disable XA for better performance

    # Database connection pool
    - name: KC_DB_POOL_MIN_SIZE
      value: "5"
    - name: KC_DB_POOL_MAX_SIZE
      value: "50"
    - name: KC_DB_POOL_INITIAL_SIZE
      value: "5"

    # Token settings
    - name: KC_SPI_EVENTS_LISTENER_JBOSS_LOGGING_SUCCESS_LEVEL
      value: "debug"

  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 2Gi
```

### 4.2 Python Keycloak Admin Client

```python
# python-services/shared/keycloak_admin.py
from keycloak import KeycloakAdmin, KeycloakOpenIDConnection
import os, functools

@functools.lru_cache(maxsize=1)
def get_keycloak_admin() -> KeycloakAdmin:
    """Singleton Keycloak admin client with connection pooling."""
    connection = KeycloakOpenIDConnection(
        server_url=os.environ["KEYCLOAK_URL"],
        realm_name=os.environ["KEYCLOAK_REALM"],
        client_id=os.environ["KEYCLOAK_CLIENT_ID"],
        client_secret_key=os.environ["KEYCLOAK_CLIENT_SECRET"],
        verify=True,
        connection_timeout=10,
        read_timeout=30,
    )
    return KeycloakAdmin(connection=connection)

async def get_user_roles(user_id: str) -> list[str]:
    admin = get_keycloak_admin()
    roles = admin.get_realm_roles_of_user(user_id=user_id)
    return [r["name"] for r in roles]

async def assign_merchant_role(user_id: str, merchant_id: str) -> None:
    admin = get_keycloak_admin()
    # Create merchant-specific group if not exists
    group_name = f"merchant:{merchant_id}"
    groups = admin.get_groups(query={"search": group_name})
    if not groups:
        admin.create_group({"name": group_name})
        groups = admin.get_groups(query={"search": group_name})
    admin.group_user_add(user_id=user_id, group_id=groups[0]["id"])
```

---

## 5. Permify (Fine-Grained Authorization)

### 5.1 HA Topology

```yaml
# infra/k8s/permify/permify-ha.yaml
permify:
  replicas: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 8

  config:
    server:
      rate_limit: 10000             # Requests/second per instance
    database:
      engine: postgres
      uri: "postgres://permify:${PERMIFY_DB_PASS}@pgbouncer:5432/permify"
      max_open_connections: 20
      max_idle_connections: 5
      max_connection_lifetime: "1h"
    cache:
      number_of_counters: 1_000_000  # 1M cached permission checks
      max_cost: "256MiB"
    distributed:
      enabled: true
      address: "permify-headless.paygate.svc:2380"  # etcd-style leader election
```

### 5.2 Go Permify Client (Cached)

```go
// go-bridge/internal/authz/permify_client.go
package authz

import (
    "context"
    "time"
    "github.com/Permify/permify-go/v1"
    "github.com/patrickmn/go-cache"
)

type PermifyClient struct {
    client *permify.Client
    cache  *cache.Cache
}

func NewPermifyClient(endpoint, apiKey string) *PermifyClient {
    client, _ := permify.NewClient(
        permify.Config{
            Endpoint: endpoint,
            APIKey:   apiKey,
        },
    )
    return &PermifyClient{
        client: client,
        cache:  cache.New(30*time.Second, 5*time.Minute), // 30s TTL
    }
}

// CheckPermission with local cache (reduces Permify load by ~80%)
func (p *PermifyClient) CheckPermission(
    ctx context.Context,
    tenantID, entity, entityID, permission, subjectType, subjectID string,
) (bool, error) {
    cacheKey := tenantID + ":" + entity + ":" + entityID + ":" + permission + ":" + subjectID
    if cached, found := p.cache.Get(cacheKey); found {
        return cached.(bool), nil
    }

    result, err := p.client.Permission.Check(ctx, &permify.PermissionCheckRequest{
        TenantId: tenantID,
        Metadata: &permify.PermissionCheckRequestMetadata{SnapToken: "", SchemaVersion: ""},
        Entity:   &permify.Entity{Type: entity, Id: entityID},
        Permission: permission,
        Subject:  &permify.Subject{Type: subjectType, Id: subjectID},
    })
    if err != nil {
        return false, err
    }

    allowed := result.Can == permify.CheckResult_CHECK_RESULT_ALLOWED
    p.cache.Set(cacheKey, allowed, cache.DefaultExpiration)
    return allowed, nil
}
```

---

## 6. APISIX (API Gateway)

### 6.1 HA Topology

```yaml
# infra/k8s/apisix/apisix-ha.yaml
apisix:
  replicas: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 20
    targetCPUUtilizationPercentage: 60

  config:
    apisix:
      node_listen: 9080
      enable_ipv6: false
      enable_admin: true
      admin_listen:
        port: 9180
      router:
        http: radixtree_uri          # Fastest router
      proxy_cache:
        cache_ttl: 10s
        zones:
          - name: disk_cache_one
            memory_size: 50m
            disk_size: 1g
            disk_path: /tmp/apisix_cache

    nginx_config:
      worker_processes: auto
      worker_connections: 65536
      worker_rlimit_nofile: 65536
      event:
        multi_accept: true
        use: epoll
      http:
        access_log_format: >-
          $remote_addr - $upstream_addr [$time_local] "$request"
          $status $body_bytes_sent $request_time
          "$http_referer" "$http_user_agent"
        keepalive_timeout: 60s
        keepalive_requests: 1000
        client_header_timeout: 60s
        client_body_timeout: 60s
        send_timeout: 10s
        upstream:
          keepalive: 320
          keepalive_requests: 1000
          keepalive_timeout: 60s
```

### 6.2 Rate Limiting Plugin Config

```yaml
# infra/apisix/plugins/rate-limit.yaml
# Applied to all /api/trpc routes
plugins:
  - name: limit-req
    config:
      rate: 100          # Sustained rate: 100 req/s per consumer
      burst: 200         # Burst allowance
      key: consumer_name
      rejected_code: 429
      rejected_msg: '{"error":"Rate limit exceeded","retryAfter":1}'

  - name: limit-count
    config:
      count: 10000       # 10K requests per window
      time_window: 60    # 60-second window
      key: remote_addr
      rejected_code: 429

  - name: api-breaker
    config:
      break_response_code: 502
      unhealthy:
        http_statuses: [500, 502, 503]
        failures: 5
      healthy:
        http_statuses: [200, 201]
        successes: 3
```

---

## 7. TigerBeetle (Financial Ledger)

### 7.1 HA Topology (3-Node Cluster)

The existing 3-node TigerBeetle setup in `docker-compose.prod.yml` is correct. The following tuning applies to the TigerBeetle data file and network settings:

```bash
# scripts/tigerbeetle-init.sh
#!/bin/bash
# Initialize TigerBeetle cluster nodes

TB_VERSION="0.16.11"
DATA_DIR="/var/lib/tigerbeetle"

for NODE in 1 2 3; do
  mkdir -p "$DATA_DIR/node-$NODE"
  
  # Format data file (run once per node)
  ./tigerbeetle format \
    --cluster=0 \
    --replica=$(( NODE - 1 )) \
    --replica-count=3 \
    "$DATA_DIR/node-$NODE/0_0.tigerbeetle"
done

# Start node 1
./tigerbeetle start \
  --addresses=tb-1:3001,tb-2:3002,tb-3:3003 \
  --cache-grid=8GiB \              # 8GB in-memory grid cache
  "$DATA_DIR/node-1/0_0.tigerbeetle" &
```

### 7.2 Go TigerBeetle Client (Batch Transfers)

```go
// go-bridge/internal/ledger/tigerbeetle_client.go
package ledger

import (
    "context"
    tigerbeetle "github.com/tigerbeetle/tigerbeetle-go"
    tb_types "github.com/tigerbeetle/tigerbeetle-go/pkg/types"
)

type LedgerClient struct {
    tb *tigerbeetle.Client
}

func NewLedgerClient(addresses []string) (*LedgerClient, error) {
    tb, err := tigerbeetle.NewClient(
        tb_types.ToUint128(0), // cluster ID
        addresses,
        32,                    // concurrency limit (outstanding requests)
    )
    if err != nil {
        return nil, err
    }
    return &LedgerClient{tb: tb}, nil
}

// BatchTransfer executes up to 8,191 transfers atomically
func (l *LedgerClient) BatchTransfer(ctx context.Context, transfers []tb_types.Transfer) error {
    // TigerBeetle processes batches atomically — all succeed or all fail
    results, err := l.tb.CreateTransfers(transfers)
    if err != nil {
        return err
    }
    for _, result := range results {
        if result.Result != tb_types.TransferOK {
            return fmt.Errorf("transfer %d failed: %v", result.Index, result.Result)
        }
    }
    return nil
}

// Performance: TigerBeetle handles 1M+ transfers/second on NVMe
// Batch size of 8,191 is optimal for throughput
// Use uint128 IDs for all account and transfer identifiers
```

---

## 8. Dapr (Distributed Application Runtime)

### 8.1 HA Configuration

```yaml
# infra/dapr/components/ha-config.yaml
apiVersion: dapr.io/v1alpha1
kind: Configuration
metadata:
  name: paygate-config
  namespace: paygate
spec:
  tracing:
    samplingRate: "0.01"          # 1% sampling in production
    zipkin:
      endpointAddress: "http://jaeger-collector:9411/api/v2/spans"
  metric:
    enabled: true
  features:
    - name: Actor.Reentrancy
      enabled: true
    - name: Scheduler.BuiltInJobScheduler
      enabled: true
  api:
    allowed:
      - name: invoke
        version: v1
      - name: state
        version: v1
      - name: pubsub
        version: v1
```

### 8.2 Pub/Sub Component (Kafka-backed, HA)

```yaml
# infra/dapr/components/merchant-pubsub.yaml (enhanced)
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: merchant-pubsub
  namespace: paygate
spec:
  type: pubsub.kafka
  version: v1
  metadata:
    - name: brokers
      value: "kafka-0.kafka-headless:9092,kafka-1.kafka-headless:9092,kafka-2.kafka-headless:9092"
    - name: consumerGroup
      value: "dapr-merchant-consumer"
    - name: clientID
      value: "dapr-paygate"
    - name: authType
      value: "none"
    # Performance
    - name: maxMessageBytes
      value: "10485760"           # 10MB
    - name: fetchBlockDuration
      value: "200ms"
    - name: producerFetchDefault
      value: "1048576"            # 1MB fetch
    # Reliability
    - name: disableTls
      value: "false"
    - name: ackWaitTime
      value: "30s"
    - name: redeliveryCount
      value: "5"
    - name: publishOnlyOnceTopic
      value: "false"
```

---

## 9. Fluvio (Real-Time Stream Processing)

### 9.1 HA Cluster Setup

```bash
# infra/fluvio/setup.sh (enhanced)
#!/bin/bash
# Fluvio 3-node HA cluster setup

set -e

# Install Fluvio CLI
curl -fsS https://hub.infinyon.cloud/install/install.sh | bash

# Create HA cluster on Kubernetes
fluvio cluster start \
  --k8 \
  --namespace paygate \
  --spu-replicas 3 \
  --rust-log "info"

# Create topics with replication
fluvio topic create paygate-transactions \
  --partitions 8 \
  --replication-factor 3 \
  --retention-time 7d \
  --segment-size 1073741824    # 1GB segments

fluvio topic create paygate-fraud-events \
  --partitions 4 \
  --replication-factor 3 \
  --retention-time 30d

fluvio topic create paygate-kyc-liveness \
  --partitions 4 \
  --replication-factor 3 \
  --retention-time 90d
```

### 9.2 Rust Fluvio Consumer

```rust
// rust-services/src/fluvio/consumer.rs
use fluvio::{Fluvio, Offset, consumer::ConsumerConfig};
use futures::StreamExt;

pub async fn consume_transactions(handler: impl Fn(Vec<u8>) -> bool) {
    let fluvio = Fluvio::connect().await.expect("Fluvio connect failed");
    
    let config = ConsumerConfig::builder()
        .max_bytes(10 * 1024 * 1024)    // 10MB max per fetch
        .build()
        .expect("Config build failed");

    let consumer = fluvio
        .partition_consumer("paygate-transactions", 0)
        .await
        .expect("Consumer creation failed");

    let mut stream = consumer
        .stream_with_config(Offset::end(), config)
        .await
        .expect("Stream creation failed");

    while let Some(Ok(record)) = stream.next().await {
        let payload = record.get_value().to_vec();
        if !handler(payload) {
            // Nack: re-process on next poll
            eprintln!("Handler failed, will retry");
        }
    }
}
```

---

## 10. OpenSearch (Search & Analytics)

### 10.1 HA Topology

```yaml
# infra/k8s/opensearch/opensearch-ha.yaml
# 3 dedicated master + 3 data + 2 coordinating nodes

opensearch:
  master:
    replicas: 3
    javaOpts: "-Xms2g -Xmx2g -XX:+UseG1GC"
    resources:
      requests: { cpu: 500m, memory: 3Gi }
      limits: { cpu: 2000m, memory: 4Gi }
    persistence:
      size: 20Gi

  data:
    replicas: 3
    javaOpts: "-Xms8g -Xmx8g -XX:+UseG1GC -XX:MaxGCPauseMillis=200"
    resources:
      requests: { cpu: 2000m, memory: 10Gi }
      limits: { cpu: 4000m, memory: 12Gi }
    persistence:
      size: 500Gi
      storageClass: premium-rwo

  coordinating:
    replicas: 2
    javaOpts: "-Xms2g -Xmx2g"
    resources:
      requests: { cpu: 500m, memory: 3Gi }
      limits: { cpu: 2000m, memory: 4Gi }

  config:
    opensearch.yml: |
      cluster.name: paygate-search
      # Performance
      indices.memory.index_buffer_size: 30%
      indices.queries.cache.size: 20%
      thread_pool.search.queue_size: 10000
      thread_pool.write.queue_size: 10000
      # Durability
      index.number_of_replicas: 1
      index.refresh_interval: 5s           # Reduce for near-real-time
      index.translog.durability: async     # Async fsync for performance
      index.translog.sync_interval: 5s
```

### 10.2 Python OpenSearch Client

```python
# python-services/shared/opensearch_client.py
from opensearchpy import OpenSearch, RequestsHttpConnection, helpers
from opensearchpy.helpers import bulk
import os, asyncio

def get_opensearch_client() -> OpenSearch:
    return OpenSearch(
        hosts=[{"host": os.environ["OPENSEARCH_HOST"], "port": 9200}],
        http_auth=(os.environ["OPENSEARCH_USER"], os.environ["OPENSEARCH_PASS"]),
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        pool_maxsize=20,
        timeout=30,
        max_retries=3,
        retry_on_timeout=True,
    )

async def bulk_index_transactions(transactions: list[dict]) -> dict:
    """Bulk index transactions with optimal batch size."""
    client = get_opensearch_client()
    actions = [
        {
            "_index": "paygate-transactions",
            "_id": tx["id"],
            "_source": {
                "merchant_id": tx["merchant_id"],
                "amount": tx["amount"],
                "currency": tx["currency"],
                "status": tx["status"],
                "created_at": tx["created_at"].isoformat(),
                "customer_email": tx.get("customer_email"),
                "reference": tx["reference"],
            }
        }
        for tx in transactions
    ]
    success, errors = bulk(
        client,
        actions,
        chunk_size=500,         # 500 docs per bulk request
        max_chunk_bytes=5242880, # 5MB per chunk
        raise_on_error=False,
    )
    return {"indexed": success, "errors": len(errors)}
```

---

## 11. Mojaloop (Interbank Payment Switch)

### 11.1 HA Configuration

```yaml
# infra/k8s/mojaloop/mojaloop-ha.yaml
# Mojaloop vNext with 3-replica services

mojaloop:
  ml-api-adapter:
    replicaCount: 3
    resources:
      requests: { cpu: 500m, memory: 512Mi }
      limits: { cpu: 2000m, memory: 1Gi }
    config:
      # Kafka topics for Mojaloop events
      KAFKA_TOPIC_TRANSFER_PREPARE: "topic-transfer-prepare"
      KAFKA_TOPIC_TRANSFER_FULFIL: "topic-transfer-fulfil"
      KAFKA_TOPIC_TRANSFER_GET: "topic-transfer-get"
      # Timeouts (ms)
      EXPIRY_DURATION_MS: "60000"
      PREPARE_TIMEOUT_MS: "30000"
      FULFIL_TIMEOUT_MS: "30000"

  central-ledger:
    replicaCount: 3
    config:
      # Database
      DATABASE_HOST: pgbouncer.paygate.svc
      DATABASE_PORT: "5432"
      DATABASE_USER: mojaloop
      DATABASE_POOL_MIN: "5"
      DATABASE_POOL_MAX: "30"
      # Performance
      CACHE_ENABLED: "true"
      CACHE_MAX_BYTE_SIZE: "10000000"  # 10MB
```

### 11.2 Go Mojaloop Client (Retry + Circuit Breaker)

```go
// go-bridge/internal/mojaloop/client.go
package mojaloop

import (
    "context"
    "net/http"
    "time"
    "github.com/sony/gobreaker"
    "github.com/hashicorp/go-retryablehttp"
)

type MojaloopClient struct {
    httpClient *retryablehttp.Client
    breaker    *gobreaker.CircuitBreaker
    baseURL    string
    apiKey     string
}

func NewMojaloopClient(baseURL, apiKey string) *MojaloopClient {
    retryClient := retryablehttp.NewClient()
    retryClient.RetryMax = 3
    retryClient.RetryWaitMin = 100 * time.Millisecond
    retryClient.RetryWaitMax = 2 * time.Second
    retryClient.HTTPClient.Timeout = 30 * time.Second

    breaker := gobreaker.NewCircuitBreaker(gobreaker.Settings{
        Name:        "mojaloop",
        MaxRequests: 5,
        Interval:    10 * time.Second,
        Timeout:     30 * time.Second,
        ReadyToTrip: func(counts gobreaker.Counts) bool {
            return counts.ConsecutiveFailures > 5
        },
    })

    return &MojaloopClient{
        httpClient: retryClient,
        breaker:    breaker,
        baseURL:    baseURL,
        apiKey:     apiKey,
    }
}

func (c *MojaloopClient) PostTransfer(ctx context.Context, transfer TransferRequest) (*TransferResponse, error) {
    result, err := c.breaker.Execute(func() (interface{}, error) {
        return c.doPostTransfer(ctx, transfer)
    })
    if err != nil {
        return nil, fmt.Errorf("mojaloop circuit breaker: %w", err)
    }
    return result.(*TransferResponse), nil
}
```

---

## 12. Lakehouse (Analytics — Apache Iceberg + Trino)

### 12.1 HA Topology

```yaml
# infra/k8s/lakehouse/lakehouse-ha.yaml
# Trino coordinator + 3 workers + Iceberg REST catalog

trino:
  coordinator:
    replicas: 1                    # Single coordinator (HA via restart policy)
    resources:
      requests: { cpu: 2000m, memory: 4Gi }
      limits: { cpu: 4000m, memory: 8Gi }
    config:
      query.max-memory: 6GB
      query.max-memory-per-node: 2GB
      query.max-total-memory-per-node: 3GB
      task.concurrency: 8
      task.max-worker-threads: 32

  worker:
    replicas: 3
    autoscaling:
      enabled: true
      minReplicas: 3
      maxReplicas: 10
    resources:
      requests: { cpu: 4000m, memory: 8Gi }
      limits: { cpu: 8000m, memory: 16Gi }
    config:
      node.data-dir: /data/trino
      spill-enabled: true
      spiller-spill-path: /tmp/trino-spill

iceberg-rest:
  replicas: 2
  config:
    CATALOG_WAREHOUSE: s3://paygate-lakehouse/warehouse
    CATALOG_IO__IMPL: org.apache.iceberg.aws.s3.S3FileIO
    CATALOG_S3_ENDPOINT: ${S3_ENDPOINT}
```

### 12.2 Python Lakehouse Writer

```python
# python-services/lakehouse-audit/writer.py
import pyarrow as pa
import pyarrow.parquet as pq
from pyiceberg.catalog import load_catalog
from pyiceberg.schema import Schema
from pyiceberg.types import (
    NestedField, StringType, TimestampType, LongType, DoubleType
)
import os, datetime

def get_iceberg_catalog():
    return load_catalog(
        "paygate",
        **{
            "type": "rest",
            "uri": os.environ["ICEBERG_REST_URL"],
            "s3.endpoint": os.environ["S3_ENDPOINT"],
            "s3.access-key-id": os.environ["AWS_ACCESS_KEY_ID"],
            "s3.secret-access-key": os.environ["AWS_SECRET_ACCESS_KEY"],
        }
    )

async def write_transactions_to_lakehouse(transactions: list[dict]) -> int:
    """Write a batch of transactions to Iceberg table."""
    catalog = get_iceberg_catalog()
    table = catalog.load_table("paygate.transactions")

    # Convert to Arrow table
    schema = pa.schema([
        pa.field("id", pa.string()),
        pa.field("merchant_id", pa.string()),
        pa.field("amount", pa.int64()),
        pa.field("currency", pa.string()),
        pa.field("status", pa.string()),
        pa.field("created_at", pa.timestamp("us", tz="UTC")),
        pa.field("partition_date", pa.date32()),  # Partition column
    ])
    
    arrow_table = pa.Table.from_pylist(
        [{
            **tx,
            "partition_date": tx["created_at"].date(),
        } for tx in transactions],
        schema=schema
    )

    # Append to Iceberg table (ACID, schema-evolving)
    table.append(arrow_table)
    return len(transactions)
```

---

## Summary: HA & Performance Targets

| Component | HA Topology | Target Availability | Target Throughput |
|---|---|---|---|
| **Kafka** | 3-broker KRaft | 99.99% | 1M msg/s |
| **Redis** | 1 primary + 2 replicas + 3 Sentinel | 99.99% | 500K ops/s |
| **Temporal** | 3 frontend + 3 history + 3 matching | 99.9% | 10K workflows/s |
| **Keycloak** | 3-node active-active + Infinispan | 99.9% | 5K auth/s |
| **Permify** | 3 replicas + local cache | 99.9% | 50K checks/s |
| **APISIX** | 3 replicas + etcd cluster | 99.99% | 100K req/s |
| **TigerBeetle** | 3-node consensus | 99.999% | 1M transfers/s |
| **Dapr** | Sidecar per pod (inherits pod HA) | 99.9% | N/A (sidecar) |
| **Fluvio** | 3 SPU replicas | 99.9% | 500K msg/s |
| **OpenSearch** | 3 master + 3 data + 2 coord | 99.9% | 100K docs/s |
| **Mojaloop** | 3 replicas per service | 99.9% | 1K transfers/s |
| **Lakehouse** | 1 coord + 3 workers (auto-scale) | 99.5% | 1TB/day ingest |
