package handlers

// new_features.go — stub handlers for the 20 new feature endpoints.
// Each handler returns a realistic mock JSON response so the tRPC layer
// gets well-typed data even before the real microservices are deployed.
// Replace the mock bodies with real upstream calls as services come online.

import (
	"fmt"
	"net/http"
	"time"
)

// ─── helpers ─────────────────────────────────────────────────────────────────
// writeJSON and now() are defined in wallet.go — do not redeclare here.

// ─── Digital Gold ────────────────────────────────────────────────────────────

func GetDigitalGoldHoldings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"holdingId": "DG-001", "merchantId": "m1",
		"goldGrams": 5.25, "currentValueKobo": 5250000,
		"purchasedGrams": 5.0, "avgPurchasePricePerGram": 980000,
		"currentPricePerGram": 1000000, "unrealizedPnLKobo": 100000,
		"lastUpdated": time.Now().UTC().Format(time.RFC3339),
	})
}

func BuyDigitalGold(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"transactionId": fmt.Sprintf("DGT-%d", time.Now().UnixMilli()),
		"goldGrams": 0.5, "amountKobo": 500000,
		"pricePerGram": 1000000, "status": "completed", "timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func SellDigitalGold(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"transactionId": fmt.Sprintf("DGS-%d", time.Now().UnixMilli()),
		"goldGrams": 0.5, "proceedsKobo": 495000,
		"pricePerGram": 990000, "status": "completed", "timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func GetDigitalGoldHistory(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"transactions": []map[string]any{
			{"id": "DGT-1", "type": "buy", "goldGrams": 1.0, "amountKobo": 1000000, "pricePerGram": 1000000, "timestamp": time.Now().UTC().Format(time.RFC3339)},
		}, "total": 1,
	})
}

func CreateGoldSIP(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"sipId": fmt.Sprintf("SIP-%d", time.Now().UnixMilli()),
		"status": "active", "nextRunAt": time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339),
	})
}

// ─── Mutual Funds ────────────────────────────────────────────────────────────

func ListMutualFunds(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"funds": []map[string]any{
			{"fundId": "MF-001", "name": "PayGate Growth Fund", "category": "equity", "nav": 125.50, "returns1Y": 18.5, "returns3Y": 52.0, "riskLevel": "moderate", "minInvestmentKobo": 100000, "aum": "₦2.5B"},
			{"fundId": "MF-002", "name": "PayGate Stable Fund", "category": "debt", "nav": 108.20, "returns1Y": 9.2, "returns3Y": 28.5, "riskLevel": "low", "minInvestmentKobo": 50000, "aum": "₦1.2B"},
		}, "total": 2,
	})
}

func GetMutualFundDetails(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"fundId": "MF-001", "name": "PayGate Growth Fund", "category": "equity",
		"nav": 125.50, "returns1Y": 18.5, "returns3Y": 52.0, "returns5Y": 95.0,
		"riskLevel": "moderate", "minInvestmentKobo": 100000, "exitLoad": 1.0,
		"expenseRatio": 1.5, "fundManager": "PayGate AMC",
	})
}

func InvestInMutualFund(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"investmentId": fmt.Sprintf("INV-%d", time.Now().UnixMilli()),
		"units": 7.97, "nav": 125.50, "amountKobo": 1000000,
		"status": "processing", "estimatedSettlement": time.Now().Add(2 * 24 * time.Hour).UTC().Format(time.RFC3339),
	})
}

func GetMutualFundPortfolio(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"totalInvestedKobo": 5000000, "currentValueKobo": 5850000,
		"totalPnLKobo": 850000, "totalPnLPct": 17.0,
		"holdings": []map[string]any{
			{"fundId": "MF-001", "fundName": "PayGate Growth Fund", "units": 39.84, "nav": 125.50, "investedKobo": 5000000, "currentValueKobo": 5000000, "pnLKobo": 850000, "pnLPct": 17.0},
		},
	})
}

func RedeemMutualFund(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"redemptionId": fmt.Sprintf("RED-%d", time.Now().UnixMilli()),
		"units": 3.97, "nav": 125.50, "proceedsKobo": 498000,
		"status": "processing", "estimatedCredit": time.Now().Add(3 * 24 * time.Hour).UTC().Format(time.RFC3339),
	})
}

// ─── Consumer Insurance ──────────────────────────────────────────────────────

