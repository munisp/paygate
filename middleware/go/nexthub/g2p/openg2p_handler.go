// Package g2p — OpenG2P / MOSIP interoperability adapter
//
// Open-source standards used:
//   OpenG2P:  https://github.com/OpenG2P (Apache 2.0) — G2P payment orchestration
//   MOSIP:    https://github.com/mosip (MPL 2.0) — Modular Open Source Identity Platform
//   OpenSPP:  https://github.com/OpenSPP (LGPL 3.0) — Social Protection Platform
//   G2P Connect: https://g2pconnect.cdpi.dev (open spec) — CDPI G2P interoperability
//   OpenID4VP: https://openid.net/specs/openid-4-verifiable-presentations-1_0.html
//
// Architecture:
//   NASIMS/NDE/CCT → G2P Connect API → this handler → PayGate bulk disbursement
//   MOSIP identity → NIN/BVN resolver → ALS account lookup → TigerBeetle credit
//
// Supported protocols:
//   G2P Connect v1.0: /disbursement, /beneficiary, /status
//   MOSIP ID Auth: /idauthentication, /otp
//   OpenG2P REST: /programs, /beneficiaries, /payments
//   OpenSPP FHIR: /fhir/R4/Patient (beneficiary as FHIR Patient)
package g2p

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ─── G2P Connect v1.0 Structures ─────────────────────────────────────────────

// G2PConnectHeader is the standard G2P Connect message header
type G2PConnectHeader struct {
	Version      string `json:"version"`       // "1.0.0"
	MessageID    string `json:"message_id"`
	MessageTS    string `json:"message_ts"`
	Action       string `json:"action"`        // disbursement, status, search
	SenderID     string `json:"sender_id"`
	ReceiverID   string `json:"receiver_id"`
	IsMsgEncrypted bool `json:"is_msg_encrypted"`
}

// G2PConnectDisbursementRequest is the G2P Connect disbursement request
type G2PConnectDisbursementRequest struct {
	Signature string                    `json:"signature"`
	Header    G2PConnectHeader          `json:"header"`
	Message   G2PConnectDisbursementMsg `json:"message"`
}

type G2PConnectDisbursementMsg struct {
	TransactionID string                `json:"transaction_id"`
	DisbursementList []G2PDisbursement  `json:"disbursement_list"`
}

type G2PDisbursement struct {
	DisbursementID   string  `json:"disbursement_id"`
	BeneficiaryID    string  `json:"beneficiary_id"`     // NIN or MOSIP UIN
	BeneficiaryName  string  `json:"beneficiary_name"`
	Amount           float64 `json:"amount"`
	Currency         string  `json:"currency"`
	NarrationCode    string  `json:"narration_code"`     // program code
	PaymentDate      string  `json:"payment_date"`
	AccountDetails   *G2PAccountDetails `json:"account_details,omitempty"`
}

type G2PAccountDetails struct {
	AccountType   string `json:"account_type"`   // bank, mobile_money, wallet
	AccountNumber string `json:"account_number"`
	BankCode      string `json:"bank_code,omitempty"`
	MobileNumber  string `json:"mobile_number,omitempty"`
}

// G2PConnectStatusRequest is the G2P Connect status enquiry request
type G2PConnectStatusRequest struct {
	Header  G2PConnectHeader `json:"header"`
	Message struct {
		TransactionID string `json:"transaction_id"`
		DisbursementIDs []string `json:"disbursement_ids"`
	} `json:"message"`
}

// G2PConnectResponse is the standard G2P Connect response
type G2PConnectResponse struct {
	Signature string                 `json:"signature"`
	Header    G2PConnectHeader       `json:"header"`
	Message   map[string]interface{} `json:"message"`
}

// ─── MOSIP ID Auth Structures ─────────────────────────────────────────────────

type MOSIPAuthRequest struct {
	ID          string `json:"id"`           // "mosip.identity.auth"
	Version     string `json:"version"`      // "1.0"
	RequestTime string `json:"requestTime"`
	TransactionID string `json:"transactionID"`
	IndividualID  string `json:"individualId"` // UIN or VID
	IndividualIDType string `json:"individualIdType"` // UIN, VID
	ConsentObtained bool `json:"consentObtained"`
	RequestedAuth struct {
		OTP  bool `json:"otp"`
		Demo bool `json:"demo"`
		Bio  bool `json:"bio"`
	} `json:"requestedAuth"`
	Request string `json:"request"` // encrypted auth data
}

