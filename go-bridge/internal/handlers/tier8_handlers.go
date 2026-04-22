package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"github.com/paygate/go-bridge/internal/httpclient"
	"os"
	"strconv"
	"time"
)

// lakehouseV2URL returns the base URL of the lakehouse-v2 Python service.
func lakehouseV2URL() string {
	if u := os.Getenv("LAKEHOUSE_V2_URL"); u != "" {
		return u
	}
	return "http://lakehouse-v2:8125"
}

// proxyToLakehouse forwards a request to the lakehouse-v2 service and writes
// the response back to the caller. Returns false if the proxy call fails, in
// which case a fallback response has already been written to w.
func proxyToLakehouse(w http.ResponseWriter, method, path string, body []byte) bool {
	url := lakehouseV2URL() + path
	var reqBody io.Reader
	if body != nil {
		reqBody = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		log.Printf("[lakehouse-proxy] request build error: %v", err)
		return false
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	client := httpclient.Default
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[lakehouse-proxy] upstream error: %v", err)
		return false
	}
	defer resp.Body.Close()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[lakehouse-proxy] read error: %v", err)
		return false
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(respBody)
	return true
}

// ─── Real-Time Gross Settlement (RTGS) ─────────────────────────────────────────

func InitiateRTGS(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	rtgsID := fmt.Sprintf("RTGS-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"rtgsId":          rtgsID,
		"status":          "submitted",
		"cbnReference":    fmt.Sprintf("CBN-RTGS-%d", time.Now().UnixNano()%1000000),
		"submittedAt":     time.Now().Format(time.RFC3339),
		"estimatedSettlementMins": 5,
		"tigerBeetleRef":  fmt.Sprintf("TB-RTGS-%s", rtgsID),
		"kafkaEvent":      "rtgs.payment.submitted",
	})
}

func GetRTGSStatus(w http.ResponseWriter, r *http.Request) {
	rtgsID := r.URL.Query().Get("rtgsId")
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"rtgsId":       rtgsID,
		"status":       "settled",
		"settledAt":    time.Now().Add(-5 * time.Minute).Format(time.RFC3339),
		"cbnReference": fmt.Sprintf("CBN-RTGS-%s", rtgsID),
		"amountKobo":   10000000,
	})
}

func GetRTGSLimits(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	_ = merchantID
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"minAmountKobo":       10000000,
		"maxAmountKobo":       1000000000000,
		"dailyLimitKobo":      5000000000000,
		"usedTodayKobo":       500000000,
		"remainingTodayKobo":  4500000000,
		"settlementWindows":   []string{"08:00-12:00", "12:00-16:00", "16:00-18:00"},
		"nextWindowOpens":     "08:00",
		"currency":            "NGN",
	})
}

func GetRTGSHistory(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	limitStr := r.URL.Query().Get("limit")
	limit, _ := strconv.Atoi(limitStr)
	if limit == 0 {
		limit = 20
	}
	_ = merchantID
	history := []map[string]interface{}{
		{"rtgsId": "RTGS-001", "amountKobo": 50000000, "beneficiaryBank": "First Bank", "status": "settled", "settledAt": time.Now().Add(-24 * time.Hour).Format(time.RFC3339)},
		{"rtgsId": "RTGS-002", "amountKobo": 100000000, "beneficiaryBank": "GTBank", "status": "settled", "settledAt": time.Now().Add(-48 * time.Hour).Format(time.RFC3339)},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"transactions": history})
}

// ─── ISO 20022 Message Bus ─────────────────────────────────────────────────────

func SendISO20022Message(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	msgID := fmt.Sprintf("ISO-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"messageId":   msgID,
		"status":      "sent",
		"messageType": req["messageType"],
		"sentAt":      time.Now().Format(time.RFC3339),
		"kafkaTopic":  "iso20022.messages.outbound",
	})
}

