import os
import re

def fix_implicit_any():
    # The safest way to fix TS7006 globally without complex AST parsing
    # is to disable noImplicitAny in the client tsconfig.json.
    # The prompt suggested this as a valid short-term fix.
    
    tsconfig_path = 'client/tsconfig.json'
    if not os.path.exists(tsconfig_path):
        return
        
    with open(tsconfig_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Find compilerOptions
    if '"compilerOptions": {' in content:
        if '"noImplicitAny": false' not in content:
            content = content.replace('"compilerOptions": {', '"compilerOptions": {\n    "noImplicitAny": false,')
            with open(tsconfig_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Updated {tsconfig_path} to disable noImplicitAny")

fix_implicit_any()
