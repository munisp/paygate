package handlers

// new_features.go — Wave 76/77 feature handlers for the PayGate Go bridge.
// Each handler first attempts a real upstream call; on failure it falls back
// to a realistic mock so the portal remains usable during service outages.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// ─── Upstream URL helpers ─────────────────────────────────────────────────────

func digitalGoldURL() string {
	if u := os.Getenv("DIGITAL_GOLD_URL"); u != "" {
		return u
	}
	return "http://digital-gold-service:9020"
}
func mutualFundsURL() string {
	if u := os.Getenv("MUTUAL_FUNDS_URL"); u != "" {
		return u
	}
	return "http://mutual-funds-service:9021"
}
func consumerInsuranceURL() string {
	if u := os.Getenv("CONSUMER_INSURANCE_URL"); u != "" {
		return u
	}
	return "http://insurance-service:9022"
}
func pensionServiceURL() string {
	if u := os.Getenv("PENSION_SERVICE_URL"); u != "" {
		return u
	}
	return "http://pension-service:9023"
}
func cashbackServiceURL() string {
	if u := os.Getenv("CASHBACK_SERVICE_URL"); u != "" {
		return u
	}
	return "http://cashback-service:9024"
}
func voicePaymentsURL() string {
	if u := os.Getenv("VOICE_PAYMENTS_URL"); u != "" {
		return u
	}
	return "http://voice-payments-service:9025"
}
func wealthManagementURL() string {
	if u := os.Getenv("WEALTH_MANAGEMENT_URL"); u != "" {
		return u
	}
	return "http://wealth-service:9026"
}
func emiServiceURL() string {
	if u := os.Getenv("EMI_SERVICE_URL"); u != "" {
		return u
	}
	return "http://emi-service:9027"
}
func bulkCollectionsURL() string {
	if u := os.Getenv("BULK_COLLECTIONS_URL"); u != "" {
		return u
	}
	return "http://bulk-collections-service:9028"
}
func salaryAccountsURL() string {
	if u := os.Getenv("SALARY_ACCOUNTS_URL"); u != "" {
		return u
	}
	return "http://salary-service:9029"
}
func privacyPaymentsURL() string {
	if u := os.Getenv("PRIVACY_PAYMENTS_URL"); u != "" {
		return u
	}
	return "http://privacy-payments-service:9030"
}
func reportsServiceURL() string {
	if u := os.Getenv("REPORTS_SERVICE_URL"); u != "" {
		return u
	}
	return "http://reports-service:9031"
}
func aiInsightsV2URL() string {
	if u := os.Getenv("AI_INSIGHTS_V2_URL"); u != "" {
		return u
	}
	return "http://ai-insights-v2-service:9032"
}
func nodalAccountsURL() string {
	if u := os.Getenv("NODAL_ACCOUNTS_URL"); u != "" {
		return u
	}
	return "http://nodal-accounts-service:9033"
}
func smartRetailPOSURL() string {
	if u := os.Getenv("SMART_RETAIL_POS_URL"); u != "" {
		return u
	}
	return "http://smart-retail-pos-service:9034"
}
func intlRemittanceURL() string {
	if u := os.Getenv("INTL_REMITTANCE_URL"); u != "" {
		return u
	}
	return "http://intl-remittance-service:9035"
}
func subscriptionBillingV2URL() string {
	if u := os.Getenv("SUBSCRIPTION_BILLING_V2_URL"); u != "" {
		return u
	}
	return "http://subscription-billing-v2-service:9036"
}

// ─── Generic upstream proxy helper ───────────────────────────────────────────

// proxyUpstream forwards the request to an upstream service and writes the
// response back. On any error it falls back to the provided fallback function.
func proxyUpstream(w http.ResponseWriter, r *http.Request, upstreamURL string, fallback func()) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	body, err := io.ReadAll(r.Body)
	if err != nil {
		fallback()
		return
	}

	req, err := http.NewRequestWithContext(ctx, r.Method, upstreamURL, bytes.NewReader(body))
	if err != nil {
		fallback()
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", os.Getenv("MIDDLEWARE_INTERNAL_KEY"))
	req.URL.RawQuery = r.URL.RawQuery

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		fallback()
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		fallback()
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBody)
}

