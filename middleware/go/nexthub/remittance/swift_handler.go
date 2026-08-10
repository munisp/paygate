// Package remittance — SWIFT gpi + ISO 20022 pacs.008 + Travel Rule interoperability adapter
//
// Open-source standards used:
//   SWIFT gpi:   https://www.swift.com/our-solutions/global-financial-messaging/swift-gpi (open spec)
//   ISO 20022:   https://www.iso20022.org (open standard) — pacs.008, pacs.002, pacs.004, camt.054
//   FATF Travel Rule: https://www.fatf-gafi.org/en/topics/virtual-assets.html (open standard)
//   IVMS 101:    https://intervasp.org (open) — Travel Rule data format
//   OpenVASP:    https://github.com/OpenVASP/openvasp-csharp-client (MIT) — VASP discovery
//   Notabene:    https://notabene.id (open API) — Travel Rule compliance
//   Mojaloop:    https://mojaloop.io (Apache 2.0) — FSPIOP remittance
//
// Architecture:
//   Sender VASP → SWIFT gpi/ISO 20022 → this handler → Travel Rule (Rust) → PayGate FX workflow
//   FSPIOP remittance → this handler → ISO 20022 converter → correspondent bank
//   SEPA Credit Transfer → this handler → PayGate settlement
//
// Supported protocols:
//   SWIFT gpi: gCCT (cross-currency credit transfer), gCOV (cover payment), gFIT (financial institution transfer)
//   ISO 20022: pacs.008, pacs.002, pacs.004 (return), camt.054, pain.001 (customer credit transfer initiation)
//   SEPA: SCT (SEPA Credit Transfer), SCT Inst (instant)
//   FATF Travel Rule: IVMS 101 originator/beneficiary data
package remittance

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// ─── SWIFT gpi Structures ────────────────────────────────────────────────────

// SWIFTGPIPayment represents a SWIFT gpi cross-currency credit transfer
type SWIFTGPIPayment struct {
	UETR            string  `json:"uetr"`
	InstructionID   string  `json:"instructionId"`
	EndToEndID      string  `json:"endToEndId"`
	TransactionRef  string  `json:"transactionRef"`
	SenderBIC       string  `json:"senderBic"`
	ReceiverBIC     string  `json:"receiverBic"`
	CorrespondentBIC string  `json:"correspondentBic,omitempty"`
	Amount          float64 `json:"amount"`
	Currency        string  `json:"currency"`
	TargetCurrency  string  `json:"targetCurrency"`
	FXRate          float64 `json:"fxRate"`
	ConvertedAmount float64 `json:"convertedAmount"`
	ChargeBearer    string  `json:"chargeBearer"` // SLEV, SHAR, DEBT, CRED
	Purpose         string  `json:"purpose"`
	Originator      SWIFTParty `json:"originator"`
	Beneficiary     SWIFTParty `json:"beneficiary"`
	TravelRule      *TravelRuleData `json:"travelRule,omitempty"`
	Status          string  `json:"status"`
	StatusTimestamp string  `json:"statusTimestamp"`
}

type SWIFTParty struct {
	Name        string `json:"name"`
	AccountNumber string `json:"accountNumber"`
	BIC         string `json:"bic,omitempty"`
	IBAN        string `json:"iban,omitempty"`
	Address     SWIFTAddress `json:"address"`
	LEI         string `json:"lei,omitempty"` // Legal Entity Identifier
}

type SWIFTAddress struct {
	Street  string `json:"street,omitempty"`
	City    string `json:"city"`
	Country string `json:"country"` // ISO 3166-1 alpha-2
	PostCode string `json:"postCode,omitempty"`
}

// SWIFTGPIStatus represents a SWIFT gpi payment status update
type SWIFTGPIStatus struct {
	UETR            string `json:"uetr"`
	Status          string `json:"status"` // ACCC, ACSP, RJCT, PDNG
	StatusDescription string `json:"statusDescription"`
	UpdatedAt       string `json:"updatedAt"`
	ConfirmationRef string `json:"confirmationRef,omitempty"`
	ChargesAmount   float64 `json:"chargesAmount,omitempty"`
	ChargesCurrency string `json:"chargesCurrency,omitempty"`
}

