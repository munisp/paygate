package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/rand"
	"net/http"
	"os"
	"time"
)

// ─── Insurance Premium Collection ─────────────────────────────────────────────

func GetInsuranceProducts(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	_ = merchantID
	products := []map[string]interface{}{
		{"id": "ins_life_001", "name": "Life Cover Basic", "provider": "AXA Mansard", "premiumKobo": 50000, "coverageType": "life", "durationDays": 365},
		{"id": "ins_health_001", "name": "Health Shield Plus", "provider": "Leadway Assurance", "premiumKobo": 150000, "coverageType": "health", "durationDays": 365},
		{"id": "ins_device_001", "name": "Device Protection", "provider": "Coronation Insurance", "premiumKobo": 25000, "coverageType": "device", "durationDays": 180},
		{"id": "ins_travel_001", "name": "Travel Guard", "provider": "NEM Insurance", "premiumKobo": 35000, "coverageType": "travel", "durationDays": 90},
		{"id": "ins_agric_001", "name": "Farm Shield", "provider": "AIICO Insurance", "premiumKobo": 80000, "coverageType": "agriculture", "durationDays": 365},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"products": products})
}

func EnrollInsuranceCustomer(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	policyID := fmt.Sprintf("POL-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"policyId":    policyID,
		"premiumKobo": 150000,
		"startDate":   time.Now().Format("2006-01-02"),
		"expiryDate":  time.Now().AddDate(1, 0, 0).Format("2006-01-02"),
		"status":      "active",
		"kafkaTopic":  "insurance.policy.created",
	})
}

func CollectInsurancePremium(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	txnID := fmt.Sprintf("INS-TXN-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"transactionId": txnID,
		"status":        "success",
		"receiptUrl":    fmt.Sprintf("https://receipts.paygate.ng/insurance/%s.pdf", txnID),
	})
}

func GetInsurancePolicies(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	status := r.URL.Query().Get("status")
	_ = merchantID
	policies := []map[string]interface{}{
		{"policyId": "POL-123456", "customerId": "cust_001", "productName": "Health Shield Plus", "status": "active", "premiumKobo": 150000, "expiryDate": time.Now().AddDate(0, 6, 0).Format("2006-01-02")},
		{"policyId": "POL-789012", "customerId": "cust_002", "productName": "Life Cover Basic", "status": status, "premiumKobo": 50000, "expiryDate": time.Now().AddDate(0, 3, 0).Format("2006-01-02")},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"policies": policies})
}

func FileInsuranceClaim(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	claimID := fmt.Sprintf("CLM-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"claimId":             claimID,
		"status":              "under_review",
		"estimatedPayoutKobo": 500000,
	})
}

// ─── Carbon Credit Marketplace ─────────────────────────────────────────────────

func GetCarbonListings(w http.ResponseWriter, r *http.Request) {
	listings := []map[string]interface{}{
		{"id": "CCR-001", "projectName": "Redd+ Forest Nigeria", "country": "Nigeria", "creditType": "REDD+", "pricePerTonneUSD": 12.50, "availableCredits": 50000, "verified": true},
		{"id": "CCR-002", "projectName": "Solar Cookstove Kenya", "country": "Kenya", "creditType": "Gold Standard", "pricePerTonneUSD": 18.00, "availableCredits": 25000, "verified": true},
		{"id": "CCR-003", "projectName": "Mangrove Restoration Ghana", "country": "Ghana", "creditType": "VCS", "pricePerTonneUSD": 15.75, "availableCredits": 10000, "verified": true},
		{"id": "CCR-004", "projectName": "Wind Farm Senegal", "country": "Senegal", "creditType": "CDM", "pricePerTonneUSD": 9.00, "availableCredits": 75000, "verified": false},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"listings": listings})
}