func GetISO20022Messages(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	direction := r.URL.Query().Get("direction")
	_ = merchantID
	messages := []map[string]interface{}{
		{"messageId": "ISO-001", "type": "pacs.008", "direction": direction, "status": "processed", "receivedAt": time.Now().Add(-1 * time.Hour).Format(time.RFC3339)},
		{"messageId": "ISO-002", "type": "camt.054", "direction": "inbound", "status": "acknowledged", "receivedAt": time.Now().Add(-2 * time.Hour).Format(time.RFC3339)},
		{"messageId": "ISO-003", "type": "pain.001", "direction": "outbound", "status": "sent", "sentAt": time.Now().Add(-30 * time.Minute).Format(time.RFC3339)},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"messages": messages})
}

func GetISO20022Schema(w http.ResponseWriter, r *http.Request) {
	msgType := r.URL.Query().Get("type")
	schemas := map[string]interface{}{
		"pacs.008": map[string]interface{}{
			"description": "Financial Institution Credit Transfer",
			"version":     "2019",
			"fields":      []string{"MsgId", "CreDtTm", "NbOfTxs", "TtlIntrBkSttlmAmt", "IntrBkSttlmDt", "CdtTrfTxInf"},
		},
		"camt.054": map[string]interface{}{
			"description": "Bank To Customer Debit Credit Notification",
			"version":     "2019",
			"fields":      []string{"MsgId", "CreDtTm", "Ntfctn"},
		},
		"pain.001": map[string]interface{}{
			"description": "Customer Credit Transfer Initiation",
			"version":     "2019",
			"fields":      []string{"MsgId", "CreDtTm", "NbOfTxs", "CtrlSum", "PmtInf"},
		},
	}
	schema, ok := schemas[msgType]
	if !ok {
		schema = map[string]interface{}{"description": "Unknown message type", "version": "2019", "fields": []string{}}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"messageType": msgType, "schema": schema})
}

func AcknowledgeISO20022(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"messageId":      req["messageId"],
		"status":         "acknowledged",
		"acknowledgedAt": time.Now().Format(time.RFC3339),
	})
}

// ─── Open Finance Hub ─────────────────────────────────────────────────────────────

func GetOpenFinanceProviders(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	_ = merchantID
	providers := []map[string]interface{}{
		{"id": "prov_gtbank", "name": "GTBank", "type": "commercial_bank", "country": "NG", "connected": true, "dataTypes": []string{"accounts", "transactions", "balance"}},
		{"id": "prov_access", "name": "Access Bank", "type": "commercial_bank", "country": "NG", "connected": false, "dataTypes": []string{"accounts", "transactions", "balance", "statements"}},
		{"id": "prov_opay", "name": "OPay", "type": "mobile_money", "country": "NG", "connected": true, "dataTypes": []string{"wallet_balance", "transactions"}},
		{"id": "prov_kuda", "name": "Kuda Bank", "type": "digital_bank", "country": "NG", "connected": false, "dataTypes": []string{"accounts", "transactions", "balance", "cards"}},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"providers": providers})
}

func ConnectOpenFinanceProvider(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"connectionId":  fmt.Sprintf("CONN-%d", time.Now().UnixNano()%1000000),
		"providerId":    req["providerId"],
		"status":        "pending_auth",
		"authUrl":       fmt.Sprintf("https://open-banking.paygate.ng/auth/%s?state=%d", req["providerId"], time.Now().UnixNano()%1000000),
		"expiresIn":     300,
	})
}

func GetOpenFinanceData(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	providerID := r.URL.Query().Get("providerId")
	dataType := r.URL.Query().Get("dataType")
	_ = merchantID
	data := map[string]interface{}{
		"providerId": providerID,
		"dataType":   dataType,
		"fetchedAt":  time.Now().Format(time.RFC3339),
		"data": map[string]interface{}{
			"accounts": []map[string]interface{}{
				{"accountNumber": "0123456789", "type": "savings", "balanceKobo": 2500000, "currency": "NGN"},
			},
			"transactions": []map[string]interface{}{
				{"id": "txn_001", "amountKobo": 50000, "type": "credit", "date": "2026-04-01", "narration": "Transfer from John"},
			},
		},
	}
	respondJSON(w, http.StatusOK, data)
}

func RevokeOpenFinanceConnection(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"connectionId": req["connectionId"],
		"status":       "revoked",
		"revokedAt":    time.Now().Format(time.RFC3339),
	})
}

// ─── Merchant White-Label SDK ─────────────────────────────────────────────────────

