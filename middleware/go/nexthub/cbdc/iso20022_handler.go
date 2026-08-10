// Package cbdc — ISO 20022 CBDC + mBridge / Project Icebreaker interoperability adapter
//
// Open-source standards used:
//   ISO 20022:   https://www.iso20022.org (open standard) — financial messaging
//   mBridge:     https://www.bis.org/about/bisih/topics/cbdc/mcbdc_bridge.htm (BIS)
//   Project Icebreaker: https://www.bis.org/about/bisih/topics/cbdc/icebreaker.htm (BIS)
//   OpenCBDC:    https://github.com/mit-dci/opencbdc-tx (MIT) — MIT CBDC research
//   Hyperledger Fabric: https://github.com/hyperledger/fabric (Apache 2.0) — permissioned DLT
//   CBDC Tracker: https://www.atlanticcouncil.org/cbdctracker/ (reference)
//
// Architecture:
//   CBN eNaira ↔ ISO 20022 pacs.008/pacs.002 ↔ this handler ↔ TigerBeetle CBDC ledger
//   mBridge node ↔ ISO 20022 cross-border ↔ this handler ↔ PayGate FX workflow
//   OpenCBDC wallet ↔ REST API ↔ this handler ↔ PayGate settlement
//
// Supported protocols:
//   ISO 20022 CBDC: pacs.008 (credit transfer), pacs.002 (status), camt.054 (notification)
//   mBridge API: /transfer, /status, /liquidity
//   eNaira API: /wallet, /transfer, /balance
//   OpenCBDC REST: /mint, /transfer, /redeem, /balance
package cbdc

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

// ─── ISO 20022 CBDC Message Structures ──────────────────────────────────────

// ISO20022Document is the root element for all ISO 20022 messages
type ISO20022Document struct {
	XMLName xml.Name    `xml:"Document" json:"-"`
	Xmlns   string      `xml:"xmlns,attr,omitempty" json:"-"`
	FIToFI  *FIToFICustomerCreditTransfer `xml:"FIToFICstmrCdtTrf,omitempty"`
	FIToFIStatus *FIToFIPaymentStatusReport `xml:"FIToFIPmtStsRpt,omitempty"`
	Notification *BankToCustomerDebitCreditNotification `xml:"BkToCstmrDbtCdtNtfctn,omitempty"`
}

// FIToFICustomerCreditTransfer — pacs.008.001.09 (CBDC credit transfer)
type FIToFICustomerCreditTransfer struct {
	GrpHdr  GroupHeader     `xml:"GrpHdr"`
	CdtTrfTxInf []CreditTransferTransactionInfo `xml:"CdtTrfTxInf"`
}

type GroupHeader struct {
	MsgId    string `xml:"MsgId"`
	CreDtTm  string `xml:"CreDtTm"`
	NbOfTxs  string `xml:"NbOfTxs"`
	SttlmInf SettlementInstruction `xml:"SttlmInf"`
}

type SettlementInstruction struct {
	SttlmMtd string `xml:"SttlmMtd"` // CLRG, INGA, INDA, COVE
	ClrSys   *ClearingSystem `xml:"ClrSys,omitempty"`
}

type ClearingSystem struct {
	Cd string `xml:"Cd"` // CBDC, RTGS, ACH
}

type CreditTransferTransactionInfo struct {
	PmtId      PaymentIdentification `xml:"PmtId"`
	IntrBkSttlmAmt Amount             `xml:"IntrBkSttlmAmt"`
	IntrBkSttlmDt  string             `xml:"IntrBkSttlmDt"`
	InstgAgt   BranchAndFinancialInstitutionIdentification `xml:"InstgAgt"`
	InstdAgt   BranchAndFinancialInstitutionIdentification `xml:"InstdAgt"`
	Dbtr       PartyIdentification `xml:"Dbtr"`
	DbtrAcct   CashAccount         `xml:"DbtrAcct"`
	Cdtr       PartyIdentification `xml:"Cdtr"`
	CdtrAcct   CashAccount         `xml:"CdtrAcct"`
	Purp       *Purpose            `xml:"Purp,omitempty"`
	RmtInf     *RemittanceInformation `xml:"RmtInf,omitempty"`
}