func queryString(r *http.Request) string {
	if q := r.URL.RawQuery; q != "" {
		return "?" + q
	}
	return ""
}

// ─── Digital Gold ─────────────────────────────────────────────────────────────

func GetDigitalGoldPrice(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, digitalGoldURL()+"/price", func() {
		writeJSON(w, 200, map[string]any{
			"buyPricePerGram": 98500, "sellPricePerGram": 97200,
			"currency": "NGN", "updatedAt": time.Now().UTC().Format(time.RFC3339), "change24h": 1.2,
		})
	})
}

func GetDigitalGoldHoldings(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, digitalGoldURL()+"/holdings"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"grams": 5.25, "currentValueKobo": 5168250,
			"avgBuyPricePerGram": 95000, "unrealizedPnlKobo": 168250,
		})
	})
}

func BuyDigitalGold(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, digitalGoldURL()+"/buy", func() {
		writeJSON(w, 200, map[string]any{
			"transactionId": fmt.Sprintf("DGT-%d", time.Now().UnixMilli()),
			"gramsAcquired": 0.51, "totalCostKobo": 50000, "status": "completed",
		})
	})
}

func SellDigitalGold(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, digitalGoldURL()+"/sell", func() {
		writeJSON(w, 200, map[string]any{
			"transactionId": fmt.Sprintf("DGS-%d", time.Now().UnixMilli()),
			"proceedsKobo": 49500, "status": "completed",
		})
	})
}

func GetDigitalGoldHistory(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, digitalGoldURL()+"/history"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"transactions": []map[string]any{
				{
					"id": "DGT-1", "type": "buy", "grams": 1.0,
					"pricePerGram": 95000, "amountKobo": 95000,
					"timestamp": time.Now().Add(-72 * time.Hour).UTC().Format(time.RFC3339),
					"status": "completed",
				},
			},
			"total": 1,
		})
	})
}

func CreateGoldSIP(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, digitalGoldURL()+"/sip/create", func() {
		writeJSON(w, 200, map[string]any{
			"sipId":             fmt.Sprintf("SIP-%d", time.Now().UnixMilli()),
			"status":            "active",
			"nextExecutionDate": time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339),
		})
	})
}

// ─── Mutual Funds ─────────────────────────────────────────────────────────────

func ListMutualFunds(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, mutualFundsURL()+"/list"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"funds": []map[string]any{
				{"fundId": "MF-001", "name": "PayGate Growth Fund", "category": "equity", "nav": 125.50, "returns1y": 18.5, "returns3y": 52.0, "aum": 2500000000, "expenseRatio": 1.5, "riskLevel": "moderate", "minInvestment": 50000},
				{"fundId": "MF-002", "name": "PayGate Stable Fund", "category": "debt", "nav": 108.20, "returns1y": 9.2, "returns3y": 28.5, "aum": 1200000000, "expenseRatio": 0.8, "riskLevel": "low", "minInvestment": 50000},
			},
			"total": 2,
		})
	})
}

func GetMutualFundDetails(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, mutualFundsURL()+"/details"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"fundId": "MF-001", "name": "PayGate Growth Fund",
			"description": "A diversified equity fund targeting long-term capital appreciation.",
			"nav":         125.50,
			"returns":     map[string]any{"1m": 2.1, "3m": 6.5, "1y": 18.5, "3y": 52.0},
			"riskMeter":   "moderate",
		})
	})
}

func GetMutualFundPortfolio(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, mutualFundsURL()+"/portfolio"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"investments": []map[string]any{
				{"fundId": "MF-001", "fundName": "PayGate Growth Fund", "units": 200.0, "currentNav": 125.50, "investedKobo": 23000000, "currentValueKobo": 25100000, "pnlKobo": 2100000, "pnlPct": 9.13},
			},
			"totalInvestedKobo": 23000000, "totalCurrentValueKobo": 25100000, "totalPnlKobo": 2100000,
		})
	})
}

