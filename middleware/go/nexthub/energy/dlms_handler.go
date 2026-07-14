// Package energy — DLMS/COSEM + IEC 62055-41 STS interoperability adapter
//
// Open-source standards used:
//   DLMS/COSEM: IEC 62056 series — smart meter communication (open IEC standard)
//   STS:        IEC 62055-41 — Standard Transfer Specification for prepayment meters
//   ESME:       EN 13757-1 — Energy metering data exchange (open CENELEC standard)
//   OpenADR:    https://www.openadr.org (open, Apache 2.0) — demand response
//   OCPP:       https://www.openchargealliance.org (open) — EV charging
//   OpenMUC:    https://www.openmuc.org (LGPL 3.0) — DLMS/COSEM Java library
//
// Architecture:
//   DISCO (IKEDC/EKEDC/AEDC/PHEDC/EEDC) → DLMS/COSEM → this handler → PayGate vend
//   Smart meter → STS token request → this handler → Rust STS engine → 20-digit token
//   EV charger → OCPP 2.0.1 → this handler → PayGate energy payment
//
// Supported protocols:
//   DLMS/COSEM: meter data read, meter configuration, load profile
//   STS (IEC 62055-41): token generation, token transfer, credit management
//   OpenADR 2.0b: demand response events
//   OCPP 2.0.1: EV charging session management
package energy

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ─── DLMS/COSEM Structures ────────────────────────────────────────────────────

// DLMSMeterData represents a DLMS/COSEM meter data read response
type DLMSMeterData struct {
	MeterSerialNumber string          `json:"meterSerialNumber"`
	MeterType         string          `json:"meterType"`    // single-phase, three-phase
	Timestamp         string          `json:"timestamp"`
	ActiveEnergyImport float64        `json:"activeEnergyImport"`  // kWh
	ActiveEnergyExport float64        `json:"activeEnergyExport"`  // kWh (for solar)
	ReactivePower     float64         `json:"reactivePower"`       // kVAr
	Voltage           []float64       `json:"voltage"`             // V per phase
	Current           []float64       `json:"current"`             // A per phase
	PowerFactor       float64         `json:"powerFactor"`
	CreditBalance     float64         `json:"creditBalance"`       // kWh remaining
	TamperStatus      bool            `json:"tamperStatus"`
	LoadProfile       []DLMSLoadEntry `json:"loadProfile,omitempty"`
}

type DLMSLoadEntry struct {
	Timestamp    string  `json:"timestamp"`
	ActivePower  float64 `json:"activePower"` // kW
	ReactivePower float64 `json:"reactivePower"`
}

// DLMSMeterConfig represents DLMS/COSEM meter configuration parameters
type DLMSMeterConfig struct {
	MeterSerialNumber string  `json:"meterSerialNumber"`
	Tariff            float64 `json:"tariff"`           // NGN per kWh
	MaxDemand         float64 `json:"maxDemand"`        // kW
	LoadLimit         float64 `json:"loadLimit"`        // kW
	CreditLimit       float64 `json:"creditLimit"`      // kWh
	DisconnectOnLowCredit bool `json:"disconnectOnLowCredit"`
	LowCreditThreshold float64 `json:"lowCreditThreshold"` // kWh
}

// ─── STS (IEC 62055-41) Structures ──────────────────────────────────────────

// STSTokenRequest is the request to generate a prepayment STS token
type STSTokenRequest struct {
	MeterSerialNumber string  `json:"meterSerialNumber"`
	MeterType         string  `json:"meterType"`   // electricity, water, gas
	Amount            float64 `json:"amount"`      // NGN
	Currency          string  `json:"currency"`
	Units             float64 `json:"units"`       // kWh (calculated from amount/tariff)
	TokenClass        string  `json:"tokenClass"`  // credit, keychange, set_maximum_power_limit
	DISCOCode         string  `json:"discoCode"`   // IKEDC, EKEDC, AEDC, PHEDC, EEDC, KEDCO, JED, BEDC
	PaymentRef        string  `json:"paymentRef"`
}

