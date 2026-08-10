// Package scf — GS1 / EDIFACT / UBL Supply Chain Finance interoperability adapter
//
// Open-source standards used:
//   GS1:     https://www.gs1.org/standards (open, royalty-free)
//   EDIFACT: https://unece.org/trade/uncefact/introducing-unedifact (UN/CEFACT, open)
//   UBL 2.x: https://docs.oasis-open.org/ubl/UBL-2.3.html (OASIS, Apache 2.0)
//   PEPPOL:  https://peppol.org/specifications/ (open, EU e-invoicing)
//
// Architecture:
//   Buyer ERP → UBL/EDIFACT invoice → this handler → PayGate SCF workflow
//   Supplier → GET /nexthub/gs1/invoice/{id} → UBL XML response
//   Financier → POST /nexthub/gs1/discount → DynamicDiscountingWorkflow
//
// Supported transactions:
//   UBL 2.3: Invoice, CreditNote, DespatchAdvice, ReceiptAdvice, OrderResponse
//   EDIFACT: INVOIC, DESADV, RECADV, ORDERS, ORDRSP
//   GS1 XML: InvoiceMessage, DespatchAdviceMessage
package scf

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

// ─── UBL 2.3 Invoice Structure ───────────────────────────────────────────────

type UBLInvoice struct {
	XMLName              xml.Name          `xml:"Invoice" json:"-"`
	Xmlns                string            `xml:"xmlns,attr,omitempty" json:"-"`
	UBLVersionID         string            `xml:"UBLVersionID"`
	CustomizationID      string            `xml:"CustomizationID,omitempty"`
	ProfileID            string            `xml:"ProfileID,omitempty"`
	ID                   string            `xml:"ID"`
	IssueDate            string            `xml:"IssueDate"`
	DueDate              string            `xml:"DueDate,omitempty"`
	InvoiceTypeCode      string            `xml:"InvoiceTypeCode"` // 380=Invoice, 381=CreditNote
	DocumentCurrencyCode string            `xml:"DocumentCurrencyCode"`
	Note                 string            `xml:"Note,omitempty"`
	AccountingSupplierParty UBLParty       `xml:"AccountingSupplierParty"`
	AccountingCustomerParty UBLParty       `xml:"AccountingCustomerParty"`
	PaymentMeans         *UBLPaymentMeans  `xml:"PaymentMeans,omitempty"`
	TaxTotal             *UBLTaxTotal      `xml:"TaxTotal,omitempty"`
	LegalMonetaryTotal   UBLMonetaryTotal  `xml:"LegalMonetaryTotal"`
	InvoiceLine          []UBLInvoiceLine  `xml:"InvoiceLine"`
}

type UBLParty struct {
	Party UBLPartyDetail `xml:"Party"`
}

type UBLPartyDetail struct {
	PartyIdentification []UBLPartyID   `xml:"PartyIdentification"`
	PartyName           UBLPartyName   `xml:"PartyName"`
	PostalAddress       *UBLAddress    `xml:"PostalAddress,omitempty"`
	PartyTaxScheme      *UBLTaxScheme  `xml:"PartyTaxScheme,omitempty"`
	Contact             *UBLContact    `xml:"Contact,omitempty"`
}

type UBLPartyID struct {
	ID UBLSchemeID `xml:"ID"`
}

type UBLSchemeID struct {
	SchemeID string `xml:"schemeID,attr,omitempty"`
	Value    string `xml:",chardata"`
}

type UBLPartyName struct {
	Name string `xml:"Name"`
}

type UBLAddress struct {
	StreetName  string `xml:"StreetName,omitempty"`
	CityName    string `xml:"CityName,omitempty"`
	PostalZone  string `xml:"PostalZone,omitempty"`
	Country     UBLCountry `xml:"Country"`
}

type UBLCountry struct {
	IdentificationCode string `xml:"IdentificationCode"`
}

type UBLTaxScheme struct {
	CompanyID string `xml:"CompanyID"`
	TaxScheme UBLTaxSchemeID `xml:"TaxScheme"`
}