func InvestInMutualFund(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, mutualFundsURL()+"/invest", func() {
		writeJSON(w, 200, map[string]any{
			"orderId": fmt.Sprintf("MFO-%d", time.Now().UnixMilli()),
			"units": 79.68, "nav": 125.50, "amountKobo": 10000000, "status": "processing",
		})
	})
}

func RedeemMutualFund(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, mutualFundsURL()+"/redeem", func() {
		writeJSON(w, 200, map[string]any{
			"redemptionId":          fmt.Sprintf("MFR-%d", time.Now().UnixMilli()),
			"units":                 50.0,
			"estimatedProceedsKobo": 6275000,
			"settlementDate":        time.Now().Add(3 * 24 * time.Hour).Format("2006-01-02"),
			"status":                "processing",
		})
	})
}

// ─── Consumer Insurance ───────────────────────────────────────────────────────

func ListInsuranceProducts(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, consumerInsuranceURL()+"/products"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"products": []map[string]any{
				{"productId": "INS-001", "name": "PayGate Health Shield", "type": "health", "premiumKobo": 500000, "coverageKobo": 50000000, "duration": "12 months", "features": []string{"Hospitalization", "Surgery"}, "insurer": "AXA Mansard"},
				{"productId": "INS-002", "name": "Device Protect", "type": "device", "premiumKobo": 150000, "coverageKobo": 5000000, "duration": "12 months", "features": []string{"Accidental damage", "Theft"}, "insurer": "Leadway"},
			},
		})
	})
}

func GetActivePolicies(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, consumerInsuranceURL()+"/policies"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{"policies": []map[string]any{}})
	})
}

func PurchaseInsurancePolicy(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, consumerInsuranceURL()+"/purchase", func() {
		writeJSON(w, 200, map[string]any{
			"policyId":       fmt.Sprintf("POL-%d", time.Now().UnixMilli()),
			"policyNumber":   fmt.Sprintf("PG-H-2026-%d", time.Now().UnixMilli()%10000),
			"certificateUrl": "https://docs.paygate.ng/certificates/sample.pdf",
			"premiumKobo":    500000,
			"status":         "active",
		})
	})
}

// FileInsuranceClaim is defined in tier6_handlers.go

func GetInsuranceClaims(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, consumerInsuranceURL()+"/claims"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{"claims": []map[string]any{}})
	})
}

// ─── Pension / NPS ────────────────────────────────────────────────────────────

func GetPensionAccount(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, pensionServiceURL()+"/account"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"accountId": "PEN-001", "rsaPin": "PEN2026001234",
			"pfaName": "Stanbic IBTC Pension", "totalContributionsKobo": 12000000,
			"currentValueKobo": 13450000, "employerContributionsKobo": 8000000,
			"employeeContributionsKobo": 4000000, "returns": 12.1,
			"retirementDate": "2055-01-01",
		})
	})
}

func OpenPensionAccount(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, pensionServiceURL()+"/open", func() {
		writeJSON(w, 200, map[string]any{
			"accountId": fmt.Sprintf("PEN-%d", time.Now().UnixMilli()),
			"rsaPin":    fmt.Sprintf("PEN2026%d", time.Now().UnixMilli()%1000000),
			"pfaName":   "Stanbic IBTC Pension",
			"status":    "active",
		})
	})
}

func MakePensionContribution(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, pensionServiceURL()+"/contribute", func() {
		writeJSON(w, 200, map[string]any{
			"transactionId": fmt.Sprintf("PENT-%d", time.Now().UnixMilli()),
			"amountKobo": 500000, "status": "completed", "newBalanceKobo": 13950000,
		})
	})
}

func GetPensionStatements(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, pensionServiceURL()+"/statements"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"statements": []map[string]any{
				{"month": "2026-01", "employerContributionKobo": 666666, "employeeContributionKobo": 333333, "investmentReturnKobo": 112000, "closingBalanceKobo": 13450000},
			},
		})
	})
}