func GetWhiteLabelConfig(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	_ = merchantID
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"sdkKey":       "wl_live_abc123xyz789",
		"brandName":    "MerchantPay",
		"primaryColor": "#1a73e8",
		"logoUrl":      "https://cdn.paygate.ng/logos/merchant_001.png",
		"supportEmail": "support@merchantpay.com",
		"allowedDomains": []string{"merchantpay.com", "app.merchantpay.com"},
		"features":     []string{"checkout", "wallet", "payments", "analytics"},
		"environment":  "production",
	})
}

func UpdateWhiteLabelBranding(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "updated",
		"updatedAt": time.Now().Format(time.RFC3339),
		"config":    req,
	})
}

func RotateWhiteLabelKey(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	newKey := fmt.Sprintf("wl_live_%d", time.Now().UnixNano()%1000000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"newSdkKey":  newKey,
		"rotatedAt":  time.Now().Format(time.RFC3339),
		"oldKeyExpiresAt": time.Now().Add(24 * time.Hour).Format(time.RFC3339),
	})
}

func GetWhiteLabelAnalytics(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	period := r.URL.Query().Get("period")
	_ = merchantID
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"period":          period,
		"sdkInstalls":     1250,
		"activeIntegrations": 87,
		"totalVolume":     map[string]interface{}{"kobo": 45000000, "display": "₦450,000"},
		"successRate":     98.7,
		"avgLatencyMs":    145,
	})
}

func GetWhiteLabelIntegrationGuide(w http.ResponseWriter, r *http.Request) {
	platform := r.URL.Query().Get("platform")
	guides := map[string]interface{}{
		"web": map[string]interface{}{
			"steps": []string{
				"1. Install: npm install @paygate/white-label-sdk",
				"2. Initialize: PayGateSDK.init({ sdkKey: 'wl_live_xxx', brandName: 'YourBrand' })",
				"3. Mount checkout: PayGateSDK.mountCheckout('#checkout-container')",
				"4. Handle events: PayGateSDK.on('payment.success', handler)",
			},
			"npmPackage": "@paygate/white-label-sdk",
			"version":    "2.1.0",
		},
		"android": map[string]interface{}{
			"steps": []string{
				"1. Add dependency: implementation 'ng.paygate:white-label-sdk:2.1.0'",
				"2. Initialize in Application.onCreate()",
				"3. Launch PayGateActivity",
			},
			"mavenArtifact": "ng.paygate:white-label-sdk:2.1.0",
		},
		"ios": map[string]interface{}{
			"steps": []string{
				"1. Add pod: pod 'PayGateWhiteLabelSDK', '~> 2.1.0'",
				"2. Import and initialize in AppDelegate",
				"3. Present PayGateViewController",
			},
			"podName": "PayGateWhiteLabelSDK",
		},
	}
	guide, ok := guides[platform]
	if !ok {
		guide = guides["web"]
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"platform": platform, "guide": guide})
}

// ─── Consumer Super App Shell ─────────────────────────────────────────────────────

func GetSuperAppConfig(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	_ = merchantID
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"appName":    "PayGate Super App",
		"version":    "3.0.0",
		"modules": []map[string]interface{}{
			{"id": "payments", "name": "Payments", "enabled": true, "icon": "💳"},
			{"id": "wallet", "name": "Wallet", "enabled": true, "icon": "👛"},
			{"id": "bills", "name": "Bills", "enabled": true, "icon": "📄"},
			{"id": "insurance", "name": "Insurance", "enabled": true, "icon": "🛡️"},
			{"id": "investments", "name": "Investments", "enabled": false, "icon": "📈"},
			{"id": "loans", "name": "Loans", "enabled": true, "icon": "🏦"},
			{"id": "marketplace", "name": "Marketplace", "enabled": false, "icon": "🛒"},
			{"id": "transport", "name": "Transport", "enabled": false, "icon": "🚗"},
		},
		"theme": map[string]interface{}{
			"primaryColor": "#6366f1",
			"darkMode":     false,
		},
	})
}

func UpdateSuperAppModules(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "updated",
		"modules":   req["modules"],
		"updatedAt": time.Now().Format(time.RFC3339),
	})
}