func ListInsuranceProducts(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"products": []map[string]any{
			{"productId": "INS-001", "name": "Device Protection", "category": "device", "premiumKobo": 50000, "coverageKobo": 5000000, "duration": "annual", "provider": "PayGate Insurance"},
			{"productId": "INS-002", "name": "Travel Cover", "category": "travel", "premiumKobo": 25000, "coverageKobo": 10000000, "duration": "trip", "provider": "PayGate Insurance"},
		},
	})
}

func PurchaseInsurance(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"policyId": fmt.Sprintf("POL-%d", time.Now().UnixMilli()),
		"status": "active", "startDate": time.Now().UTC().Format(time.RFC3339),
		"endDate": time.Now().Add(365 * 24 * time.Hour).UTC().Format(time.RFC3339),
		"policyNumber": fmt.Sprintf("PG-%d", time.Now().Unix()),
	})
}

func ListInsurancePolicies(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"policies": []map[string]any{
			{"policyId": "POL-001", "productName": "Device Protection", "status": "active", "premiumKobo": 50000, "coverageKobo": 5000000, "startDate": time.Now().UTC().Format(time.RFC3339), "endDate": time.Now().Add(365 * 24 * time.Hour).UTC().Format(time.RFC3339)},
		},
	})
}

func FileClaim(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"claimId": fmt.Sprintf("CLM-%d", time.Now().UnixMilli()),
		"status": "under_review", "estimatedResolution": time.Now().Add(7 * 24 * time.Hour).UTC().Format(time.RFC3339),
	})
}

func ListClaims(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"claims": []map[string]any{}})
}

// ─── Pension / NPS ───────────────────────────────────────────────────────────

func GetPensionAccount(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"accountId": "PEN-001", "rsaPin": "PEN-123456789",
		"balanceKobo": 12500000, "employerContributionKobo": 8000000,
		"employeeContributionKobo": 4500000, "fundType": "fund_ii",
		"pfa": "PayGate PFA", "status": "active",
	})
}

func ContributeToPension(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"contributionId": fmt.Sprintf("CONT-%d", time.Now().UnixMilli()),
		"amountKobo": 100000, "type": "voluntary", "status": "processed", "timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func GetPensionStatement(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"statementId": "STMT-001", "period": "2025",
		"openingBalanceKobo": 10000000, "closingBalanceKobo": 12500000,
		"totalContributionsKobo": 2500000, "investmentReturnsKobo": 0,
		"downloadUrl": "https://cdn.paygate.ng/statements/pension-2025.pdf",
	})
}

func GetPensionFundPerformance(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"funds": []map[string]any{
			{"fundType": "fund_i", "name": "Retirement Savings Fund I", "ytdReturn": 8.5, "nav": 1.25, "riskLevel": "low"},
			{"fundType": "fund_ii", "name": "Retirement Savings Fund II", "ytdReturn": 12.3, "nav": 1.45, "riskLevel": "moderate"},
			{"fundType": "fund_iii", "name": "Retirement Savings Fund III", "ytdReturn": 16.8, "nav": 1.68, "riskLevel": "high"},
		},
	})
}

// ─── Cashback & Rewards ──────────────────────────────────────────────────────

func GetCashbackBalance(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"merchantId": "m1", "cashbackBalanceKobo": 250000,
		"totalEarnedKobo": 1500000, "totalRedeemedKobo": 1250000,
		"pendingKobo": 50000, "tier": "gold",
	})
}

func GetCashbackHistory(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"transactions": []map[string]any{
			{"id": "CB-001", "type": "earn", "amountKobo": 5000, "description": "2% cashback on ₦250,000 sale", "timestamp": time.Now().UTC().Format(time.RFC3339)},
		}, "total": 1,
	})
}

func RedeemCashback(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"redemptionId": fmt.Sprintf("RDEM-%d", time.Now().UnixMilli()),
		"amountKobo": 100000, "status": "credited", "timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func GetMerchantCashbackConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"merchantId": "m1", "cashbackRate": 2.0, "maxCashbackKobo": 50000,
		"minTransactionKobo": 10000, "enabled": true, "categories": []string{"all"},
	})
}

func UpdateMerchantCashbackConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"updated": true, "timestamp": time.Now().UTC().Format(time.RFC3339)})
}

// ─── Voice Payments (Soundbox) ───────────────────────────────────────────────

func RegisterSoundbox(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"deviceId": fmt.Sprintf("SB-%d", time.Now().UnixMilli()),
		"status": "active", "registeredAt": time.Now().UTC().Format(time.RFC3339),
	})
}