type UBLTaxSchemeID struct {
	ID string `xml:"ID"`
}

type UBLContact struct {
	Name  string `xml:"Name,omitempty"`
	Telephone string `xml:"Telephone,omitempty"`
	ElectronicMail string `xml:"ElectronicMail,omitempty"`
}

type UBLPaymentMeans struct {
	PaymentMeansCode string `xml:"PaymentMeansCode"`
	PaymentDueDate   string `xml:"PaymentDueDate,omitempty"`
	PayeeFinancialAccount *UBLFinancialAccount `xml:"PayeeFinancialAccount,omitempty"`
}

type UBLFinancialAccount struct {
	ID                  string `xml:"ID"`
	FinancialInstitutionBranch *UBLBranch `xml:"FinancialInstitutionBranch,omitempty"`
}

type UBLBranch struct {
	ID string `xml:"ID"`
}

type UBLTaxTotal struct {
	TaxAmount   UBLAmount   `xml:"TaxAmount"`
	TaxSubtotal []UBLTaxSubtotal `xml:"TaxSubtotal"`
}

type UBLTaxSubtotal struct {
	TaxableAmount UBLAmount `xml:"TaxableAmount"`
	TaxAmount     UBLAmount `xml:"TaxAmount"`
	TaxCategory   UBLTaxCategory `xml:"TaxCategory"`
}

type UBLTaxCategory struct {
	ID        string `xml:"ID"`
	Percent   float64 `xml:"Percent,omitempty"`
	TaxScheme UBLTaxSchemeID `xml:"TaxScheme"`
}

type UBLMonetaryTotal struct {
	LineExtensionAmount UBLAmount `xml:"LineExtensionAmount"`
	TaxExclusiveAmount  UBLAmount `xml:"TaxExclusiveAmount"`
	TaxInclusiveAmount  UBLAmount `xml:"TaxInclusiveAmount"`
	PayableAmount       UBLAmount `xml:"PayableAmount"`
}

type UBLAmount struct {
	CurrencyID string  `xml:"currencyID,attr"`
	Value      float64 `xml:",chardata"`
}

type UBLInvoiceLine struct {
	ID                  string    `xml:"ID"`
	InvoicedQuantity    UBLQty    `xml:"InvoicedQuantity"`
	LineExtensionAmount UBLAmount `xml:"LineExtensionAmount"`
	Item                UBLItem   `xml:"Item"`
	Price               UBLPrice  `xml:"Price"`
}

type UBLQty struct {
	UnitCode string  `xml:"unitCode,attr,omitempty"`
	Value    float64 `xml:",chardata"`
}

type UBLItem struct {
	Description        string            `xml:"Description,omitempty"`
	Name               string            `xml:"Name"`
	BuyersItemIdentification *UBLItemID  `xml:"BuyersItemIdentification,omitempty"`
	SellersItemIdentification *UBLItemID `xml:"SellersItemIdentification,omitempty"`
	StandardItemIdentification *UBLGTIN  `xml:"StandardItemIdentification,omitempty"`
}

type UBLItemID struct {
	ID string `xml:"ID"`
}

type UBLGTIN struct {
	ID UBLSchemeID `xml:"ID"`
}

type UBLPrice struct {
	PriceAmount UBLAmount `xml:"PriceAmount"`
}

// ─── EDIFACT INVOIC Segment ──────────────────────────────────────────────────

// EDIFACTMessage represents a parsed EDIFACT message (simplified)
type EDIFACTMessage struct {
	MessageType    string            `json:"messageType"` // INVOIC, DESADV, RECADV
	MessageRef     string            `json:"messageRef"`
	Sender         string            `json:"sender"`
	Recipient      string            `json:"recipient"`
	Date           string            `json:"date"`
	Segments       []EDIFACTSegment  `json:"segments"`
}

type EDIFACTSegment struct {
	Tag        string   `json:"tag"`
	Elements   []string `json:"elements"`
}

