#!/usr/bin/env python3
"""
Add publishAuditEvent calls to admin mutations missing audit coverage (Wave 133).
Patches crud120.ts and crud120b.ts in-place.
"""

import re

AUDIT_IMPORT = "import { publishAuditEvent } from \"../kafkaClient\";\n"

# Each entry: (file, old_return, new_return_with_audit)
PATCHES = [
    # crud120.ts — approveLoan
    (
        "server/routers/crud120.ts",
        "    await db.update(emiLoans).set({ status: \"active\", disbursedAt: new Date() })\n      .where(eq(emiLoans.id, input.id));\n    return { success: true };\n  }),",
        "    await db.update(emiLoans).set({ status: \"active\", disbursedAt: new Date() })\n      .where(eq(emiLoans.id, input.id));\n    publishAuditEvent({ action: 'emi_loan.approved', actorId: 'system', targetId: input.id, metadata: {}, timestamp: new Date().toISOString() }).catch(() => {});\n    return { success: true };\n  }),",
    ),
    # crud120.ts — revoke invite code
    (
        "server/routers/crud120.ts",
        "    await db.update(inviteCodes).set({ status: \"revoked\" }).where(eq(inviteCodes.id, input.id));\n    return { success: true };\n  }),",
        "    await db.update(inviteCodes).set({ status: \"revoked\" }).where(eq(inviteCodes.id, input.id));\n    publishAuditEvent({ action: 'invite_code.revoked', actorId: 'system', targetId: input.id, metadata: {}, timestamp: new Date().toISOString() }).catch(() => {});\n    return { success: true };\n  }),",
    ),
    # crud120.ts — approve moneyRequest
    (
        "server/routers/crud120.ts",
        "    await db.update(moneyRequests).set({ status: \"approved\", approvedAt: new Date() })\n      .where(eq(moneyRequests.id, input.id));\n    return { success: true };\n  }),",
        "    await db.update(moneyRequests).set({ status: \"approved\", approvedAt: new Date() })\n      .where(eq(moneyRequests.id, input.id));\n    publishAuditEvent({ action: 'money_request.approved', actorId: 'system', targetId: input.id, metadata: {}, timestamp: new Date().toISOString() }).catch(() => {});\n    return { success: true };\n  }),",
    ),
    # crud120.ts — revokeConsent
    (
        "server/routers/crud120.ts",
        "    await db.update(openBankingConsentsV2).set({ status: \"revoked\", revokedAt: new Date() })\n      .where(eq(openBankingConsentsV2.id, input.id));\n    return { success: true };\n  }),",
        "    await db.update(openBankingConsentsV2).set({ status: \"revoked\", revokedAt: new Date() })\n      .where(eq(openBankingConsentsV2.id, input.id));\n    publishAuditEvent({ action: 'open_banking_consent.revoked', actorId: 'system', targetId: input.id, metadata: {}, timestamp: new Date().toISOString() }).catch(() => {});\n    return { success: true };\n  }),",
    ),
    # crud120.ts — approveRun (payroll)
    (
        "server/routers/crud120.ts",
        "    await db.update(payrollRuns).set({ status: \"approved\", approvedAt: new Date() })\n      .where(eq(payrollRuns.id, input.id));\n    return { success: true };\n  }),",
        "    await db.update(payrollRuns).set({ status: \"approved\", approvedAt: new Date() })\n      .where(eq(payrollRuns.id, input.id));\n    publishAuditEvent({ action: 'payroll_run.approved', actorId: 'system', targetId: input.id, metadata: {}, timestamp: new Date().toISOString() }).catch(() => {});\n    return { success: true };\n  }),",
    ),
    # crud120.ts — revoke sdkToken
    (
        "server/routers/crud120.ts",
        "    await db.update(sdkTokens).set({ status: \"revoked\", revokedAt: new Date() })\n      .where(eq(sdkTokens.id, input.id));\n    return { success: true };\n  }),",
        "    await db.update(sdkTokens).set({ status: \"revoked\", revokedAt: new Date() })\n      .where(eq(sdkTokens.id, input.id));\n    publishAuditEvent({ action: 'sdk_token.revoked', actorId: 'system', targetId: input.id, metadata: {}, timestamp: new Date().toISOString() }).catch(() => {});\n    return { success: true };\n  }),",
    ),
    # crud120b.ts — suspend superAgentV2Network
    (
        "server/routers/crud120b.ts",
        "    await db.update(superAgentV2Networks).set({ status: \"suspended\" })\n      .where(eq(superAgentV2Networks.id, input.id));\n    return { success: true };\n  }),",
        "    await db.update(superAgentV2Networks).set({ status: \"suspended\" })\n      .where(eq(superAgentV2Networks.id, input.id));\n    publishAuditEvent({ action: 'super_agent_network.suspended', actorId: 'system', targetId: input.id, metadata: { reason: input.reason }, timestamp: new Date().toISOString() }).catch(() => {});\n    return { success: true };\n  }),",
    ),
    # crud120b.ts — suspend tenant
    (
        "server/routers/crud120b.ts",
        "    await db.update(tenants).set({ status: \"suspended\" }).where(eq(tenants.id, input.id));\n    return { success: true };\n  }),",
        "    await db.update(tenants).set({ status: \"suspended\" }).where(eq(tenants.id, input.id));\n    publishAuditEvent({ action: 'tenant.suspended', actorId: 'system', targetId: input.id, metadata: { reason: input.reason }, timestamp: new Date().toISOString() }).catch(() => {});\n    return { success: true };\n  }),",
    ),
    # wave121.ts — invoice financing approve (missing publishAuditEvent)
    (
        "server/routers/wave121.ts",
        "      await db.update(invoiceFinancingV2Applications).set({\n        status: \"approved\",\n        approvedAmount: input.approvedAmount,\n        updatedAt: new Date(),\n      }).where(and(eq(invoiceFinancingV2Applications.id, input.id), eq(invoiceFinancingV2Applications.merchantId, ctx.user.tenantId ?? \"\")));\n      return { success: true };\n    }),",
        "      await db.update(invoiceFinancingV2Applications).set({\n        status: \"approved\",\n        approvedAmount: input.approvedAmount,\n        updatedAt: new Date(),\n      }).where(and(eq(invoiceFinancingV2Applications.id, input.id), eq(invoiceFinancingV2Applications.merchantId, ctx.user.tenantId ?? \"\")));\n      publishAuditEvent({ action: 'invoice_financing.approved', actorId: ctx.user.openId, targetId: input.id, metadata: { approvedAmount: input.approvedAmount }, timestamp: new Date().toISOString() }).catch(() => {});\n      return { success: true };\n    }),",
    ),
]

def ensure_import(content: str, filename: str) -> str:
    if "publishAuditEvent" in content:
        return content  # already imported
    # Insert after first import line
    first_import = content.find("import ")
    if first_import == -1:
        return AUDIT_IMPORT + content
    end_of_first_import = content.find("\n", first_import) + 1
    return content[:end_of_first_import] + AUDIT_IMPORT + content[end_of_first_import:]

files_modified = {}

for (filename, old, new) in PATCHES:
    if filename not in files_modified:
        with open(filename, "r") as f:
            files_modified[filename] = f.read()

    content = files_modified[filename]
    if old in content:
        content = content.replace(old, new, 1)
        files_modified[filename] = content
        print(f"  PATCHED: {filename} — {new.split('publishAuditEvent')[1][:60].strip()}")
    else:
        print(f"  SKIP (not found): {filename} — {old[:80].strip()}")

for filename, content in files_modified.items():
    content = ensure_import(content, filename)
    with open(filename, "w") as f:
        f.write(content)
    print(f"Wrote {filename}")

print("Done.")