func PurchaseCarbonCredits(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	certID := fmt.Sprintf("CERT-%d", time.Now().UnixNano()%1000000)
	tonnes := 10.0
	if t, ok := req["tonnes"].(float64); ok {
		tonnes = t
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"certificateId":    certID,
		"tonnes":           tonnes,
		"totalCostUSD":     tonnes * 12.50,
		"retirementSerial": fmt.Sprintf("VCS-RET-%d", rand.Int63n(999999)),
		"status":           "retired",
	})
}

func GetCarbonCertificates(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	_ = merchantID
	certs := []map[string]interface{}{
		{"certificateId": "CERT-001", "projectName": "Redd+ Forest Nigeria", "tonnes": 100, "retiredAt": "2026-01-15", "serial": "VCS-RET-123456"},
		{"certificateId": "CERT-002", "projectName": "Solar Cookstove Kenya", "tonnes": 50, "retiredAt": "2026-02-20", "serial": "GS-RET-789012"},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"certificates": certs, "totalTonnes": 150, "offsetKgCO2": 150000})
}

func GetCarbonEmissionsReport(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	year := r.URL.Query().Get("year")
	_ = merchantID
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"year":             year,
		"totalEmissionsKg": 45000,
		"offsetKg":         30000,
		"netEmissionsKg":   15000,
		"offsetPct":        66.7,
		"breakdown": map[string]interface{}{
			"servers":    12000,
			"travel":     8000,
			"operations": 25000,
		},
	})
}

// ─── NFT Loyalty Badges ─────────────────────────────────────────────────────────

func CreateNFTCollection(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	collectionID := fmt.Sprintf("NFT-COL-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"collectionId":    collectionID,
		"contractAddress": fmt.Sprintf("0x%040x", rand.Int63()),
		"network":         "polygon",
		"status":          "deployed",
		"explorerUrl":     fmt.Sprintf("https://polygonscan.com/address/0x%040x", rand.Int63()),
	})
}

func MintNFTBadge(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	tokenID := rand.Int63n(999999)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"tokenId":     tokenID,
		"txHash":      fmt.Sprintf("0x%064x", rand.Int63()),
		"status":      "minted",
		"metadataUrl": fmt.Sprintf("https://metadata.paygate.ng/nft/%d.json", tokenID),
	})
}

func GetNFTCollections(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	_ = merchantID
	collections := []map[string]interface{}{
		{"collectionId": "NFT-COL-001", "name": "PayGate Gold Members", "symbol": "PGG", "totalMinted": 1250, "network": "polygon", "contractAddress": "0xabc123"},
		{"collectionId": "NFT-COL-002", "name": "PayGate Platinum Elite", "symbol": "PGP", "totalMinted": 87, "network": "polygon", "contractAddress": "0xdef456"},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"collections": collections})
}

func GetCustomerNFTBadges(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	customerID := r.URL.Query().Get("customerId")
	_ = merchantID
	badges := []map[string]interface{}{
		{"tokenId": 1001, "collectionName": "PayGate Gold Members", "badgeName": "Gold Member 2026", "mintedAt": "2026-01-01", "imageUrl": "https://cdn.paygate.ng/nft/gold-2026.png"},
		{"tokenId": 2045, "collectionName": "PayGate Platinum Elite", "badgeName": "Top Spender Q1", "mintedAt": "2026-03-31", "imageUrl": "https://cdn.paygate.ng/nft/platinum-q1.png"},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"customerId": customerID, "badges": badges})
}

// ─── BNPL v2 with Credit Bureau ─────────────────────────────────────────────────

func CheckBNPLv2Eligibility(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	_ = merchantID
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"eligible":          true,
		"maxAmountKobo":     5000000,
		"creditScore":       720,
		"creditBureau":      "CRC Credit Bureau",
		"interestRatePct":   2.5,
		"availableTenors":   []int{1, 2, 3, 6, 12},
		"requiresGuarantor": false,
	})
}