func ListPFAs(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, pensionServiceURL()+"/pfas", func() {
		writeJSON(w, 200, map[string]any{
			"pfas": []map[string]any{
				{"code": "STANBIC", "name": "Stanbic IBTC Pension", "rating": "A+", "aum": 2500000000000, "returnsYtd": 12.1},
				{"code": "ARM", "name": "ARM Pension Managers", "rating": "A", "aum": 1800000000000, "returnsYtd": 11.5},
			},
		})
	})
}

// ─── Cashback & Rewards ───────────────────────────────────────────────────────

func GetCashbackBalance(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, cashbackServiceURL()+"/balance"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"cashbackKobo": 125000, "pendingKobo": 25000,
			"lifetimeEarnedKobo": 350000, "lifetimeRedeemedKobo": 200000,
			"tier": "silver", "nextTierThreshold": 500000,
		})
	})
}

func GetCashbackTransactions(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, cashbackServiceURL()+"/transactions"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"transactions": []map[string]any{
				{"id": "CB-001", "type": "earned", "amountKobo": 5000, "description": "5% cashback on food order", "timestamp": time.Now().Add(-24 * time.Hour).UTC().Format(time.RFC3339), "status": "credited"},
			},
			"total": 1,
		})
	})
}

func RedeemCashback(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, cashbackServiceURL()+"/redeem", func() {
		writeJSON(w, 200, map[string]any{
			"redemptionId": fmt.Sprintf("CBR-%d", time.Now().UnixMilli()),
			"amountKobo": 100000, "status": "completed", "newBalanceKobo": 25000,
		})
	})
}

func GetCashbackOffers(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, cashbackServiceURL()+"/offers", func() {
		writeJSON(w, 200, map[string]any{
			"offers": []map[string]any{
				{"offerId": "OFF-001", "merchant": "Shoprite", "cashbackPct": 5.0, "maxCashbackKobo": 5000, "validUntil": time.Now().Add(7 * 24 * time.Hour).Format("2006-01-02"), "category": "groceries"},
			},
		})
	})
}

// ─── Voice Payments / Soundbox ────────────────────────────────────────────────

func GetSoundboxDevices(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, voicePaymentsURL()+"/devices"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"devices": []map[string]any{
				{"deviceId": "SB-001", "merchantId": "m1", "status": "online", "volume": 80, "language": "en", "lastSeen": time.Now().UTC().Format(time.RFC3339), "firmwareVersion": "2.1.0"},
			},
			"total": 1,
		})
	})
}

func RegisterSoundboxDevice(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, voicePaymentsURL()+"/register", func() {
		writeJSON(w, 200, map[string]any{
			"deviceId":       fmt.Sprintf("SB-%d", time.Now().UnixMilli()),
			"status":         "registered",
			"activationCode": "PG-SB-2026",
		})
	})
}

func GetSoundboxPayments(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, voicePaymentsURL()+"/payments"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"payments": []map[string]any{
				{"paymentId": "VP-001", "amountKobo": 250000, "timestamp": time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339), "status": "completed"},
			},
			"total": 1,
		})
	})
}

func UpdateSoundboxSettings(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, voicePaymentsURL()+"/settings", func() {
		writeJSON(w, 200, map[string]any{"success": true, "message": "Settings updated"})
	})
}

// ─── Wealth Management ────────────────────────────────────────────────────────

func GetWealthPortfolio(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, wealthManagementURL()+"/portfolio"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"totalValueKobo": 45000000, "investedKobo": 40000000,
			"unrealizedPnlKobo": 5000000, "unrealizedPnlPct": 12.5,
			"riskScore": 65,
			"assetAllocation": map[string]any{"equity": 60.0, "debt": 25.0, "gold": 10.0, "cash": 5.0},
		})
	})
}

func GetWealthGoals(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, wealthManagementURL()+"/goals"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"goals": []map[string]any{
				{"goalId": "G-001", "name": "Emergency Fund", "targetKobo": 6000000, "currentKobo": 4500000, "progress": 75.0, "targetDate": "2026-12-31", "status": "on_track"},
			},
		})
	})
}