func ListSoundboxDevices(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"devices": []map[string]any{
			{"deviceId": "SB-001", "name": "Main Counter", "status": "online", "lastSeen": time.Now().UTC().Format(time.RFC3339), "totalTransactions": 1250, "totalVolumeKobo": 12500000},
		},
	})
}

func ConfigureSoundbox(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"updated": true, "timestamp": time.Now().UTC().Format(time.RFC3339)})
}

func TestSoundboxAudio(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"sent": true, "deviceId": "SB-001", "timestamp": time.Now().UTC().Format(time.RFC3339)})
}

func GetSoundboxStats(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"totalDevices": 3, "onlineDevices": 2, "todayTransactions": 45,
		"todayVolumeKobo": 4500000, "avgResponseMs": 1200,
	})
}

func GetSoundboxAlerts(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"alerts": []map[string]any{}})
}

// ─── Wealth Management ───────────────────────────────────────────────────────

func GetWealthPortfolio(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"totalValueKobo": 25000000, "totalInvestedKobo": 20000000,
		"totalPnLKobo": 5000000, "totalPnLPct": 25.0,
		"allocations": []map[string]any{
			{"assetClass": "equities", "valueKobo": 12500000, "pct": 50.0},
			{"assetClass": "fixed_income", "valueKobo": 7500000, "pct": 30.0},
			{"assetClass": "gold", "valueKobo": 5000000, "pct": 20.0},
		},
	})
}

func GetWealthRecommendations(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"recommendations": []map[string]any{
			{"id": "REC-001", "type": "rebalance", "title": "Rebalance Portfolio", "description": "Your equity allocation is above target. Consider moving 5% to fixed income.", "expectedReturn": 12.5, "riskScore": 4},
		},
	})
}

func GetRiskProfile(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"merchantId": "m1", "riskScore": 6, "riskCategory": "moderate",
		"investmentHorizon": "5-10 years", "lastAssessed": time.Now().UTC().Format(time.RFC3339),
	})
}

func SetRiskProfile(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"updated": true, "riskCategory": "moderate", "timestamp": time.Now().UTC().Format(time.RFC3339)})
}

func GetWealthGoals(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"goals": []map[string]any{
			{"goalId": "GOAL-001", "name": "Business Expansion", "targetAmountKobo": 50000000, "currentAmountKobo": 25000000, "deadline": "2027-01-01", "status": "on_track"},
		},
	})
}

func CreateWealthGoal(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"goalId": fmt.Sprintf("GOAL-%d", time.Now().UnixMilli()),
		"status": "active", "createdAt": time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── EMI Checkout ────────────────────────────────────────────────────────────

func GetEMIPlans(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"plans": []map[string]any{
			{"planId": "EMI-3M", "tenure": 3, "interestRate": 0.0, "processingFeeKobo": 0, "label": "3 Months 0% Interest"},
			{"planId": "EMI-6M", "tenure": 6, "interestRate": 1.5, "processingFeeKobo": 5000, "label": "6 Months"},
			{"planId": "EMI-12M", "tenure": 12, "interestRate": 2.0, "processingFeeKobo": 10000, "label": "12 Months"},
		},
	})
}

func InitiateEMI(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"emiId": fmt.Sprintf("EMI-%d", time.Now().UnixMilli()),
		"status": "active", "firstInstallmentDate": time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339),
		"checkoutUrl": "https://checkout.paygate.ng/emi/test",
	})
}

func GetEMISchedule(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"emiId": "EMI-001", "tenure": 3, "totalAmountKobo": 300000,
		"installments": []map[string]any{
			{"installmentNo": 1, "dueDate": time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339), "amountKobo": 100000, "status": "pending"},
			{"installmentNo": 2, "dueDate": time.Now().Add(60 * 24 * time.Hour).UTC().Format(time.RFC3339), "amountKobo": 100000, "status": "pending"},
			{"installmentNo": 3, "dueDate": time.Now().Add(90 * 24 * time.Hour).UTC().Format(time.RFC3339), "amountKobo": 100000, "status": "pending"},
		},
	})
}

func GetEMIMerchantConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"merchantId": "m1", "enabled": true, "minOrderKobo": 50000,
		"maxOrderKobo": 5000000, "availableTenures": []int{3, 6, 12},
	})
}

func UpdateEMIMerchantConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"updated": true, "timestamp": time.Now().UTC().Format(time.RFC3339)})
}

// ─── Bulk Collections ────────────────────────────────────────────────────────