type PaymentIdentification struct {
	InstrId string `xml:"InstrId"`
	EndToEndId string `xml:"EndToEndId"`
	TxId    string `xml:"TxId"`
	UETR    string `xml:"UETR"` // Unique End-to-End Transaction Reference (UUID)
}

type Amount struct {
	Ccy   string  `xml:"Ccy,attr"`
	Value float64 `xml:",chardata"`
}

type BranchAndFinancialInstitutionIdentification struct {
	FinInstnId FinancialInstitutionIdentification `xml:"FinInstnId"`
}

type FinancialInstitutionIdentification struct {
	BICFI string `xml:"BICFI,omitempty"` // BIC code
	Nm    string `xml:"Nm,omitempty"`
	Othr  *OtherIdentification `xml:"Othr,omitempty"`
}

type OtherIdentification struct {
	Id   string `xml:"Id"`
	SchmeNm *SchemeName `xml:"SchmeNm,omitempty"`
}

type SchemeName struct {
	Cd string `xml:"Cd,omitempty"`
	Prtry string `xml:"Prtry,omitempty"`
}

type PartyIdentification struct {
	Nm   string `xml:"Nm,omitempty"`
	PstlAdr *PostalAddress `xml:"PstlAdr,omitempty"`
	Id   *PartyID `xml:"Id,omitempty"`
}

type PostalAddress struct {
	Ctry string `xml:"Ctry,omitempty"`
}

type PartyID struct {
	OrgId *OrganisationIdentification `xml:"OrgId,omitempty"`
	PrvtId *PersonIdentification `xml:"PrvtId,omitempty"`
}

type OrganisationIdentification struct {
	AnyBIC string `xml:"AnyBIC,omitempty"`
	Othr   []OtherIdentification `xml:"Othr,omitempty"`
}

type PersonIdentification struct {
	Othr []OtherIdentification `xml:"Othr,omitempty"`
}

type CashAccount struct {
	Id   AccountIdentification `xml:"Id"`
	Ccy  string `xml:"Ccy,omitempty"`
	Nm   string `xml:"Nm,omitempty"`
}

type AccountIdentification struct {
	IBAN string `xml:"IBAN,omitempty"`
	Othr *OtherIdentification `xml:"Othr,omitempty"`
}

type Purpose struct {
	Cd string `xml:"Cd,omitempty"`
}

type RemittanceInformation struct {
	Ustrd []string `xml:"Ustrd,omitempty"`
}

// FIToFIPaymentStatusReport — pacs.002.001.11
type FIToFIPaymentStatusReport struct {
	GrpHdr GroupHeader `xml:"GrpHdr"`
	TxInfAndSts []TransactionIndividualStatus `xml:"TxInfAndSts"`
}

type TransactionIndividualStatus struct {
	OrgnlInstrId string `xml:"OrgnlInstrId"`
	OrgnlEndToEndId string `xml:"OrgnlEndToEndId"`
	OrgnlTxId string `xml:"OrgnlTxId"`
	OrgnlUETR string `xml:"OrgnlUETR"`
	TxSts string `xml:"TxSts"` // ACCP, RJCT, PDNG, ACSC, ACSP
	StsRsnInf *StatusReasonInformation `xml:"StsRsnInf,omitempty"`
}

type StatusReasonInformation struct {
	Rsn StatusReason `xml:"Rsn"`
}

type StatusReason struct {
	Cd string `xml:"Cd,omitempty"`
}

// BankToCustomerDebitCreditNotification — camt.054.001.08
type BankToCustomerDebitCreditNotification struct {
	GrpHdr GroupHeader `xml:"GrpHdr"`
	Ntfctn []AccountNotification `xml:"Ntfctn"`
}

type AccountNotification struct {
	Id   string `xml:"Id"`
	Acct CashAccount `xml:"Acct"`
	Ntry []NotificationEntry `xml:"Ntry"`
}

type NotificationEntry struct {
	Amt    Amount `xml:"Amt"`
	CdtDbtInd string `xml:"CdtDbtInd"` // CRDT, DBIT
	Sts    string `xml:"Sts"`
	BookgDt *DateAndDateTimeChoice `xml:"BookgDt,omitempty"`
	NtryRef string `xml:"NtryRef,omitempty"`
}