// STSTokenResponse is the STS token generation response
type STSTokenResponse struct {
	Token             string  `json:"token"`              // 20-digit STS token
	MeterSerialNumber string  `json:"meterSerialNumber"`
	Units             float64 `json:"units"`              // kWh credited
	Amount            float64 `json:"amount"`
	Currency          string  `json:"currency"`
	DISCOCode         string  `json:"discoCode"`
	TokenClass        string  `json:"tokenClass"`
	ExpiryDate        string  `json:"expiryDate"`
	PaymentRef        string  `json:"paymentRef"`
	GeneratedAt       string  `json:"generatedAt"`
}

// ─── OpenADR 2.0b Structures ─────────────────────────────────────────────────

// OpenADREvent represents an OpenADR 2.0b demand response event
type OpenADREvent struct {
	EventID       string  `json:"eventID"`
	EventStatus   string  `json:"eventStatus"`   // far, near, active, completed, cancelled
	StartDT       string  `json:"startDT"`
	Duration      string  `json:"duration"`      // ISO 8601 duration
	SignalType     string  `json:"signalType"`    // SIMPLE, PRICE, LOAD_DISPATCH
	SignalPayload  float64 `json:"signalPayload"` // 0=normal, 1=moderate, 2=high, 3=special
	MarketContext  string  `json:"marketContext"`
	VenID         string  `json:"venID"`         // Virtual End Node ID
}

// ─── OCPP 2.0.1 Structures ───────────────────────────────────────────────────

// OCPPChargeSession represents an OCPP 2.0.1 charging session
type OCPPChargeSession struct {
	SessionID     string  `json:"sessionId"`
	ChargePointID string  `json:"chargePointId"`
	ConnectorID   int     `json:"connectorId"`
	StartTime     string  `json:"startTime"`
	StopTime      string  `json:"stopTime,omitempty"`
	EnergyDelivered float64 `json:"energyDelivered"` // kWh
	Cost          float64 `json:"cost"`
	Currency      string  `json:"currency"`
	Status        string  `json:"status"` // Charging, Finishing, Completed
	PaymentRef    string  `json:"paymentRef,omitempty"`
}

// ─── DISCO Configuration ─────────────────────────────────────────────────────

var DISCOConfigs = map[string]map[string]interface{}{
	"IKEDC": {"name": "Ikeja Electric", "state": "Lagos", "tariff": 68.0, "currency": "NGN"},
	"EKEDC": {"name": "Eko Electricity", "state": "Lagos", "tariff": 68.0, "currency": "NGN"},
	"AEDC":  {"name": "Abuja Electricity", "state": "FCT", "tariff": 62.0, "currency": "NGN"},
	"PHEDC": {"name": "Port Harcourt Electric", "state": "Rivers", "tariff": 55.0, "currency": "NGN"},
	"EEDC":  {"name": "Enugu Electricity", "state": "Enugu", "tariff": 52.0, "currency": "NGN"},
	"KEDCO": {"name": "Kano Electricity", "state": "Kano", "tariff": 48.0, "currency": "NGN"},
	"JED":   {"name": "Jos Electricity", "state": "Plateau", "tariff": 50.0, "currency": "NGN"},
	"BEDC":  {"name": "Benin Electricity", "state": "Edo", "tariff": 54.0, "currency": "NGN"},
}

// ─── DLMS Handler ─────────────────────────────────────────────────────────────

type DLMSHandler struct {
	logger *zap.Logger
}

func NewDLMSHandler(logger *zap.Logger) *DLMSHandler {
	return &DLMSHandler{logger: logger}
}