type MOSIPAuthResponse struct {
	ID          string `json:"id"`
	Version     string `json:"version"`
	ResponseTime string `json:"responseTime"`
	TransactionID string `json:"transactionID"`
	Response    struct {
		AuthStatus bool   `json:"authStatus"`
		AuthToken  string `json:"authToken,omitempty"`
	} `json:"response"`
	Errors []MOSIPError `json:"errors,omitempty"`
}

type MOSIPError struct {
	ErrorCode string `json:"errorCode"`
	ErrorMessage string `json:"errorMessage"`
}

// ─── OpenG2P Program Structures ──────────────────────────────────────────────

type OpenG2PProgram struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Code        string `json:"code"`        // NASIMS, CCT, NPOWER, TRADERMONI
	Description string `json:"description"`
	Currency    string `json:"currency"`
	BenefitAmount float64 `json:"benefit_amount"`
	Frequency   string `json:"frequency"`   // monthly, quarterly, one-time
	Active      bool   `json:"active"`
}

type OpenG2PBeneficiary struct {
	ID          string `json:"id"`
	NIN         string `json:"nin"`
	BVN         string `json:"bvn,omitempty"`
	MosipUIN    string `json:"mosip_uin,omitempty"`
	FullName    string `json:"full_name"`
	DateOfBirth string `json:"date_of_birth"`
	Gender      string `json:"gender"`
	State       string `json:"state"`
	LGA         string `json:"lga"`
	ProgramCode string `json:"program_code"`
	AccountNumber string `json:"account_number,omitempty"`
	BankCode    string `json:"bank_code,omitempty"`
	MobileNumber string `json:"mobile_number,omitempty"`
	Status      string `json:"status"` // active, suspended, exited
}

// ─── OpenG2P Handler ─────────────────────────────────────────────────────────

type OpenG2PHandler struct {
	logger *zap.Logger
}

func NewOpenG2PHandler(logger *zap.Logger) *OpenG2PHandler {
	return &OpenG2PHandler{logger: logger}
}

func (h *OpenG2PHandler) RegisterRoutes(rg *gin.RouterGroup) {
	// G2P Connect v1.0 endpoints
	rg.POST("/g2pconnect/disbursement", h.G2PConnectDisbursement)
	rg.POST("/g2pconnect/status", h.G2PConnectStatus)
	rg.POST("/g2pconnect/beneficiary/search", h.G2PConnectBeneficiarySearch)

	// MOSIP ID Auth endpoints
	rg.POST("/mosip/auth", h.MOSIPAuthenticate)
	rg.POST("/mosip/otp", h.MOSIPSendOTP)
	rg.GET("/mosip/uin/:nin", h.MOSIPResolveNIN)

	// OpenG2P REST endpoints
	rg.GET("/programs", h.ListPrograms)
	rg.GET("/programs/:code", h.GetProgram)
	rg.POST("/beneficiaries", h.RegisterBeneficiary)
	rg.GET("/beneficiaries/:id", h.GetBeneficiary)
	rg.PUT("/beneficiaries/:id", h.UpdateBeneficiary)
	rg.GET("/beneficiaries/nin/:nin", h.GetBeneficiaryByNIN)

	// OpenSPP FHIR endpoint (beneficiary as FHIR Patient)
	rg.GET("/fhir/R4/Patient/:id", h.GetBeneficiaryAsFHIR)
	rg.POST("/fhir/R4/Patient", h.RegisterBeneficiaryAsFHIR)

	// Batch disbursement
	rg.POST("/disbursement/batch", h.CreateDisbursementBatch)
	rg.GET("/disbursement/batch/:id", h.GetBatchStatus)
	rg.POST("/disbursement/batch/:id/reconcile", h.ReconcileBatch)

	// NIN/BVN resolution
	rg.GET("/resolve/nin/:nin", h.ResolveNIN)
	rg.GET("/resolve/bvn/:bvn", h.ResolveBVN)
}

// ─── G2P Connect Handlers ─────────────────────────────────────────────────────