// ParseEDIFACT parses a raw EDIFACT message string into structured segments
// Follows UN/EDIFACT syntax rules (ISO 9735)
func ParseEDIFACT(raw string) (*EDIFACTMessage, error) {
	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")
	msg := &EDIFACTMessage{}
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Each segment ends with '
		line = strings.TrimSuffix(line, "'")
		parts := strings.SplitN(line, "+", 2)
		if len(parts) == 0 {
			continue
		}
		tag := parts[0]
		var elements []string
		if len(parts) > 1 {
			elements = strings.Split(parts[1], "+")
		}
		seg := EDIFACTSegment{Tag: tag, Elements: elements}
		msg.Segments = append(msg.Segments, seg)

		switch tag {
		case "UNH":
			if len(elements) > 1 {
				msgTypeParts := strings.Split(elements[1], ":")
				if len(msgTypeParts) > 0 {
					msg.MessageType = msgTypeParts[0]
				}
			}
			msg.MessageRef = elements[0]
		case "BGM":
			// BGM+380+INV-001+9 — document type, number, function
		case "DTM":
			if len(elements) > 0 {
				dtmParts := strings.Split(elements[0], ":")
				if len(dtmParts) >= 2 && dtmParts[0] == "137" {
					msg.Date = dtmParts[1]
				}
			}
		case "NAD":
			if len(elements) > 0 {
				if elements[0] == "BY" && msg.Recipient == "" {
					if len(elements) > 1 {
						msg.Recipient = elements[1]
					}
				} else if elements[0] == "SE" && msg.Sender == "" {
					if len(elements) > 1 {
						msg.Sender = elements[1]
					}
				}
			}
		}
	}
	return msg, nil
}

// EDIFACTToUBL converts a parsed EDIFACT INVOIC message to a UBL 2.3 Invoice
func EDIFACTToUBL(msg *EDIFACTMessage) *UBLInvoice {
	inv := &UBLInvoice{
		Xmlns:                "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
		UBLVersionID:         "2.3",
		CustomizationID:      "urn:cen.eu:en16931:2017",
		ID:                   msg.MessageRef,
		IssueDate:            msg.Date,
		InvoiceTypeCode:      "380",
		DocumentCurrencyCode: "NGN",
	}
	return inv
}

// ─── GS1 Handler ─────────────────────────────────────────────────────────────

type GS1Handler struct {
	logger *zap.Logger
}

func NewGS1Handler(logger *zap.Logger) *GS1Handler {
	return &GS1Handler{logger: logger}
}

func (h *GS1Handler) RegisterRoutes(rg *gin.RouterGroup) {
	// UBL 2.3 endpoints
	rg.POST("/ubl/invoice", h.SubmitUBLInvoice)
	rg.GET("/ubl/invoice/:id", h.GetUBLInvoice)
	rg.POST("/ubl/credit-note", h.SubmitUBLCreditNote)
	rg.POST("/ubl/despatch-advice", h.SubmitDespatchAdvice)
	rg.POST("/ubl/receipt-advice", h.SubmitReceiptAdvice)

	// EDIFACT endpoints
	rg.POST("/edifact/invoic", h.SubmitEDIFACTInvoic)
	rg.POST("/edifact/desadv", h.SubmitEDIFACTDesadv)
	rg.POST("/edifact/recadv", h.SubmitEDIFACTRecadv)

	// GS1 XML endpoints
	rg.POST("/xml/invoice", h.SubmitGS1XMLInvoice)

	// PEPPOL BIS 3.0 endpoint
	rg.POST("/peppol/invoice", h.SubmitPEPPOLInvoice)

	// Dynamic discounting
	rg.POST("/discount/request", h.RequestDiscount)
	rg.GET("/discount/:id", h.GetDiscountStatus)

	// GS1 GTIN lookup
	rg.GET("/gtin/:gtin", h.LookupGTIN)
}

// ─── UBL Invoice Handlers ────────────────────────────────────────────────────