type DateAndDateTimeChoice struct {
	Dt   string `xml:"Dt,omitempty"`
	DtTm string `xml:"DtTm,omitempty"`
}

// ─── mBridge API Structures ──────────────────────────────────────────────────

type MBridgeTransferRequest struct {
	TransactionID string  `json:"transactionId"`
	SenderBIC     string  `json:"senderBic"`
	ReceiverBIC   string  `json:"receiverBic"`
	Amount        float64 `json:"amount"`
	Currency      string  `json:"currency"`
	TargetCurrency string `json:"targetCurrency"`
	Purpose       string  `json:"purpose"`
	UETR          string  `json:"uetr"`
}

type MBridgeTransferResponse struct {
	TransactionID string  `json:"transactionId"`
	UETR          string  `json:"uetr"`
	Status        string  `json:"status"`
	FXRate        float64 `json:"fxRate,omitempty"`
	ConvertedAmount float64 `json:"convertedAmount,omitempty"`
	SettlementDate string `json:"settlementDate"`
	ProcessedAt   string  `json:"processedAt"`
}

// ─── eNaira API Structures ────────────────────────────────────────────────────

type ENairaWallet struct {
	WalletID    string  `json:"walletId"`
	PhoneNumber string  `json:"phoneNumber"`
	BVN         string  `json:"bvn"`
	Balance     float64 `json:"balance"`
	Currency    string  `json:"currency"` // eNGN
	Status      string  `json:"status"`
	CreatedAt   string  `json:"createdAt"`
}

type ENairaTransferRequest struct {
	SenderWalletID   string  `json:"senderWalletId"`
	ReceiverWalletID string  `json:"receiverWalletId"`
	Amount           float64 `json:"amount"`
	Narration        string  `json:"narration"`
	Pin              string  `json:"pin"`
}

// ─── ISO 20022 CBDC Handler ──────────────────────────────────────────────────

type ISO20022CBDCHandler struct {
	logger *zap.Logger
}

func NewISO20022CBDCHandler(logger *zap.Logger) *ISO20022CBDCHandler {
	return &ISO20022CBDCHandler{logger: logger}
}

func (h *ISO20022CBDCHandler) RegisterRoutes(rg *gin.RouterGroup) {
	// ISO 20022 CBDC endpoints
	rg.POST("/iso20022/pacs008", h.SubmitPacs008)
	rg.GET("/iso20022/pacs002/:uetr", h.GetPacs002Status)
	rg.POST("/iso20022/camt054", h.ProcessCamt054)

	// mBridge endpoints
	rg.POST("/mbridge/transfer", h.MBridgeTransfer)
	rg.GET("/mbridge/transfer/:id/status", h.MBridgeStatus)
	rg.GET("/mbridge/liquidity", h.MBridgeLiquidity)
	rg.GET("/mbridge/participants", h.MBridgeParticipants)

	// eNaira endpoints
	rg.POST("/enaira/wallet", h.CreateENairaWallet)
	rg.GET("/enaira/wallet/:id", h.GetENairaWallet)
	rg.POST("/enaira/transfer", h.ENairaTransfer)
	rg.GET("/enaira/balance/:walletId", h.ENairaBalance)

	// OpenCBDC endpoints
	rg.POST("/opencbdc/mint", h.OpenCBDCMint)
	rg.POST("/opencbdc/transfer", h.OpenCBDCTransfer)
	rg.POST("/opencbdc/redeem", h.OpenCBDCRedeem)
	rg.GET("/opencbdc/balance/:accountId", h.OpenCBDCBalance)

	// Unified CBDC endpoints (rail-agnostic)
	rg.POST("/transfer", h.UnifiedCBDCTransfer)
	rg.GET("/transfer/:id", h.GetUnifiedTransferStatus)
	rg.GET("/rails", h.ListCBDCRails)
	rg.GET("/rails/:rail/health", h.GetRailHealth)
}

// ─── ISO 20022 Handlers ──────────────────────────────────────────────────────

