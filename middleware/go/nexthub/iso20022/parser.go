// Package iso20022 provides parsing and conversion between ISO 20022 financial
// messages and the FSPIOP (Mojaloop) API message format.
//
// Supported message types:
//   - pacs.008.001.09 — FI to FI Customer Credit Transfer
//   - pacs.002.001.12 — FI to FI Payment Status Report
//   - camt.054.001.09 — Bank to Customer Debit Credit Notification
//   - pain.001.001.11 — Customer Credit Transfer Initiation
package iso20022

import (
	"encoding/xml"
	"fmt"
	"strings"
	"time"
)

// ─── Common Types ─────────────────────────────────────────────────────────────

// ActiveCurrencyAndAmount represents a monetary amount with currency.
type ActiveCurrencyAndAmount struct {
	Currency string  `xml:"Ccy,attr"`
	Value    float64 `xml:",chardata"`
}

// PartyIdentification represents a financial party (debtor/creditor).
type PartyIdentification struct {
	Name    string          `xml:"Nm,omitempty"`
	PostalAddress *PostalAddress `xml:"PstlAdr,omitempty"`
	ID      *PartyID        `xml:"Id,omitempty"`
	CtryOfRes string        `xml:"CtryOfRes,omitempty"`
}

// PostalAddress represents a postal address.
type PostalAddress struct {
	Country    string   `xml:"Ctry,omitempty"`
	AddressLine []string `xml:"AdrLine,omitempty"`
}

// PartyID represents party identification (IBAN, BIC, etc.).
type PartyID struct {
	OrgID  *OrganisationID  `xml:"OrgId,omitempty"`
	PrvtID *PrivateID       `xml:"PrvtId,omitempty"`
}

// OrganisationID represents an organisation identifier.
type OrganisationID struct {
	AnyBIC string `xml:"AnyBIC,omitempty"`
	LEI    string `xml:"LEI,omitempty"`
}

// PrivateID represents a private individual identifier.
type PrivateID struct {
	DtAndPlcOfBirth *DateAndPlaceOfBirth `xml:"DtAndPlcOfBirth,omitempty"`
	Other           []OtherID            `xml:"Othr,omitempty"`
}

// DateAndPlaceOfBirth represents date and place of birth.
type DateAndPlaceOfBirth struct {
	BirthDt   string `xml:"BirthDt"`
	PrvcOfBirth string `xml:"PrvcOfBirth,omitempty"`
	CityOfBirth string `xml:"CityOfBirth"`
	CtryOfBirth string `xml:"CtryOfBirth"`
}

// OtherID represents another form of identification.
type OtherID struct {
	ID      string `xml:"Id"`
	SchmeNm *SchemeName `xml:"SchmeNm,omitempty"`
}

// SchemeName represents an identification scheme name.
type SchemeName struct {
	Cd    string `xml:"Cd,omitempty"`
	Prtry string `xml:"Prtry,omitempty"`
}

// FinancialInstitutionID represents a financial institution identifier.
type FinancialInstitutionID struct {
	BICFI   string `xml:"BICFI,omitempty"`
	ClrSysMmbID *ClearingSystemMemberID `xml:"ClrSysMmbId,omitempty"`
	Nm      string `xml:"Nm,omitempty"`
}

// ClearingSystemMemberID represents a clearing system member identifier.
type ClearingSystemMemberID struct {
	ClrSysID *ClearingSystemID `xml:"ClrSysId,omitempty"`
	MmbID    string            `xml:"MmbId"`
}

// ClearingSystemID represents a clearing system identifier.
type ClearingSystemID struct {
	Cd    string `xml:"Cd,omitempty"`
	Prtry string `xml:"Prtry,omitempty"`
}

// ─── pacs.008 — FI to FI Customer Credit Transfer ────────────────────────────

// Pacs008Document is the root element for pacs.008.001.09.
type Pacs008Document struct {
	XMLName xml.Name   `xml:"Document"`
	FIToFICstmrCdtTrf FIToFICustomerCreditTransfer `xml:"FIToFICstmrCdtTrf"`
}

// FIToFICustomerCreditTransfer is the pacs.008 message body.
type FIToFICustomerCreditTransfer struct {
	GrpHdr  GroupHeader          `xml:"GrpHdr"`
	CdtTrfTxInf []CreditTransferTransaction `xml:"CdtTrfTxInf"`
}

// GroupHeader is the common group header for pacs messages.
type GroupHeader struct {
	MsgID       string    `xml:"MsgId"`
	CreDtTm     time.Time `xml:"CreDtTm"`
	NbOfTxs     int       `xml:"NbOfTxs"`
	SttlmInf    SettlementInstruction `xml:"SttlmInf"`
	InstgAgt    *FinancialInstitutionID `xml:"InstgAgt>FinInstnId,omitempty"`
	InstdAgt    *FinancialInstitutionID `xml:"InstdAgt>FinInstnId,omitempty"`
}