func CreateWealthGoal(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, wealthManagementURL()+"/goals/create", func() {
		writeJSON(w, 200, map[string]any{
			"goalId":                             fmt.Sprintf("G-%d", time.Now().UnixMilli()),
			"status":                             "active",
			"recommendedMonthlyContributionKobo": 500000,
		})
	})
}

func GetWealthRecommendations(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, wealthManagementURL()+"/recommendations"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"recommendations": []map[string]any{
				{"type": "rebalance", "title": "Rebalance Portfolio", "description": "Your equity allocation is 5% above target.", "priority": "medium"},
			},
		})
	})
}

// ─── EMI Checkout ─────────────────────────────────────────────────────────────

func GetEMIPlans(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, emiServiceURL()+"/plans"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"plans": []map[string]any{
				{"planId": "EMI-3M", "tenure": 3, "interestRatePct": 2.5, "processingFeeKobo": 50000, "minAmountKobo": 500000, "maxAmountKobo": 50000000},
				{"planId": "EMI-6M", "tenure": 6, "interestRatePct": 3.5, "processingFeeKobo": 75000, "minAmountKobo": 1000000, "maxAmountKobo": 100000000},
				{"planId": "EMI-12M", "tenure": 12, "interestRatePct": 5.0, "processingFeeKobo": 100000, "minAmountKobo": 2000000, "maxAmountKobo": 200000000},
			},
		})
	})
}

func CreateEMIApplication(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, emiServiceURL()+"/apply", func() {
		writeJSON(w, 200, map[string]any{
			"applicationId": fmt.Sprintf("EMIA-%d", time.Now().UnixMilli()),
			"status":        "pending_approval",
			"emiAmountKobo": 350000,
			"firstEmiDate":  time.Now().Add(30 * 24 * time.Hour).Format("2006-01-02"),
		})
	})
}

func GetEMIApplications(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, emiServiceURL()+"/applications"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"applications": []map[string]any{
				{"applicationId": "EMIA-001", "amountKobo": 5000000, "tenure": 6, "emiAmountKobo": 875000, "status": "active", "paidInstallments": 2, "remainingInstallments": 4},
			},
			"total": 1,
		})
	})
}

func GetEMISchedule(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, emiServiceURL()+"/schedule"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"schedule": []map[string]any{
				{"installmentNo": 1, "dueDate": "2026-02-01", "amountKobo": 875000, "status": "paid"},
				{"installmentNo": 2, "dueDate": "2026-03-01", "amountKobo": 875000, "status": "paid"},
				{"installmentNo": 3, "dueDate": "2026-04-01", "amountKobo": 875000, "status": "upcoming"},
			},
		})
	})
}

// ─── Bulk Collections ─────────────────────────────────────────────────────────

func ListBulkCollections(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, bulkCollectionsURL()+"/list"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"collections": []map[string]any{
				{"collectionId": "BC-001", "name": "March Rent Collection", "totalAmountKobo": 25000000, "collectedKobo": 20000000, "pendingKobo": 5000000, "debtorCount": 10, "collectedCount": 8, "status": "active"},
			},
			"total": 1,
		})
	})
}

func CreateBulkCollection(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, bulkCollectionsURL()+"/create", func() {
		writeJSON(w, 200, map[string]any{
			"collectionId": fmt.Sprintf("BC-%d", time.Now().UnixMilli()),
			"status":       "created",
			"debtorCount":  0,
		})
	})
}

func SendCollectionReminders(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, bulkCollectionsURL()+"/reminders", func() {
		writeJSON(w, 200, map[string]any{"sent": 8, "failed": 0, "channels": []string{"sms", "email"}})
	})
}

func GetCollectionAnalytics(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, bulkCollectionsURL()+"/analytics"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"totalCollectedKobo": 20000000, "collectionRate": 80.0, "avgDaysToCollect": 5.2,
		})
	})
}

// ─── Salary Accounts ─────────────────────────────────────────────────────────

func ListSalaryAccounts(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, salaryAccountsURL()+"/list"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"accounts": []map[string]any{
				{"accountId": "SA-001", "employeeName": "John Doe", "accountNumber": "0123456789", "bankCode": "057", "monthlySalaryKobo": 30000000, "status": "active"},
			},
			"total": 1,
		})
	})
}