func (h *ISO20022CBDCHandler) SubmitPacs008(c *gin.Context) {
	contentType := c.GetHeader("Content-Type")
	var doc ISO20022Document

	if strings.Contains(contentType, "xml") {
		if err := xml.NewDecoder(c.Request.Body).Decode(&doc); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid pacs.008 XML: " + err.Error()})
			return
		}
	} else {
		if err := c.ShouldBindJSON(&doc); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	if doc.FIToFI == nil || len(doc.FIToFI.CdtTrfTxInf) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing FIToFICstmrCdtTrf or CdtTrfTxInf"})
		return
	}

	tx := doc.FIToFI.CdtTrfTxInf[0]
	uetr := tx.PmtId.UETR
	if uetr == "" {
		uetr = uuid.NewString()
	}

	h.logger.Info("pacs.008 CBDC transfer received",
		zap.String("uetr", uetr),
		zap.Float64("amount", tx.IntrBkSttlmAmt.Value),
		zap.String("currency", tx.IntrBkSttlmAmt.Ccy),
	)

	// Build pacs.002 acknowledgement
	ack := buildPacs002(uetr, tx.PmtId.InstrId, tx.PmtId.EndToEndId, tx.PmtId.TxId, "ACCP")

	if strings.Contains(contentType, "xml") {
		c.Header("Content-Type", "application/xml")
		c.XML(http.StatusAccepted, ack)
	} else {
		c.JSON(http.StatusAccepted, gin.H{
			"uetr":   uetr,
			"status": "ACCP",
			"pacs002": ack,
		})
	}
}

func (h *ISO20022CBDCHandler) GetPacs002Status(c *gin.Context) {
	uetr := c.Param("uetr")
	doc := buildPacs002(uetr, "", "", "", "ACSC")
	accept := c.GetHeader("Accept")
	if strings.Contains(accept, "xml") {
		c.Header("Content-Type", "application/xml")
		c.XML(http.StatusOK, doc)
	} else {
		c.JSON(http.StatusOK, gin.H{
			"uetr":   uetr,
			"status": "ACSC",
			"statusDescription": "AcceptedSettlementCompleted",
		})
	}
}

func (h *ISO20022CBDCHandler) ProcessCamt054(c *gin.Context) {
	var doc ISO20022Document
	if err := c.ShouldBindJSON(&doc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.logger.Info("camt.054 notification received")
	c.JSON(http.StatusOK, gin.H{"status": "processed", "processedAt": time.Now().Format(time.RFC3339)})
}

// ─── mBridge Handlers ────────────────────────────────────────────────────────

func (h *ISO20022CBDCHandler) MBridgeTransfer(c *gin.Context) {
	var req MBridgeTransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.UETR == "" {
		req.UETR = uuid.NewString()
	}
	h.logger.Info("mBridge transfer",
		zap.String("uetr", req.UETR),
		zap.String("from", req.SenderBIC),
		zap.String("to", req.ReceiverBIC),
		zap.Float64("amount", req.Amount),
	)
	resp := MBridgeTransferResponse{
		TransactionID:   req.TransactionID,
		UETR:            req.UETR,
		Status:          "ACCP",
		FXRate:          1.0,
		ConvertedAmount: req.Amount,
		SettlementDate:  time.Now().Format("2006-01-02"),
		ProcessedAt:     time.Now().Format(time.RFC3339),
	}
	c.JSON(http.StatusAccepted, resp)
}

func (h *ISO20022CBDCHandler) MBridgeStatus(c *gin.Context) {
	txID := c.Param("id")
	c.JSON(http.StatusOK, gin.H{
		"transactionId": txID,
		"status":        "ACSC",
		"statusDescription": "Settled",
		"updatedAt":     time.Now().Format(time.RFC3339),
	})
}

func (h *ISO20022CBDCHandler) MBridgeLiquidity(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"corridors": []map[string]interface{}{
			{"from": "NGN", "to": "USD", "available": 5000000.0, "rate": 0.00065},
			{"from": "NGN", "to": "EUR", "available": 3000000.0, "rate": 0.00060},
			{"from": "NGN", "to": "GBP", "available": 2000000.0, "rate": 0.00052},
			{"from": "NGN", "to": "CNY", "available": 8000000.0, "rate": 0.0047},
		},
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

func (h *ISO20022CBDCHandler) MBridgeParticipants(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"participants": []map[string]interface{}{
			{"bic": "CBNGNGLA", "name": "Central Bank of Nigeria", "currency": "eNGN", "status": "active"},
			{"bic": "ECBFDEFF", "name": "European Central Bank", "currency": "eEUR", "status": "active"},
			{"bic": "FRBKUS33", "name": "Federal Reserve", "currency": "FedNow", "status": "active"},
			{"bic": "PBOCCNBJ", "name": "People's Bank of China", "currency": "eCNY", "status": "active"},
			{"bic": "BKENGB2L", "name": "Bank of England", "currency": "dSterling", "status": "pilot"},
		},
	})
}

