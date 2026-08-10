import re, glob

# Fix tier6/7/8 handlers: respondJSON(w, data) -> respondJSON(w, http.StatusOK, data)
for fname in ['internal/handlers/tier6_handlers.go', 
              'internal/handlers/tier7_handlers.go',
              'internal/handlers/tier8_handlers.go']:
    try:
        with open(fname) as f:
            content = f.read()
        # Replace respondJSON(w, ...) with respondJSON(w, http.StatusOK, ...)
        # Pattern: respondJSON(w, <expr>) where expr doesn't start with http.Status
        def fix_respond(m):
            args = m.group(1)
            # Check if second arg already has a status code
            if args.startswith('http.Status') or re.match(r'^\d{3}', args):
                return m.group(0)
            return f'respondJSON(w, http.StatusOK, {args})'
        
        content = re.sub(r'respondJSON\(w, ([^)]+)\)', fix_respond, content)
        
        # Make sure http is imported
        if '"net/http"' not in content and 'net/http' not in content:
            content = content.replace('import (', 'import (\n\t"net/http"')
        
        with open(fname, 'w') as f:
            f.write(content)
        print(f'Fixed {fname}')
    except FileNotFoundError:
        print(f'Skipped {fname} (not found)')

# Fix split_payments.go: type mismatch for SplitRecipient and SplitLeg
with open('internal/handlers/split_payments.go') as f:
    content = f.read()

# Replace []SplitRecipient with []pgdb.SplitRecipient in struct literal
# The issue is req.Recipients is []SplitRecipient but pgdb.SplitRuleRecord.Recipients is []pgdb.SplitRecipient
# Solution: convert by using the handler type directly or make pgdb use handler types
# Simplest fix: make SplitRuleRecord.Recipients use json.RawMessage or interface{}
# Better fix: convert the slice
old_create = '''	if err := pgdb.CreateSplitRule(ctx, pgdb.SplitRuleRecord{
		RuleID:      ruleID,
		RuleName:    req.RuleName,
		Description: req.Description,
		Recipients:  req.Recipients,
		CreatedBy:   req.CreatedBy,
		IsActive:    true,
	})'''

new_create = '''	pgdbRecipients := make([]pgdb.SplitRecipient, len(req.Recipients))
	for i, r := range req.Recipients {
		pgdbRecipients[i] = pgdb.SplitRecipient{
			MerchantID: r.MerchantID,
			Label:      r.Label,
			SharePct:   r.SharePct,
			FixedKobo:  r.FixedKobo,
		}
	}
	if err := pgdb.CreateSplitRule(ctx, pgdb.SplitRuleRecord{
		RuleID:      ruleID,
		RuleName:    req.RuleName,
		Description: req.Description,
		Recipients:  pgdbRecipients,
		CreatedBy:   req.CreatedBy,
		IsActive:    true,
	})'''

if old_create in content:
    content = content.replace(old_create, new_create)
    print('Fixed SplitRecipient type conversion')
else:
    print('SplitRecipient pattern not found')

# Fix SplitLeg type mismatch
old_legs = '''	if err := pgdb.RecordSplitPayment(ctx, pgdb.SplitPaymentRecord{
		SplitPaymentID:  splitPaymentID,
		SplitRuleID:     req.SplitRuleID,
		TotalAmountKobo: req.TotalAmountKobo,
		Reference:       req.Reference,
		Legs:            legs,
		Status:          "completed",
	})'''

new_legs = '''	pgdbLegs := make([]pgdb.SplitLeg, len(legs))
	for i, l := range legs {
		pgdbLegs[i] = pgdb.SplitLeg{
			MerchantID: l.MerchantID,
			Label:      l.Label,
			AmountKobo: l.AmountKobo,
			TransferID: l.TransferID,
			Status:     l.Status,
		}
	}
	if err := pgdb.RecordSplitPayment(ctx, pgdb.SplitPaymentRecord{
		SplitPaymentID:  splitPaymentID,
		SplitRuleID:     req.SplitRuleID,
		TotalAmountKobo: req.TotalAmountKobo,
		Reference:       req.Reference,
		Legs:            pgdbLegs,
		Status:          "completed",
	})'''

if old_legs in content:
    content = content.replace(old_legs, new_legs)
    print('Fixed SplitLeg type conversion')
else:
    print('SplitLeg pattern not found')

with open('internal/handlers/split_payments.go', 'w') as f:
    f.write(content)
print('Wrote split_payments.go')
