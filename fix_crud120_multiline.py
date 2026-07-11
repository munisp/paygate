import re

with open('server/routers/crud120.ts', 'r') as f:
    content = f.read()

# Replace multi-line `.values({ ... })`
# We look for `.values({` followed by anything lazy, then `})`
# We add ` as any` before the `})`
content = re.sub(r'(\.values\(\{.*?)(\}\)(?:\.returning\(\))?;)', r'\1 } as any)\2', content, flags=re.DOTALL)
content = re.sub(r'(\.set\(\{.*?)(\}\)\.where\()', r'\1 } as any).where(', content, flags=re.DOTALL)

with open('server/routers/crud120.ts', 'w') as f:
    f.write(content)
print("Applied multi-line regex casts")