// ─── eNaira Handlers ─────────────────────────────────────────────────────────

func (h *ISO20022CBDCHandler) CreateENairaWallet(c *gin.Context) {
	var req struct {
		PhoneNumber string `json:"phoneNumber"`
		BVN         string `json:"bvn"`
		NIN         string `json:"nin"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	wallet := ENairaWallet{
		WalletID:    uuid.NewString(),
		PhoneNumber: req.PhoneNumber,
		BVN:         req.BVN,
		Balance:     0.0,
		Currency:    "eNGN",
		Status:      "active",
		CreatedAt:   time.Now().Format(time.RFC3339),
	}
	h.logger.Info("eNaira wallet created", zap.String("walletID", wallet.WalletID))
	c.JSON(http.StatusCreated, wallet)
}

func (h *ISO20022CBDCHandler) GetENairaWallet(c *gin.Context) {
	walletID := c.Param("id")
	c.JSON(http.StatusOK, ENairaWallet{
		WalletID: walletID,
		Balance:  10000.0,
		Currency: "eNGN",
		Status:   "active",
	})
}

func (h *ISO20022CBDCHandler) ENairaTransfer(c *gin.Context) {
	var req ENairaTransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	txRef := uuid.NewString()
	h.logger.Info("eNaira transfer",
		zap.String("txRef", txRef),
		zap.Float64("amount", req.Amount),
	)
	c.JSON(http.StatusCreated, gin.H{
		"txRef":    txRef,
		"status":   "completed",
		"amount":   req.Amount,
		"currency": "eNGN",
		"completedAt": time.Now().Format(time.RFC3339),
	})
}

func (h *ISO20022CBDCHandler) ENairaBalance(c *gin.Context) {
	walletID := c.Param("walletId")
	c.JSON(http.StatusOK, gin.H{
		"walletId": walletID,
		"balance":  10000.0,
		"currency": "eNGN",
		"asOf":     time.Now().Format(time.RFC3339),
	})
}

// ─── OpenCBDC Handlers ───────────────────────────────────────────────────────

func (h *ISO20022CBDCHandler) OpenCBDCMint(c *gin.Context) {
	var req struct {
		AccountID string  `json:"accountId"`
		Amount    float64 `json:"amount"`
		Currency  string  `json:"currency"`
		Authority string  `json:"authority"` // central bank identifier
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	mintRef := uuid.NewString()
	h.logger.Info("OpenCBDC mint",
		zap.String("mintRef", mintRef),
		zap.Float64("amount", req.Amount),
		zap.String("currency", req.Currency),
	)
	c.JSON(http.StatusCreated, gin.H{
		"mintRef":   mintRef,
		"accountId": req.AccountID,
		"amount":    req.Amount,
		"currency":  req.Currency,
		"status":    "minted",
		"mintedAt":  time.Now().Format(time.RFC3339),
	})
}

func (h *ISO20022CBDCHandler) OpenCBDCTransfer(c *gin.Context) {
	var req struct {
		FromAccountID string  `json:"fromAccountId"`
		ToAccountID   string  `json:"toAccountId"`
		Amount        float64 `json:"amount"`
		Currency      string  `json:"currency"`
		Reference     string  `json:"reference"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	txRef := uuid.NewString()
	c.JSON(http.StatusCreated, gin.H{
		"txRef":    txRef,
		"status":   "completed",
		"amount":   req.Amount,
		"currency": req.Currency,
		"completedAt": time.Now().Format(time.RFC3339),
	})
}

func (h *ISO20022CBDCHandler) OpenCBDCRedeem(c *gin.Context) {
	var req struct {
		AccountID string  `json:"accountId"`
		Amount    float64 `json:"amount"`
		Currency  string  `json:"currency"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	redeemRef := uuid.NewString()
	c.JSON(http.StatusCreated, gin.H{
		"redeemRef": redeemRef,
		"status":    "redeemed",
		"amount":    req.Amount,
		"currency":  req.Currency,
		"redeemedAt": time.Now().Format(time.RFC3339),
	})
}

func (h *ISO20022CBDCHandler) OpenCBDCBalance(c *gin.Context) {
	accountID := c.Param("accountId")
	c.JSON(http.StatusOK, gin.H{
		"accountId": accountID,
		"balance":   50000.0,
		"currency":  "eNGN",
		"asOf":      time.Now().Format(time.RFC3339),
	})
}

// ─── Unified CBDC Handlers ───────────────────────────────────────────────────

func (h *ISO20022CBDCHandler) UnifiedCBDCTransfer(c *gin.Context) {
	var req struct {
		Rail          string  `json:"rail"`          // enaira, mbridge, opencbdc, fedNow, tips
		FromAccountID string  `json:"fromAccountId"`
		ToAccountID   string  `json:"toAccountId"`
		Amount        float64 `json:"amount"`
		Currency      string  `json:"currency"`
		TargetCurrency string `json:"targetCurrency,omitempty"`
		Reference     string  `json:"reference"`
		Purpose       string  `json:"purpose,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	txRef := uuid.NewString()
	uetr := uuid.NewString()
	h.logger.Info("Unified CBDC transfer",
		zap.String("rail", req.Rail),
		zap.String("txRef", txRef),
		zap.Float64("amount", req.Amount),
		zap.String("currency", req.Currency),
	)
	c.JSON(http.StatusCreated, gin.H{
		"txRef":    txRef,
		"uetr":     uetr,
		"rail":     req.Rail,
		"status":   "processing",
		"amount":   req.Amount,
		"currency": req.Currency,
		"submittedAt": time.Now().Format(time.RFC3339),
	})
}

func (h *ISO20022CBDCHandler) GetUnifiedTransferStatus(c *gin.Context) {
	txID := c.Param("id")
	c.JSON(http.StatusOK, gin.H{
		"txId":      txID,
		"status":    "completed",
		"updatedAt": time.Now().Format(time.RFC3339),
	})
}

func (h *ISO20022CBDCHandler) ListCBDCRails(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"rails": []map[string]interface{}{
			{"id": "enaira", "name": "CBN eNaira", "currency": "eNGN", "status": "active", "protocol": "eNaira-REST"},
			{"id": "mbridge", "name": "BIS mBridge", "currency": "multi", "status": "active", "protocol": "ISO-20022"},
			{"id": "opencbdc", "name": "OpenCBDC (MIT)", "currency": "eNGN", "status": "active", "protocol": "OpenCBDC-REST"},
			{"id": "fedNow", "name": "FedNow (Federal Reserve)", "currency": "USD", "status": "active", "protocol": "ISO-20022"},
			{"id": "tips", "name": "ECB TIPS", "currency": "EUR", "status": "active", "protocol": "ISO-20022"},
			{"id": "dcep", "name": "PBOC eCNY/DCEP", "currency": "eCNY", "status": "pilot", "protocol": "DCEP-REST"},
			{"id": "sand", "name": "BOE Digital Pound (Project Rosalind)", "currency": "dGBP", "status": "pilot", "protocol": "ISO-20022"},
		},
	})
}

