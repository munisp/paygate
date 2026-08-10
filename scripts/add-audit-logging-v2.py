#!/usr/bin/env python3
"""
Add auditedProcedure to financial mutations in routers.ts.
Handles the chained pattern: protectedProcedure\n    .input(...)\n    .mutation(...)
"""
import re

ROUTERS_FILE = "server/routers.ts"

content = open(ROUTERS_FILE).read()

# Step 1: Ensure auditedProcedure is imported
if 'auditedProcedure' not in content:
    content = content.replace(
        'import { protectedProcedure, publicProcedure, router } from "./_core/trpc";',
        'import { protectedProcedure, publicProcedure, router } from "./_core/trpc";\nimport { auditedProcedure } from "./_core/auditMiddleware";'
    )
    print("Added auditedProcedure import")

# Step 2: Find the financial router sections by line number
lines = content.split('\n')

# Find router start/end positions
router_sections = {}
router_starts = {}

for i, line in enumerate(lines):
    for router_name in ['payoutsRouter', 'transactionsRouter', 'disputesRouter', 
                        'virtualCardsRouter', 'paymentLinksRouter', 'apiKeysRouter',
                        'webhooksRouter', 'fraudRiskRouter']:
        if f'const {router_name} = router({{' in line:
            router_starts[router_name] = i
            break

# Find the end of each router (matching braces)
for router_name, start_line in router_starts.items():
    depth = 0
    end_line = start_line
    for i in range(start_line, len(lines)):
        for ch in lines[i]:
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    end_line = i
                    break
        if depth == 0:
            break
    router_sections[router_name] = (start_line, end_line)
    print(f"  {router_name}: lines {start_line}-{end_line}")

# Step 3: Replace protectedProcedure with auditedProcedure for mutations
# in the financial router sections
# Pattern: a line ending with "protectedProcedure" followed eventually by ".mutation("

total_replaced = 0

for router_name, (start, end) in router_sections.items():
    section_lines = lines[start:end+1]
    section = '\n'.join(section_lines)
    
    # Find all occurrences of protectedProcedure that lead to .mutation
    # Pattern: protectedProcedure followed by optional .input(...) then .mutation(
    # We need to find the protectedProcedure and check if it eventually leads to .mutation
    
    # Simple approach: find procedure names that use protectedProcedure and have .mutation
    # in the same "block" (between the procedure name and the next procedure name)
    
    # Split into individual procedure definitions
    # A procedure starts with "  name: protectedProcedure" or "  name: protectedProcedure"
    
    new_section = section
    
    # Find all protectedProcedure occurrences in this section
    # and check if the next .mutation or .query is .mutation
    proc_pattern = re.compile(r'(protectedProcedure)(\s*\n(?:\s+\.[^\n]+\n)*\s+\.mutation\()', re.MULTILINE)
    
    matches = list(proc_pattern.finditer(new_section))
    if matches:
        # Replace from end to start to preserve positions
        for match in reversed(matches):
            new_section = new_section[:match.start(1)] + 'auditedProcedure' + new_section[match.end(1):]
            total_replaced += 1
        
        print(f"  Replaced {len(matches)} mutations in {router_name}")
        
        # Update the lines
        new_lines = new_section.split('\n')
        lines[start:end+1] = new_lines

content = '\n'.join(lines)

print(f"\nTotal mutations replaced: {total_replaced}")
print(f"Remaining protectedProcedure.mutation: {content.count('protectedProcedure.mutation')}")
print(f"auditedProcedure usage: {content.count('auditedProcedure')}")

open(ROUTERS_FILE, 'w').write(content)
print("Done!")