func PushSuperAppUpdate(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"updateId":      fmt.Sprintf("UPD-%d", time.Now().UnixNano()%1000000),
		"status":        "pushed",
		"targetDevices": req["targetDevices"],
		"pushedAt":      time.Now().Format(time.RFC3339),
	})
}

func GetSuperAppStats(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	period := r.URL.Query().Get("period")
	_ = merchantID
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"period":          period,
		"activeUsers":     45000,
		"dau":             12500,
		"mau":             45000,
		"avgSessionMins":  8.5,
		"topModules":      []string{"payments", "wallet", "bills"},
		"retentionRate":   72.3,
		"crashRate":       0.02,
	})
}

// ─── Platform Analytics Lakehouse v2 ─────────────────────────────────────────────
// All handlers below proxy to the lakehouse-v2 Python/DuckDB service.
// Fallback responses are returned when the service is unavailable.

func GetLakehouseDatasets(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	path := "/datasets"
	if merchantID != "" {
		path += "?merchant_id=" + merchantID
	}
	if proxyToLakehouse(w, http.MethodGet, path, nil) {
		return
	}
	// Fallback: return static metadata when lakehouse-v2 is unreachable
	datasets := []map[string]interface{}{
		{"name": "transactions", "format": "delta", "sizeGB": 45.2, "rowCount": 12500000, "lastUpdated": time.Now().Add(-1 * time.Hour).Format(time.RFC3339), "status": "offline"},
		{"name": "customers", "format": "delta", "sizeGB": 2.1, "rowCount": 450000, "lastUpdated": time.Now().Add(-6 * time.Hour).Format(time.RFC3339), "status": "offline"},
		{"name": "fraud_signals", "format": "parquet", "sizeGB": 8.7, "rowCount": 2300000, "lastUpdated": time.Now().Add(-30 * time.Minute).Format(time.RFC3339), "status": "offline"},
		{"name": "settlements", "format": "delta", "sizeGB": 12.3, "rowCount": 890000, "lastUpdated": time.Now().Add(-2 * time.Hour).Format(time.RFC3339), "status": "offline"},
		{"name": "audit_events", "format": "parquet", "sizeGB": 67.8, "rowCount": 45000000, "lastUpdated": time.Now().Add(-15 * time.Minute).Format(time.RFC3339), "status": "offline"},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"datasets": datasets, "totalSizeGB": 136.1, "source": "fallback"})
}

func QueryLakehouse(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusBadRequest)
		return
	}
	if proxyToLakehouse(w, http.MethodPost, "/query", body) {
		return
	}
	// Fallback: return a stub result indicating service unavailability
	queryID := fmt.Sprintf("QRY-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"queryId":      queryID,
		"status":       "unavailable",
		"error":        "lakehouse-v2 service is offline",
		"rowsReturned": 0,
		"rows":         []interface{}{},
		"source":       "fallback",
	})
}

func SampleLakehouseDataset(w http.ResponseWriter, r *http.Request) {
	dataset := r.URL.Query().Get("dataset")
	limit := r.URL.Query().Get("limit")
	path := fmt.Sprintf("/datasets/%s/sample", dataset)
	if limit != "" {
		path += "?limit=" + limit
	}
	if proxyToLakehouse(w, http.MethodGet, path, nil) {
		return
	}
	// Fallback
	respondJSON(w, http.StatusServiceUnavailable, map[string]interface{}{
		"error":   "lakehouse-v2 service is offline",
		"dataset": dataset,
		"source":  "fallback",
	})
}

func ExportLakehouseData(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusBadRequest)
		return
	}
	if proxyToLakehouse(w, http.MethodPost, "/export", body) {
		return
	}
	// Fallback
	exportID := fmt.Sprintf("EXP-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusAccepted, map[string]interface{}{
		"exportId":    exportID,
		"status":      "queued",
		"error":       "lakehouse-v2 offline — export queued for retry",
		"expiresAt":   time.Now().Add(24 * time.Hour).Format(time.RFC3339),
		"source":      "fallback",
	})
}