func CreateBulkCollection(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"collectionId": fmt.Sprintf("BC-%d", time.Now().UnixMilli()),
		"status": "pending", "totalAmount": 0, "count": 0, "createdAt": time.Now().UTC().Format(time.RFC3339),
	})
}

func ListBulkCollections(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"collections": []map[string]any{
			{"collectionId": "BC-001", "name": "January Dues", "status": "completed", "totalAmountKobo": 5000000, "count": 50, "collected": 45, "createdAt": time.Now().UTC().Format(time.RFC3339)},
		}, "total": 1,
	})
}

func GetBulkCollectionDetails(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"collectionId": "BC-001", "name": "January Dues", "status": "completed",
		"totalAmountKobo": 5000000, "count": 50, "collected": 45,
		"items": []map[string]any{
			{"itemId": "BCI-001", "customerName": "John Doe", "amountKobo": 100000, "status": "paid", "paidAt": time.Now().UTC().Format(time.RFC3339)},
		},
	})
}

func SendCollectionReminders(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"sent": 5, "failed": 0, "timestamp": time.Now().UTC().Format(time.RFC3339)})
}

func ExportBulkCollection(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"downloadUrl": "https://cdn.paygate.ng/exports/bulk-collection.csv",
		"expiresAt": time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339),
	})
}

// ─── API Docs Portal ─────────────────────────────────────────────────────────

func GetAPIDocsList(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"categories": []map[string]any{
			{"id": "payments", "name": "Payments", "description": "Accept and process payments", "endpoints": 12, "version": "v2"},
			{"id": "payouts", "name": "Payouts", "description": "Send money to bank accounts", "endpoints": 8, "version": "v1"},
			{"id": "webhooks", "name": "Webhooks", "description": "Real-time event notifications", "endpoints": 4, "version": "v1"},
		},
	})
}

func GetAPIDocsEndpoint(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"endpointId": "pay-001", "method": "POST", "path": "/v2/payments/initiate",
		"description": "Initiate a payment transaction", "version": "v2",
		"parameters": []map[string]any{
			{"name": "amount", "type": "integer", "required": true, "description": "Amount in kobo"},
			{"name": "currency", "type": "string", "required": true, "description": "ISO currency code"},
		},
		"responses": map[string]any{"200": "Payment initiated successfully", "400": "Invalid request"},
		"sampleRequest": `{"amount": 100000, "currency": "NGN", "reference": "ref-001"}`,
		"sampleResponse": `{"transactionId": "TXN-001", "status": "pending", "checkoutUrl": "https://..."}`,
	})
}

func GetAPIChangelog(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"changelog": []map[string]any{
			{"version": "v2.5.0", "date": "2025-01-01", "changes": []string{"Added EMI checkout support", "Improved webhook reliability"}},
			{"version": "v2.4.0", "date": "2024-10-01", "changes": []string{"Added bulk collections", "Added digital gold API"}},
		},
	})
}

func GetAPIUsageStats(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"totalRequests": 125000, "successRate": 99.2, "avgLatencyMs": 145,
		"topEndpoints": []map[string]any{
			{"path": "/v2/payments/initiate", "requests": 50000, "successRate": 99.5},
			{"path": "/v1/payouts/send", "requests": 25000, "successRate": 98.8},
		},
	})
}

func GenerateAPIKey(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"keyId": fmt.Sprintf("KEY-%d", time.Now().UnixMilli()),
		"key": fmt.Sprintf("pg_test_%d", time.Now().UnixNano()),
		"createdAt": time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── Salary Accounts ─────────────────────────────────────────────────────────

func OpenSalaryAccount(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"accountId": fmt.Sprintf("SAL-%d", time.Now().UnixMilli()),
		"accountNumber": fmt.Sprintf("30%d", time.Now().Unix()%100000000),
		"bankName": "PayGate MFB", "status": "active", "createdAt": time.Now().UTC().Format(time.RFC3339),
	})
}

func GetSalaryAccount(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"accountId": "SAL-001", "employeeId": "EMP-001",
		"accountNumber": "3012345678", "bankName": "PayGate MFB",
		"balanceKobo": 500000, "status": "active",
		"salaryKobo": 500000, "nextPayDate": time.Now().Add(15 * 24 * time.Hour).UTC().Format(time.RFC3339),
	})
}

func GetSalaryTransactions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"transactions": []map[string]any{
			{"id": "ST-001", "type": "credit", "amountKobo": 500000, "description": "Salary - January 2025", "timestamp": time.Now().UTC().Format(time.RFC3339)},
		}, "total": 1,
	})
}

