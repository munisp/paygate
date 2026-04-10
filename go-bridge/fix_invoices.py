content = open('internal/handlers/invoices.go').read()

old = 'LineItems:      req.LineItems,\n\t\tSubtotalKobo:'
new = '''LineItems:      func() []pgdb.InvoiceLineItem {
			items := make([]pgdb.InvoiceLineItem, len(req.LineItems))
			for i, li := range req.LineItems {
				items[i] = pgdb.InvoiceLineItem{
					Description:   li.Description,
					Quantity:      li.Quantity,
					UnitPriceKobo: li.UnitPriceKobo,
					TaxPct:        li.TaxPct,
					DiscountPct:   li.DiscountPct,
				}
			}
			return items
		}(),
		SubtotalKobo:'''

if old in content:
    content = content.replace(old, new)
    open('internal/handlers/invoices.go', 'w').write(content)
    print('Fixed LineItems conversion')
else:
    print('Pattern not found, showing context:')
    idx = content.find('LineItems:')
    print(repr(content[max(0,idx-50):idx+100]))
