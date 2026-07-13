import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We want to replace:
    #   enabled: isAdmin,
    # }, { staleTime: 30_000 });
    # with:
    #   enabled: isAdmin,
    #   staleTime: 30_000
    # });
    
    # Simple regex to merge the two objects
    # This looks for }, { staleTime: ... } and replaces it with , staleTime: ... }
    original = content
    content = re.sub(r'\}, \s*{\s*staleTime:', ', staleTime:', content)
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk('client/src/pages'):
    for file in files:
        if file.endswith('.tsx'):
            process_file(os.path.join(root, file))