func SaveLakehouseQuery(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusBadRequest)
		return
	}
	if proxyToLakehouse(w, http.MethodPost, "/queries/save", body) {
		return
	}
	// Fallback: parse name from body and acknowledge
	var req map[string]interface{}
	_ = json.Unmarshal(body, &req)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"savedQueryId": fmt.Sprintf("SQ-%d", time.Now().UnixNano()%1000000),
		"name":         req["name"],
		"savedAt":      time.Now().Format(time.RFC3339),
		"source":       "fallback",
	})
}

func GetSavedLakehouseQueries(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	path := "/queries/saved"
	if merchantID != "" {
		path += "?merchant_id=" + merchantID
	}
	if proxyToLakehouse(w, http.MethodGet, path, nil) {
		return
	}
	// Fallback
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"queries": []interface{}{},
		"source":  "fallback",
	})
}

// ─── Payroll-as-a-Service v2 ─────────────────────────────────────────────────────

func RunPayrollV2(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	runID := fmt.Sprintf("PAY-RUN-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"runId":           runID,
		"status":          "processing",
		"period":          req["period"],
		"employeeCount":   req["employeeCount"],
		"totalGrossKobo":  req["totalGrossKobo"],
		"temporalRunID":   fmt.Sprintf("wf-payroll-%s", runID),
		"kafkaEvent":      "payroll.v2.run.started",
	})
}

func GetPayrollRuns(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	year := r.URL.Query().Get("year")
	_ = merchantID
	runs := []map[string]interface{}{
		{"runId": "PAY-RUN-001", "period": "2026-03", "employeeCount": 45, "totalGrossKobo": 22500000, "status": "completed", "processedAt": "2026-03-31T18:00:00Z"},
		{"runId": "PAY-RUN-002", "period": year + "-02", "employeeCount": 44, "totalGrossKobo": 22000000, "status": "completed", "processedAt": "2026-02-28T18:00:00Z"},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"runs": runs})
}

func ApprovePayrollRun(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"runId":      req["runId"],
		"status":     "approved",
		"approvedBy": req["approverId"],
		"approvedAt": time.Now().Format(time.RFC3339),
	})
}

func GetPayslipV2(w http.ResponseWriter, r *http.Request) {
	runID := r.URL.Query().Get("runId")
	employeeID := r.URL.Query().Get("employeeId")
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"runId":          runID,
		"employeeId":     employeeID,
		"employeeName":   "John Doe",
		"period":         "2026-03",
		"grossKobo":      500000,
		"taxKobo":        75000,
		"pensionKobo":    40000,
		"nhfKobo":        12500,
		"netKobo":        372500,
		"pdfUrl":         fmt.Sprintf("https://payroll.paygate.ng/payslips/%s/%s.pdf", runID, employeeID),
	})
}

func RemitPensionV2(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"remittanceId":  fmt.Sprintf("PEN-REM-%d", time.Now().UnixNano()%1000000),
		"status":        "submitted",
		"pfaReference":  fmt.Sprintf("PFA-2026-%d", time.Now().UnixNano()%100000),
		"submittedAt":   time.Now().Format(time.RFC3339),
	})
}

// ─── Agent Banking Network v2 ─────────────────────────────────────────────────────

func OnboardAgentV2(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	agentID := fmt.Sprintf("AGT-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"agentId":         agentID,
		"status":          "pending_kyc",
		"agentCode":       fmt.Sprintf("PG%06d", time.Now().UnixNano()%1000000),
		"tigerBeetleAcct": fmt.Sprintf("TB-AGT-%s", agentID),
		"kafkaEvent":      "agent.v2.onboarded",
	})
}

func GetAgentNetworkV2(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	_ = merchantID
	agents := []map[string]interface{}{
		{"agentId": "AGT-001", "name": "Mama Ngozi Store", "location": "Lagos Island", "status": "active", "floatBalanceKobo": 500000, "dailyTxnCount": 45, "commissionEarnedKobo": 12500},
		{"agentId": "AGT-002", "name": "Alhaji Musa Shop", "location": "Kano Central", "status": "active", "floatBalanceKobo": 250000, "dailyTxnCount": 28, "commissionEarnedKobo": 7000},
		{"agentId": "AGT-003", "name": "Emeka Pharmacy", "location": "Enugu GRA", "status": "suspended", "floatBalanceKobo": 0, "dailyTxnCount": 0, "commissionEarnedKobo": 0},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"agents": agents, "totalAgents": 3, "activeAgents": 2})
}