func RequestSalaryAdvance(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"advanceId": fmt.Sprintf("ADV-%d", time.Now().UnixMilli()),
		"amountKobo": 250000, "status": "approved",
		"repaymentDate": time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339),
	})
}

// ─── Privacy Payments ────────────────────────────────────────────────────────

func GeneratePrivateID(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"aliasId": fmt.Sprintf("PVT-%d", time.Now().UnixMilli()),
		"alias": fmt.Sprintf("pg-private-%d@paygate.ng", time.Now().Unix()%1000000),
		"expiresAt": time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339),
		"status": "active",
	})
}

func GetPrivacySettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"merchantId": "m1", "privacyMode": "standard",
		"hideBusinessName": false, "hideBankDetails": true,
		"usePrivateAlias": false, "privateAlias": nil,
	})
}

func UpdatePrivacySettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"updated": true, "timestamp": time.Now().UTC().Format(time.RFC3339)})
}

func GetPrivacyHistory(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"transactions": []map[string]any{
			{"id": "PVT-TX-001", "type": "payment", "amountKobo": 100000, "maskedSender": "pg-private-***@paygate.ng", "timestamp": time.Now().UTC().Format(time.RFC3339)},
		}, "total": 1,
	})
}

// ─── Reports Center ──────────────────────────────────────────────────────────

func GenerateTransactionReport(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"reportId": fmt.Sprintf("RPT-%d", time.Now().UnixMilli()),
		"downloadUrl": "https://cdn.paygate.ng/reports/transactions.csv",
		"expiresAt": time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339),
		"rowCount": 1250,
	})
}

func GenerateSettlementReport(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"reportId": fmt.Sprintf("RPT-%d", time.Now().UnixMilli()),
		"downloadUrl": "https://cdn.paygate.ng/reports/settlements.csv",
		"expiresAt": time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339),
		"rowCount": 85,
	})
}

func GenerateCustomerReport(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"reportId": fmt.Sprintf("RPT-%d", time.Now().UnixMilli()),
		"downloadUrl": "https://cdn.paygate.ng/reports/customers.csv",
		"expiresAt": time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339),
		"rowCount": 3200,
	})
}

func GenerateTaxReport(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"reportId": fmt.Sprintf("RPT-%d", time.Now().UnixMilli()),
		"downloadUrl": "https://cdn.paygate.ng/reports/tax.pdf",
		"expiresAt": time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339),
		"totalVatKobo": 125000, "totalWhtKobo": 75000,
	})
}

func ListReports(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"reports": []map[string]any{
			{"reportId": "RPT-001", "type": "transactions", "format": "csv", "from": "2025-01-01", "to": "2025-01-31", "rowCount": 1250, "downloadUrl": "https://cdn.paygate.ng/reports/tx.csv", "expiresAt": time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339), "createdAt": time.Now().UTC().Format(time.RFC3339)},
		}, "total": 1,
	})
}

func GetScheduledReports(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{"schedules": []map[string]any{}})
}

func CreateScheduledReport(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"scheduleId": fmt.Sprintf("SCH-%d", time.Now().UnixMilli()),
		"nextRunAt": time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339),
		"status": "active",
	})
}

// ─── Nodal Accounts ──────────────────────────────────────────────────────────

func CreateNodalAccount(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"accountId": fmt.Sprintf("NOD-%d", time.Now().UnixMilli()),
		"accountNumber": fmt.Sprintf("20%d", time.Now().Unix()%100000000),
		"bankName": "Access Bank", "purpose": "escrow",
		"balanceKobo": 0, "status": "active", "createdAt": time.Now().UTC().Format(time.RFC3339),
	})
}

func ListNodalAccounts(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"accounts": []map[string]any{
			{"accountId": "NOD-001", "accountNumber": "2012345678", "bankName": "Access Bank", "purpose": "escrow", "balanceKobo": 5000000, "status": "active", "createdAt": time.Now().UTC().Format(time.RFC3339)},
		},
	})
}

func GetNodalTransactions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"transactions": []map[string]any{
			{"id": "NT-001", "type": "credit", "amountKobo": 5000000, "narration": "Marketplace escrow deposit", "balance": 5000000, "timestamp": time.Now().UTC().Format(time.RFC3339)},
		}, "total": 1,
	})
}