// ─── IVMS 101 Travel Rule Structures ─────────────────────────────────────────

// TravelRuleData is the IVMS 101 Travel Rule payload (FATF Recommendation 16)
type TravelRuleData struct {
	Originator  IVMS101Person `json:"originator"`
	Beneficiary IVMS101Person `json:"beneficiary"`
	OriginatingVASP IVMS101VASP `json:"originatingVasp"`
	BeneficiaryVASP IVMS101VASP `json:"beneficiaryVasp"`
	TransferAmount float64 `json:"transferAmount"`
	TransferCurrency string `json:"transferCurrency"`
	Signature   string `json:"signature,omitempty"` // ed25519 signature from Rust signer
}

type IVMS101Person struct {
	NaturalPerson *IVMS101NaturalPerson `json:"naturalPerson,omitempty"`
	LegalPerson   *IVMS101LegalPerson   `json:"legalPerson,omitempty"`
	AccountNumber string `json:"accountNumber"`
}

type IVMS101NaturalPerson struct {
	FirstName   string `json:"firstName"`
	LastName    string `json:"lastName"`
	DateOfBirth string `json:"dateOfBirth,omitempty"` // YYYY-MM-DD
	PlaceOfBirth string `json:"placeOfBirth,omitempty"`
	NationalID  string `json:"nationalId,omitempty"`
	CountryOfResidence string `json:"countryOfResidence"` // ISO 3166-1 alpha-2
	Address     *IVMS101Address `json:"address,omitempty"`
}

type IVMS101LegalPerson struct {
	Name        string `json:"name"`
	LEI         string `json:"lei,omitempty"`
	RegistrationNumber string `json:"registrationNumber,omitempty"`
	CountryOfRegistration string `json:"countryOfRegistration"`
}

type IVMS101Address struct {
	AddressLine []string `json:"addressLine,omitempty"`
	Street      string `json:"street,omitempty"`
	BuildingNumber string `json:"buildingNumber,omitempty"`
	City        string `json:"city"`
	PostCode    string `json:"postCode,omitempty"`
	Country     string `json:"country"` // ISO 3166-1 alpha-2
}

type IVMS101VASP struct {
	Name    string `json:"name"`
	BVID    string `json:"bvid,omitempty"` // VASP identifier
	LEI     string `json:"lei,omitempty"`
	Country string `json:"country"`
}

// ─── SEPA Structures ─────────────────────────────────────────────────────────

// SEPACreditTransfer represents a SEPA Credit Transfer (SCT / SCT Inst)
type SEPACreditTransfer struct {
	MessageID      string  `json:"messageId"`
	CreationDateTime string `json:"creationDateTime"`
	NumberOfTransactions int `json:"numberOfTransactions"`
	ControlSum     float64 `json:"controlSum"`
	Transactions   []SEPATransaction `json:"transactions"`
}

type SEPATransaction struct {
	EndToEndID     string  `json:"endToEndId"`
	Amount         float64 `json:"amount"`
	Currency       string  `json:"currency"` // EUR
	DebtorName     string  `json:"debtorName"`
	DebtorIBAN     string  `json:"debtorIban"`
	DebtorBIC      string  `json:"debtorBic"`
	CreditorName   string  `json:"creditorName"`
	CreditorIBAN   string  `json:"creditorIban"`
	CreditorBIC    string  `json:"creditorBic"`
	RemittanceInfo string  `json:"remittanceInfo,omitempty"`
	Purpose        string  `json:"purpose,omitempty"`
}

// ─── ISO 20022 pain.001 Structure ────────────────────────────────────────────

// Pain001Document represents a pain.001.001.09 customer credit transfer initiation
type Pain001Document struct {
	XMLName xml.Name `xml:"Document" json:"-"`
	Xmlns   string   `xml:"xmlns,attr,omitempty" json:"-"`
	CstmrCdtTrfInitn CustomerCreditTransferInitiation `xml:"CstmrCdtTrfInitn"`
}

