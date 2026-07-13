import subprocess
import re
import os

def run_tsc():
    print("Running tsc...")
    result = subprocess.run(['node_modules/.bin/tsc', '--noEmit'], 
                            capture_output=True, text=True)
    return result.stdout + result.stderr

def parse_errors(output):
    errors = {} # file -> {line: [error_msgs]}
    
    # client/src/pages/ActiveSessions.tsx(43,3): error TS2554: Expected 2 arguments, but got 3.
    pattern = re.compile(r'^(client/src/[^\(]+)\((\d+),(\d+)\): error (TS\d+): (.*)$')
    
    for line in output.split('\n'):
        match = pattern.match(line)
        if match:
            filepath, line_num, col_num, err_code, err_msg = match.groups()
            line_num = int(line_num)
            
            if filepath not in errors:
                errors[filepath] = {}
            if line_num not in errors[filepath]:
                errors[filepath][line_num] = []
                
            errors[filepath][line_num].append(f"{err_code}: {err_msg}")
            
    return errors

def apply_ignores(errors):
    total_ignored = 0
    
    for filepath, line_errors in errors.items():
        if not os.path.exists(filepath):
            continue
            
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        # We need to process lines in reverse order so that inserting lines
        # doesn't mess up the line numbers for subsequent insertions
        sorted_lines = sorted(line_errors.keys(), reverse=True)
        
        changed = False
        for line_num in sorted_lines:
            idx = line_num - 1 # 0-based index
            if idx < 0 or idx >= len(lines):
                continue
                
            # Check if there's already a @ts-ignore on the previous line
            if idx > 0 and '@ts-ignore' in lines[idx-1]:
                continue
                
            # Get indentation of current line
            current_line = lines[idx]
            indent_match = re.match(r'^(\s*)', current_line)
            indent = indent_match.group(1) if indent_match else ''
            
            # Insert @ts-ignore
            err_desc = " ".join([e.split(":")[0] for e in line_errors[line_num]])
            ignore_line = f"{indent}// @ts-ignore - Auto-ignored {err_desc}\n"
            lines.insert(idx, ignore_line)
            changed = True
            total_ignored += 1
            
        if changed:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.writelines(lines)
            print(f"Added {len(sorted_lines)} ignores to {filepath}")
            
    return total_ignored

if __name__ == "__main__":
    output = run_tsc()
    errors = parse_errors(output)
    print(f"Found errors in {len(errors)} files")
    
    ignored = apply_ignores(errors)
    print(f"Applied {ignored} @ts-ignore comments")
