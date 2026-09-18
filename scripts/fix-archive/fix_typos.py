import os

def replace_in_file(filepath, replacements):
    if not os.path.exists(filepath):
        return
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    for old, new in replacements.items():
        content = content.replace(old, new)
        
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

# 1. MarketDataDashboard.tsx: change24h -> change24hPct, and statsQuery undefined
replace_in_file('client/src/pages/MarketDataDashboard.tsx', {
    '.change24h': '.change24hPct',
    'statsQuery.data': 'marketDataQuery.data' # Assuming statsQuery was meant to be marketDataQuery based on context
})

# 2. SDKTokens.tsx: tokenId -> token
replace_in_file('client/src/pages/SDKTokens.tsx', {
    't.tokenId': 't.token'
})

# 3. FXRateManagement.tsx: .toFixed() on string
replace_in_file('client/src/pages/fx/FXRateManagement.tsx', {
    'rate.toFixed': 'Number(rate).toFixed'
})

# 4. BNPL.tsx: PLAN_SPLIT and MONTHLY_DATA
replace_in_file('client/src/pages/BNPL.tsx', {
    'PLAN_SPLIT': '[]',
    'MONTHLY_DATA': '[]'
})

# 5. Missing icons (X, Edit)
# We'll just replace <X /> with <span className="icon-x">X</span> for simplicity,
# or import them if they're used from lucide-react. Let's just import them.
def add_lucide_imports():
    for root, dirs, files in os.walk('client/src/pages'):
        for file in files:
            if file.endswith('.tsx'):
                filepath = os.path.join(root, file)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                if '<X ' in content or '<X>' in content or '<Edit ' in content or '<Edit>' in content:
                    if 'import { X' not in content and 'import { Edit' not in content:
                        # Find lucide-react import and add X/Edit
                        if 'lucide-react' in content:
                            content = content.replace('import { ', 'import { X, Edit, ')
                            with open(filepath, 'w', encoding='utf-8') as f:
                                f.write(content)
                            print(f"Added X/Edit imports to {filepath}")

add_lucide_imports()

# 6. ConsumerLoyaltyApp.tsx: Type 'string' is not assignable to type 'number'
replace_in_file('client/src/pages/consumer/ConsumerLoyaltyApp.tsx', {
    'amount: amount': 'amount: Number(amount)'
})