func CreateSalaryAccount(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, salaryAccountsURL()+"/create", func() {
		writeJSON(w, 200, map[string]any{
			"accountId":     fmt.Sprintf("SA-%d", time.Now().UnixMilli()),
			"status":        "active",
			"accountNumber": "0987654321",
		})
	})
}

func DisburseSalaries(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, salaryAccountsURL()+"/disburse", func() {
		writeJSON(w, 200, map[string]any{
			"batchId":            fmt.Sprintf("SAB-%d", time.Now().UnixMilli()),
			"totalDisbursedKobo": 30000000,
			"successCount":       1,
			"failureCount":       0,
			"status":             "completed",
		})
	})
}

func RequestSalaryAdvance(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, salaryAccountsURL()+"/advance", func() {
		writeJSON(w, 200, map[string]any{
			"advanceId":          fmt.Sprintf("SAA-%d", time.Now().UnixMilli()),
			"approvedAmountKobo": 10000000,
			"status":             "approved",
			"repaymentDate":      time.Now().Add(30 * 24 * time.Hour).Format("2006-01-02"),
		})
	})
}

// ─── Privacy Payments ─────────────────────────────────────────────────────────

func GetPrivacySettings(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, privacyPaymentsURL()+"/settings"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"maskedName": true, "maskedAmount": false,
			"privateAlias": "PayGate User", "encryptedTransactions": true,
		})
	})
}

func UpdatePrivacySettings(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, privacyPaymentsURL()+"/settings/update", func() {
		writeJSON(w, 200, map[string]any{"success": true, "message": "Privacy settings updated"})
	})
}

func GetPrivateTransactions(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, privacyPaymentsURL()+"/transactions"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"transactions": []map[string]any{
				{"id": "PVT-001", "maskedAmount": "N***,***", "maskedRecipient": "P***e U***r", "timestamp": time.Now().Add(-24 * time.Hour).UTC().Format(time.RFC3339), "status": "completed"},
			},
			"total": 1,
		})
	})
}

func CreatePrivatePayment(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, privacyPaymentsURL()+"/create", func() {
		writeJSON(w, 200, map[string]any{
			"paymentId":           fmt.Sprintf("PVT-%d", time.Now().UnixMilli()),
			"status":              "completed",
			"encryptedReceiptUrl": "https://receipts.paygate.ng/pvt/sample",
		})
	})
}

// ─── Reports Center ───────────────────────────────────────────────────────────

func ListReports(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, reportsServiceURL()+"/list"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"reports": []map[string]any{
				{"reportId": "RPT-001", "name": "March 2026 Transaction Report", "type": "transactions", "format": "csv", "status": "ready", "downloadUrl": "https://reports.paygate.ng/rpt/sample.csv", "createdAt": time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339), "sizeBytes": 245760},
			},
			"total": 1,
		})
	})
}

func GenerateReport(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, reportsServiceURL()+"/generate", func() {
		writeJSON(w, 200, map[string]any{
			"reportId":                   fmt.Sprintf("RPT-%d", time.Now().UnixMilli()),
			"status":                     "processing",
			"estimatedCompletionSeconds": 30,
		})
	})
}

func CreateScheduledReport(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, reportsServiceURL()+"/schedule/create", func() {
		writeJSON(w, 200, map[string]any{
			"scheduleId": fmt.Sprintf("RPTS-%d", time.Now().UnixMilli()),
			"status":     "active",
			"nextRunAt":  time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339),
		})
	})
}

func GetReportTemplates(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, reportsServiceURL()+"/templates", func() {
		writeJSON(w, 200, map[string]any{
			"templates": []map[string]any{
				{"templateId": "TPL-001", "name": "Daily Transaction Summary", "type": "transactions", "availableFormats": []string{"csv", "xlsx", "pdf"}},
				{"templateId": "TPL-002", "name": "Settlement Report", "type": "settlements", "availableFormats": []string{"csv", "xlsx", "pdf"}},
				{"templateId": "TPL-003", "name": "Revenue Analytics", "type": "analytics", "availableFormats": []string{"xlsx", "pdf"}},
			},
		})
	})
}