func (h *DLMSHandler) RegisterRoutes(rg *gin.RouterGroup) {
	// DLMS/COSEM endpoints
	rg.GET("/dlms/meter/:serial", h.ReadMeterData)
	rg.GET("/dlms/meter/:serial/load-profile", h.GetLoadProfile)
	rg.PUT("/dlms/meter/:serial/config", h.ConfigureMeter)
	rg.POST("/dlms/meter/:serial/disconnect", h.DisconnectMeter)
	rg.POST("/dlms/meter/:serial/reconnect", h.ReconnectMeter)

	// STS token endpoints
	rg.POST("/sts/token", h.GenerateSTSToken)
	rg.POST("/sts/token/validate", h.ValidateSTSToken)
	rg.GET("/sts/meter/:serial/balance", h.GetMeterBalance)

	// Vend (payment + token) endpoint
	rg.POST("/vend", h.VendElectricity)
	rg.GET("/vend/:ref", h.GetVendStatus)

	// DISCO management
	rg.GET("/disco", h.ListDISCOs)
	rg.GET("/disco/:code", h.GetDISCO)
	rg.GET("/disco/:code/tariff", h.GetTariff)

	// OpenADR 2.0b endpoints
	rg.POST("/openadr/event", h.CreateDREvent)
	rg.GET("/openadr/event/:id", h.GetDREvent)
	rg.POST("/openadr/ven/:id/opt", h.VENOptInOut)

	// OCPP 2.0.1 endpoints
	rg.POST("/ocpp/session/start", h.StartChargeSession)
	rg.POST("/ocpp/session/:id/stop", h.StopChargeSession)
	rg.GET("/ocpp/session/:id", h.GetChargeSession)
	rg.GET("/ocpp/chargepoint/:id/status", h.GetChargePointStatus)
}

// ─── DLMS/COSEM Handlers ─────────────────────────────────────────────────────

func (h *DLMSHandler) ReadMeterData(c *gin.Context) {
	serial := c.Param("serial")
	// In production: connect to DISCO DLMS/COSEM server via TCP/IP or GPRS
	// Using gurux-dlms-go (Apache 2.0): https://github.com/Gurux/gurux.dlms.go
	data := DLMSMeterData{
		MeterSerialNumber:  serial,
		MeterType:          "single-phase",
		Timestamp:          time.Now().Format(time.RFC3339),
		ActiveEnergyImport: 1234.56,
		ActiveEnergyExport: 0.0,
		ReactivePower:      12.3,
		Voltage:            []float64{230.5},
		Current:            []float64{5.2},
		PowerFactor:        0.95,
		CreditBalance:      45.8,
		TamperStatus:       false,
	}
	h.logger.Info("DLMS meter read", zap.String("serial", serial))
	c.JSON(http.StatusOK, data)
}

func (h *DLMSHandler) GetLoadProfile(c *gin.Context) {
	serial := c.Param("serial")
	entries := make([]DLMSLoadEntry, 24)
	for i := range entries {
		entries[i] = DLMSLoadEntry{
			Timestamp:    time.Now().Add(-time.Duration(23-i) * time.Hour).Format(time.RFC3339),
			ActivePower:  0.5 + rand.Float64()*2.0,
			ReactivePower: 0.1 + rand.Float64()*0.5,
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"meterSerialNumber": serial,
		"period":            "24h",
		"entries":           entries,
	})
}

func (h *DLMSHandler) ConfigureMeter(c *gin.Context) {
	serial := c.Param("serial")
	var config DLMSMeterConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	config.MeterSerialNumber = serial
	h.logger.Info("DLMS meter configured", zap.String("serial", serial))
	c.JSON(http.StatusOK, gin.H{"status": "configured", "config": config})
}

func (h *DLMSHandler) DisconnectMeter(c *gin.Context) {
	serial := c.Param("serial")
	h.logger.Info("DLMS meter disconnect", zap.String("serial", serial))
	c.JSON(http.StatusOK, gin.H{"serial": serial, "status": "disconnected", "timestamp": time.Now().Format(time.RFC3339)})
}

func (h *DLMSHandler) ReconnectMeter(c *gin.Context) {
	serial := c.Param("serial")
	h.logger.Info("DLMS meter reconnect", zap.String("serial", serial))
	c.JSON(http.StatusOK, gin.H{"serial": serial, "status": "connected", "timestamp": time.Now().Format(time.RFC3339)})
}

// ─── STS Token Handlers ──────────────────────────────────────────────────────

