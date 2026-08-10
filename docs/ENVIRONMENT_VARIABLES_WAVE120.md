# Wave 120 — Environment Variables Reference

This document lists all new environment variables introduced in Wave 120.

## Wave 120 New Services

### Staff Management Service (port 8910)
| Variable | Default | Description |
|---|---|---|
| `STAFF_SERVICE_URL` | `http://staff-service:8910` | Staff management service endpoint |
| `STAFF_MAX_SHIFTS_PER_DAY` | `3` | Maximum shifts a staff member can clock in per day |
| `STAFF_PAYROLL_CYCLE` | `monthly` | Payroll calculation cycle (weekly/biweekly/monthly) |

### Insurance Claims Service (port 8911)
| Variable | Default | Description |
|---|---|---|
| `INSURANCE_SERVICE_URL` | `http://insurance-service:8911` | Insurance claims service endpoint |
| `INSURANCE_CLAIM_TIMEOUT_DAYS` | `30` | Days before a claim auto-escalates |
| `INSURANCE_MAX_CLAIM_AMOUNT` | `10000000` | Maximum claim amount in kobo |

### Support Chat Service (port 8912)
| Variable | Default | Description |
|---|---|---|
| `SUPPORT_CHAT_SERVICE_URL` | `http://support-chat-service:8912` | Support chat service endpoint |
| `SUPPORT_WEBSOCKET_ENABLED` | `true` | Enable WebSocket for real-time chat |
| `SUPPORT_MAX_SESSIONS` | `1000` | Maximum concurrent support sessions |
| `SUPPORT_AUTO_CLOSE_HOURS` | `72` | Hours before idle sessions auto-close |

### USDC Bridge Service (port 8913)
| Variable | Default | Description |
|---|---|---|
| `USDC_BRIDGE_SERVICE_URL` | `http://usdc-bridge-service:8913` | USDC bridge service endpoint |
| `ETH_RPC_URL` | — | Ethereum RPC endpoint (Infura/Alchemy) |
| `POLYGON_RPC_URL` | `https://polygon-rpc.com` | Polygon RPC endpoint |
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Solana RPC endpoint |
| `USDC_CONTRACT_ADDRESS` | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | USDC ERC-20 contract address (mainnet) |
| `USDC_MIN_TRANSFER_AMOUNT` | `1` | Minimum USDC transfer amount |
| `USDC_MAX_TRANSFER_AMOUNT` | `1000000` | Maximum USDC transfer amount |

### Tax Filing Service (port 8914)
| Variable | Default | Description |
|---|---|---|
| `TAX_FILING_SERVICE_URL` | `http://tax-filing-service:8914` | Tax filing service endpoint |
| `FIRS_API_URL` | `https://api.firs.gov.ng` | FIRS (Federal Inland Revenue Service) API |
| `FIRS_API_KEY` | — | FIRS API authentication key |
| `LIRS_API_URL` | `https://api.lirs.gov.ng` | Lagos IRS API endpoint |
| `TAX_FILING_DEADLINE_BUFFER_DAYS` | `7` | Days before deadline to send reminder |

### Split Bill Service (port 8915)
| Variable | Default | Description |
|---|---|---|
| `SPLIT_BILL_SERVICE_URL` | `http://split-bill-service:8915` | Split bill service endpoint |
| `SPLIT_BILL_MAX_PARTICIPANTS` | `20` | Maximum participants per split session |
| `SPLIT_BILL_EXPIRY_HOURS` | `48` | Hours before unpaid split sessions expire |

### Webhook Simulator V2 (port 8916)
| Variable | Default | Description |
|---|---|---|
| `WEBHOOK_SIM_V2_URL` | `http://webhook-simulator-v2:8916` | Webhook simulator V2 endpoint |
| `WEBHOOK_SIM_MAX_CONCURRENT` | `50` | Maximum concurrent simulations |
| `WEBHOOK_SIM_TIMEOUT_SECONDS` | `30` | Timeout per simulation request |
| `WEBHOOK_SIM_RETRY_COUNT` | `3` | Number of retries on failure |

### Tenant Provisioning Service (port 8917)
| Variable | Default | Description |
|---|---|---|
| `TENANT_PROVISIONING_SERVICE_URL` | `http://tenant-provisioning-service:8917` | Tenant provisioning endpoint |
| `KEYCLOAK_ADMIN_USER` | `admin` | Keycloak admin username for tenant creation |
| `KEYCLOAK_ADMIN_PASS` | — | Keycloak admin password |
| `TENANT_DEFAULT_PLAN` | `starter` | Default plan for new tenants |
| `TENANT_TRIAL_DAYS` | `30` | Trial period for new tenants |

### OpenAppSec WAF
| Variable | Default | Description |
|---|---|---|
| `OPENAPPSEC_UID` | — | OpenAppSec unique identifier |
| `OPENAPPSEC_TOKEN` | — | OpenAppSec authentication token |
| `OPENAPPSEC_LEARNING_MODE` | `true` | Enable learning mode (no blocking) |
| `OPENAPPSEC_BLOCKING_MODE` | `false` | Enable blocking mode (production) |

## Security Hardening Variables (Wave 120)
| Variable | Default | Description |
|---|---|---|
| `RANSOMWARE_BACKUP_INTERVAL_HOURS` | `6` | Automated backup interval |
| `DDOS_RATE_LIMIT_WINDOW_SECONDS` | `60` | DDoS rate limit window |
| `DDOS_MAX_REQUESTS_PER_WINDOW` | `1000` | Max requests per IP per window |
| `PBAC_STRICT_MODE` | `false` | Enforce PBAC on all procedures |
| `OFFLINE_SYNC_QUEUE_MAX` | `500` | Max offline operations to queue |
| `LOW_BANDWIDTH_MODE_THRESHOLD_KBPS` | `100` | Threshold to activate low-bandwidth mode |

## OpenSearch Integration Variables
| Variable | Default | Description |
|---|---|---|
| `OPENSEARCH_URL` | `http://opensearch:9200` | OpenSearch cluster endpoint |
| `OPENSEARCH_USERNAME` | `admin` | OpenSearch username |
| `OPENSEARCH_PASSWORD` | — | OpenSearch password |
| `OPENSEARCH_INDEX_PREFIX` | `paygate` | Index name prefix |
| `OPENSEARCH_AUDIT_INDEX` | `paygate-audit-events` | Audit trail index name |
| `OPENSEARCH_TX_INDEX` | `paygate-transactions` | Transaction search index |

## TigerBeetle New Accounts
| Variable | Default | Description |
|---|---|---|
| `TIGERBEETLE_STAFF_LEDGER_ID` | `1010` | Ledger ID for staff float accounts |
| `TIGERBEETLE_INSURANCE_LEDGER_ID` | `1011` | Ledger ID for insurance premium accounts |
| `TIGERBEETLE_USDC_LEDGER_ID` | `1012` | Ledger ID for USDC custody accounts |

## Lakehouse Compliance
| Variable | Default | Description |
|---|---|---|
| `LAKEHOUSE_URL` | `http://lakehouse:8125` | Lakehouse service endpoint |
| `LAKEHOUSE_COMPLIANCE_BUCKET` | `paygate-compliance` | S3 bucket for compliance events |
| `LAKEHOUSE_RETENTION_DAYS` | `2555` | Compliance event retention (7 years) |
| `LAKEHOUSE_WRITE_TIMEOUT_MS` | `5000` | Write timeout for compliance events |
