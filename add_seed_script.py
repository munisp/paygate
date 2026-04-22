import json

with open('package.json', 'r') as f:
    pkg = json.load(f)

if 'db:seed' not in pkg['scripts']:
    pkg['scripts']['db:seed'] = 'tsx drizzle/seed.ts'
    with open('package.json', 'w') as f:
        json.dump(pkg, f, indent=2)
        f.write('\n')
    print('Added db:seed script')
else:
    print('db:seed already exists:', pkg['scripts']['db:seed'])