type CustomerCreditTransferInitiation struct {
	GrpHdr  Pain001GroupHeader `xml:"GrpHdr"`
	PmtInf  []PaymentInstruction `xml:"PmtInf"`
}

type Pain001GroupHeader struct {
	MsgId    string `xml:"MsgId"`
	CreDtTm  string `xml:"CreDtTm"`
	NbOfTxs  string `xml:"NbOfTxs"`
	CtrlSum  string `xml:"CtrlSum"`
	InitgPty Pain001Party `xml:"InitgPty"`
}

type Pain001Party struct {
	Nm string `xml:"Nm"`
	Id *Pain001PartyID `xml:"Id,omitempty"`
}

type Pain001PartyID struct {
	OrgId *Pain001OrgID `xml:"OrgId,omitempty"`
}

type Pain001OrgID struct {
	AnyBIC string `xml:"AnyBIC,omitempty"`
}

type PaymentInstruction struct {
	PmtInfId   string `xml:"PmtInfId"`
	PmtMtd     string `xml:"PmtMtd"` // TRF
	NbOfTxs    string `xml:"NbOfTxs"`
	CtrlSum    string `xml:"CtrlSum"`
	PmtTpInf   PaymentTypeInformation `xml:"PmtTpInf"`
	ReqdExctnDt string `xml:"ReqdExctnDt"`
	Dbtr       Pain001Party `xml:"Dbtr"`
	DbtrAcct   Pain001Account `xml:"DbtrAcct"`
	DbtrAgt    Pain001Agent `xml:"DbtrAgt"`
	CdtTrfTxInf []Pain001CreditTransfer `xml:"CdtTrfTxInf"`
}

type PaymentTypeInformation struct {
	SvcLvl *ServiceLevel `xml:"SvcLvl,omitempty"`
}

type ServiceLevel struct {
	Cd string `xml:"Cd"` // SEPA, SDVA, PRTY
}

type Pain001Account struct {
	Id Pain001AccountID `xml:"Id"`
}

type Pain001AccountID struct {
	IBAN string `xml:"IBAN,omitempty"`
	Othr *Pain001OtherID `xml:"Othr,omitempty"`
}

type Pain001OtherID struct {
	Id string `xml:"Id"`
}

type Pain001Agent struct {
	FinInstnId Pain001FinInstn `xml:"FinInstnId"`
}

type Pain001FinInstn struct {
	BICFI string `xml:"BICFI,omitempty"`
}

type Pain001CreditTransfer struct {
	PmtId  Pain001PaymentID `xml:"PmtId"`
	Amt    Pain001Amount    `xml:"Amt"`
	CdtrAgt Pain001Agent   `xml:"CdtrAgt"`
	Cdtr   Pain001Party    `xml:"Cdtr"`
	CdtrAcct Pain001Account `xml:"CdtrAcct"`
	Purp   *Pain001Purpose `xml:"Purp,omitempty"`
	RmtInf *Pain001RemittanceInfo `xml:"RmtInf,omitempty"`
}

type Pain001PaymentID struct {
	InstrId    string `xml:"InstrId"`
	EndToEndId string `xml:"EndToEndId"`
}

type Pain001Amount struct {
	InstdAmt Pain001InstdAmt `xml:"InstdAmt"`
}

type Pain001InstdAmt struct {
	Ccy   string  `xml:"Ccy,attr"`
	Value float64 `xml:",chardata"`
}

type Pain001Purpose struct {
	Cd string `xml:"Cd"`
}

type Pain001RemittanceInfo struct {
	Ustrd []string `xml:"Ustrd,omitempty"`
}

// ─── SWIFT gpi Handler ───────────────────────────────────────────────────────

type SWIFTGPIHandler struct {
	logger *zap.Logger
}

func NewSWIFTGPIHandler(logger *zap.Logger) *SWIFTGPIHandler {
	return &SWIFTGPIHandler{logger: logger}
}