// SettlementInstruction represents settlement method.
type SettlementInstruction struct {
	SttlmMtd string `xml:"SttlmMtd"` // CLRG, INDA, INGA, COVE
}

// CreditTransferTransaction is a single transfer within pacs.008.
type CreditTransferTransaction struct {
	PmtID       PaymentID                `xml:"PmtId"`
	IntrBkSttlmAmt ActiveCurrencyAndAmount `xml:"IntrBkSttlmAmt"`
	IntrBkSttlmDt string                  `xml:"IntrBkSttlmDt,omitempty"`
	ChrgBr      string                   `xml:"ChrgBr,omitempty"` // DEBT, CRED, SHAR, SLEV
	InstgAgt    *FinancialInstitutionID  `xml:"InstgAgt>FinInstnId,omitempty"`
	InstdAgt    *FinancialInstitutionID  `xml:"InstdAgt>FinInstnId,omitempty"`
	Dbtr        PartyIdentification      `xml:"Dbtr"`
	DbtrAcct    *AccountID               `xml:"DbtrAcct,omitempty"`
	DbtrAgt     *FinancialInstitutionID  `xml:"DbtrAgt>FinInstnId,omitempty"`
	CdtrAgt     *FinancialInstitutionID  `xml:"CdtrAgt>FinInstnId,omitempty"`
	Cdtr        PartyIdentification      `xml:"Cdtr"`
	CdtrAcct    *AccountID               `xml:"CdtrAcct,omitempty"`
	RmtInf      *RemittanceInformation   `xml:"RmtInf,omitempty"`
	Purp        *Purpose                 `xml:"Purp,omitempty"`
}

// PaymentID represents payment identification.
type PaymentID struct {
	InstrID   string `xml:"InstrId,omitempty"`
	EndToEndID string `xml:"EndToEndId"`
	TxID      string `xml:"TxId,omitempty"`
	UETR      string `xml:"UETR,omitempty"` // Unique End-to-End Transaction Reference
}

// AccountID represents an account identifier.
type AccountID struct {
	ID AccountIDType `xml:"Id"`
}

// AccountIDType holds IBAN or other account ID.
type AccountIDType struct {
	IBAN  string   `xml:"IBAN,omitempty"`
	Othr  *OtherID `xml:"Othr,omitempty"`
}

// RemittanceInformation holds payment reference information.
type RemittanceInformation struct {
	Ustrd []string `xml:"Ustrd,omitempty"`
	Strd  []StructuredRemittance `xml:"Strd,omitempty"`
}

// StructuredRemittance holds structured remittance data.
type StructuredRemittance struct {
	RfrdDocInf []ReferredDocumentInformation `xml:"RfrdDocInf,omitempty"`
}

// ReferredDocumentInformation holds document reference.
type ReferredDocumentInformation struct {
	Tp  *ReferredDocumentType `xml:"Tp,omitempty"`
	Nb  string                `xml:"Nb,omitempty"`
	RltdDt string             `xml:"RltdDt,omitempty"`
}

// ReferredDocumentType holds document type code.
type ReferredDocumentType struct {
	CdOrPrtry DocumentTypeCodeOrProprietary `xml:"CdOrPrtry"`
}

// DocumentTypeCodeOrProprietary holds document type.
type DocumentTypeCodeOrProprietary struct {
	Cd    string `xml:"Cd,omitempty"`
	Prtry string `xml:"Prtry,omitempty"`
}

// Purpose holds the purpose of the payment.
type Purpose struct {
	Cd    string `xml:"Cd,omitempty"`
	Prtry string `xml:"Prtry,omitempty"`
}

// ─── pacs.002 — FI to FI Payment Status Report ───────────────────────────────

// Pacs002Document is the root element for pacs.002.001.12.
type Pacs002Document struct {
	XMLName xml.Name `xml:"Document"`
	FIToFIPmtStsRpt FIToFIPaymentStatusReport `xml:"FIToFIPmtStsRpt"`
}

// FIToFIPaymentStatusReport is the pacs.002 message body.
type FIToFIPaymentStatusReport struct {
	GrpHdr  Pacs002GroupHeader `xml:"GrpHdr"`
	TxInfAndSts []TransactionIndividualStatus `xml:"TxInfAndSts"`
}

// Pacs002GroupHeader is the pacs.002 group header.
type Pacs002GroupHeader struct {
	MsgID   string    `xml:"MsgId"`
	CreDtTm time.Time `xml:"CreDtTm"`
	InstgAgt *FinancialInstitutionID `xml:"InstgAgt>FinInstnId,omitempty"`
	InstdAgt *FinancialInstitutionID `xml:"InstdAgt>FinInstnId,omitempty"`
}

