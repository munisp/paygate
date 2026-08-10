import re

# Fix dcc.go: redis.GetJSON returns 2 values, and dbRate.Rate -> dbRate.MidRate
with open('internal/handlers/dcc.go') as f:
    content = f.read()

# Fix redis.GetJSON assignment mismatch - it returns (bool, error)
# Pattern: "err := redis.GetJSON(...)" -> "_, err := redis.GetJSON(...)"
content = re.sub(
    r'(\s+)(err) := redis\.GetJSON\(',
    r'\1_, \2 = redis.GetJSON(',
    content
)
# Also handle "ok := redis.GetJSON(...)" -> "ok, _ := redis.GetJSON(...)"
content = re.sub(
    r'(\s+)(ok) := redis\.GetJSON\(',
    r'\1\2, _ := redis.GetJSON(',
    content
)
# Fix dbRate.Rate -> dbRate.MidRate
content = content.replace('dbRate.Rate', 'dbRate.MidRate')

with open('internal/handlers/dcc.go', 'w') as f:
    f.write(content)
print('Fixed dcc.go')

# Fix lending.go: uuid.UUID to string for UUIDToUint128, redis.GetJSON mismatch
with open('internal/handlers/lending.go') as f:
    content = f.read()

# Fix uuid.UUID -> string for UUIDToUint128
content = re.sub(
    r'tb\.UUIDToUint128\((transferID|repaymentID)\)',
    r'tb.UUIDToUint128(\1.String())',
    content
)
# Fix redis.GetJSON assignment mismatch
content = re.sub(
    r'(\s+)(err) := redis\.GetJSON\(',
    r'\1_, \2 = redis.GetJSON(',
    content
)
content = re.sub(
    r'(\s+)(ok) := redis\.GetJSON\(',
    r'\1\2, _ := redis.GetJSON(',
    content
)

with open('internal/handlers/lending.go', 'w') as f:
    f.write(content)
print('Fixed lending.go')

# Fix embedded_finance.go: merchant.KYBStatus, balance fields
with open('internal/handlers/embedded_finance.go') as f:
    content = f.read()

# Fix merchant.KYBStatus -> merchant.KYCStatus or similar
# Check what fields MerchantProfile has
content = content.replace('merchant.KYBStatus', 'merchant.KYCStatus')

# Fix balance.AvailableKobo, balance.LedgerKobo, balance.AccountID
# GetConsumerBalance returns int64, not a struct
# Need to wrap the int64 in a struct response
old_balance = '''	balance, err := pgdb.GetConsumerBalance(ctx, customerID)
	if err != nil {
		http.Error(w, `{"error":"failed to get balance"}`, http.StatusInternalServerError)
		return
	}'''
new_balance = '''	balanceKobo, err := pgdb.GetConsumerBalance(ctx, customerID)
	if err != nil {
		http.Error(w, `{"error":"failed to get balance"}`, http.StatusInternalServerError)
		return
	}
	balance := struct {
		AvailableKobo int64
		LedgerKobo    int64
		AccountID     string
	}{
		AvailableKobo: balanceKobo,
		LedgerKobo:    balanceKobo,
		AccountID:     customerID,
	}'''

if old_balance in content:
    content = content.replace(old_balance, new_balance)
    print('Fixed balance struct in embedded_finance.go')
else:
    print('Balance pattern not found, trying alternative fix')
    # Direct field replacement
    content = content.replace('balance.AvailableKobo', 'balanceKobo')
    content = content.replace('balance.LedgerKobo', 'balanceKobo')
    content = content.replace('balance.AccountID', 'customerID')
    # Fix the balance variable name
    content = content.replace(
        'balance, err := pgdb.GetConsumerBalance(ctx, customerID)',
        'balanceKobo, err := pgdb.GetConsumerBalance(ctx, customerID)'
    )
    print('Applied direct field replacement for balance')

with open('internal/handlers/embedded_finance.go', 'w') as f:
    f.write(content)
print('Fixed embedded_finance.go')
