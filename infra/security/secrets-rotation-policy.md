# PayGate Secrets Rotation Policy

## Overview

All production secrets must be rotated on a defined schedule and immediately upon suspected compromise. This document defines rotation procedures for every secret in the PayGate platform.

## Secret Inventory and Rotation Schedule

| Secret | Environment Variable | Rotation Frequency | Owner | Impact on Rotation |
|---|---|---|---|---|
| JWT signing secret | `JWT_SECRET` | 90 days | Platform team | All active sessions invalidated — users must re-login |
| Bridge internal key | `BRIDGE_INTERNAL_KEY` | 90 days | Platform team | Portal and bridge must be restarted simultaneously |
| Stripe secret key (live) | `STRIPE_SECRET_KEY` | On compromise only | Finance team | Rotate in Stripe Dashboard; update portal secret |
| Stripe webhook secret | `STRIPE_WEBHOOK_SECRET` | On endpoint change | Finance team | Update in Stripe Dashboard → Webhooks |
| Database password | `DATABASE_URL` | 180 days | DBA | Update PgBouncer userlist.txt; rolling restart |
| Redis password | `REDIS_URL` | 180 days | Platform team | Update all services; rolling restart |
| Permify API key | `PERMIFY_API_KEY` | 90 days | Security team | Update bridge; no user impact |
| Kafka SASL credentials | `KAFKA_SASL_*` | 180 days | Platform team | Update all producers/consumers |
| Temporal namespace key | `TEMPORAL_API_KEY` | 180 days | Platform team | Update bridge worker |
| NIBSS HMAC secret | `NIBSS_HMAC_SECRET` | On compromise only | Finance team | Coordinate with NIBSS; update bridge |
| Mojaloop connector key | `MOJALOOP_API_KEY` | 180 days | Finance team | Update bridge; coordinate with Mojaloop hub |
| M-Pesa consumer key | `MPESA_CONSUMER_KEY` | 180 days | Finance team | Update Python service |
| Keycloak client secret | `KEYCLOAK_CLIENT_SECRET` | 90 days | Platform team | Update portal OAuth config |

## Rotation Procedure

### Standard Rotation (JWT_SECRET, BRIDGE_INTERNAL_KEY)

1. Generate a new secret: `openssl rand -base64 64`
2. Update the secret in the Manus portal: Settings → Secrets
3. Trigger a rolling restart of the affected service
4. Verify health checks pass on all replicas
5. Record the rotation date in the audit log

### Zero-Downtime JWT Rotation

JWT rotation invalidates all active sessions. To minimise disruption:

1. Schedule rotation during off-peak hours (02:00–04:00 WAT)
2. Notify users 24 hours in advance via in-app notification
3. Set the new `JWT_SECRET` in Secrets
4. Restart the portal with a rolling update (one replica at a time)
5. Monitor error rates for 15 minutes post-rotation

### Database Password Rotation

1. Create a new PostgreSQL user with the same privileges: `CREATE USER paygate_app_v2 WITH PASSWORD '...'`
2. Grant all required permissions to the new user
3. Update `DATABASE_URL` in Secrets to use the new credentials
4. Update `pgbouncer.ini` userlist.txt on all PgBouncer nodes
5. Reload PgBouncer: `pgbouncer -R /etc/pgbouncer/pgbouncer.ini`
6. Verify connections are healthy
7. Revoke and drop the old user after 24 hours

### Emergency Rotation (Suspected Compromise)

1. Immediately rotate the compromised secret (do not wait for off-peak)
2. Audit all access logs for the past 30 days using the compromised secret
3. File an incident report in the security log
4. Notify affected users if customer data may have been accessed
5. Review and tighten access controls

## Rotation Verification Checklist

After every rotation:

- [ ] New secret is set in Manus Secrets panel
- [ ] All affected services restarted and healthy
- [ ] Health check endpoints return 200
- [ ] No authentication errors in logs for 15 minutes
- [ ] Rotation date recorded in audit log
- [ ] Old secret revoked/deleted from all systems

## Automated Rotation (Future)

Consider integrating with HashiCorp Vault or AWS Secrets Manager for automated rotation with zero-downtime lease renewal.
