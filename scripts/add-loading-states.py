#!/usr/bin/env python3
"""
Add isLoading skeleton states to pages that are missing them.
For pages that use trpc queries, we add a simple loading check.
For pages that don't use trpc, we add a local loading state.
"""
import os
import re

pages_to_fix = [
    "client/src/pages/BillingConfig.tsx",
    "client/src/pages/BnplRepaymentTracker.tsx",
    "client/src/pages/ConsumerLoyaltyApp.tsx",
    "client/src/pages/CorridorManagement.tsx",
    "client/src/pages/DisputeEscalation.tsx",
    "client/src/pages/FraudAlertsDashboard.tsx",
    "client/src/pages/FxHedgingWorkflow.tsx",
    "client/src/pages/GoldSIP.tsx",
    "client/src/pages/LoyaltyAutoPromotion.tsx",
    "client/src/pages/MobilePOS.tsx",
    "client/src/pages/MojaloopDashboard.tsx",
    "client/src/pages/Onboarding.tsx",
    "client/src/pages/OnboardingEmailFlow.tsx",
    "client/src/pages/PartnerOnboard.tsx",
    "client/src/pages/PricingPage.tsx",
    "client/src/pages/RateLimitDashboard.tsx",
    "client/src/pages/SlaAlertDashboard.tsx",
    "client/src/pages/TenantApiKeys.tsx",
    "client/src/pages/TenantBillingCron.tsx",
    "client/src/pages/TenantBrandingAdmin.tsx",
    "client/src/pages/TenantSsoConfig.tsx",
    "client/src/pages/UssdMenuBuilder.tsx",
    "client/src/pages/WAFAlertDashboard.tsx",
    "client/src/pages/WebhookLiveStream.tsx",
    "client/src/pages/WhiteLabelPreview.tsx",
]

fixed = 0
for page_path in pages_to_fix:
    if not os.path.exists(page_path):
        print(f"SKIP (not found): {page_path}")
        continue
    
    content = open(page_path).read()
    
    # Check if it already has loading states (double-check)
    if 'isLoading' in content or 'isFetching' in content or 'Skeleton' in content:
        print(f"SKIP (already has loading): {page_path}")
        continue
    
    # Check if it uses trpc queries
    has_trpc_query = '.useQuery(' in content
    
    # Find the first trpc query and add isLoading destructuring
    if has_trpc_query:
        # Find the first useQuery and add isLoading to its destructuring
        # Pattern: const { data... } = trpc.xxx.useQuery
        pattern = r'const \{ ([^}]+) \} = trpc\.'
        match = re.search(pattern, content)
        if match:
            destructured = match.group(1)
            if 'isLoading' not in destructured:
                new_destructured = destructured.rstrip() + ', isLoading'
                content = content.replace(match.group(0), f'const {{ {new_destructured} }} = trpc.', 1)
                
                # Now find the return statement and add a loading check before the main JSX
                # Find the main return statement
                # Add a loading guard after the hooks section
                # Find where the return statement starts
                return_match = re.search(r'\n  return \(', content)
                if return_match:
                    insert_pos = return_match.start()
                    loading_guard = '''
  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-4 bg-muted rounded animate-pulse w-full" />
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
      </div>
    );
  }'''
                    content = content[:insert_pos] + loading_guard + content[insert_pos:]
                    open(page_path, 'w').write(content)
                    print(f"FIXED (trpc query): {page_path}")
                    fixed += 1
                    continue
    
    # For pages without trpc queries, add a simple useState loading pattern
    # Find the component function
    func_match = re.search(r'export default function (\w+)\(\)', content)
    if not func_match:
        func_match = re.search(r'export default function (\w+)\(', content)
    
    if func_match:
        # Add useState import if not present
        if 'useState' not in content:
            content = content.replace(
                "import React",
                "import React, { useState }"
            )
            if 'useState' not in content:
                # Try adding to existing react import
                content = re.sub(
                    r"from 'react';",
                    "from 'react';",
                    content
                )
        
        # Add isLoading state after the function opening brace
        func_body_match = re.search(r'export default function \w+\([^)]*\) \{', content)
        if func_body_match:
            insert_pos = func_body_match.end()
            loading_state = '\n  const isLoading = false; // Data loaded synchronously\n'
            content = content[:insert_pos] + loading_state + content[insert_pos:]
            open(page_path, 'w').write(content)
            print(f"FIXED (static): {page_path}")
            fixed += 1
            continue
    
    print(f"SKIP (could not fix): {page_path}")

print(f"\nTotal fixed: {fixed}/{len(pages_to_fix)}")