func (h *DLMSHandler) GenerateSTSToken(c *gin.Context) {
	var req STSTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Calculate units from amount and tariff
	discoConfig, ok := DISCOConfigs[strings.ToUpper(req.DISCOCode)]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("unknown DISCO code: %s", req.DISCOCode)})
		return
	}
	tariff := discoConfig["tariff"].(float64)
	units := req.Amount / tariff

	// Generate 20-digit STS token
	// In production: call the Rust STS engine (nepa_token.rs) via gRPC or shared memory
	// The Rust engine implements IEC 62055-41 AES-128 token generation
	token := generateSTSToken20Digit(req.MeterSerialNumber, units)

	resp := STSTokenResponse{
		Token:             token,
		MeterSerialNumber: req.MeterSerialNumber,
		Units:             units,
		Amount:            req.Amount,
		Currency:          req.Currency,
		DISCOCode:         strings.ToUpper(req.DISCOCode),
		TokenClass:        req.TokenClass,
		ExpiryDate:        time.Now().AddDate(0, 0, 365).Format("2006-01-02"),
		PaymentRef:        req.PaymentRef,
		GeneratedAt:       time.Now().Format(time.RFC3339),
	}

	h.logger.Info("STS token generated",
		zap.String("serial", req.MeterSerialNumber),
		zap.Float64("units", units),
		zap.String("disco", req.DISCOCode),
	)
	c.JSON(http.StatusCreated, resp)
}

func (h *DLMSHandler) ValidateSTSToken(c *gin.Context) {
	var req struct {
		Token             string `json:"token"`
		MeterSerialNumber string `json:"meterSerialNumber"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Validate 20-digit format
	cleaned := strings.ReplaceAll(req.Token, " ", "")
	if len(cleaned) != 20 {
		c.JSON(http.StatusBadRequest, gin.H{"valid": false, "error": "STS token must be 20 digits"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"valid":  true,
		"token":  req.Token,
		"serial": req.MeterSerialNumber,
	})
}

func (h *DLMSHandler) GetMeterBalance(c *gin.Context) {
	serial := c.Param("serial")
	c.JSON(http.StatusOK, gin.H{
		"meterSerialNumber": serial,
		"creditBalance":     45.8,
		"unit":              "kWh",
		"lastUpdated":       time.Now().Format(time.RFC3339),
	})
}

// ─── Vend Handlers ───────────────────────────────────────────────────────────

func (h *DLMSHandler) VendElectricity(c *gin.Context) {
	var req struct {
		MeterSerialNumber string  `json:"meterSerialNumber"`
		Amount            float64 `json:"amount"`
		Currency          string  `json:"currency"`
		DISCOCode         string  `json:"discoCode"`
		PaymentMethod     string  `json:"paymentMethod"` // card, wallet, ussd
		CustomerRef       string  `json:"customerRef"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	vendRef := uuid.NewString()
	discoConfig, ok := DISCOConfigs[strings.ToUpper(req.DISCOCode)]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("unknown DISCO: %s", req.DISCOCode)})
		return
	}
	tariff := discoConfig["tariff"].(float64)
	units := req.Amount / tariff
	token := generateSTSToken20Digit(req.MeterSerialNumber, units)

	h.logger.Info("Electricity vend",
		zap.String("vendRef", vendRef),
		zap.String("serial", req.MeterSerialNumber),
		zap.Float64("amount", req.Amount),
		zap.Float64("units", units),
	)

	c.JSON(http.StatusCreated, gin.H{
		"vendRef":           vendRef,
		"meterSerialNumber": req.MeterSerialNumber,
		"token":             token,
		"units":             units,
		"amount":            req.Amount,
		"currency":          req.Currency,
		"discoCode":         strings.ToUpper(req.DISCOCode),
		"discoName":         discoConfig["name"],
		"status":            "completed",
		"vendedAt":          time.Now().Format(time.RFC3339),
	})
}

func (h *DLMSHandler) GetVendStatus(c *gin.Context) {
	ref := c.Param("ref")
	c.JSON(http.StatusOK, gin.H{
		"vendRef": ref,
		"status":  "completed",
		"updatedAt": time.Now().Format(time.RFC3339),
	})
}

// ─── DISCO Handlers ──────────────────────────────────────────────────────────

func (h *DLMSHandler) ListDISCOs(c *gin.Context) {
	discos := make([]map[string]interface{}, 0, len(DISCOConfigs))
	for code, cfg := range DISCOConfigs {
		entry := map[string]interface{}{"code": code}
		for k, v := range cfg {
			entry[k] = v
		}
		discos = append(discos, entry)
	}
	c.JSON(http.StatusOK, gin.H{"discos": discos, "total": len(discos)})
}

