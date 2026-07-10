// Package iso20022 — FSPIOP ↔ ISO 20022 message converter.
//
// Converts between the Mojaloop FSPIOP transfer model and ISO 20022 pacs.008/pacs.002
// messages, enabling NextHub to act as a gateway between FSPIOP-native DFSPs and
// ISO 20022-native RTGS/CBDC rails (ECB TIPS, BOE RTGS, CBN eNaira).
package iso20022

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ─── FSPIOP Transfer Model (simplified) ──────────────────────────────────────

// FSPIOPTransfer represents a Mojaloop FSPIOP transfer.
type FSPIOPTransfer struct {
	TransferID    string
	QuoteID       string
	PayerFSP      string
	PayeeFSP      string
	Amount        string
	Currency      string
	ILPPacket     string
	Condition     string
	Expiration    time.Time
	PayerParty    FSPIOPParty
	PayeeParty    FSPIOPParty
	Note          string
}

// FSPIOPParty represents a party in a FSPIOP transfer.
type FSPIOPParty struct {
	PartyIDType string // MSISDN, IBAN, BVN, EMAIL, ALIAS
	PartyID     string
	PartyName   string
	PartyDOB    string
	FspID       string
}

// FSPIOPTransferStatus represents the status of a FSPIOP transfer.
type FSPIOPTransferStatus struct {
	TransferID    string
	TransferState string // RECEIVED, RESERVED, COMMITTED, ABORTED
	Fulfilment    string
	CompletedAt   time.Time
	ErrorCode     string
	ErrorDesc     string
}

// ─── FSPIOP → pacs.008 ────────────────────────────────────────────────────────

// FSPIOPToPacs008 converts a FSPIOP transfer to a pacs.008 message.
// This is used when NextHub forwards a transfer to an ISO 20022 RTGS rail.
func FSPIOPToPacs008(t *FSPIOPTransfer) (*Pacs008Document, error) {
	if t == nil {
		return nil, fmt.Errorf("transfer is nil")
	}

	// Parse amount
	var amount float64
	if _, err := fmt.Sscanf(t.Amount, "%f", &amount); err != nil {
		return nil, fmt.Errorf("invalid amount %q: %w", t.Amount, err)
	}

	// Generate UETR (UUID v4 as per SWIFT gpi)
	uetr := uuid.New().String()

	// Map FSPIOP party ID type to ISO 20022 scheme
	dbtrAcct := mapPartyToAccount(t.PayerParty)
	cdtrAcct := mapPartyToAccount(t.PayeeParty)

	doc := &Pacs008Document{
		FIToFICstmrCdtTrf: FIToFICustomerCreditTransfer{
			GrpHdr: GroupHeader{
				MsgID:   fmt.Sprintf("NHUB-%s", strings.ReplaceAll(t.TransferID, "-", "")[:16]),
				CreDtTm: time.Now().UTC(),
				NbOfTxs: 1,
				SttlmInf: SettlementInstruction{
					SttlmMtd: "CLRG", // Clearing
				},
				InstgAgt: &FinancialInstitutionID{
					BICFI: bicFromFSPID(t.PayerFSP),
				},
				InstdAgt: &FinancialInstitutionID{
					BICFI: bicFromFSPID(t.PayeeFSP),
				},
			},
			CdtTrfTxInf: []CreditTransferTransaction{
				{
					PmtID: PaymentID{
						InstrID:    t.TransferID,
						EndToEndID: t.QuoteID,
						TxID:       t.TransferID,
						UETR:       uetr,
					},
					IntrBkSttlmAmt: ActiveCurrencyAndAmount{
						Currency: t.Currency,
						Value:    amount,
					},
					IntrBkSttlmDt: time.Now().UTC().Format("2006-01-02"),
					ChrgBr:        "SLEV",
					Dbtr: PartyIdentification{
						Name: t.PayerParty.PartyName,
						ID:   mapPartyToID(t.PayerParty),
					},
					DbtrAcct: dbtrAcct,
					DbtrAgt: &FinancialInstitutionID{
						BICFI: bicFromFSPID(t.PayerFSP),
					},
					CdtrAgt: &FinancialInstitutionID{
						BICFI: bicFromFSPID(t.PayeeFSP),
					},
					Cdtr: PartyIdentification{
						Name: t.PayeeParty.PartyName,
						ID:   mapPartyToID(t.PayeeParty),
					},
					CdtrAcct: cdtrAcct,
					RmtInf: &RemittanceInformation{
						Ustrd: []string{t.Note},
					},
					Purp: &Purpose{
						Cd: "TRAD", // Trade settlement
					},
				},
			},
		},
	}

	return doc, nil
}

// ─── pacs.002 → FSPIOP Transfer Status ───────────────────────────────────────