func (h *GS1Handler) SubmitUBLInvoice(c *gin.Context) {
	contentType := c.GetHeader("Content-Type")
	var invoice UBLInvoice

	if strings.Contains(contentType, "xml") {
		if err := xml.NewDecoder(c.Request.Body).Decode(&invoice); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid UBL XML: " + err.Error()})
			return
		}
	} else {
		if err := c.ShouldBindJSON(&invoice); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	invoiceID := uuid.NewString()
	if invoice.ID == "" {
		invoice.ID = invoiceID
	}

	h.logger.Info("UBL invoice received",
		zap.String("invoiceID", invoice.ID),
		zap.String("currency", invoice.DocumentCurrencyCode),
		zap.Float64("payable", invoice.LegalMonetaryTotal.PayableAmount.Value),
	)

	// Map to PayGate SCF invoice
	paygateInvoice := map[string]interface{}{
		"id":              invoiceID,
		"ublInvoiceID":    invoice.ID,
		"supplierName":    invoice.AccountingSupplierParty.Party.PartyName.Name,
		"buyerName":       invoice.AccountingCustomerParty.Party.PartyName.Name,
		"issueDate":       invoice.IssueDate,
		"dueDate":         invoice.DueDate,
		"currency":        invoice.DocumentCurrencyCode,
		"totalAmount":     invoice.LegalMonetaryTotal.PayableAmount.Value,
		"lineCount":       len(invoice.InvoiceLine),
		"status":          "submitted",
		"protocol":        "UBL-2.3",
		"submittedAt":     time.Now().Format(time.RFC3339),
	}

	c.JSON(http.StatusCreated, gin.H{
		"invoiceRef":     invoiceID,
		"paygateInvoice": paygateInvoice,
		"status":         "submitted",
	})
}

func (h *GS1Handler) GetUBLInvoice(c *gin.Context) {
	invoiceID := c.Param("id")
	// In production: fetch from PayGate DB and return as UBL XML or JSON
	accept := c.GetHeader("Accept")
	if strings.Contains(accept, "xml") {
		invoice := UBLInvoice{
			Xmlns:                "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
			UBLVersionID:         "2.3",
			ID:                   invoiceID,
			IssueDate:            time.Now().Format("2006-01-02"),
			InvoiceTypeCode:      "380",
			DocumentCurrencyCode: "NGN",
		}
		c.Header("Content-Type", "application/xml")
		c.XML(http.StatusOK, invoice)
	} else {
		c.JSON(http.StatusOK, gin.H{"id": invoiceID, "status": "active", "protocol": "UBL-2.3"})
	}
}

func (h *GS1Handler) SubmitUBLCreditNote(c *gin.Context) {
	var creditNote map[string]interface{}
	if err := c.ShouldBindJSON(&creditNote); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ref := uuid.NewString()
	c.JSON(http.StatusCreated, gin.H{"creditNoteRef": ref, "status": "submitted"})
}

func (h *GS1Handler) SubmitDespatchAdvice(c *gin.Context) {
	var da map[string]interface{}
	if err := c.ShouldBindJSON(&da); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ref := uuid.NewString()
	c.JSON(http.StatusCreated, gin.H{"despatchRef": ref, "status": "submitted"})
}

func (h *GS1Handler) SubmitReceiptAdvice(c *gin.Context) {
	var ra map[string]interface{}
	if err := c.ShouldBindJSON(&ra); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ref := uuid.NewString()
	c.JSON(http.StatusCreated, gin.H{"receiptRef": ref, "status": "submitted"})
}

// ─── EDIFACT Handlers ────────────────────────────────────────────────────────

func (h *GS1Handler) SubmitEDIFACTInvoic(c *gin.Context) {
	body, err := c.GetRawData()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read EDIFACT body"})
		return
	}
	msg, err := ParseEDIFACT(string(body))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "EDIFACT parse error: " + err.Error()})
		return
	}
	invoiceRef := uuid.NewString()
	h.logger.Info("EDIFACT INVOIC received",
		zap.String("ref", invoiceRef),
		zap.String("sender", msg.Sender),
		zap.String("recipient", msg.Recipient),
	)
	// Convert to UBL for internal processing
	ublInvoice := EDIFACTToUBL(msg)
	c.JSON(http.StatusCreated, gin.H{
		"invoiceRef":  invoiceRef,
		"edifactType": msg.MessageType,
		"ublConverted": ublInvoice.ID,
		"status":      "submitted",
	})
}