func (h *DLMSHandler) GetDISCO(c *gin.Context) {
	code := strings.ToUpper(c.Param("code"))
	cfg, ok := DISCOConfigs[code]
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("DISCO %s not found", code)})
		return
	}
	result := map[string]interface{}{"code": code}
	for k, v := range cfg {
		result[k] = v
	}
	c.JSON(http.StatusOK, result)
}

func (h *DLMSHandler) GetTariff(c *gin.Context) {
	code := strings.ToUpper(c.Param("code"))
	cfg, ok := DISCOConfigs[code]
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("DISCO %s not found", code)})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"discoCode": code,
		"tariff":    cfg["tariff"],
		"currency":  cfg["currency"],
		"unit":      "NGN/kWh",
		"effectiveDate": "2024-01-01",
	})
}

// ─── OpenADR 2.0b Handlers ───────────────────────────────────────────────────

func (h *DLMSHandler) CreateDREvent(c *gin.Context) {
	var event OpenADREvent
	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	event.EventID = uuid.NewString()
	event.EventStatus = "far"
	h.logger.Info("OpenADR event created", zap.String("eventID", event.EventID))
	c.JSON(http.StatusCreated, event)
}

func (h *DLMSHandler) GetDREvent(c *gin.Context) {
	eventID := c.Param("id")
	c.JSON(http.StatusOK, OpenADREvent{
		EventID:     eventID,
		EventStatus: "active",
		SignalType:  "SIMPLE",
		SignalPayload: 1.0,
	})
}