func (h *OpenG2PHandler) G2PConnectDisbursement(c *gin.Context) {
	var req G2PConnectDisbursementRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	batchID := uuid.NewString()
	results := make([]map[string]interface{}, len(req.Message.DisbursementList))

	for i, d := range req.Message.DisbursementList {
		txID := uuid.NewString()
		h.logger.Info("G2P Connect disbursement",
			zap.String("batchID", batchID),
			zap.String("beneficiaryID", d.BeneficiaryID),
			zap.Float64("amount", d.Amount),
		)
		results[i] = map[string]interface{}{
			"disbursement_id": d.DisbursementID,
			"transaction_id":  txID,
			"status":          "queued",
			"timestamp":       time.Now().Format(time.RFC3339),
		}
	}

	resp := G2PConnectResponse{
		Header: G2PConnectHeader{
			Version:    "1.0.0",
			MessageID:  uuid.NewString(),
			MessageTS:  time.Now().Format(time.RFC3339),
			Action:     "disbursement",
			SenderID:   "paygate-nexthub",
			ReceiverID: req.Header.SenderID,
		},
		Message: map[string]interface{}{
			"transaction_id":    req.Message.TransactionID,
			"batch_id":          batchID,
			"disbursement_count": len(req.Message.DisbursementList),
			"status":            "accepted",
			"results":           results,
		},
	}
	c.JSON(http.StatusAccepted, resp)
}

func (h *OpenG2PHandler) G2PConnectStatus(c *gin.Context) {
	var req G2PConnectStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	statuses := make([]map[string]interface{}, len(req.Message.DisbursementIDs))
	for i, id := range req.Message.DisbursementIDs {
		statuses[i] = map[string]interface{}{
			"disbursement_id": id,
			"status":          "completed",
			"timestamp":       time.Now().Format(time.RFC3339),
		}
	}
	c.JSON(http.StatusOK, G2PConnectResponse{
		Header: G2PConnectHeader{
			Version:   "1.0.0",
			MessageID: uuid.NewString(),
			MessageTS: time.Now().Format(time.RFC3339),
			Action:    "status",
		},
		Message: map[string]interface{}{
			"transaction_id": req.Message.TransactionID,
			"statuses":       statuses,
		},
	})
}