func (h *GS1Handler) SubmitEDIFACTDesadv(c *gin.Context) {
	body, _ := c.GetRawData()
	msg, _ := ParseEDIFACT(string(body))
	ref := uuid.NewString()
	c.JSON(http.StatusCreated, gin.H{"ref": ref, "type": "DESADV", "segments": len(msg.Segments)})
}

func (h *GS1Handler) SubmitEDIFACTRecadv(c *gin.Context) {
	body, _ := c.GetRawData()
	msg, _ := ParseEDIFACT(string(body))
	ref := uuid.NewString()
	c.JSON(http.StatusCreated, gin.H{"ref": ref, "type": "RECADV", "segments": len(msg.Segments)})
}

// ─── GS1 XML Handler ─────────────────────────────────────────────────────────

func (h *GS1Handler) SubmitGS1XMLInvoice(c *gin.Context) {
	var invoice map[string]interface{}
	if err := c.ShouldBindJSON(&invoice); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ref := uuid.NewString()
	c.JSON(http.StatusCreated, gin.H{"invoiceRef": ref, "protocol": "GS1-XML", "status": "submitted"})
}

// ─── PEPPOL BIS 3.0 Handler ──────────────────────────────────────────────────

func (h *GS1Handler) SubmitPEPPOLInvoice(c *gin.Context) {
	// PEPPOL BIS 3.0 is a profile of UBL 2.3
	var invoice UBLInvoice
	if err := xml.NewDecoder(c.Request.Body).Decode(&invoice); err != nil {
		// Try JSON
		if err2 := c.ShouldBindJSON(&invoice); err2 != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid PEPPOL/UBL document"})
			return
		}
	}
	ref := uuid.NewString()
	c.JSON(http.StatusCreated, gin.H{
		"invoiceRef": ref,
		"protocol":   "PEPPOL-BIS-3.0",
		"ublVersion": "2.3",
		"status":     "submitted",
	})
}

// ─── Dynamic Discounting ─────────────────────────────────────────────────────

func (h *GS1Handler) RequestDiscount(c *gin.Context) {
	var req struct {
		InvoiceRef    string  `json:"invoiceRef"`
		DiscountRate  float64 `json:"discountRate"`  // e.g. 2.5 (%)
		EarlyPayDate  string  `json:"earlyPayDate"`
		RequestedBy   string  `json:"requestedBy"`   // buyer or financier
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	discountRef := uuid.NewString()
	h.logger.Info("Dynamic discount requested",
		zap.String("invoiceRef", req.InvoiceRef),
		zap.Float64("rate", req.DiscountRate),
	)
	c.JSON(http.StatusCreated, gin.H{
		"discountRef":  discountRef,
		"invoiceRef":   req.InvoiceRef,
		"discountRate": req.DiscountRate,
		"earlyPayDate": req.EarlyPayDate,
		"status":       "pending_approval",
		"createdAt":    time.Now().Format(time.RFC3339),
	})
}

func (h *GS1Handler) GetDiscountStatus(c *gin.Context) {
	discountID := c.Param("id")
	c.JSON(http.StatusOK, gin.H{
		"discountRef": discountID,
		"status":      "approved",
		"approvedAt":  time.Now().Format(time.RFC3339),
	})
}

// ─── GS1 GTIN Lookup ─────────────────────────────────────────────────────────

func (h *GS1Handler) LookupGTIN(c *gin.Context) {
	gtin := c.Param("gtin")
	if len(gtin) != 14 && len(gtin) != 13 && len(gtin) != 12 && len(gtin) != 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid GTIN length: %d (expected 8, 12, 13, or 14)", len(gtin))})
		return
	}
	// In production: call GS1 Cloud or local GS1 registry
	c.JSON(http.StatusOK, gin.H{
		"gtin":        gtin,
		"description": "Product lookup via GS1 registry",
		"brand":       "Unknown",
		"countryOfOrigin": "NG",
		"gs1Registry": "https://www.gs1.org/services/verified-by-gs1",
	})
}

