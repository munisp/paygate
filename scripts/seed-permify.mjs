#!/usr/bin/env node
/**
 * seed-permify.mjs
 * Seed Permify with PayGate relationship tuples for all existing merchants.
 * Usage: node scripts/seed-permify.mjs
 *
 * Env vars (optional — falls back to localhost defaults):
 *   PERMIFY_URL      e.g. http://permify:3476
 *   PERMIFY_API_KEY  bearer token (leave empty for local dev)
 */

const PERMIFY_URL = process.env.PERMIFY_URL || "http://localhost:3476";
const PERMIFY_API_KEY = process.env.PERMIFY_API_KEY || "";
const TENANT_ID = "t1";

const headers = {
  "Content-Type": "application/json",
  ...(PERMIFY_API_KEY ? { Authorization: `Bearer ${PERMIFY_API_KEY}` } : {}),
};

async function permifyPost(path, body) {
  const res = await fetch(`${PERMIFY_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Permify ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function writeSchema() {
  const schema = `
entity user {}
entity merchant {
  relation owner @user
  relation admin @user
  relation member @user
  relation viewer @user

  permission view = owner or admin or member or viewer
  permission edit = owner or admin
  permission delete = owner
  permission approve_payout = owner or admin
  permission initiate_payout = owner or admin or member
  permission view_analytics = owner or admin or member or viewer
  permission manage_api_keys = owner or admin
  permission manage_webhooks = owner or admin or member
  permission manage_team = owner or admin
  permission view_disputes = owner or admin or member or viewer
  permission respond_dispute = owner or admin or member
  permission view_transactions = owner or admin or member or viewer
  permission refund_transaction = owner or admin
  permission view_customers = owner or admin or member or viewer
  permission manage_virtual_cards = owner or admin or member
  permission view_compliance = owner or admin
  permission manage_settings = owner or admin
}
entity role {
  relation assignee @user
  permission use = assignee
}
`;
  console.log("Writing Permify schema...");
  try {
    await permifyPost(`/v1/tenants/${TENANT_ID}/schemas/write`, { schema });
    console.log("✓ Schema written");
  } catch (e) {
    console.warn("Schema write failed (may already exist):", e.message);
  }
}

async function seedMerchantRelationships() {
  // Default seed: create relationships for the demo merchant
  const tuples = [
    {
      entity: { type: "merchant", id: "merchant_demo" },
      relation: "owner",
      subject: { type: "user", id: "user_owner" },
    },
    {
      entity: { type: "merchant", id: "merchant_demo" },
      relation: "admin",
      subject: { type: "user", id: "user_admin" },
    },
    {
      entity: { type: "merchant", id: "merchant_demo" },
      relation: "member",
      subject: { type: "user", id: "user_member" },
    },
    {
      entity: { type: "merchant", id: "merchant_demo" },
      relation: "viewer",
      subject: { type: "user", id: "user_viewer" },
    },
  ];

  console.log(`Seeding ${tuples.length} relationship tuples...`);
  try {
    const result = await permifyPost(`/v1/tenants/${TENANT_ID}/relationships/write`, {
      metadata: { schema_version: "" },
      tuples,
    });
    console.log("✓ Relationships seeded:", JSON.stringify(result, null, 2));
  } catch (e) {
    console.warn("Relationship seed failed (Permify may be offline):", e.message);
    console.log("Relationships that would have been seeded:");
    tuples.forEach((t) =>
      console.log(`  ${t.entity.type}:${t.entity.id}#${t.relation}@${t.subject.type}:${t.subject.id}`)
    );
  }
}

async function main() {
  console.log("=== PayGate Permify Seeder ===");
  console.log(`Target: ${PERMIFY_URL}/v1/tenants/${TENANT_ID}`);
  await writeSchema();
  await seedMerchantRelationships();
  console.log("=== Done ===");
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