func CreateBNPLv2Loan(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	loanID := fmt.Sprintf("BNPL2-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"loanId":         loanID,
		"status":         "active",
		"disbursedKobo":  req["amountKobo"],
		"totalRepayKobo": int64(req["amountKobo"].(float64) * 1.025),
		"firstDueDate":   time.Now().AddDate(0, 1, 0).Format("2006-01-02"),
		"kafkaEvent":     "bnpl.v2.loan.created",
	})
}

func GetBNPLv2Loans(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	status := r.URL.Query().Get("status")
	_ = merchantID
	loans := []map[string]interface{}{
		{"loanId": "BNPL2-001", "customerId": "cust_001", "amountKobo": 200000, "status": status, "dueDate": "2026-05-01", "outstandingKobo": 150000},
		{"loanId": "BNPL2-002", "customerId": "cust_002", "amountKobo": 500000, "status": "active", "dueDate": "2026-06-01", "outstandingKobo": 500000},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"loans": loans})
}

func RecordBNPLv2Repayment(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":         "success",
		"amountPaidKobo": req["amountKobo"],
		"remainingKobo":  0,
		"loanStatus":     "paid",
	})
}

// ─── Crypto On/Off Ramp ─────────────────────────────────────────────────────────

// cryptoRampProviderURL returns the configured ramp provider base URL, or "".
func cryptoRampProviderURL() string {
	return os.Getenv("CRYPTO_RAMP_PROVIDER_URL")
}

// cryptoRampUnavailable fails loudly when no ramp provider is wired. We never
// fabricate quotes, wallet balances, or on-chain transaction hashes.
func cryptoRampUnavailable(w http.ResponseWriter) {
	slog.Error("[crypto-ramp] CRYPTO_RAMP_PROVIDER_URL not configured — refusing to fabricate ramp data")
	respondJSON(w, http.StatusServiceUnavailable, map[string]interface{}{
		"error":   "ramp_provider_not_configured",
		"message": "no crypto ramp provider is wired (set CRYPTO_RAMP_PROVIDER_URL); refusing to fabricate quotes/transactions",
	})
}

func GetCryptoRampQuote(w http.ResponseWriter, r *http.Request) {
	provider := cryptoRampProviderURL()
	if provider == "" {
		cryptoRampUnavailable(w)
		return
	}
	proxyToProvider(w, r, http.MethodGet, provider+"/v1/quotes?"+r.URL.RawQuery, nil)
}

func ExecuteCryptoRamp(w http.ResponseWriter, r *http.Request) {
	provider := cryptoRampProviderURL()
	if provider == "" {
		cryptoRampUnavailable(w)
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	proxyToProvider(w, r, http.MethodPost, provider+"/v1/executions", body)
}

func GetCryptoWallets(w http.ResponseWriter, r *http.Request) {
	provider := cryptoRampProviderURL()
	if provider == "" {
		cryptoRampUnavailable(w)
		return
	}
	proxyToProvider(w, r, http.MethodGet, provider+"/v1/wallets?"+r.URL.RawQuery, nil)
}

func GetCryptoTransactions(w http.ResponseWriter, r *http.Request) {
	provider := cryptoRampProviderURL()
	if provider == "" {
		cryptoRampUnavailable(w)
		return
	}
	proxyToProvider(w, r, http.MethodGet, provider+"/v1/transactions?"+r.URL.RawQuery, nil)
}

// proxyToProvider relays a request to the configured ramp provider and
// relays its response verbatim; 502 on transport failure.
func proxyToProvider(w http.ResponseWriter, r *http.Request, method, target string, body []byte) {
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(r.Context(), method, target, bodyReader)
	if err != nil {
		http.Error(w, "failed to build provider request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if key := os.Getenv("CRYPTO_RAMP_PROVIDER_KEY"); key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		slog.Error("[crypto-ramp] provider unreachable", "err", err)
		respondJSON(w, http.StatusBadGateway, map[string]interface{}{
			"error":   "ramp_provider_unreachable",
			"message": "configured ramp provider could not be reached",
		})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBody)
}