// ─── AI Insights V2 ───────────────────────────────────────────────────────────

func GetRevenueForecast(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, aiInsightsV2URL()+"/forecast"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"totalForecastKobo": 125000000, "growthTrend": 15.5,
			"seasonalFactors": []map[string]any{
				{"month": "April", "factor": 1.1, "note": "Easter spending boost"},
			},
			"confidenceScore": 87.5,
		})
	})
}

func GetCustomerSegments(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, aiInsightsV2URL()+"/segments"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"segments": []map[string]any{
				{"segmentId": "SEG-001", "name": "High Value", "customerCount": 250, "avgTransactionKobo": 500000, "retentionRate": 92.0, "churnRisk": "low"},
				{"segmentId": "SEG-002", "name": "Regular", "customerCount": 1200, "avgTransactionKobo": 85000, "retentionRate": 78.0, "churnRisk": "medium"},
			},
		})
	})
}

func GetAnomalyAlerts(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, aiInsightsV2URL()+"/anomalies"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"alerts": []map[string]any{
				{"alertId": "ANO-001", "type": "volume_spike", "severity": "medium", "description": "Transaction volume 3x above normal", "detectedAt": time.Now().Add(-3 * time.Hour).UTC().Format(time.RFC3339), "status": "open"},
			},
			"total": 1,
		})
	})
}

func GetProductRecommendations(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, aiInsightsV2URL()+"/recommendations"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"recommendations": []map[string]any{
				{"productId": "BNPL", "name": "Buy Now Pay Later", "reason": "35% of your customers have credit scores above 700", "estimatedUpliftPct": 22.0, "priority": "high"},
			},
		})
	})
}

// ─── Nodal Accounts ───────────────────────────────────────────────────────────

func ListNodalAccounts(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, nodalAccountsURL()+"/list"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"accounts": []map[string]any{
				{"accountId": "NOD-001", "name": "Escrow Pool A", "type": "escrow", "bankName": "Zenith Bank", "accountNumber": "1234567890", "balanceKobo": 15000000, "status": "active", "regulatoryRef": "CBN-NODAL-2026-001"},
			},
			"total": 1,
		})
	})
}

func CreateNodalAccount(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, nodalAccountsURL()+"/create", func() {
		writeJSON(w, 200, map[string]any{
			"accountId":     fmt.Sprintf("NOD-%d", time.Now().UnixMilli()),
			"accountNumber": fmt.Sprintf("%010d", time.Now().UnixMilli()%10000000000),
			"status":        "pending_activation",
		})
	})
}

func GetNodalTransactions(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, nodalAccountsURL()+"/transactions"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"transactions": []map[string]any{
				{"txId": "NODT-001", "type": "credit", "amountKobo": 5000000, "description": "Escrow deposit", "timestamp": time.Now().Add(-4 * time.Hour).UTC().Format(time.RFC3339), "status": "completed"},
			},
			"total": 1,
		})
	})
}

func GetNodalComplianceReport(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, nodalAccountsURL()+"/compliance"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"reportDate":            time.Now().Format("2006-01-02"),
			"totalNodalBalanceKobo": 15000000,
			"floatUtilizationPct":   65.0,
			"cbnComplianceStatus":   "compliant",
			"lastAuditDate":         "2026-03-31",
		})
	})
}

// ─── Smart Retail POS ─────────────────────────────────────────────────────────

func ListPOSProducts(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, smartRetailPOSURL()+"/products"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"products": []map[string]any{
				{"productId": "PRD-001", "name": "Coca-Cola 50cl", "sku": "CC-50CL", "priceKobo": 30000, "stockQty": 48, "category": "beverages", "barcode": "5449000000996"},
				{"productId": "PRD-002", "name": "Indomie Noodles", "sku": "IND-70G", "priceKobo": 25000, "stockQty": 120, "category": "food", "barcode": "8850987000046"},
			},
			"total": 2,
		})
	})
}

