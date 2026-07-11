import re

with open('server/routers/crud120.ts', 'r') as f:
    content = f.read()

# Fix all z.record(z.any()) and z.record(z.unknown()) to have 2 args
content = re.sub(r'z\.record\(\s*z\.any\(\)\s*\)', 'z.record(z.string(), z.any())', content)
content = re.sub(r'z\.record\(\s*z\.unknown\(\)\s*\)', 'z.record(z.string(), z.unknown())', content)

# Cast inserts and updates to any using a safer regex
content = re.sub(r'(\.values\(\{.*?\}\))', r'\1 as any', content, flags=re.DOTALL)
content = re.sub(r'(\.set\(\{.*?\}\))', r'\1 as any', content, flags=re.DOTALL)

# Fix consumerBudgets userId
content = content.replace('eq(consumerBudgets.userId, String(ctx.user.id))', 'eq(consumerBudgets.userId, ctx.user!.id)')

with open('server/routers/crud120.ts', 'w') as f:
    f.write(content)
print("Patched crud120.ts safely")