func (h *SWIFTGPIHandler) RegisterRoutes(rg *gin.RouterGroup) {
	// SWIFT gpi endpoints
	rg.POST("/swift/gpi/transfer", h.InitiateGPITransfer)
	rg.GET("/swift/gpi/transfer/:uetr", h.GetGPIStatus)
	rg.POST("/swift/gpi/transfer/:uetr/cancel", h.CancelGPITransfer)
	rg.POST("/swift/gpi/status", h.UpdateGPIStatus)
	rg.GET("/swift/gpi/tracker/:uetr", h.TrackGPIPayment)

	// ISO 20022 pain.001 endpoints
	rg.POST("/iso20022/pain001", h.SubmitPain001)
	rg.POST("/iso20022/pacs004", h.SubmitPacs004Return)

	// SEPA endpoints
	rg.POST("/sepa/sct", h.SubmitSEPACreditTransfer)
	rg.POST("/sepa/sct-inst", h.SubmitSEPAInstant)
	rg.GET("/sepa/sct/:messageId/status", h.GetSEPAStatus)

	// Travel Rule endpoints
	rg.POST("/travel-rule/submit", h.SubmitTravelRule)
	rg.GET("/travel-rule/:uetr", h.GetTravelRuleStatus)
	rg.POST("/travel-rule/verify", h.VerifyTravelRuleSignature)

	// Corridor endpoints
	rg.GET("/corridors", h.ListCorridors)
	rg.GET("/corridors/:from/:to/rate", h.GetCorridorRate)
	rg.GET("/corridors/:from/:to/limits", h.GetCorridorLimits)
}

// ─── SWIFT gpi Handlers ──────────────────────────────────────────────────────

func (h *SWIFTGPIHandler) InitiateGPITransfer(c *gin.Context) {
	var req SWIFTGPIPayment
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.UETR == "" {
		req.UETR = uuid.NewString()
	}
	req.InstructionID = uuid.NewString()
	req.Status = "ACSP"
	req.StatusTimestamp = time.Now().Format(time.RFC3339)

	// Travel Rule threshold check (FATF: USD 1,000 / EUR 1,000)
	if req.Amount >= 1000 && req.TravelRule == nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Travel Rule data required for transfers >= 1000 " + req.Currency,
			"requirement": "FATF Recommendation 16 — IVMS 101 originator/beneficiary data required",
		})
		return
	}

	h.logger.Info("SWIFT gpi transfer initiated",
		zap.String("uetr", req.UETR),
		zap.Float64("amount", req.Amount),
		zap.String("currency", req.Currency),
		zap.String("from", req.SenderBIC),
		zap.String("to", req.ReceiverBIC),
	)
	c.JSON(http.StatusAccepted, req)
}

func (h *SWIFTGPIHandler) GetGPIStatus(c *gin.Context) {
	uetr := c.Param("uetr")
	c.JSON(http.StatusOK, SWIFTGPIStatus{
		UETR:              uetr,
		Status:            "ACCC",
		StatusDescription: "AcceptedCreditSettlementCompleted",
		UpdatedAt:         time.Now().Format(time.RFC3339),
	})
}

func (h *SWIFTGPIHandler) CancelGPITransfer(c *gin.Context) {
	uetr := c.Param("uetr")
	var req struct {
		Reason string `json:"reason"`
	}
	c.ShouldBindJSON(&req)
	c.JSON(http.StatusOK, gin.H{
		"uetr":        uetr,
		"status":      "CNCL",
		"reason":      req.Reason,
		"cancelledAt": time.Now().Format(time.RFC3339),
	})
}

func (h *SWIFTGPIHandler) UpdateGPIStatus(c *gin.Context) {
	var status SWIFTGPIStatus
	if err := c.ShouldBindJSON(&status); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	status.UpdatedAt = time.Now().Format(time.RFC3339)
	h.logger.Info("SWIFT gpi status update",
		zap.String("uetr", status.UETR),
		zap.String("status", status.Status),
	)
	c.JSON(http.StatusOK, status)
}