// TransactionIndividualStatus is a single status entry in pacs.002.
type TransactionIndividualStatus struct {
	StsID       string `xml:"StsId,omitempty"`
	OrgnlInstrID string `xml:"OrgnlInstrId,omitempty"`
	OrgnlEndToEndID string `xml:"OrgnlEndToEndId,omitempty"`
	OrgnlTxID   string `xml:"OrgnlTxId,omitempty"`
	OrgnlUETR   string `xml:"OrgnlUETR,omitempty"`
	TxSts       string `xml:"TxSts"` // ACCP, ACSC, ACSP, ACWC, PDNG, RJCT
	StsRsnInf   []StatusReasonInformation `xml:"StsRsnInf,omitempty"`
	AccptncDtTm *time.Time `xml:"AccptncDtTm,omitempty"`
}

// StatusReasonInformation holds rejection reason codes.
type StatusReasonInformation struct {
	Orgtr *PartyIdentification `xml:"Orgtr,omitempty"`
	Rsn   *StatusReason        `xml:"Rsn,omitempty"`
	AddtlInf []string          `xml:"AddtlInf,omitempty"`
}

// StatusReason holds the reason code.
type StatusReason struct {
	Cd    string `xml:"Cd,omitempty"`
	Prtry string `xml:"Prtry,omitempty"`
}

// ─── camt.054 — Bank to Customer Debit Credit Notification ───────────────────

// Camt054Document is the root element for camt.054.001.09.
type Camt054Document struct {
	XMLName xml.Name `xml:"Document"`
	BkToCstmrDbtCdtNtfctn BankToCustomerDebitCreditNotification `xml:"BkToCstmrDbtCdtNtfctn"`
}

// BankToCustomerDebitCreditNotification is the camt.054 message body.
type BankToCustomerDebitCreditNotification struct {
	GrpHdr Camt054GroupHeader `xml:"GrpHdr"`
	Ntfctn []AccountNotification `xml:"Ntfctn"`
}

// Camt054GroupHeader is the camt.054 group header.
type Camt054GroupHeader struct {
	MsgID   string    `xml:"MsgId"`
	CreDtTm time.Time `xml:"CreDtTm"`
	MsgPgntn *MessagePagination `xml:"MsgPgntn,omitempty"`
}

// MessagePagination represents message pagination.
type MessagePagination struct {
	PgNb    string `xml:"PgNb"`
	LastPgInd bool `xml:"LastPgInd"`
}

// AccountNotification is a single account notification in camt.054.
type AccountNotification struct {
	ID      string `xml:"Id"`
	Acct    *AccountID `xml:"Acct,omitempty"`
	RltdAcct *AccountID `xml:"RltdAcct,omitempty"`
	TxsSummry *NumberAndSumOfTransactions `xml:"TxsSummry,omitempty"`
	Ntry    []ReportEntry `xml:"Ntry"`
}

// NumberAndSumOfTransactions holds transaction summary.
type NumberAndSumOfTransactions struct {
	NbOfNtries string `xml:"NbOfNtries,omitempty"`
	Sum        float64 `xml:"Sum,omitempty"`
}

// ReportEntry is a single entry in camt.054.
type ReportEntry struct {
	NtryRef  string `xml:"NtryRef,omitempty"`
	Amt      ActiveCurrencyAndAmount `xml:"Amt"`
	CdtDbtInd string `xml:"CdtDbtInd"` // CRDT, DBIT
	Sts      EntryStatus `xml:"Sts"`
	BookgDt  *DateAndDateTime `xml:"BookgDt,omitempty"`
	ValDt    *DateAndDateTime `xml:"ValDt,omitempty"`
	BkTxCd   BankTransactionCode `xml:"BkTxCd"`
	NtryDtls []EntryDetails `xml:"NtryDtls,omitempty"`
}

// EntryStatus holds the entry status.
type EntryStatus struct {
	Cd    string `xml:"Cd,omitempty"`
	Prtry string `xml:"Prtry,omitempty"`
}

// DateAndDateTime holds either a date or datetime.
type DateAndDateTime struct {
	Dt   string `xml:"Dt,omitempty"`
	DtTm string `xml:"DtTm,omitempty"`
}

// BankTransactionCode holds the bank transaction code.
type BankTransactionCode struct {
	Domn *Domain `xml:"Domn,omitempty"`
	Prtry *ProprietaryBankTransactionCode `xml:"Prtry,omitempty"`
}

// Domain holds the domain code.
type Domain struct {
	Cd   string `xml:"Cd"`
	Fmly *Family `xml:"Fmly,omitempty"`
}

// Family holds the family code.
type Family struct {
	Cd    string `xml:"Cd"`
	SubFmlyCd string `xml:"SubFmlyCd"`
}

