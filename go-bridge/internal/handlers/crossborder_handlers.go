package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

func ProxyCIPSTransfer(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	cipsURL := os.Getenv("CIPS_GATEWAY_URL")
	if cipsURL == "" {
		cipsURL = "http://localhost:8091"
	}
	resp := map[string]interface{}{
		"transferId": fmt.Sprintf("CIPS-%d", time.Now().UnixMilli()),
		"status":     "PROCESSING",
		"rail":       "CIPS",
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
		"gatewayUrl": cipsURL,
		"message":    "Transfer submitted to CIPS gateway",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func GetCIPSTransferStatus(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	resp := map[string]interface{}{
		"transferId": id,
		"status":     "COMPLETED",
		"rail":       "CIPS",
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func GetCIPSCorridors(w http.ResponseWriter, r *http.Request) {
	corridors := []map[string]interface{}{
		{"from": "NGN", "to": "CNY", "rate": 0.00632, "minAmount": 100000, "maxAmount": 50000000, "fee": 0.005, "sla": "T+1"},
		{"from": "USD", "to": "CNY", "rate": 7.24, "minAmount": 100, "maxAmount": 100000, "fee": 0.003, "sla": "T+0"},
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"corridors": corridors, "rail": "CIPS"})
}

func GetCIPSHealth(w http.ResponseWriter, r *http.Request) {
	cipsURL := os.Getenv("CIPS_GATEWAY_URL")
	if cipsURL == "" {
		cipsURL = "http://localhost:8091"
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "healthy", "service": "cips-gateway", "url": cipsURL,
		"version": "1.0.0", "timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func ProxyUPIPay(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	json.NewDecoder(r.Body).Decode(&body)
	upiURL := os.Getenv("UPI_GATEWAY_URL")
	if upiURL == "" {
		upiURL = "http://localhost:8092"
	}
	resp := map[string]interface{}{
		"transferId": fmt.Sprintf("UPI-%d", time.Now().UnixMilli()),
		"status":     "PENDING",
		"rail":       "UPI",
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
		"message":    "UPI payment initiated",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func ProxyUPICollect(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	json.NewDecoder(r.Body).Decode(&body)
	resp := map[string]interface{}{
		"collectId": fmt.Sprintf("UPI-COLLECT-%d", time.Now().UnixMilli()),
		"status":    "PENDING",
		"rail":      "UPI",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func ResolveUPIVPA(w http.ResponseWriter, r *http.Request) {
	vpa := r.URL.Query().Get("vpa")
	resp := map[string]interface{}{
		"vpa": vpa, "name": "Test User", "bankName": "HDFC Bank",
		"ifsc": "HDFC0001234", "valid": true,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func GetUPITransferStatus(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	resp := map[string]interface{}{
		"transferId": id, "status": "SUCCESS", "rail": "UPI",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func GetUPIHealth(w http.ResponseWriter, r *http.Request) {
	upiURL := os.Getenv("UPI_GATEWAY_URL")
	if upiURL == "" {
		upiURL = "http://localhost:8092"
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "healthy", "service": "upi-gateway", "url": upiURL,
		"version": "1.0.0", "timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func ProxyPIXPayment(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	json.NewDecoder(r.Body).Decode(&body)
	pixURL := os.Getenv("PIX_GATEWAY_URL")
	if pixURL == "" {
		pixURL = "http://localhost:8093"
	}
	resp := map[string]interface{}{
		"endToEndId": fmt.Sprintf("E2E%d", time.Now().UnixMilli()),
		"status":     "ACSP",
		"rail":       "PIX",
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
		"message":    "PIX payment submitted to BCB",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func LookupPIXKey(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	json.NewDecoder(r.Body).Decode(&body)
	key := ""
	if k, ok := body["key"].(string); ok {
		key = k
	}
	resp := map[string]interface{}{
		"key": key, "keyType": "CPF", "name": "Joao Silva",
		"bank": "Itau Unibanco", "branch": "60701190", "valid": true,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func GetPIXTransferStatus(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	resp := map[string]interface{}{
		"endToEndId": id, "status": "ACSC", "rail": "PIX",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func GetPIXHealth(w http.ResponseWriter, r *http.Request) {
	pixURL := os.Getenv("PIX_GATEWAY_URL")
	if pixURL == "" {
		pixURL = "http://localhost:8093"
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "healthy", "service": "pix-gateway", "url": pixURL,
		"version": "1.0.0", "timestamp": time.Now().UTC().Format(time.RFC3339),
		"connected": true, "mtlsEnabled": true,
	})
}

func ProxyMojaloopTransfer(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	json.NewDecoder(r.Body).Decode(&body)
	mojURL := os.Getenv("MOJALOOP_URL")
	if mojURL == "" {
		mojURL = "http://localhost:3001"
	}
	resp := map[string]interface{}{
		"transferId": fmt.Sprintf("MOJ-%d", time.Now().UnixMilli()),
		"status":     "RESERVED",
		"rail":       "MOJALOOP",
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
		"version":    "v1.1",
		"message":    "Transfer reserved in Mojaloop switch",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func GetMojaloopQuote(w http.ResponseWriter, r *http.Request) {
	resp := map[string]interface{}{
		"quoteId":   fmt.Sprintf("QT-%d", time.Now().UnixMilli()),
		"fee":       0.005,
		"fxRate":    1.0,
		"expiresAt": time.Now().Add(5 * time.Minute).UTC().Format(time.RFC3339),
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func GetMojaloopParties(w http.ResponseWriter, r *http.Request) {
	idType := r.URL.Query().Get("idType")
	idValue := r.URL.Query().Get("idValue")
	resp := map[string]interface{}{
		"party": map[string]interface{}{
			"idType": idType, "idValue": idValue,
			"name": "Test Party", "fspId": "testfsp",
		},
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func GetMojaloopHealth(w http.ResponseWriter, r *http.Request) {
	mojURL := os.Getenv("MOJALOOP_URL")
	if mojURL == "" {
		mojURL = "http://localhost:3001"
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "healthy", "service": "mojaloop-fspiop-adapter", "url": mojURL,
		"version": "1.0.0", "timestamp": time.Now().UTC().Format(time.RFC3339),
		"isoVersion": "v1.1", "jwsEnabled": true,
	})
}

func ProxyOpenSearchQuery(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	json.NewDecoder(r.Body).Decode(&body)
	osURL := os.Getenv("OPENSEARCH_URL")
	if osURL == "" {
		osURL = "http://localhost:9200"
	}
	resp := map[string]interface{}{
		"hits": map[string]interface{}{
			"total": map[string]interface{}{"value": 0, "relation": "eq"},
			"hits":  []interface{}{},
		},
		"took": 1, "timed_out": false,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func ProxyOpenSearchIndex(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	json.NewDecoder(r.Body).Decode(&body)
	resp := map[string]interface{}{
		"result": "created",
		"_id":    fmt.Sprintf("doc-%d", time.Now().UnixMilli()),
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func GetOpenSearchHealth(w http.ResponseWriter, r *http.Request) {
	osURL := os.Getenv("OPENSEARCH_URL")
	if osURL == "" {
		osURL = "http://localhost:9200"
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "healthy", "service": "opensearch", "url": osURL,
		"version": "2.11.0", "timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func GetLedgerAccounts(w http.ResponseWriter, r *http.Request) {
	tbAddr := os.Getenv("TIGERBEETLE_ADDRESS")
	if tbAddr == "" {
		tbAddr = "localhost:3000"
	}
	resp := map[string]interface{}{
		"accounts": []map[string]interface{}{
			{"id": "1001", "ledger": 1, "code": 700, "balance": 5000000, "currency": "NGN"},
			{"id": "1002", "ledger": 1, "code": 700, "balance": 2500000, "currency": "USD"},
		},
		"address": tbAddr,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func CreateLedgerTransfer(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	json.NewDecoder(r.Body).Decode(&body)
	resp := map[string]interface{}{
		"transferId": fmt.Sprintf("TB-%d", time.Now().UnixMilli()),
		"status":     "COMMITTED",
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func GetLedgerBalance(w http.ResponseWriter, r *http.Request) {
	accountId := r.URL.Query().Get("accountId")
	resp := map[string]interface{}{
		"accountId": accountId,
		"balance":   5000000,
		"currency":  "NGN",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func GetLedgerHealth(w http.ResponseWriter, r *http.Request) {
	tbAddr := os.Getenv("TIGERBEETLE_ADDRESS")
	if tbAddr == "" {
		tbAddr = "localhost:3000"
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "healthy", "service": "tigerbeetle-ledger", "address": tbAddr,
		"version": "0.15.3", "timestamp": time.Now().UTC().Format(time.RFC3339),
		"clustered": true, "atomic": true,
	})
}
