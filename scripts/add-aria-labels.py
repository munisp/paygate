#!/usr/bin/env python3
"""
Add aria-label attributes to icon-only buttons across all pages.
Targets: <Button> and <button> elements that contain only icons (no text).
"""
import os
import re
import glob

pages = glob.glob('client/src/pages/*.tsx') + glob.glob('client/src/components/*.tsx')

# Common icon-only button patterns to fix
# Pattern: <Button ...><SomeIcon ... /></Button> without text
# We'll add aria-label based on context clues in the button

icon_button_patterns = [
    # Copy buttons
    (r'<Button([^>]*?)>\s*<Copy([^/]*)/>\s*</Button>', r'<Button\1 aria-label="Copy">\n                <Copy\2/>\n              </Button>'),
    # Refresh/reload buttons
    (r'<Button([^>]*?)>\s*<RefreshCw([^/]*)/>\s*</Button>', r'<Button\1 aria-label="Refresh">\n                <RefreshCw\2/>\n              </Button>'),
    # Download buttons
    (r'<Button([^>]*?)>\s*<Download([^/]*)/>\s*</Button>', r'<Button\1 aria-label="Download">\n                <Download\2/>\n              </Button>'),
    # Filter buttons
    (r'<Button([^>]*?)>\s*<Filter([^/]*)/>\s*</Button>', r'<Button\1 aria-label="Filter">\n                <Filter\2/>\n              </Button>'),
    # Search buttons
    (r'<Button([^>]*?)>\s*<Search([^/]*)/>\s*</Button>', r'<Button\1 aria-label="Search">\n                <Search\2/>\n              </Button>'),
    # Close buttons
    (r'<Button([^>]*?)>\s*<X([^/]*)/>\s*</Button>', r'<Button\1 aria-label="Close">\n                <X\2/>\n              </Button>'),
    # Edit buttons
    (r'<Button([^>]*?)>\s*<Edit([^/]*)/>\s*</Button>', r'<Button\1 aria-label="Edit">\n                <Edit\2/>\n              </Button>'),
    # Delete/Trash buttons
    (r'<Button([^>]*?)>\s*<Trash([^/]*)/>\s*</Button>', r'<Button\1 aria-label="Delete">\n                <Trash\2/>\n              </Button>'),
    # Plus/Add buttons
    (r'<Button([^>]*?)>\s*<Plus([^/]*)/>\s*</Button>', r'<Button\1 aria-label="Add">\n                <Plus\2/>\n              </Button>'),
    # Settings buttons
    (r'<Button([^>]*?)>\s*<Settings([^/]*)/>\s*</Button>', r'<Button\1 aria-label="Settings">\n                <Settings\2/>\n              </Button>'),
    # Eye/View buttons
    (r'<Button([^>]*?)>\s*<Eye([^/]*)/>\s*</Button>', r'<Button\1 aria-label="View">\n                <Eye\2/>\n              </Button>'),
    # MoreHorizontal/MoreVertical buttons
    (r'<Button([^>]*?)>\s*<MoreHorizontal([^/]*)/>\s*</Button>', r'<Button\1 aria-label="More options">\n                <MoreHorizontal\2/>\n              </Button>'),
    (r'<Button([^>]*?)>\s*<MoreVertical([^/]*)/>\s*</Button>', r'<Button\1 aria-label="More options">\n                <MoreVertical\2/>\n              </Button>'),
    # Send buttons
    (r'<Button([^>]*?)>\s*<Send([^/]*)/>\s*</Button>', r'<Button\1 aria-label="Send">\n                <Send\2/>\n              </Button>'),
    # Check/Approve buttons
    (r'<Button([^>]*?)>\s*<Check([^/]*)/>\s*</Button>', r'<Button\1 aria-label="Confirm">\n                <Check\2/>\n              </Button>'),
    # ChevronLeft/Right navigation
    (r'<Button([^>]*?)>\s*<ChevronLeft([^/]*)/>\s*</Button>', r'<Button\1 aria-label="Previous">\n                <ChevronLeft\2/>\n              </Button>'),
    (r'<Button([^>]*?)>\s*<ChevronRight([^/]*)/>\s*</Button>', r'<Button\1 aria-label="Next">\n                <ChevronRight\2/>\n              </Button>'),
]

total_fixed = 0
files_fixed = 0

for page_path in pages:
    content = open(page_path).read()
    original = content
    
    for pattern, replacement in icon_button_patterns:
        # Only replace if aria-label is not already present in the match
        def replace_if_no_aria(m):
            full_match = m.group(0)
            if 'aria-label' in full_match:
                return full_match
            return re.sub(pattern, replacement, full_match)
        
        # Simple approach: find matches without aria-label
        matches = re.findall(pattern, content)
        if matches:
            # Only replace instances that don't already have aria-label
            def smart_replace(m):
                if 'aria-label' in m.group(0):
                    return m.group(0)
                return re.sub(pattern, replacement, m.group(0))
            content = re.sub(pattern, smart_replace, content)
    
    if content != original:
        open(page_path, 'w').write(content)
        changes = sum(1 for p, _ in icon_button_patterns if re.search(p, original))
        total_fixed += changes
        files_fixed += 1
        print(f"FIXED: {page_path}")

print(f"\nTotal files fixed: {files_fixed}")
print(f"Total patterns applied: {total_fixed}")