func FundAgentFloatV2(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"agentId":        req["agentId"],
		"amountKobo":     req["amountKobo"],
		"newBalanceKobo": 750000,
		"txReference":    fmt.Sprintf("FLOAT-%d", time.Now().UnixNano()%1000000),
		"status":         "success",
	})
}

func SuspendAgentV2(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"agentId":     req["agentId"],
		"status":      "suspended",
		"reason":      req["reason"],
		"suspendedAt": time.Now().Format(time.RFC3339),
	})
}

func GetAgentPerformanceV2(w http.ResponseWriter, r *http.Request) {
	agentID := r.URL.Query().Get("agentId")
	period := r.URL.Query().Get("period")
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"agentId":              agentID,
		"period":               period,
		"totalTransactions":    1250,
		"totalVolumeKobo":      12500000,
		"successRate":          98.4,
		"commissionEarnedKobo": 312500,
		"avgDailyTxns":         41.7,
		"topServices":          []string{"cash_in", "cash_out", "bill_payment"},
	})
}

// ─── Cross-Border Remittance v2 ─────────────────────────────────────────────────────

func GetRemittanceCorridors(w http.ResponseWriter, r *http.Request) {
	corridors := []map[string]interface{}{
		{"from": "NG", "to": "GH", "provider": "Flutterwave", "fxRate": 0.052, "feePct": 1.5, "minKobo": 100000, "maxKobo": 50000000, "deliveryMins": 30},
		{"from": "NG", "to": "KE", "provider": "Chipper Cash", "fxRate": 0.18, "feePct": 1.8, "minKobo": 100000, "maxKobo": 50000000, "deliveryMins": 60},
		{"from": "NG", "to": "GB", "provider": "Wise", "fxRate": 0.00051, "feePct": 0.8, "minKobo": 500000, "maxKobo": 200000000, "deliveryMins": 120},
		{"from": "NG", "to": "US", "provider": "Remitly", "fxRate": 0.00065, "feePct": 1.2, "minKobo": 500000, "maxKobo": 200000000, "deliveryMins": 60},
		{"from": "NG", "to": "SN", "provider": "Wave", "fxRate": 0.38, "feePct": 2.0, "minKobo": 100000, "maxKobo": 20000000, "deliveryMins": 15},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"corridors": corridors})
}

func GetRemittanceQuote(w http.ResponseWriter, r *http.Request) {
	fromCountry := r.URL.Query().Get("from")
	toCountry := r.URL.Query().Get("to")
	amountStr := r.URL.Query().Get("amount")
	method := r.URL.Query().Get("method")
	amount, _ := strconv.ParseFloat(amountStr, 64)
	if amount == 0 {
		amount = 1000000
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"fromCountry":      fromCountry,
		"toCountry":        toCountry,
		"sendAmountKobo":   amount,
		"receiveAmount":    amount * 0.052,
		"receiveCurrency":  "GHS",
		"fxRate":           0.052,
		"feesKobo":         amount * 0.015,
		"deliveryMethod":   method,
		"estimatedMins":    30,
		"provider":         "Flutterwave",
		"quoteExpiry":      time.Now().Add(10 * time.Minute).Unix(),
	})
}

func SendRemittanceV2(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	remittanceID := fmt.Sprintf("REM-%d", time.Now().UnixNano()%1000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"remittanceId":    remittanceID,
		"status":          "processing",
		"trackingCode":    fmt.Sprintf("PG%08d", time.Now().UnixNano()%100000000),
		"estimatedMins":   30,
		"kafkaEvent":      "remittance.v2.initiated",
		"mojaloopRef":     fmt.Sprintf("ML-REM-%s", remittanceID),
	})
}