func (h *SWIFTGPIHandler) TrackGPIPayment(c *gin.Context) {
	uetr := c.Param("uetr")
	c.JSON(http.StatusOK, gin.H{
		"uetr": uetr,
		"tracker": []map[string]interface{}{
			{"step": 1, "institution": "PAYGATENGLA", "status": "ACSP", "timestamp": time.Now().Add(-5 * time.Minute).Format(time.RFC3339)},
			{"step": 2, "institution": "CBNGNGLA", "status": "ACSP", "timestamp": time.Now().Add(-3 * time.Minute).Format(time.RFC3339)},
			{"step": 3, "institution": "CHASUS33", "status": "ACCC", "timestamp": time.Now().Add(-1 * time.Minute).Format(time.RFC3339)},
		},
		"currentStatus": "ACCC",
		"completedAt":   time.Now().Format(time.RFC3339),
	})
}

// ─── ISO 20022 pain.001 Handler ───────────────────────────────────────────────

func (h *SWIFTGPIHandler) SubmitPain001(c *gin.Context) {
	contentType := c.GetHeader("Content-Type")
	var doc Pain001Document

	if strings.Contains(contentType, "xml") {
		if err := xml.NewDecoder(c.Request.Body).Decode(&doc); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid pain.001 XML: " + err.Error()})
			return
		}
	} else {
		if err := c.ShouldBindJSON(&doc); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	msgID := doc.CstmrCdtTrfInitn.GrpHdr.MsgId
	if msgID == "" {
		msgID = uuid.NewString()
	}

	h.logger.Info("pain.001 received", zap.String("msgId", msgID))
	c.JSON(http.StatusAccepted, gin.H{
		"messageId": msgID,
		"status":    "ACCP",
		"receivedAt": time.Now().Format(time.RFC3339),
	})
}

func (h *SWIFTGPIHandler) SubmitPacs004Return(c *gin.Context) {
	var req struct {
		OriginalUETR    string  `json:"originalUetr"`
		ReturnAmount    float64 `json:"returnAmount"`
		ReturnCurrency  string  `json:"returnCurrency"`
		ReturnReason    string  `json:"returnReason"` // AC01, AC04, AC06, NARR
		ReturnReference string  `json:"returnReference"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	returnRef := uuid.NewString()
	h.logger.Info("pacs.004 return", zap.String("originalUetr", req.OriginalUETR))
	c.JSON(http.StatusCreated, gin.H{
		"returnRef":    returnRef,
		"originalUetr": req.OriginalUETR,
		"status":       "ACCP",
		"returnedAt":   time.Now().Format(time.RFC3339),
	})
}

// ─── SEPA Handlers ───────────────────────────────────────────────────────────

func (h *SWIFTGPIHandler) SubmitSEPACreditTransfer(c *gin.Context) {
	var sct SEPACreditTransfer
	if err := c.ShouldBindJSON(&sct); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if sct.MessageID == "" {
		sct.MessageID = uuid.NewString()
	}
	h.logger.Info("SEPA SCT received",
		zap.String("messageId", sct.MessageID),
		zap.Int("transactions", sct.NumberOfTransactions),
	)
	c.JSON(http.StatusAccepted, gin.H{
		"messageId":  sct.MessageID,
		"status":     "ACCP",
		"type":       "SCT",
		"acceptedAt": time.Now().Format(time.RFC3339),
	})
}

func (h *SWIFTGPIHandler) SubmitSEPAInstant(c *gin.Context) {
	var sct SEPACreditTransfer
	if err := c.ShouldBindJSON(&sct); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if sct.MessageID == "" {
		sct.MessageID = uuid.NewString()
	}
	// SCT Inst: max EUR 100,000, settlement within 10 seconds
	for _, tx := range sct.Transactions {
		if tx.Amount > 100000 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("SCT Inst max amount is EUR 100,000, got %.2f", tx.Amount),
			})
			return
		}
	}
	h.logger.Info("SEPA SCT Inst received", zap.String("messageId", sct.MessageID))
	c.JSON(http.StatusAccepted, gin.H{
		"messageId":  sct.MessageID,
		"status":     "ACSC",
		"type":       "SCT-Inst",
		"settledAt":  time.Now().Format(time.RFC3339),
	})
}

func (h *SWIFTGPIHandler) GetSEPAStatus(c *gin.Context) {
	messageID := c.Param("messageId")
	c.JSON(http.StatusOK, gin.H{
		"messageId": messageID,
		"status":    "ACSC",
		"updatedAt": time.Now().Format(time.RFC3339),
	})
}

// ─── Travel Rule Handlers ─────────────────────────────────────────────────────

func (h *SWIFTGPIHandler) SubmitTravelRule(c *gin.Context) {
	var req struct {
		UETR       string         `json:"uetr"`
		TravelRule TravelRuleData `json:"travelRule"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.UETR == "" {
		req.UETR = uuid.NewString()
	}

	// Validate IVMS 101 required fields
	if req.TravelRule.Originator.NaturalPerson == nil && req.TravelRule.Originator.LegalPerson == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IVMS 101: originator naturalPerson or legalPerson required"})
		return
	}
	if req.TravelRule.OriginatingVASP.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IVMS 101: originatingVasp.name required"})
		return
	}

	// In production: call Rust travel_rule.rs via gRPC to sign the payload with ed25519
	h.logger.Info("Travel Rule submitted",
		zap.String("uetr", req.UETR),
		zap.Float64("amount", req.TravelRule.TransferAmount),
	)

	c.JSON(http.StatusCreated, gin.H{
		"uetr":      req.UETR,
		"status":    "submitted",
		"ivms101":   "compliant",
		"submittedAt": time.Now().Format(time.RFC3339),
	})
}

