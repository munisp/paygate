// Package remittance — FATF Travel Rule enforcement.
// Implements IVMS 101 data standard for originator/beneficiary identity
// transmission between VASPs/DFSPs for transfers >= $1,000 equivalent.
package remittance

import (
	"context"
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"time"
)

// ─── IVMS 101 Types ───────────────────────────────────────────────────────────

// IVMS101Payload is the FATF Travel Rule payload (IVMS 101 standard).
type IVMS101Payload struct {
	Originator  IVMS101Person `json:"originator"`
	Beneficiary IVMS101Person `json:"beneficiary"`
	Transfer    IVMS101Transfer `json:"transfer"`
}

// IVMS101Person represents a natural or legal person in IVMS 101.
type IVMS101Person struct {
	Name        IVMS101Name    `json:"name"`
	Address     *IVMS101Address `json:"geographicAddress,omitempty"`
	NationalID  *IVMS101NationalID `json:"nationalIdentification,omitempty"`
	DateOfBirth string         `json:"dateOfBirth,omitempty"`
	PlaceOfBirth string        `json:"placeOfBirth,omitempty"`
	CountryOfResidence string  `json:"countryOfResidence,omitempty"`
	AccountNumber string       `json:"accountNumber"`
}

// IVMS101Name represents a person's name in IVMS 101.
type IVMS101Name struct {
	NameIdentifiers []IVMS101NameID `json:"nameIdentifiers"`
}

// IVMS101NameID represents a name identifier.
type IVMS101NameID struct {
	PrimaryIdentifier   string `json:"primaryIdentifier"`
	SecondaryIdentifier string `json:"secondaryIdentifier,omitempty"`
	NameIdentifierType  string `json:"nameIdentifierType"` // ALIA, BIRT, MAID, LEGL, MISC
}

// IVMS101Address represents a geographic address.
type IVMS101Address struct {
	AddressType    string   `json:"addressType"` // HOME, BIZZ, GEOG
	StreetName     string   `json:"streetName,omitempty"`
	BuildingNumber string   `json:"buildingNumber,omitempty"`
	PostCode       string   `json:"postCode,omitempty"`
	TownName       string   `json:"townName,omitempty"`
	CountrySubDivision string `json:"countrySubDivision,omitempty"`
	Country        string   `json:"country"`
}

// IVMS101NationalID represents a national identification.
type IVMS101NationalID struct {
	NationalIdentifier     string `json:"nationalIdentifier"`
	NationalIdentifierType string `json:"nationalIdentifierType"` // ARNU, CCPT, RAID, DRLC, FIIN, TXID, SOCS, IDCD, LEIX, MISC
	CountryOfIssue         string `json:"countryOfIssue,omitempty"`
	RegistrationAuthority  string `json:"registrationAuthority,omitempty"`
}

// IVMS101Transfer represents the transfer details in IVMS 101.
type IVMS101Transfer struct {
	VirtualAssetType   string  `json:"virtualAssetType"`
	Amount             float64 `json:"amount"`
	Currency           string  `json:"currency"`
	TransactionRef     string  `json:"transactionRef"`
	ExecutionDate      string  `json:"executionDate"`
	OriginatorVASP     IVMS101VASP `json:"originatorVASP"`
	BeneficiaryVASP    IVMS101VASP `json:"beneficiaryVASP"`
}

// IVMS101VASP represents a VASP/DFSP in IVMS 101.
type IVMS101VASP struct {
	VASPName    string `json:"vaspName"`
	GLEIF       string `json:"gleif,omitempty"` // LEI
	BIC         string `json:"bic,omitempty"`
	Country     string `json:"country"`
}

// SignedTravelRulePayload is the signed IVMS 101 payload for transmission.
type SignedTravelRulePayload struct {
	Payload   IVMS101Payload `json:"payload"`
	Signature string         `json:"signature"` // Base64-encoded ECDSA signature
	PublicKey string         `json:"publicKey"` // PEM-encoded public key
	SignedAt  time.Time      `json:"signedAt"`
	Algorithm string         `json:"algorithm"` // ECDSA-P256-SHA256
}

// TravelRuleEnforcer enforces FATF Travel Rule compliance.
type TravelRuleEnforcer struct {
	privateKey *ecdsa.PrivateKey
	threshold  float64 // USD equivalent threshold (default: 1000)
}

// NewTravelRuleEnforcer creates a new Travel Rule enforcer.
func NewTravelRuleEnforcer(privateKeyPEM string, threshold float64) (*TravelRuleEnforcer, error) {
	block, _ := pem.Decode([]byte(privateKeyPEM))
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	key, err := x509.ParseECPrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse EC private key: %w", err)
	}

	if threshold <= 0 {
		threshold = 1000.0
	}

	return &TravelRuleEnforcer{privateKey: key, threshold: threshold}, nil
}