// ─── UBL ↔ PayGate Mapper ────────────────────────────────────────────────────

// UBLInvoiceToPayGate converts a UBL 2.3 Invoice to a PayGate SCF invoice map
func UBLInvoiceToPayGate(inv *UBLInvoice) map[string]interface{} {
	lines := make([]map[string]interface{}, len(inv.InvoiceLine))
	for i, line := range inv.InvoiceLine {
		lines[i] = map[string]interface{}{
			"id":          line.ID,
			"description": line.Item.Name,
			"quantity":    line.InvoicedQuantity.Value,
			"unitPrice":   line.Price.PriceAmount.Value,
			"lineTotal":   line.LineExtensionAmount.Value,
			"currency":    line.LineExtensionAmount.CurrencyID,
		}
	}
	return map[string]interface{}{
		"ublInvoiceID":  inv.ID,
		"issueDate":     inv.IssueDate,
		"dueDate":       inv.DueDate,
		"currency":      inv.DocumentCurrencyCode,
		"supplierName":  inv.AccountingSupplierParty.Party.PartyName.Name,
		"buyerName":     inv.AccountingCustomerParty.Party.PartyName.Name,
		"totalAmount":   inv.LegalMonetaryTotal.PayableAmount.Value,
		"lines":         lines,
		"protocol":      "UBL-2.3",
	}
}

// PayGateInvoiceToUBL converts a PayGate SCF invoice to a UBL 2.3 Invoice
func PayGateInvoiceToUBL(invoiceID, supplierName, buyerName, currency string, amount float64, issueDate, dueDate string) *UBLInvoice {
	return &UBLInvoice{
		Xmlns:                "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
		UBLVersionID:         "2.3",
		CustomizationID:      "urn:cen.eu:en16931:2017",
		ProfileID:            "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
		ID:                   invoiceID,
		IssueDate:            issueDate,
		DueDate:              dueDate,
		InvoiceTypeCode:      "380",
		DocumentCurrencyCode: currency,
		AccountingSupplierParty: UBLParty{
			Party: UBLPartyDetail{PartyName: UBLPartyName{Name: supplierName}},
		},
		AccountingCustomerParty: UBLParty{
			Party: UBLPartyDetail{PartyName: UBLPartyName{Name: buyerName}},
		},
		LegalMonetaryTotal: UBLMonetaryTotal{
			LineExtensionAmount: UBLAmount{CurrencyID: currency, Value: amount},
			TaxExclusiveAmount:  UBLAmount{CurrencyID: currency, Value: amount},
			TaxInclusiveAmount:  UBLAmount{CurrencyID: currency, Value: amount},
			PayableAmount:       UBLAmount{CurrencyID: currency, Value: amount},
		},
	}
}

// MarshalUBL serialises a UBL Invoice to XML bytes
func MarshalUBL(inv *UBLInvoice) ([]byte, error) {
	return xml.MarshalIndent(inv, "", "  ")
}

// UnmarshalUBL parses UBL XML bytes into a UBL Invoice
func UnmarshalUBL(data []byte) (*UBLInvoice, error) {
	var inv UBLInvoice
	if err := xml.Unmarshal(data, &inv); err != nil {
		return nil, fmt.Errorf("ubl unmarshal: %w", err)
	}
	return &inv, nil
}

// UBLToJSON converts a UBL Invoice to a JSON map
func UBLToJSON(inv *UBLInvoice) (map[string]interface{}, error) {
	b, err := json.Marshal(inv)
	if err != nil {
		return nil, err
	}
	var m map[string]interface{}
	json.Unmarshal(b, &m)
	return m, nil
}