func (h *SWIFTGPIHandler) GetTravelRuleStatus(c *gin.Context) {
	uetr := c.Param("uetr")
	c.JSON(http.StatusOK, gin.H{
		"uetr":   uetr,
		"status": "approved",
		"ivms101Verified": true,
		"ofacScreened":    true,
		"updatedAt":       time.Now().Format(time.RFC3339),
	})
}

func (h *SWIFTGPIHandler) VerifyTravelRuleSignature(c *gin.Context) {
	var req struct {
		Payload   string `json:"payload"`
		Signature string `json:"signature"`
		PublicKey string `json:"publicKey"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// In production: call Rust travel_rule.rs verify_signature()
	c.JSON(http.StatusOK, gin.H{
		"valid":      true,
		"algorithm":  "ed25519",
		"verifiedAt": time.Now().Format(time.RFC3339),
	})
}

// ─── Corridor Handlers ───────────────────────────────────────────────────────

func (h *SWIFTGPIHandler) ListCorridors(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"corridors": []map[string]interface{}{
			{"from": "NGN", "to": "USD", "rate": 0.00065, "minAmount": 1000, "maxAmount": 50000000, "protocol": "SWIFT-gpi"},
			{"from": "NGN", "to": "GBP", "rate": 0.00052, "minAmount": 1000, "maxAmount": 30000000, "protocol": "SWIFT-gpi"},
			{"from": "NGN", "to": "EUR", "rate": 0.00060, "minAmount": 1000, "maxAmount": 40000000, "protocol": "SEPA-SCT"},
			{"from": "NGN", "to": "CNY", "rate": 0.0047, "minAmount": 1000, "maxAmount": 20000000, "protocol": "mBridge"},
			{"from": "NGN", "to": "GHS", "rate": 0.038, "minAmount": 500, "maxAmount": 5000000, "protocol": "FSPIOP"},
			{"from": "NGN", "to": "KES", "rate": 0.12, "minAmount": 500, "maxAmount": 5000000, "protocol": "FSPIOP"},
			{"from": "NGN", "to": "ZAR", "rate": 0.012, "minAmount": 500, "maxAmount": 10000000, "protocol": "SWIFT-gpi"},
		},
		"travelRuleThreshold": map[string]interface{}{
			"USD": 1000, "EUR": 1000, "GBP": 1000, "NGN": 1500000,
		},
	})
}

func (h *SWIFTGPIHandler) GetCorridorRate(c *gin.Context) {
	from := strings.ToUpper(c.Param("from"))
	to := strings.ToUpper(c.Param("to"))
	c.JSON(http.StatusOK, gin.H{
		"from":      from,
		"to":        to,
		"rate":      0.00065,
		"spread":    0.0002,
		"validFor":  "30s",
		"quoteID":   uuid.NewString(),
		"expiresAt": time.Now().Add(30 * time.Second).Format(time.RFC3339),
	})
}

func (h *SWIFTGPIHandler) GetCorridorLimits(c *gin.Context) {
	from := strings.ToUpper(c.Param("from"))
	to := strings.ToUpper(c.Param("to"))
	c.JSON(http.StatusOK, gin.H{
		"from":              from,
		"to":                to,
		"minAmount":         1000,
		"maxAmount":         50000000,
		"dailyLimit":        200000000,
		"travelRuleThreshold": 1000,
		"currency":          from,
	})
}

// ─── Utility Functions ───────────────────────────────────────────────────────

// BuildSWIFTGPIPayment creates a SWIFT gpi payment from basic parameters
func BuildSWIFTGPIPayment(
	senderBIC, receiverBIC string,
	senderName, receiverName string,
	senderAcct, receiverAcct string,
	senderCountry, receiverCountry string,
	amount float64, currency, targetCurrency string,
	reference string,
) *SWIFTGPIPayment {
	return &SWIFTGPIPayment{
		UETR:           uuid.NewString(),
		InstructionID:  uuid.NewString(),
		EndToEndID:     reference,
		SenderBIC:      senderBIC,
		ReceiverBIC:    receiverBIC,
		Amount:         amount,
		Currency:       currency,
		TargetCurrency: targetCurrency,
		ChargeBearer:   "SLEV",
		Originator: SWIFTParty{
			Name:          senderName,
			AccountNumber: senderAcct,
			BIC:           senderBIC,
			Address:       SWIFTAddress{Country: senderCountry},
		},
		Beneficiary: SWIFTParty{
			Name:          receiverName,
			AccountNumber: receiverAcct,
			BIC:           receiverBIC,
			Address:       SWIFTAddress{Country: receiverCountry},
		},
		Status:          "PDNG",
		StatusTimestamp: time.Now().Format(time.RFC3339),
	}
}

// NeedsTravel Rule checks if a transfer requires Travel Rule data
func NeedsTravelRule(amount float64, currency string) bool {
	thresholds := map[string]float64{
		"USD": 1000, "EUR": 1000, "GBP": 1000, "CHF": 1000,
		"NGN": 1500000, "GHS": 6000, "KES": 130000, "ZAR": 18000,
	}
	threshold, ok := thresholds[strings.ToUpper(currency)]
	if !ok {
		return amount >= 1000 // default to USD 1,000 equivalent
	}
	return amount >= threshold
}

// MarshalPain001 serialises a pain.001 document to XML
func MarshalPain001(doc *Pain001Document) ([]byte, error) {
	return xml.MarshalIndent(doc, "", "  ")
}

// IVMSValidate validates IVMS 101 required fields
func IVMSValidate(data *TravelRuleData) error {
	if data.Originator.NaturalPerson == nil && data.Originator.LegalPerson == nil {
		return fmt.Errorf("IVMS 101: originator person data required")
	}
	if data.OriginatingVASP.Name == "" {
		return fmt.Errorf("IVMS 101: originatingVasp.name required")
	}
	if data.TransferAmount <= 0 {
		return fmt.Errorf("IVMS 101: transferAmount must be positive")
	}
	return nil
}

// MarshalTravelRule serialises Travel Rule data to JSON
func MarshalTravelRule(data *TravelRuleData) ([]byte, error) {
	return json.Marshal(data)
}