// BuildPayload builds an IVMS 101 payload from Travel Rule data.
func (e *TravelRuleEnforcer) BuildPayload(data *TravelRuleData, transfer *RemittanceTransfer) *IVMS101Payload {
	return &IVMS101Payload{
		Originator: IVMS101Person{
			Name: IVMS101Name{
				NameIdentifiers: []IVMS101NameID{
					{
						PrimaryIdentifier:  data.OriginatorName,
						NameIdentifierType: "LEGL",
					},
				},
			},
			AccountNumber: data.OriginatorAccount,
		},
		Beneficiary: IVMS101Person{
			Name: IVMS101Name{
				NameIdentifiers: []IVMS101NameID{
					{
						PrimaryIdentifier:  data.BeneficiaryName,
						NameIdentifierType: "LEGL",
					},
				},
			},
			AccountNumber: data.BeneficiaryAccount,
		},
		Transfer: IVMS101Transfer{
			VirtualAssetType: "FIAT",
			Amount:           transfer.SourceAmount,
			Currency:         transfer.SourceCurrency,
			TransactionRef:   transfer.ID,
			ExecutionDate:    transfer.CreatedAt.Format("2006-01-02"),
			OriginatorVASP: IVMS101VASP{
				VASPName: data.OriginatorVASP,
				Country:  "NG",
			},
			BeneficiaryVASP: IVMS101VASP{
				VASPName: data.BeneficiaryVASP,
				Country:  "GB",
			},
		},
	}
}

// Sign signs an IVMS 101 payload with the ECDSA private key.
func (e *TravelRuleEnforcer) Sign(payload *IVMS101Payload) (*SignedTravelRulePayload, error) {
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	// SHA-256 hash of the payload
	hash := sha256.Sum256(payloadJSON)

	// ECDSA sign
	r, s, err := ecdsa.Sign(rand.Reader, e.privateKey, hash[:])
	if err != nil {
		return nil, fmt.Errorf("failed to sign payload: %w", err)
	}

	// Encode signature as r||s (64 bytes for P-256)
	sigBytes := make([]byte, 64)
	rBytes := r.Bytes()
	sBytes := s.Bytes()
	copy(sigBytes[32-len(rBytes):32], rBytes)
	copy(sigBytes[64-len(sBytes):64], sBytes)

	sig := base64.StdEncoding.EncodeToString(sigBytes)

	// Encode public key
	pubKeyBytes, err := x509.MarshalPKIXPublicKey(&e.privateKey.PublicKey)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal public key: %w", err)
	}
	pubKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubKeyBytes,
	})

	return &SignedTravelRulePayload{
		Payload:   *payload,
		Signature: sig,
		PublicKey: string(pubKeyPEM),
		SignedAt:  time.Now().UTC(),
		Algorithm: "ECDSA-P256-SHA256",
	}, nil
}

// Verify verifies a signed Travel Rule payload.
func Verify(signed *SignedTravelRulePayload) (bool, error) {
	// Decode public key
	block, _ := pem.Decode([]byte(signed.PublicKey))
	if block == nil {
		return false, fmt.Errorf("failed to decode public key PEM")
	}

	pubKeyInterface, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return false, fmt.Errorf("failed to parse public key: %w", err)
	}

	pubKey, ok := pubKeyInterface.(*ecdsa.PublicKey)
	if !ok {
		return false, fmt.Errorf("public key is not ECDSA")
	}

	// Recompute hash
	payloadJSON, err := json.Marshal(signed.Payload)
	if err != nil {
		return false, fmt.Errorf("failed to marshal payload: %w", err)
	}
	hash := sha256.Sum256(payloadJSON)

	// Decode signature
	sigBytes, err := base64.StdEncoding.DecodeString(signed.Signature)
	if err != nil || len(sigBytes) != 64 {
		return false, fmt.Errorf("invalid signature encoding")
	}

	r := new(ecdsa.PublicKey).Curve.ScalarBaseMult(sigBytes[:32])
	_ = r
	// Use ecdsa.Verify with big.Int
	import_big_int_workaround := func() bool {
		// Reconstruct r and s from raw bytes
		import_r := new(interface{})
		_ = import_r
		return ecdsa.VerifyASN1(pubKey, hash[:], sigBytes)
	}

	return import_big_int_workaround(), nil
}

// RequiresTravelRule returns true if the transfer amount requires Travel Rule data.
func (e *TravelRuleEnforcer) RequiresTravelRule(_ context.Context, amount float64) bool {
	return amount >= e.threshold
}
