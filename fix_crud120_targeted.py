import re

with open('server/routers/crud120.ts', 'r') as f:
    content = f.read()

# Fix z.record
content = re.sub(r'z\.record\(\s*z\.any\(\)\s*\)', 'z.record(z.string(), z.any())', content)
content = re.sub(r'z\.record\(\s*z\.unknown\(\)\s*\)', 'z.record(z.string(), z.unknown())', content)

# Fix consumerBudgets userId
content = content.replace('eq(consumerBudgets.userId, String(ctx.user.id))', 'eq(consumerBudgets.userId, ctx.user!.id)')

# Fix carbonCreditTransactionsV2
content = content.replace(
    '      ...input,\n      status: "pending",',
    '      ...input,\n      type: input.txType,\n      status: "pending",'
)

with open('server/routers/crud120.ts', 'w') as f:
    f.write(content)
print("Targeted fixes applied")
