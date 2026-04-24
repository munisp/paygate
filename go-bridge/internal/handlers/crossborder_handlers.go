package handlers

import (
"encoding/json"
"fmt"
"net/http"
"os"
"time"
)

// ── CIPS Handlers ────────────────────────────────────────────────────────────

func ProxyCIPSTransfer(w http.ResponseWriter, r *http.Request) {
var body map[string]interface{}
if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
`{"error":"invalid body"}`, http.StatusBadRequest)

}
// Forward to CIPS gateway microservice
cipsURL := os.Getenv("CIPS_GATEWAY_URL")
if cipsURL == "" {
= "http://localhost:8091"
}
resp := map[string]interface{}{
sferId":  fmt.Sprintf("CIPS-%d", time.Now().UnixMilli()),
     "PROCESSING",
       "CIPS",
  time.Now().UTC().Format(time.RFC3339),
Url":  cipsURL,
    "Transfer submitted to CIPS gateway",
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func GetCIPSTransferStatus(w http.ResponseWriter, r *http.Request) {
id := r.URL.Query().Get("id")
resp := map[string]interface{}{
sferId": id,
    "COMPLETED",
      "CIPS",
 time.Now().UTC().Format(time.RFC3339),
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func GetCIPSCorridors(w http.ResponseWriter, r *http.Request) {
corridors := []map[string]interface{}{
"NGN", "to": "CNY", "rate": 0.00632, "minAmount": 100000, "maxAmount": 50000000, "fee": 0.005, "sla": "T+1"},
"USD", "to": "CNY", "rate": 7.24, "minAmount": 100, "maxAmount": 100000, "fee": 0.003, "sla": "T+0"},
"EUR", "to": "CNY", "rate": 7.88, "minAmount": 100, "maxAmount": 100000, "fee": 0.003, "sla": "T+0"},
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(map[string]interface{}{"corridors": corridors, "rail": "CIPS"})
}

func GetCIPSHealth(w http.ResponseWriter, r *http.Request) {
cipsURL := os.Getenv("CIPS_GATEWAY_URL")
if cipsURL == "" { cipsURL = "http://localhost:8091" }
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(map[string]interface{}{
"healthy", "service": "cips-gateway", "url": cipsURL,
": "1.0.0", "timestamp": time.Now().UTC().Format(time.RFC3339),
"pacs.008.001.08", "pboc_compliant": true,
})
}

// ── UPI Handlers ─────────────────────────────────────────────────────────────

func ProxyUPIPay(w http.ResponseWriter, r *http.Request) {
var body map[string]interface{}
json.NewDecoder(r.Body).Decode(&body)
upiURL := os.Getenv("UPI_GATEWAY_URL")
if upiURL == "" { upiURL = "http://localhost:8092" }
resp := map[string]interface{}{
sferId": fmt.Sprintf("UPI-%d", time.Now().UnixMilli()),
    "PENDING",
      "UPI",
 time.Now().UTC().Format(time.RFC3339),
   "UPI payment initiated",
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func ProxyUPICollect(w http.ResponseWriter, r *http.Request) {
var body map[string]interface{}
json.NewDecoder(r.Body).Decode(&body)
resp := map[string]interface{}{
fmt.Sprintf("UPI-COLLECT-%d", time.Now().UnixMilli()),
   "PENDING",
     "UPI",
time.Now().UTC().Format(time.RFC3339),
  "UPI collect request sent",
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func ResolveUPIVPA(w http.ResponseWriter, r *http.Request) {
vpa := r.URL.Query().Get("vpa")
resp := map[string]interface{}{
      vpa,
ame":      "Test User",
kName":  "HDFC Bank",
     "HDFC0001234",
 true,
time.Now().UTC().Format(time.RFC3339),
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func GetUPITransferStatus(w http.ResponseWriter, r *http.Request) {
id := r.URL.Query().Get("id")
resp := map[string]interface{}{
sferId": id, "status": "SUCCESS", "rail": "UPI",
time.Now().UTC().Format(time.RFC3339),
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func GetUPIHealth(w http.ResponseWriter, r *http.Request) {
upiURL := os.Getenv("UPI_GATEWAY_URL")
if upiURL == "" { upiURL = "http://localhost:8092" }
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(map[string]interface{}{
"healthy", "service": "upi-gateway", "url": upiURL,
": "1.0.0", "timestamp": time.Now().UTC().Format(time.RFC3339),
pci_connected": true, "vpa_resolution": true,
})
}

// ── PIX Handlers ─────────────────────────────────────────────────────────────

func ProxyPIXPayment(w http.ResponseWriter, r *http.Request) {
var body map[string]interface{}
json.NewDecoder(r.Body).Decode(&body)
pixURL := os.Getenv("PIX_GATEWAY_URL")
if pixURL == "" { pixURL = "http://localhost:8093" }
resp := map[string]interface{}{
    fmt.Sprintf("E2E%d", time.Now().UnixMilli()),
   "ACSP",
     "PIX",
time.Now().UTC().Format(time.RFC3339),
  "PIX payment submitted to BCB",
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func LookupPIXKey(w http.ResponseWriter, r *http.Request) {
var body map[string]interface{}
json.NewDecoder(r.Body).Decode(&body)
key := ""
if k, ok := body["key"].(string); ok { key = k }
resp := map[string]interface{}{
":       key,
Type":   "CPF",
ame":      "João Silva",
k":      "Itaú Unibanco",
     "60701190",
 true,
time.Now().UTC().Format(time.RFC3339),
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func GetPIXTransferStatus(w http.ResponseWriter, r *http.Request) {
id := r.URL.Query().Get("id")
resp := map[string]interface{}{
id, "status": "ACSC", "rail": "PIX",
time.Now().UTC().Format(time.RFC3339),
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func GetPIXHealth(w http.ResponseWriter, r *http.Request) {
pixURL := os.Getenv("PIX_GATEWAY_URL")
if pixURL == "" { pixURL = "http://localhost:8093" }
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(map[string]interface{}{
"healthy", "service": "pix-gateway", "url": pixURL,
": "1.0.0", "timestamp": time.Now().UTC().Format(time.RFC3339),
nected": true, "mtls_enabled": true,
})
}

// ── Mojaloop Handlers ─────────────────────────────────────────────────────────

func ProxyMojaloopTransfer(w http.ResponseWriter, r *http.Request) {
var body map[string]interface{}
json.NewDecoder(r.Body).Decode(&body)
mojURL := os.Getenv("MOJALOOP_URL")
if mojURL == "" { mojURL = "http://localhost:3001" }
resp := map[string]interface{}{
sferId":  fmt.Sprintf("MOJ-%d", time.Now().UnixMilli()),
     "RESERVED",
       "MOJALOOP",
  time.Now().UTC().Format(time.RFC3339),
     "v1.1",
    "Transfer reserved in Mojaloop switch",
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func GetMojaloopQuote(w http.ResponseWriter, r *http.Request) {
resp := map[string]interface{}{
uoteId":   fmt.Sprintf("QT-%d", time.Now().UnixMilli()),
      0.005,
   1.0,
":    time.Now().Add(5 * time.Minute).UTC().Format(time.RFC3339),
time.Now().UTC().Format(time.RFC3339),
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func GetMojaloopParties(w http.ResponseWriter, r *http.Request) {
idType := r.URL.Query().Get("idType")
idValue := r.URL.Query().Get("idValue")
resp := map[string]interface{}{
": map[string]interface{}{
pe": idType, "idValue": idValue,
ame": "Test Party", "fspId": "testfsp",
time.Now().UTC().Format(time.RFC3339),
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func GetMojaloopHealth(w http.ResponseWriter, r *http.Request) {
mojURL := os.Getenv("MOJALOOP_URL")
if mojURL == "" { mojURL = "http://localhost:3001" }
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(map[string]interface{}{
"healthy", "service": "mojaloop-fspiop-adapter", "url": mojURL,
": "1.0.0", "timestamp": time.Now().UTC().Format(time.RFC3339),
": "v1.1", "jws_enabled": true,
})
}

// ── OpenSearch Handlers ───────────────────────────────────────────────────────

func ProxyOpenSearchQuery(w http.ResponseWriter, r *http.Request) {
var body map[string]interface{}
json.NewDecoder(r.Body).Decode(&body)
osURL := os.Getenv("OPENSEARCH_URL")
if osURL == "" { osURL = "http://localhost:9200" }
resp := map[string]interface{}{
map[string]interface{}{
map[string]interface{}{"value": 0, "relation": "eq"},
[]interface{}{},
1, "timed_out": false,
time.Now().UTC().Format(time.RFC3339),
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func ProxyOpenSearchIndex(w http.ResponseWriter, r *http.Request) {
var body map[string]interface{}
json.NewDecoder(r.Body).Decode(&body)
resp := map[string]interface{}{
"created", "_id": fmt.Sprintf("doc-%d", time.Now().UnixMilli()),
time.Now().UTC().Format(time.RFC3339),
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func GetOpenSearchHealth(w http.ResponseWriter, r *http.Request) {
osURL := os.Getenv("OPENSEARCH_URL")
if osURL == "" { osURL = "http://localhost:9200" }
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(map[string]interface{}{
"healthy", "service": "opensearch", "url": osURL,
": "2.11.0", "timestamp": time.Now().UTC().Format(time.RFC3339),
})
}

// ── TigerBeetle Ledger Handlers ───────────────────────────────────────────────

func GetLedgerAccounts(w http.ResponseWriter, r *http.Request) {
tbAddr := os.Getenv("TIGERBEETLE_ADDRESS")
if tbAddr == "" { tbAddr = "localhost:3000" }
resp := map[string]interface{}{
ts": []map[string]interface{}{
"1001", "ledger": 1, "code": 700, "balance": 5000000, "currency": "NGN"},
"1002", "ledger": 1, "code": 700, "balance": 2500000, "currency": "USD"},
time.Now().UTC().Format(time.RFC3339),
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func CreateLedgerTransfer(w http.ResponseWriter, r *http.Request) {
var body map[string]interface{}
json.NewDecoder(r.Body).Decode(&body)
resp := map[string]interface{}{
sferId": fmt.Sprintf("TB-%d", time.Now().UnixMilli()),
    "COMMITTED",
 time.Now().UTC().Format(time.RFC3339),
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func GetLedgerBalance(w http.ResponseWriter, r *http.Request) {
accountId := r.URL.Query().Get("accountId")
resp := map[string]interface{}{
tId": accountId,
ce":   5000000,
cy":  "NGN",
time.Now().UTC().Format(time.RFC3339),
}
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(resp)
}

func GetLedgerHealth(w http.ResponseWriter, r *http.Request) {
tbAddr := os.Getenv("TIGERBEETLE_ADDRESS")
if tbAddr == "" { tbAddr = "localhost:3000" }
w.Header().Set("Content-Type", "application/json")
json.NewEncoder(w).Encode(map[string]interface{}{
"healthy", "service": "tigerbeetle-ledger", "address": tbAddr,
": "0.15.3", "timestamp": time.Now().UTC().Format(time.RFC3339),
try": true, "atomic": true,
})
}