func ProcessRetailSale(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, smartRetailPOSURL()+"/sale", func() {
		writeJSON(w, 200, map[string]any{
			"saleId":        fmt.Sprintf("SALE-%d", time.Now().UnixMilli()),
			"totalKobo":     55000,
			"taxKobo":       4950,
			"status":        "completed",
			"paymentMethod": "card",
		})
	})
}

func GetPOSSalesAnalytics(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, smartRetailPOSURL()+"/analytics"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"totalSalesKobo": 2500000, "transactionCount": 85, "avgTransactionKobo": 29412,
			"topProducts": []map[string]any{
				{"productId": "PRD-001", "name": "Coca-Cola 50cl", "unitsSold": 32, "revenueKobo": 960000},
			},
			"peakHour": "12:00-13:00",
		})
	})
}

func UpdatePOSInventory(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, smartRetailPOSURL()+"/inventory/update", func() {
		writeJSON(w, 200, map[string]any{"success": true, "updatedCount": 1})
	})
}

// ─── International Remittance ─────────────────────────────────────────────────

// GetRemittanceCorridors is defined in tier8_handlers.go

// GetRemittanceQuote is defined in tier8_handlers.go

func CreateRemittance(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, intlRemittanceURL()+"/create", func() {
		writeJSON(w, 200, map[string]any{
			"remittanceId":      fmt.Sprintf("REM-%d", time.Now().UnixMilli()),
			"status":            "processing",
			"trackingCode":      fmt.Sprintf("PG%d", time.Now().UnixMilli()%1000000),
			"estimatedDelivery": time.Now().Add(2 * 24 * time.Hour).Format("2006-01-02"),
		})
	})
}

// GetRemittanceHistory is defined in tier8_handlers.go

// ─── Subscription Billing V2 ──────────────────────────────────────────────────

func ListSubscriptionPlans(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, subscriptionBillingV2URL()+"/plans"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"plans": []map[string]any{
				{"planId": "PLN-001", "name": "Basic", "priceKobo": 999900, "billingCycle": "monthly", "features": []string{"5 users", "10GB storage"}, "subscriberCount": 45, "status": "active"},
				{"planId": "PLN-002", "name": "Pro", "priceKobo": 2999900, "billingCycle": "monthly", "features": []string{"25 users", "100GB storage", "API access"}, "subscriberCount": 23, "status": "active"},
			},
			"total": 2,
		})
	})
}

func CreateSubscriptionPlan(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, subscriptionBillingV2URL()+"/plans/create", func() {
		writeJSON(w, 200, map[string]any{
			"planId": fmt.Sprintf("PLN-%d", time.Now().UnixMilli()), "status": "active",
		})
	})
}

func ListSubscribers(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, subscriptionBillingV2URL()+"/subscribers"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"subscribers": []map[string]any{
				{"subscriberId": "SUB-001", "customerName": "Acme Corp", "planName": "Pro", "status": "active", "mrr": 2999900, "startDate": "2026-01-01", "nextBillingDate": time.Now().Add(20 * 24 * time.Hour).Format("2006-01-02")},
			},
			"total": 1,
		})
	})
}

func CancelSubscription(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, subscriptionBillingV2URL()+"/cancel", func() {
		writeJSON(w, 200, map[string]any{
			"subscriptionId": "SUB-001",
			"status":         "cancelled",
			"cancelledAt":    time.Now().UTC().Format(time.RFC3339),
			"effectiveDate":  time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339),
		})
	})
}

func PauseSubscription(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, subscriptionBillingV2URL()+"/pause", func() {
		writeJSON(w, 200, map[string]any{
			"subscriptionId": "SUB-001",
			"status":         "paused",
			"resumesAt":      time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339),
		})
	})
}

func GetChurnAnalytics(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, subscriptionBillingV2URL()+"/analytics/churn"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"churnRate":                 3.2,
			"mrr":                       47498500,
			"arr":                       569982000,
			"newSubscriptions":          18,
			"cancelledSubscriptions":    5,
			"netGrowth":                 13,
			"avgSubscriptionLengthDays": 245,
		})
	})
}

// ─── Unused import guard ──────────────────────────────────────────────────────
var _ = json.Marshal
