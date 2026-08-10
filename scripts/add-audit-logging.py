#!/usr/bin/env python3
"""
Add auditedProcedure import and replace protectedProcedure.mutation with 
auditedProcedure.mutation for financial operations in routers.ts.

Financial mutations are those in routers: payouts, transactions, disputes, 
virtualCards, paymentLinks, bnpl, fraud, kyc, settlements, apiKeys, webhooks.
"""
import re

ROUTERS_FILE = "server/routers.ts"

content = open(ROUTERS_FILE).read()

# Step 1: Add auditedProcedure import if not present
if 'auditedProcedure' not in content:
    # Add after the protectedProcedure import
    content = content.replace(
        'import { protectedProcedure, publicProcedure, router } from "./_core/trpc";',
        'import { protectedProcedure, publicProcedure, router } from "./_core/trpc";\nimport { auditedProcedure } from "./_core/auditMiddleware";'
    )
    print("Added auditedProcedure import")
else:
    print("auditedProcedure already imported")

# Step 2: Find financial router sections and replace protectedProcedure.mutation
# We'll target specific financial mutation patterns in payouts, transactions, disputes, 
# virtualCards, paymentLinks, apiKeys, webhooks, settlements, fraud, kyc routers

# The approach: find lines with protectedProcedure.mutation in financial contexts
# by looking for the pattern within the financial router definitions

financial_routers = [
    'payoutsRouter',
    'transactionsRouter', 
    'disputesRouter',
    'virtualCardsRouter',
    'paymentLinksRouter',
    'apiKeysRouter',
    'webhooksRouter',
    'fraudRiskRouter',
    'bnplRouter',
    'kycRouter',
    'settlementRouter',
]

# Count mutations before
before_count = content.count('protectedProcedure.mutation')
print(f"Mutations using protectedProcedure before: {before_count}")

# Replace protectedProcedure.mutation with auditedProcedure.mutation
# in the financial router sections only
# We'll do this by finding each router's section and replacing within it

def replace_in_router_section(content, router_name):
    """Replace protectedProcedure.mutation with auditedProcedure.mutation within a router section."""
    # Find the router definition
    pattern = rf'const {router_name} = router\({{'
    match = re.search(pattern, content)
    if not match:
        return content, 0
    
    start = match.start()
    
    # Find the end of this router (matching closing brace)
    depth = 0
    i = match.end() - 1  # Start at the opening brace
    while i < len(content):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
        i += 1
    else:
        return content, 0
    
    # Replace within this section
    section = content[start:end]
    new_section = section.replace('protectedProcedure.mutation', 'auditedProcedure.mutation')
    count = section.count('protectedProcedure.mutation')
    
    if count > 0:
        content = content[:start] + new_section + content[end:]
        print(f"  Replaced {count} mutations in {router_name}")
    
    return content, count

total_replaced = 0
for router_name in financial_routers:
    content, count = replace_in_router_section(content, router_name)
    total_replaced += count

print(f"\nTotal mutations replaced: {total_replaced}")

after_count = content.count('protectedProcedure.mutation')
print(f"Mutations using protectedProcedure after: {after_count}")
print(f"Mutations using auditedProcedure: {content.count('auditedProcedure.mutation')}")

open(ROUTERS_FILE, 'w').write(content)
print("\nDone!")
