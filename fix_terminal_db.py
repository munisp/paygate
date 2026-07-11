import re

with open('server/routers/terminal.ts', 'r') as f:
    content = f.read()

# Remove the module-level db = getDb() (already replaced with comment)
# Add const db = (await getDb())!; at the start of each async handler body

# Pattern: find `.query(async ({` or `.mutation(async ({` followed by `) => {`
# and inject `const db = (await getDb())!;` after the opening brace

# Find all async handler patterns and inject db initialization
# The pattern is: .query(async ({ input }) => {\n or .mutation(async ({ input }) => {\n
# We need to inject after the opening brace of the handler body

def inject_db_init(match):
    """Add const db = (await getDb())!; after the opening brace of each handler"""
    full = match.group(0)
    # Find the last { in the match and add db init after it
    return full + '\n      const db = (await getDb())!;'

# Replace patterns like `.query(async ({ ... }) => {` 
# We need to be careful not to double-inject
if 'const db = (await getDb())!;' not in content:
    # Replace each handler opening
    content = re.sub(
        r'(\.(query|mutation)\(async \([^)]*\) => \{)',
        inject_db_init,
        content
    )

# Also need to handle the Promise.all pattern - it uses db directly
# The db variable is now injected per-handler, so it should work

with open('server/routers/terminal.ts', 'w') as f:
    f.write(content)

print("terminal.ts db pattern fixed")

# Count injections
count = content.count('const db = (await getDb())!;')
print(f"Injected {count} db initializations")