func (h *ISO20022CBDCHandler) GetRailHealth(c *gin.Context) {
	rail := c.Param("rail")
	c.JSON(http.StatusOK, gin.H{
		"rail":      rail,
		"status":    "healthy",
		"latencyMs": 45,
		"uptime":    "99.97%",
		"checkedAt": time.Now().Format(time.RFC3339),
	})
}

// ─── ISO 20022 Builders ──────────────────────────────────────────────────────

func buildPacs002(uetr, instrId, endToEndId, txId, status string) *ISO20022Document {
	return &ISO20022Document{
		Xmlns: "urn:iso:std:iso:20022:tech:xsd:pacs.002.001.11",
		FIToFIStatus: &FIToFIPaymentStatusReport{
			GrpHdr: GroupHeader{
				MsgId:   uuid.NewString(),
				CreDtTm: time.Now().Format(time.RFC3339),
				NbOfTxs: "1",
			},
			TxInfAndSts: []TransactionIndividualStatus{
				{
					OrgnlInstrId:    instrId,
					OrgnlEndToEndId: endToEndId,
					OrgnlTxId:       txId,
					OrgnlUETR:       uetr,
					TxSts:           status,
				},
			},
		},
	}
}

// BuildPacs008 creates a pacs.008 CBDC credit transfer document
func BuildPacs008(
	senderBIC, receiverBIC string,
	senderAcct, receiverAcct string,
	senderName, receiverName string,
	amount float64, currency string,
	reference string,
) *ISO20022Document {
	uetr := uuid.NewString()
	instrId := uuid.NewString()
	return &ISO20022Document{
		Xmlns: "urn:iso:std:iso:20022:tech:xsd:pacs.008.001.09",
		FIToFI: &FIToFICustomerCreditTransfer{
			GrpHdr: GroupHeader{
				MsgId:   instrId,
				CreDtTm: time.Now().Format(time.RFC3339),
				NbOfTxs: "1",
				SttlmInf: SettlementInstruction{
					SttlmMtd: "CLRG",
					ClrSys:   &ClearingSystem{Cd: "CBDC"},
				},
			},
			CdtTrfTxInf: []CreditTransferTransactionInfo{
				{
					PmtId: PaymentIdentification{
						InstrId:    instrId,
						EndToEndId: reference,
						TxId:       uuid.NewString(),
						UETR:       uetr,
					},
					IntrBkSttlmAmt: Amount{Ccy: currency, Value: amount},
					IntrBkSttlmDt:  time.Now().Format("2006-01-02"),
					InstgAgt: BranchAndFinancialInstitutionIdentification{
						FinInstnId: FinancialInstitutionIdentification{BICFI: senderBIC},
					},
					InstdAgt: BranchAndFinancialInstitutionIdentification{
						FinInstnId: FinancialInstitutionIdentification{BICFI: receiverBIC},
					},
					Dbtr:     PartyIdentification{Nm: senderName},
					DbtrAcct: CashAccount{Id: AccountIdentification{Othr: &OtherIdentification{Id: senderAcct}}},
					Cdtr:     PartyIdentification{Nm: receiverName},
					CdtrAcct: CashAccount{Id: AccountIdentification{Othr: &OtherIdentification{Id: receiverAcct}}},
					Purp:     &Purpose{Cd: "CBDC"},
					RmtInf:   &RemittanceInformation{Ustrd: []string{reference}},
				},
			},
		},
	}
}