func (h *DLMSHandler) VENOptInOut(c *gin.Context) {
	venID := c.Param("id")
	var req struct {
		EventID string `json:"eventID"`
		OptType string `json:"optType"` // optIn, optOut
		Reason  string `json:"reason,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"venID":   venID,
		"eventID": req.EventID,
		"optType": req.OptType,
		"status":  "acknowledged",
	})
}

// ─── OCPP 2.0.1 Handlers ─────────────────────────────────────────────────────

func (h *DLMSHandler) StartChargeSession(c *gin.Context) {
	var req struct {
		ChargePointID string `json:"chargePointId"`
		ConnectorID   int    `json:"connectorId"`
		IdTag         string `json:"idTag"`
		PaymentMethod string `json:"paymentMethod"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	session := OCPPChargeSession{
		SessionID:     uuid.NewString(),
		ChargePointID: req.ChargePointID,
		ConnectorID:   req.ConnectorID,
		StartTime:     time.Now().Format(time.RFC3339),
		Status:        "Charging",
		Currency:      "NGN",
	}
	h.logger.Info("OCPP charge session started",
		zap.String("sessionID", session.SessionID),
		zap.String("chargePoint", req.ChargePointID),
	)
	c.JSON(http.StatusCreated, session)
}

func (h *DLMSHandler) StopChargeSession(c *gin.Context) {
	sessionID := c.Param("id")
	session := OCPPChargeSession{
		SessionID:       sessionID,
		StopTime:        time.Now().Format(time.RFC3339),
		EnergyDelivered: 15.4,
		Cost:            1047.2,
		Currency:        "NGN",
		Status:          "Completed",
	}
	c.JSON(http.StatusOK, session)
}

func (h *DLMSHandler) GetChargeSession(c *gin.Context) {
	sessionID := c.Param("id")
	c.JSON(http.StatusOK, OCPPChargeSession{
		SessionID: sessionID,
		Status:    "Charging",
		Currency:  "NGN",
	})
}

func (h *DLMSHandler) GetChargePointStatus(c *gin.Context) {
	chargePointID := c.Param("id")
	c.JSON(http.StatusOK, gin.H{
		"chargePointId": chargePointID,
		"status":        "Available",
		"connectors": []map[string]interface{}{
			{"id": 1, "status": "Available", "type": "Type2"},
			{"id": 2, "status": "Occupied", "type": "CCS"},
		},
		"lastHeartbeat": time.Now().Format(time.RFC3339),
	})
}

// ─── STS Token Generator ─────────────────────────────────────────────────────

// generateSTSToken20Digit generates a 20-digit STS token
// In production this calls the Rust STS engine (nepa_token.rs) via gRPC
// which implements IEC 62055-41 AES-128 token generation
func generateSTSToken20Digit(meterSerial string, units float64) string {
	// Simplified deterministic token for demo
	// Real implementation: Rust nepa_token.rs → AES-128 encryption → 66-bit token → 20-digit BCD
	hash := 0
	for _, c := range meterSerial {
		hash = hash*31 + int(c)
	}
	unitsInt := int(units * 100)
	raw := fmt.Sprintf("%020d", (hash^unitsInt)%100000000000000000)
	if len(raw) > 20 {
		raw = raw[:20]
	}
	// Format as 4-4-4-4-4
	parts := []string{raw[0:4], raw[4:8], raw[8:12], raw[12:16], raw[16:20]}
	return strings.Join(parts, " ")
}

// ─── DLMS ↔ PayGate Mapper ────────────────────────────────────────────────────

// DLMSMeterDataToPayGate converts DLMS meter data to a PayGate vend transaction map
func DLMSMeterDataToPayGate(data *DLMSMeterData, amount float64, currency, discoCode, paymentRef string) map[string]interface{} {
	return map[string]interface{}{
		"meterSerialNumber": data.MeterSerialNumber,
		"creditBalance":     data.CreditBalance,
		"activeEnergyImport": data.ActiveEnergyImport,
		"tamperStatus":      data.TamperStatus,
		"amount":            amount,
		"currency":          currency,
		"discoCode":         discoCode,
		"paymentRef":        paymentRef,
		"protocol":          "DLMS-COSEM",
		"timestamp":         data.Timestamp,
	}
}

// STSTokenToPayGate converts an STS token response to a PayGate vend result
func STSTokenToPayGate(resp *STSTokenResponse) map[string]interface{} {
	return map[string]interface{}{
		"token":             resp.Token,
		"meterSerialNumber": resp.MeterSerialNumber,
		"units":             resp.Units,
		"amount":            resp.Amount,
		"currency":          resp.Currency,
		"discoCode":         resp.DISCOCode,
		"protocol":          "STS-IEC62055-41",
		"generatedAt":       resp.GeneratedAt,
	}
}

// MarshalDLMS serialises DLMS meter data to JSON
func MarshalDLMS(data *DLMSMeterData) ([]byte, error) {
	return json.Marshal(data)
}

// ParseTariffFromDISCO returns the tariff (NGN/kWh) for a given DISCO code
func ParseTariffFromDISCO(discoCode string) (float64, error) {
	cfg, ok := DISCOConfigs[strings.ToUpper(discoCode)]
	if !ok {
		return 0, fmt.Errorf("unknown DISCO code: %s", discoCode)
	}
	return cfg["tariff"].(float64), nil
}

// UnitsFromAmount calculates kWh units from NGN amount and DISCO tariff
func UnitsFromAmount(amount float64, discoCode string) (float64, error) {
	tariff, err := ParseTariffFromDISCO(discoCode)
	if err != nil {
		return 0, err
	}
	return amount / tariff, nil
}

// AmountFromUnits calculates NGN amount from kWh units and DISCO tariff
func AmountFromUnits(units float64, discoCode string) (float64, error) {
	tariff, err := ParseTariffFromDISCO(discoCode)
	if err != nil {
		return 0, err
	}
	return units * tariff, nil
}

// FormatSTSToken formats a raw 20-digit string as a human-readable STS token
func FormatSTSToken(raw string) string {
	digits := strings.ReplaceAll(raw, " ", "")
	if len(digits) != 20 {
		return raw
	}
	return strings.Join([]string{
		digits[0:4], digits[4:8], digits[8:12], digits[12:16], digits[16:20],
	}, " ")
}

// ValidateSTSTokenFormat validates the format of a 20-digit STS token
func ValidateSTSTokenFormat(token string) error {
	digits := strings.ReplaceAll(token, " ", "")
	if len(digits) != 20 {
		return fmt.Errorf("STS token must be 20 digits, got %d", len(digits))
	}
	if _, err := strconv.ParseUint(digits, 10, 64); err != nil {
		return fmt.Errorf("STS token must contain only digits: %w", err)
	}
	return nil
}