// ProprietaryBankTransactionCode holds a proprietary code.
type ProprietaryBankTransactionCode struct {
	Cd   string `xml:"Cd"`
	Issr string `xml:"Issr,omitempty"`
}

// EntryDetails holds entry details.
type EntryDetails struct {
	Btch *BatchInformation `xml:"Btch,omitempty"`
	TxDtls []TransactionDetails `xml:"TxDtls,omitempty"`
}

// BatchInformation holds batch information.
type BatchInformation struct {
	MsgID   string `xml:"MsgId,omitempty"`
	PmtInfID string `xml:"PmtInfId,omitempty"`
	NbOfTxs string `xml:"NbOfTxs,omitempty"`
	TtlAmt  *ActiveCurrencyAndAmount `xml:"TtlAmt,omitempty"`
}

// TransactionDetails holds transaction details.
type TransactionDetails struct {
	Refs    *TransactionReferences `xml:"Refs,omitempty"`
	Amt     *ActiveCurrencyAndAmount `xml:"Amt,omitempty"`
	CdtDbtInd string `xml:"CdtDbtInd,omitempty"`
	RmtInf  *RemittanceInformation `xml:"RmtInf,omitempty"`
}

// TransactionReferences holds transaction references.
type TransactionReferences struct {
	MsgID   string `xml:"MsgId,omitempty"`
	AcctSvcrRef string `xml:"AcctSvcrRef,omitempty"`
	PmtInfID string `xml:"PmtInfId,omitempty"`
	InstrID string `xml:"InstrId,omitempty"`
	EndToEndID string `xml:"EndToEndId,omitempty"`
	TxID    string `xml:"TxId,omitempty"`
	UETR    string `xml:"UETR,omitempty"`
}

// ─── Parser ───────────────────────────────────────────────────────────────────

// MessageType identifies the ISO 20022 message type.
type MessageType string

const (
	MsgTypePacs008 MessageType = "pacs.008"
	MsgTypePacs002 MessageType = "pacs.002"
	MsgTypeCamt054 MessageType = "camt.054"
	MsgTypePain001 MessageType = "pain.001"
)

// ParsedMessage holds the parsed ISO 20022 message.
type ParsedMessage struct {
	Type    MessageType
	Pacs008 *Pacs008Document
	Pacs002 *Pacs002Document
	Camt054 *Camt054Document
}

// DetectMessageType detects the ISO 20022 message type from XML.
func DetectMessageType(data []byte) (MessageType, error) {
	s := string(data)
	switch {
	case strings.Contains(s, "FIToFICstmrCdtTrf"):
		return MsgTypePacs008, nil
	case strings.Contains(s, "FIToFIPmtStsRpt"):
		return MsgTypePacs002, nil
	case strings.Contains(s, "BkToCstmrDbtCdtNtfctn"):
		return MsgTypeCamt054, nil
	case strings.Contains(s, "CstmrCdtTrfInitn"):
		return MsgTypePain001, nil
	default:
		return "", fmt.Errorf("unknown ISO 20022 message type")
	}
}

// Parse parses an ISO 20022 XML message.
func Parse(data []byte) (*ParsedMessage, error) {
	msgType, err := DetectMessageType(data)
	if err != nil {
		return nil, err
	}

	msg := &ParsedMessage{Type: msgType}

	switch msgType {
	case MsgTypePacs008:
		var doc Pacs008Document
		if err := xml.Unmarshal(data, &doc); err != nil {
			return nil, fmt.Errorf("pacs.008 parse error: %w", err)
		}
		msg.Pacs008 = &doc
	case MsgTypePacs002:
		var doc Pacs002Document
		if err := xml.Unmarshal(data, &doc); err != nil {
			return nil, fmt.Errorf("pacs.002 parse error: %w", err)
		}
		msg.Pacs002 = &doc
	case MsgTypeCamt054:
		var doc Camt054Document
		if err := xml.Unmarshal(data, &doc); err != nil {
			return nil, fmt.Errorf("camt.054 parse error: %w", err)
		}
		msg.Camt054 = &doc
	}

	return msg, nil
}

// MarshalPacs008 serialises a pacs.008 document to XML.
func MarshalPacs008(doc *Pacs008Document) ([]byte, error) {
	doc.XMLName = xml.Name{
		Space: "urn:iso:std:iso:20022:tech:xsd:pacs.008.001.09",
		Local: "Document",
	}
	return xml.MarshalIndent(doc, "", "  ")
}

// MarshalPacs002 serialises a pacs.002 document to XML.
func MarshalPacs002(doc *Pacs002Document) ([]byte, error) {
	doc.XMLName = xml.Name{
		Space: "urn:iso:std:iso:20022:tech:xsd:pacs.002.001.12",
		Local: "Document",
	}
	return xml.MarshalIndent(doc, "", "  ")
}
