#!/usr/bin/env python3
"""
Add toast notifications to pages that are missing them.
For pages with mutations, add onError toast handlers.
For pages without mutations, add a toast import and basic error handling.
"""
import os
import re

pages_to_fix = [
    "client/src/pages/AIInsightsV2.tsx",
    "client/src/pages/BNPLRepaymentPage.tsx",
    "client/src/pages/BillingAnalytics.tsx",
    "client/src/pages/ConsumerAnalytics.tsx",
    "client/src/pages/GoLiveChecklist.tsx",
    "client/src/pages/InsuranceClaims.tsx",
    "client/src/pages/KioskHealth.tsx",
    "client/src/pages/MiddlewareDashboard.tsx",
    "client/src/pages/SettlementForecast.tsx",
    "client/src/pages/SplitBillV2.tsx",
    "client/src/pages/StaffManagement.tsx",
    "client/src/pages/SubscriptionsPage.tsx",
    "client/src/pages/SupportChat.tsx",
    "client/src/pages/TaxEngine.tsx",
    "client/src/pages/TaxFilingV2.tsx",
    "client/src/pages/TerminalMap.tsx",
    "client/src/pages/TransactionReceipt.tsx",
    "client/src/pages/TransactionReceiptsV2.tsx",
    "client/src/pages/UsdcV3.tsx",
    "client/src/pages/WebhookSimulatorV2.tsx",
]

fixed = 0
for page_path in pages_to_fix:
    if not os.path.exists(page_path):
        print(f"SKIP (not found): {page_path}")
        continue
    
    content = open(page_path).read()
    
    # Check if it already has toast (double-check)
    if 'toast.' in content:
        print(f"SKIP (already has toast): {page_path}")
        continue
    
    # Add sonner toast import
    if 'from "sonner"' in content or "from 'sonner'" in content:
        # Already has sonner import, just add toast to it
        content = re.sub(
            r'import \{ ([^}]+) \} from ["\']sonner["\']',
            lambda m: f'import {{ {m.group(1)}, toast }} from "sonner"' if 'toast' not in m.group(1) else m.group(0),
            content
        )
    else:
        # Add sonner import after the first import line
        first_import_end = content.find('\n', content.find('import '))
        if first_import_end > 0:
            content = content[:first_import_end+1] + 'import { toast } from "sonner";\n' + content[first_import_end+1:]
    
    # Find useMutation calls and add onError handlers
    # Pattern: .useMutation() or .useMutation({...})
    has_mutation = '.useMutation(' in content
    
    if has_mutation:
        # Find mutations without onError and add them
        # Simple pattern: useMutation() with no options -> add onError
        content = re.sub(
            r'\.useMutation\(\)',
            '.useMutation({ onError: (e) => toast.error(e.message) })',
            content
        )
        
        # For mutations with options but no onError
        def add_on_error(m):
            full = m.group(0)
            if 'onError' in full:
                return full
            # Add onError before the closing }
            return full.rstrip(')').rstrip('}').rstrip() + ',\n      onError: (e) => toast.error(e.message),\n    })'
        
        content = re.sub(
            r'\.useMutation\(\{[^}]+\}\)',
            add_on_error,
            content
        )
    
    # For query errors, add error handling
    has_query = '.useQuery(' in content
    if has_query and 'error' not in content.lower():
        # Add a simple error display using useEffect
        # Find the first useQuery destructuring and add error
        content = re.sub(
            r'const \{ ([^}]+) \} = trpc\.',
            lambda m: f'const {{ {m.group(1)}, error }} = trpc.' if 'error' not in m.group(1) else m.group(0),
            content,
            count=1
        )
        
        # Add useEffect for error toast if not present
        if 'useEffect' not in content and 'error' in content:
            # Add useEffect import
            content = re.sub(
                r"import React",
                "import React, { useEffect }",
                content
            )
            if 'useEffect' not in content:
                content = re.sub(
                    r"from 'react'",
                    "from 'react'",
                    content
                )
    
    open(page_path, 'w').write(content)
    print(f"FIXED: {page_path}")
    fixed += 1

print(f"\nTotal fixed: {fixed}/{len(pages_to_fix)}")