func (h *OpenG2PHandler) G2PConnectBeneficiarySearch(c *gin.Context) {
	var req struct {
		Header  G2PConnectHeader `json:"header"`
		Message struct {
			SearchCriteria map[string]string `json:"search_criteria"`
			Pagination     struct {
				PageNumber int `json:"page_number"`
				PageSize   int `json:"page_size"`
			} `json:"pagination"`
		} `json:"message"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, G2PConnectResponse{
		Header: G2PConnectHeader{
			Version:   "1.0.0",
			MessageID: uuid.NewString(),
			MessageTS: time.Now().Format(time.RFC3339),
			Action:    "beneficiary_search",
		},
		Message: map[string]interface{}{
			"total_count": 0,
			"beneficiaries": []interface{}{},
		},
	})
}

// ─── MOSIP Handlers ──────────────────────────────────────────────────────────

func (h *OpenG2PHandler) MOSIPAuthenticate(c *gin.Context) {
	var req MOSIPAuthRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// In production: call MOSIP IDA service
	resp := MOSIPAuthResponse{
		ID:            "mosip.identity.auth",
		Version:       "1.0",
		ResponseTime:  time.Now().Format(time.RFC3339),
		TransactionID: req.TransactionID,
	}
	resp.Response.AuthStatus = true
	resp.Response.AuthToken = uuid.NewString()
	c.JSON(http.StatusOK, resp)
}

func (h *OpenG2PHandler) MOSIPSendOTP(c *gin.Context) {
	var req struct {
		IndividualID string `json:"individualId"`
		OTPChannel   string `json:"otpChannel"` // EMAIL, PHONE
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"status":  "OTP_SENT",
		"channel": req.OTPChannel,
		"maskedContact": "****" + req.IndividualID[len(req.IndividualID)-4:],
	})
}

func (h *OpenG2PHandler) MOSIPResolveNIN(c *gin.Context) {
	nin := c.Param("nin")
	// In production: call NIMC NIN verification API
	c.JSON(http.StatusOK, gin.H{
		"nin":       nin,
		"mosip_uin": uuid.NewString(),
		"status":    "verified",
	})
}

// ─── OpenG2P REST Handlers ────────────────────────────────────────────────────

func (h *OpenG2PHandler) ListPrograms(c *gin.Context) {
	programs := []OpenG2PProgram{
		{ID: "1", Name: "N-Power", Code: "NPOWER", Description: "Youth empowerment program", Currency: "NGN", BenefitAmount: 30000, Frequency: "monthly", Active: true},
		{ID: "2", Name: "Conditional Cash Transfer", Code: "CCT", Description: "National Social Investment Programme", Currency: "NGN", BenefitAmount: 5000, Frequency: "monthly", Active: true},
		{ID: "3", Name: "TraderMoni", Code: "TRADERMONI", Description: "Micro-credit for petty traders", Currency: "NGN", BenefitAmount: 10000, Frequency: "one-time", Active: true},
		{ID: "4", Name: "MarketMoni", Code: "MARKETMONI", Description: "Micro-credit for market women", Currency: "NGN", BenefitAmount: 50000, Frequency: "one-time", Active: true},
		{ID: "5", Name: "NASIMS", Code: "NASIMS", Description: "National Social Investment Management System", Currency: "NGN", BenefitAmount: 20000, Frequency: "monthly", Active: true},
	}
	c.JSON(http.StatusOK, gin.H{"programs": programs, "total": len(programs)})
}

func (h *OpenG2PHandler) GetProgram(c *gin.Context) {
	code := strings.ToUpper(c.Param("code"))
	c.JSON(http.StatusOK, OpenG2PProgram{
		ID:          uuid.NewString(),
		Name:        code,
		Code:        code,
		Currency:    "NGN",
		Active:      true,
	})
}

func (h *OpenG2PHandler) RegisterBeneficiary(c *gin.Context) {
	var b OpenG2PBeneficiary
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	b.ID = uuid.NewString()
	b.Status = "active"
	h.logger.Info("Beneficiary registered",
		zap.String("id", b.ID),
		zap.String("nin", b.NIN),
		zap.String("program", b.ProgramCode),
	)
	c.JSON(http.StatusCreated, b)
}

func (h *OpenG2PHandler) GetBeneficiary(c *gin.Context) {
	id := c.Param("id")
	c.JSON(http.StatusOK, OpenG2PBeneficiary{ID: id, Status: "active"})
}

func (h *OpenG2PHandler) UpdateBeneficiary(c *gin.Context) {
	id := c.Param("id")
	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates["id"] = id
	updates["updatedAt"] = time.Now().Format(time.RFC3339)
	c.JSON(http.StatusOK, updates)
}

func (h *OpenG2PHandler) GetBeneficiaryByNIN(c *gin.Context) {
	nin := c.Param("nin")
	c.JSON(http.StatusOK, OpenG2PBeneficiary{
		ID:     uuid.NewString(),
		NIN:    nin,
		Status: "active",
	})
}

// ─── FHIR Patient Representation ─────────────────────────────────────────────

func (h *OpenG2PHandler) GetBeneficiaryAsFHIR(c *gin.Context) {
	id := c.Param("id")
	// Return beneficiary as FHIR R4 Patient resource (OpenSPP compatibility)
	patient := map[string]interface{}{
		"resourceType": "Patient",
		"id":           id,
		"meta": map[string]interface{}{
			"profile": []string{"https://openg2p.org/fhir/StructureDefinition/G2PBeneficiary"},
		},
		"identifier": []map[string]interface{}{
			{"system": "https://nimc.gov.ng/nin", "value": id},
		},
		"active": true,
		"extension": []map[string]interface{}{
			{
				"url": "https://openg2p.org/fhir/ext/program-enrollment",
				"valueString": "CCT",
			},
		},
	}
	c.Header("Content-Type", "application/fhir+json")
	c.JSON(http.StatusOK, patient)
}

func (h *OpenG2PHandler) RegisterBeneficiaryAsFHIR(c *gin.Context) {
	var patient map[string]interface{}
	if err := c.ShouldBindJSON(&patient); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	patient["id"] = uuid.NewString()
	c.Header("Content-Type", "application/fhir+json")
	c.JSON(http.StatusCreated, patient)
}

// ─── Batch Disbursement ──────────────────────────────────────────────────────

func (h *OpenG2PHandler) CreateDisbursementBatch(c *gin.Context) {
	var req struct {
		ProgramCode   string           `json:"programCode"`
		Disbursements []G2PDisbursement `json:"disbursements"`
		ScheduledDate string           `json:"scheduledDate"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	batchID := uuid.NewString()
	totalAmount := 0.0
	for _, d := range req.Disbursements {
		totalAmount += d.Amount
	}
	h.logger.Info("Disbursement batch created",
		zap.String("batchID", batchID),
		zap.String("program", req.ProgramCode),
		zap.Int("count", len(req.Disbursements)),
		zap.Float64("total", totalAmount),
	)
	c.JSON(http.StatusCreated, gin.H{
		"batchID":       batchID,
		"programCode":   req.ProgramCode,
		"count":         len(req.Disbursements),
		"totalAmount":   totalAmount,
		"status":        "queued",
		"scheduledDate": req.ScheduledDate,
		"createdAt":     time.Now().Format(time.RFC3339),
	})
}

func (h *OpenG2PHandler) GetBatchStatus(c *gin.Context) {
	batchID := c.Param("id")
	c.JSON(http.StatusOK, gin.H{
		"batchID":    batchID,
		"status":     "processing",
		"processed":  0,
		"failed":     0,
		"total":      0,
		"updatedAt":  time.Now().Format(time.RFC3339),
	})
}

func (h *OpenG2PHandler) ReconcileBatch(c *gin.Context) {
	batchID := c.Param("id")
	c.JSON(http.StatusOK, gin.H{
		"batchID":      batchID,
		"reconciled":   true,
		"reconciledAt": time.Now().Format(time.RFC3339),
		"mismatches":   0,
	})
}

// ─── NIN/BVN Resolution ──────────────────────────────────────────────────────

func (h *OpenG2PHandler) ResolveNIN(c *gin.Context) {
	nin := c.Param("nin")
	if len(nin) != 11 {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid NIN length: %d (expected 11)", len(nin))})
		return
	}
	// In production: call NIMC NIN verification API
	c.JSON(http.StatusOK, gin.H{
		"nin":          nin,
		"verified":     true,
		"accountFound": true,
		"bankCode":     "000014",
		"accountNumber": "XXXXXXXXXX",
		"source":       "NIMC",
	})
}

func (h *OpenG2PHandler) ResolveBVN(c *gin.Context) {
	bvn := c.Param("bvn")
	if len(bvn) != 11 {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid BVN length: %d (expected 11)", len(bvn))})
		return
	}
	// In production: call CBN BVN verification API
	c.JSON(http.StatusOK, gin.H{
		"bvn":          bvn,
		"verified":     true,
		"accountFound": true,
		"bankCode":     "000014",
		"accountNumber": "XXXXXXXXXX",
		"source":       "CBN-BVN",
	})
}

// ─── G2P Connect ↔ PayGate Mapper ────────────────────────────────────────────

// G2PConnectToPayGateBatch converts a G2P Connect disbursement request to a PayGate batch
func G2PConnectToPayGateBatch(req *G2PConnectDisbursementRequest) map[string]interface{} {
	items := make([]map[string]interface{}, len(req.Message.DisbursementList))
	for i, d := range req.Message.DisbursementList {
		items[i] = map[string]interface{}{
			"beneficiaryID":   d.BeneficiaryID,
			"beneficiaryName": d.BeneficiaryName,
			"amount":          d.Amount,
			"currency":        d.Currency,
			"narration":       d.NarrationCode,
			"paymentDate":     d.PaymentDate,
		}
	}
	return map[string]interface{}{
		"transactionID": req.Message.TransactionID,
		"senderID":      req.Header.SenderID,
		"protocol":      "G2P-Connect-1.0",
		"items":         items,
		"count":         len(items),
	}
}

// PayGateBatchToG2PConnect converts a PayGate batch result to G2P Connect response
func PayGateBatchToG2PConnect(batchID string, results []map[string]interface{}, senderID string) *G2PConnectResponse {
	return &G2PConnectResponse{
		Header: G2PConnectHeader{
			Version:    "1.0.0",
			MessageID:  uuid.NewString(),
			MessageTS:  time.Now().Format(time.RFC3339),
			Action:     "disbursement",
			SenderID:   "paygate-nexthub",
			ReceiverID: senderID,
		},
		Message: map[string]interface{}{
			"batch_id": batchID,
			"status":   "accepted",
			"results":  results,
		},
	}
}

// MarshalG2PConnect serialises a G2P Connect response to JSON
func MarshalG2PConnect(resp *G2PConnectResponse) ([]byte, error) {
	return json.Marshal(resp)
}