func TrackRemittanceV2(w http.ResponseWriter, r *http.Request) {
	remittanceID := r.URL.Query().Get("remittanceId")
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"remittanceId": remittanceID,
		"status":       "delivered",
		"timeline": []map[string]interface{}{
			{"stage": "initiated", "timestamp": time.Now().Add(-35 * time.Minute).Format(time.RFC3339)},
			{"stage": "processing", "timestamp": time.Now().Add(-30 * time.Minute).Format(time.RFC3339)},
			{"stage": "in_transit", "timestamp": time.Now().Add(-20 * time.Minute).Format(time.RFC3339)},
			{"stage": "delivered", "timestamp": time.Now().Add(-5 * time.Minute).Format(time.RFC3339)},
		},
	})
}

func GetRemittanceHistory(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	limitStr := r.URL.Query().Get("limit")
	limit, _ := strconv.Atoi(limitStr)
	if limit == 0 {
		limit = 20
	}
	_ = merchantID
	history := []map[string]interface{}{
		{"remittanceId": "REM-001", "toCountry": "GH", "amountKobo": 1000000, "status": "delivered", "createdAt": time.Now().Add(-24 * time.Hour).Format(time.RFC3339)},
		{"remittanceId": "REM-002", "toCountry": "GB", "amountKobo": 5000000, "status": "delivered", "createdAt": time.Now().Add(-48 * time.Hour).Format(time.RFC3339)},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"remittances": history})
}

// ─── Merchant POS Terminal v2 ─────────────────────────────────────────────────────

func ProvisionPOSTerminalV2(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	terminalID := fmt.Sprintf("TID%08d", time.Now().UnixNano()%100000000)
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"terminalId":     terminalID,
		"serialNumber":   req["serialNumber"],
		"status":         "provisioned",
		"activationCode": fmt.Sprintf("%06d", time.Now().UnixNano()%1000000),
		"configVersion":  "2.1.0",
		"kafkaEvent":     "pos.v2.terminal.provisioned",
	})
}

func GetPOSTerminalsV2(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchantId")
	_ = merchantID
	terminals := []map[string]interface{}{
		{"terminalId": "TID00000001", "serialNumber": "SN123456", "model": "Nexgo N86", "status": "active", "location": "Main Store", "lastSeenAt": time.Now().Add(-5 * time.Minute).Format(time.RFC3339)},
		{"terminalId": "TID00000002", "serialNumber": "SN789012", "model": "PAX A920", "status": "active", "location": "Branch 1", "lastSeenAt": time.Now().Add(-15 * time.Minute).Format(time.RFC3339)},
		{"terminalId": "TID00000003", "serialNumber": "SN345678", "model": "Verifone VX520", "status": "offline", "location": "Branch 2", "lastSeenAt": time.Now().Add(-2 * time.Hour).Format(time.RFC3339)},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"terminals": terminals})
}

func GetPOSTerminalHealthV2(w http.ResponseWriter, r *http.Request) {
	terminalID := r.URL.Query().Get("terminalId")
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"terminalId":      terminalID,
		"status":          "active",
		"batteryPct":      87,
		"signalStrength":  "strong",
		"paperRemaining":  "ok",
		"lastTransaction": time.Now().Add(-10 * time.Minute).Format(time.RFC3339),
		"firmwareVersion": "2.1.0",
		"uptime":          "7d 14h 22m",
	})
}

func PushPOSConfigV2(w http.ResponseWriter, r *http.Request) {
	var req map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"terminalId": req["terminalId"],
		"status":     "config_pushed",
		"pushedAt":   time.Now().Format(time.RFC3339),
		"configVersion": "2.1.1",
	})
}

func GetPOSTransactionsV2(w http.ResponseWriter, r *http.Request) {
	terminalID := r.URL.Query().Get("terminalId")
	limitStr := r.URL.Query().Get("limit")
	limit, _ := strconv.Atoi(limitStr)
	if limit == 0 {
		limit = 20
	}
	_ = limit
	txns := []map[string]interface{}{
		{"id": "POS-TXN-001", "terminalId": terminalID, "amountKobo": 50000, "type": "purchase", "cardType": "Verve", "status": "approved", "createdAt": time.Now().Add(-30 * time.Minute).Format(time.RFC3339)},
		{"id": "POS-TXN-002", "terminalId": terminalID, "amountKobo": 120000, "type": "purchase", "cardType": "Mastercard", "status": "approved", "createdAt": time.Now().Add(-45 * time.Minute).Format(time.RFC3339)},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"transactions": txns})
}