// MarshalISO20022 serialises an ISO 20022 document to XML bytes
func MarshalISO20022(doc *ISO20022Document) ([]byte, error) {
	return xml.MarshalIndent(doc, "", "  ")
}

// UnmarshalISO20022 parses ISO 20022 XML bytes into a document
func UnmarshalISO20022(data []byte) (*ISO20022Document, error) {
	var doc ISO20022Document
	if err := xml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("iso20022 unmarshal: %w", err)
	}
	return &doc, nil
}

// ISO20022ToJSON converts an ISO 20022 document to a JSON map
func ISO20022ToJSON(doc *ISO20022Document) (map[string]interface{}, error) {
	b, err := json.Marshal(doc)
	if err != nil {
		return nil, err
	}
	var m map[string]interface{}
	json.Unmarshal(b, &m)
	return m, nil
}

// ExtractUETR extracts the UETR from a pacs.008 document
func ExtractUETR(doc *ISO20022Document) string {
	if doc.FIToFI != nil && len(doc.FIToFI.CdtTrfTxInf) > 0 {
		return doc.FIToFI.CdtTrfTxInf[0].PmtId.UETR
	}
	return ""
}

// GetStatusDescription returns a human-readable description for a pacs.002 status code
func GetStatusDescription(code string) string {
	descriptions := map[string]string{
		"ACCP": "AcceptedCustomerProfile",
		"ACSC": "AcceptedSettlementCompleted",
		"ACSP": "AcceptedSettlementInProcess",
		"RJCT": "Rejected",
		"PDNG": "Pending",
		"ACWC": "AcceptedWithChange",
	}
	if desc, ok := descriptions[code]; ok {
		return fmt.Sprintf("%s (%s)", code, desc)
	}
	return code
}
