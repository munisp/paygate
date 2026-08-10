// python_proxies.go — Go bridge HTTP handlers that proxy requests to Python
// microservices (tax-engine and carbon-oracle).
//
// Each handler calls proxyUpstream (defined in new_features.go) which:
//   1. Forwards the request to the upstream Python service.
//   2. Falls back to a static stub response when the service is unreachable.
//
// Service defaults (overridable via env vars):
//   TAX_ENGINE_URL     — default: http://tax-engine:9013
//   CARBON_ORACLE_URL  — default: http://carbon-oracle:9011
package handlers

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

// ─── URL helpers ─────────────────────────────────────────────────────────────

func taxEngineURL() string {
	if u := os.Getenv("TAX_ENGINE_URL"); u != "" {
		return u
	}
	return "http://tax-engine:9013"
}

func carbonOracleURL() string {
	if u := os.Getenv("CARBON_ORACLE_URL"); u != "" {
		return u
	}
	return "http://carbon-oracle:9011"
}

// ─── Tax Engine handlers ──────────────────────────────────────────────────────

// ProxyTaxEngineCalculate proxies GET /tax-engine/calculate to the Python
// tax-engine service at /calculate.  Falls back to a FIRS-compliant stub.
func ProxyTaxEngineCalculate(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, taxEngineURL()+"/calculate"+queryString(r), func() {
		amount := 0.0
		fmt.Sscanf(r.URL.Query().Get("amount"), "%f", &amount)
		txType := r.URL.Query().Get("type")
		if txType == "" {
			txType = "payment"
		}
		vatRate := 7.5
		whtRate := 10.0
		vatKobo := amount * vatRate / 100
		whtKobo := amount * whtRate / 100
		writeJSON(w, 200, map[string]any{
			"grossAmountKobo":    amount,
			"vatRatePct":         vatRate,
			"vatAmountKobo":      vatKobo,
			"whtRatePct":         whtRate,
			"whtAmountKobo":      whtKobo,
			"totalTaxKobo":       vatKobo + whtKobo,
			"netAmountKobo":      amount - whtKobo,
			"effectiveTaxRatePct": (vatKobo + whtKobo) / amount * 100,
			"taxBreakdown": []map[string]any{
				{"taxType": "VAT", "description": "Value Added Tax (FIRS)", "rate": vatRate, "amountKobo": vatKobo},
				{"taxType": "WHT", "description": "Withholding Tax (FIRS)", "rate": whtRate, "amountKobo": whtKobo},
			},
			"transactionType": txType,
			"firsCode":        "WHT-001",
		})
	})
}

// ProxyTaxEngineRemittance proxies GET /tax-engine/remittance to the Python
// tax-engine service at /remittance.  Falls back to a stub.
func ProxyTaxEngineRemittance(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, taxEngineURL()+"/remittance"+queryString(r), func() {
		month := r.URL.Query().Get("month")
		if month == "" {
			month = time.Now().Format("2006-01")
		}
		writeJSON(w, 200, map[string]any{
			"period":               month,
			"vatKobo":              875000,
			"whtKobo":              1250000,
			"stampDutyKobo":        50000,
			"totalRemittanceKobo":  2175000,
			"dueDate":              time.Now().AddDate(0, 0, 21).Format("2006-01-02"),
			"paymentReference":     fmt.Sprintf("FIRS-REM-%s-%d", month, time.Now().UnixMilli()%100000),
		})
	})
}

// ProxyTaxEngineRates proxies GET /tax-engine/rates to the Python tax-engine
// service at /rates.  Falls back to a static FIRS rate table.
func ProxyTaxEngineRates(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, taxEngineURL()+"/rates", func() {
		writeJSON(w, 200, map[string]any{
			"rates": map[string]any{
				"VAT":        map[string]any{"rate": 7.5, "description": "Value Added Tax", "remitTo": "FIRS"},
				"WHT_IND":    map[string]any{"rate": 5.0, "description": "Withholding Tax (Individual)", "remitTo": "FIRS"},
				"WHT_CORP":   map[string]any{"rate": 10.0, "description": "Withholding Tax (Corporate)", "remitTo": "FIRS"},
				"STAMP_DUTY": map[string]any{"rate": 0.075, "description": "Stamp Duty", "remitTo": "FIRS"},
				"CIT":        map[string]any{"rate": 30.0, "description": "Company Income Tax", "remitTo": "FIRS"},
			},
			"effectiveDate": "2024-01-01",
			"jurisdiction":  "Nigeria",
		})
	})
}

// ─── Carbon Oracle handlers ───────────────────────────────────────────────────

// ProxyCarbonOracleProjects proxies GET /carbon-oracle/projects to the Python
// carbon-oracle service at /projects.
func ProxyCarbonOracleProjects(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, carbonOracleURL()+"/projects"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"projects": []map[string]any{
				{"id": "REDD-001", "name": "Redd+ Forest Nigeria", "type": "REDD+", "country": "Nigeria", "pricePerTonneUSD": 12.50, "available": true, "verified": true},
				{"id": "GS-002", "name": "Solar Cookstove Kenya", "type": "Gold Standard", "country": "Kenya", "pricePerTonneUSD": 18.00, "available": true, "verified": true},
				{"id": "VCS-003", "name": "Mangrove Restoration Ghana", "type": "VCS", "country": "Ghana", "pricePerTonneUSD": 15.75, "available": true, "verified": true},
			},
		})
	})
}

// ProxyCarbonOraclePrice proxies GET /carbon-oracle/price to the Python
// carbon-oracle service at /price.
func ProxyCarbonOraclePrice(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, carbonOracleURL()+"/price"+queryString(r), func() {
		writeJSON(w, 200, map[string]any{
			"pricePerTonneUSD": 14.25,
			"currency":         "USD",
			"source":           "carbon-oracle-stub",
			"updatedAt":        time.Now().UTC().Format(time.RFC3339),
		})
	})
}

// ProxyCarbonOracleCalculate proxies POST /carbon-oracle/calculate to the
// Python carbon-oracle service at /calculate.
func ProxyCarbonOracleCalculate(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, carbonOracleURL()+"/calculate", func() {
		writeJSON(w, 200, map[string]any{
			"totalEmissionsKgCO2":    45000,
			"offsetKgCO2":            30000,
			"netEmissionsKgCO2":      15000,
			"creditsRequired":        15,
			"estimatedCostUSD":       213.75,
			"breakdown": map[string]any{
				"servers":    12000,
				"travel":     8000,
				"operations": 25000,
			},
		})
	})
}

// ProxyCarbonOracleRetire proxies POST /carbon-oracle/retire to the Python
// carbon-oracle service at /retire.
func ProxyCarbonOracleRetire(w http.ResponseWriter, r *http.Request) {
	proxyUpstream(w, r, carbonOracleURL()+"/retire", func() {
		certID := fmt.Sprintf("CARBON-CERT-%d", time.Now().UnixMilli()%1000000)
		writeJSON(w, 200, map[string]any{
			"certificateId":    certID,
			"retirementSerial": fmt.Sprintf("VCS-RET-%d", time.Now().UnixMilli()%999999),
			"tonnes":           10,
			"status":           "retired",
			"retiredAt":        time.Now().UTC().Format(time.RFC3339),
		})
	})
}