// Pacs002ToFSPIOPStatus converts a pacs.002 status report to a FSPIOP transfer status.
func Pacs002ToFSPIOPStatus(doc *Pacs002Document) ([]FSPIOPTransferStatus, error) {
	if doc == nil {
		return nil, fmt.Errorf("pacs.002 document is nil")
	}

	var statuses []FSPIOPTransferStatus

	for _, txSts := range doc.FIToFIPmtStsRpt.TxInfAndSts {
		status := FSPIOPTransferStatus{
			TransferID:    txSts.OrgnlTxID,
			TransferState: mapPacs002StatusToFSPIOP(txSts.TxSts),
		}

		if txSts.AccptncDtTm != nil {
			status.CompletedAt = *txSts.AccptncDtTm
		}

		// Extract error codes from rejection reasons
		for _, rsn := range txSts.StsRsnInf {
			if rsn.Rsn != nil {
				status.ErrorCode = mapISO20022ErrorToFSPIOP(rsn.Rsn.Cd)
				if len(rsn.AddtlInf) > 0 {
					status.ErrorDesc = strings.Join(rsn.AddtlInf, "; ")
				}
			}
		}

		statuses = append(statuses, status)
	}

	return statuses, nil
}

// ─── Helper functions ─────────────────────────────────────────────────────────

// mapPartyToAccount maps a FSPIOP party to an ISO 20022 account ID.
func mapPartyToAccount(party FSPIOPParty) *AccountID {
	switch party.PartyIDType {
	case "IBAN":
		return &AccountID{
			ID: AccountIDType{IBAN: party.PartyID},
		}
	default:
		return &AccountID{
			ID: AccountIDType{
				Othr: &OtherID{
					ID: party.PartyID,
					SchmeNm: &SchemeName{
						Prtry: party.PartyIDType,
					},
				},
			},
		}
	}
}

// mapPartyToID maps a FSPIOP party to an ISO 20022 party ID.
func mapPartyToID(party FSPIOPParty) *PartyID {
	switch party.PartyIDType {
	case "BVN", "NIN", "PERSONAL_ID":
		return &PartyID{
			PrvtID: &PrivateID{
				Other: []OtherID{
					{
						ID: party.PartyID,
						SchmeNm: &SchemeName{
							Cd: "NIDN", // National Identity Number
						},
					},
				},
			},
		}
	default:
		return &PartyID{
			OrgID: &OrganisationID{
				AnyBIC: bicFromFSPID(party.FspID),
			},
		}
	}
}

// bicFromFSPID derives a pseudo-BIC from a FSPIOP FSP ID.
// In production, this would look up the BIC from a registry.
func bicFromFSPID(fspID string) string {
	if len(fspID) == 0 {
		return "NEXTHUBXX"
	}
	// Pad or truncate to 8 chars for BIC format
	clean := strings.ToUpper(strings.ReplaceAll(fspID, "-", ""))
	if len(clean) >= 8 {
		return clean[:8]
	}
	return fmt.Sprintf("%-8s", clean)
}

// mapPacs002StatusToFSPIOP maps ISO 20022 pacs.002 status codes to FSPIOP transfer states.
func mapPacs002StatusToFSPIOP(isoStatus string) string {
	switch isoStatus {
	case "ACSC", "ACSP": // Accepted Settlement Completed / Accepted Settlement In Process
		return "COMMITTED"
	case "ACCP", "ACWC": // Accepted Customer Profile / Accepted With Change
		return "RESERVED"
	case "PDNG": // Pending
		return "RECEIVED"
	case "RJCT": // Rejected
		return "ABORTED"
	default:
		return "RECEIVED"
	}
}

// mapISO20022ErrorToFSPIOP maps ISO 20022 error codes to FSPIOP error codes.
func mapISO20022ErrorToFSPIOP(isoCode string) string {
	errorMap := map[string]string{
		"AC01": "3100", // Incorrect Account Number
		"AC04": "3200", // Closed Account Number
		"AC06": "4001", // Blocked Account
		"AG01": "5000", // Transaction Forbidden
		"AM01": "5001", // Zero Amount
		"AM02": "5002", // Not Allowed Amount
		"AM04": "4001", // Insufficient Funds
		"AM05": "3303", // Duplication
		"BE01": "3100", // Inconsistent with End Customer
		"BE04": "3100", // Missing Creditor Address
		"DT01": "3303", // Invalid Date
		"FF01": "3100", // Invalid File Format
		"MD07": "3200", // End Customer Deceased
		"MS02": "5000", // Not Specified Reason Customer Generated
		"MS03": "5000", // Not Specified Reason Agent Generated
		"RC01": "3100", // Bank Identifier Incorrect
		"RR01": "3100", // Missing Debtor Account or Identification
		"RR02": "3100", // Missing Debtor Name or Address
		"RR03": "3100", // Missing Creditor Name or Address
		"RR04": "3100", // Regulatory Reason
		"TM01": "3303", // Cut Off Time
	}

	if fspiop, ok := errorMap[isoCode]; ok {
		return fspiop
	}
	return "5000" // Generic error
}