func TransferFromNodal(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"reference": fmt.Sprintf("NOD-TRF-%d", time.Now().UnixMilli()),
		"status": "processing", "timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── Smart Retail POS ────────────────────────────────────────────────────────

func GetRetailConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"merchantId": "m1", "enabled": true, "printerConnected": true,
		"barcodeScanner": true, "weighingScale": false, "loyaltyIntegration": true,
		"taxRate": 7.5,
	})
}

func ProcessRetailSale(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"saleId": fmt.Sprintf("SALE-%d", time.Now().UnixMilli()),
		"totalAmountKobo": 250000, "status": "completed",
		"receiptUrl": "https://cdn.paygate.ng/receipts/sale.pdf",
		"loyaltyPointsEarned": 25, "timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func GetInventoryAlerts(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"alerts": []map[string]any{
			{"sku": "SKU-001", "productName": "Indomie Noodles", "currentStock": 5, "reorderLevel": 20, "urgency": "high"},
		},
	})
}

func GetDailySalesSummary(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"date": time.Now().Format("2006-01-02"), "totalSalesKobo": 1250000,
		"totalTransactions": 45, "avgTransactionKobo": 27778,
		"topProducts": []map[string]any{
			{"sku": "SKU-001", "name": "Indomie Noodles", "quantity": 120, "revenueKobo": 360000},
		},
	})
}

func PrintReceipt(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"printed": true, "receiptUrl": "https://cdn.paygate.ng/receipts/receipt.pdf", "timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── International Remittance ────────────────────────────────────────────────
// GetRemittanceCorridors, GetRemittanceQuote, GetRemittanceHistory are already
// defined in tier8_handlers.go — only add the new intl-remittance variants.

func InitiateRemittanceTransfer(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"transferId": fmt.Sprintf("TRF-%d", time.Now().UnixMilli()),
		"trackingNumber": fmt.Sprintf("PG%d", time.Now().Unix()),
		"status": "processing", "createdAt": time.Now().UTC().Format(time.RFC3339),
	})
}

func TrackRemittanceTransfer(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"trackingNumber": "PG123456789", "status": "in_transit",
		"estimatedDelivery": time.Now().Add(2 * time.Hour).UTC().Format(time.RFC3339),
		"deliveredAt": nil,
		"statusHistory": []map[string]any{
			{"status": "initiated", "description": "Transfer initiated", "timestamp": time.Now().UTC().Format(time.RFC3339)},
			{"status": "processing", "description": "Funds received by partner", "timestamp": time.Now().UTC().Format(time.RFC3339)},
		},
	})
}

// ─── Subscription Billing V2 ─────────────────────────────────────────────────

func ListSubscriptionPlans(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"plans": []map[string]any{
			{"planId": "PLAN-001", "name": "Starter", "description": "For small businesses", "priceKobo": 999900, "currency": "NGN", "interval": "month", "intervalCount": 1, "trialDays": 14, "features": []string{"Up to 100 transactions/mo", "Basic analytics", "Email support"}, "activeSubscribers": 125, "status": "active"},
			{"planId": "PLAN-002", "name": "Growth", "description": "For growing businesses", "priceKobo": 2999900, "currency": "NGN", "interval": "month", "intervalCount": 1, "trialDays": 7, "features": []string{"Unlimited transactions", "Advanced analytics", "Priority support", "API access"}, "activeSubscribers": 48, "status": "active"},
		},
	})
}

func CreateSubscriptionPlan(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"planId": fmt.Sprintf("PLAN-%d", time.Now().UnixMilli()),
		"status": "active", "createdAt": time.Now().UTC().Format(time.RFC3339),
	})
}

func ListSubscribers(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"subscribers": []map[string]any{
			{"subscriptionId": "SUB-001", "customerId": "CUST-001", "customerName": "Acme Corp", "planName": "Growth", "status": "active", "currentPeriodEnd": time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339), "amountKobo": 2999900, "failedPayments": 0},
		}, "total": 1,
	})
}

func CancelSubscription(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"subscriptionId": "SUB-001", "status": "cancelled",
		"cancelledAt": time.Now().UTC().Format(time.RFC3339), "effectiveDate": time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339),
	})
}

func PauseSubscription(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"subscriptionId": "SUB-001", "status": "paused",
		"resumesAt": time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339),
	})
}

func GetChurnAnalytics(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]any{
		"churnRate": 3.2, "mrr": 47498500, "arr": 569982000,
		"newSubscriptions": 18, "cancelledSubscriptions": 5,
		"netGrowth": 13, "avgSubscriptionLengthDays": 245,
	})
}
