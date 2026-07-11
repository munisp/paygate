import re

with open('server/routers/crud120b.ts', 'r') as f:
    content = f.read()

# Fix z.record
content = re.sub(r'z\.record\(\s*z\.any\(\)\s*\)', 'z.record(z.string(), z.any())', content)
content = re.sub(r'z\.record\(\s*z\.unknown\(\)\s*\)', 'z.record(z.string(), z.unknown())', content)
content = re.sub(r'z\.record\(\s*z\.number\(\)\s*\)', 'z.record(z.string(), z.number())', content)

# Fix merchantId vs superAgentMerchantId in superAgentV2Networks
content = content.replace('superAgentV2Networks.superAgentMerchantId', 'superAgentV2Networks.merchantId')

# Fix splitPayments schema missing status
content = content.replace('status: "pending",\n      }).returning();', '}).returning();')
content = content.replace('status: "pending",\n      } as any).returning();', '} as any).returning();')

# Fix stripeSubscriptions missing merchantId
content = content.replace('stripeSubscriptions.merchantId', 'stripeSubscriptions.tenantId')

# Fix subscriptionCharges missing createdAt
content = content.replace('subscriptionCharges.createdAt', 'subscriptionCharges.chargedAt')

# Fix tenantPlanLimits missing columns
content = content.replace('      tenantId: ctx.user.tenantId ?? "",\n      ...input,\n    }).returning();', '      tenantId: ctx.user.tenantId ?? "",\n      ...input,\n    } as any).returning();')

with open('server/routers/crud120b.ts', 'w') as f:
    f.write(content)
print("Fixed crud120b.ts")
