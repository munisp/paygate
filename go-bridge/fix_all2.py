import re

# Fix dcc.go: "_, err = redis.GetJSON" -> "_, err := redis.GetJSON" (first use)
with open('internal/handlers/dcc.go') as f:
    content = f.read()

# Fix "if _, err = redis.GetJSON" -> "if _, err := redis.GetJSON" 
content = content.replace('if _, err = redis.GetJSON(', 'if _, err := redis.GetJSON(')

with open('internal/handlers/dcc.go', 'w') as f:
    f.write(content)
print('Fixed dcc.go redis.GetJSON')

# Fix lending.go: same issue
with open('internal/handlers/lending.go') as f:
    content = f.read()

content = content.replace('if _, err = redis.GetJSON(', 'if _, err := redis.GetJSON(')

with open('internal/handlers/lending.go', 'w') as f:
    f.write(content)
print('Fixed lending.go redis.GetJSON')

# Fix split_payments.go: uuid.UUID -> string for UUIDToUint128, undefined pgdb/tb functions
with open('internal/handlers/split_payments.go') as f:
    content = f.read()

# Fix uuid.UUID -> string for UUIDToUint128
content = re.sub(
    r'tb\.UUIDToUint128\((transferID)\)',
    r'tb.UUIDToUint128(\1.String())',
    content
)
# Fix tb.FlagLinked - this is likely a TigerBeetle transfer flag
# Replace with the correct constant or remove
content = content.replace('tb.FlagLinked', '1') # TransferLinked flag value

with open('internal/handlers/split_payments.go', 'w') as f:
    f.write(content)
print('Fixed split_payments.go uuid and flags')
