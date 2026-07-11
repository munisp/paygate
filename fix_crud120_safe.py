import re

def cast_db_calls(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # Find all `.values({ ... })` and `.set({ ... })` and append `as any`
    # Since regex is hard for balanced brackets, we'll do it manually by finding `.values({` and `.set({`
    
    def process_call(text, keyword):
        idx = 0
        while True:
            idx = text.find(keyword, idx)
            if idx == -1:
                break
            
            # Find the matching closing parenthesis for the values() or set() call
            # We know it starts at idx + len(keyword) - 1 (which is the opening parenthesis)
            paren_count = 0
            start_paren = idx + len(keyword) - 1
            end_paren = -1
            
            for i in range(start_paren, len(text)):
                if text[i] == '(':
                    paren_count += 1
                elif text[i] == ')':
                    paren_count -= 1
                    if paren_count == 0:
                        end_paren = i
                        break
            
            if end_paren != -1:
                # Check if it already has 'as any'
                inside = text[start_paren+1:end_paren]
                if not inside.strip().endswith('as any'):
                    # Insert ' as any' before the closing parenthesis
                    text = text[:end_paren] + ' as any' + text[end_paren:]
            
            idx += len(keyword)
            
        return text

    content = process_call(content, '.values(')
    content = process_call(content, '.set(')

    with open(filename, 'w') as f:
        f.write(content)
    print(f"Patched {filename} safely")

cast_db_calls('server/routers/crud119.ts')
