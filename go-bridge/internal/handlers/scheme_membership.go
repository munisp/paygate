package handlers

// scheme_membership.go — Visa/Mastercard/Verve Scheme Membership & BIN Sponsorship
//
// Implements:
//   - BIN (Bank Identification Number) lookup with scheme routing
//   - Principal membership management for PSP licence holders
//   - BIN sponsorship for sub-merchants under the PSP's scheme membership
//   - Scheme dispute submission (Visa/Mastercard chargeback arbitration)
//
// A PSP licence holder is a principal member of Visa/Mastercard/Verve.
// Sub-merchants are sponsored under the PSP's BIN range.

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/redis"
)

// SchemeMembership describes the PSP's principal membership with a card scheme.
type SchemeMembership struct {
	Scheme             string     `json:"scheme"`          // visa, mastercard, verve
	MembershipType     string     `json:"membership_type"` // principal, associate, sponsored
	MemberID           string     `json:"member_id"`       // scheme-assigned member ID
	BINRanges          []BINRange `json:"bin_ranges"`
	SponsoredMerchants []string   `json:"sponsored_merchants"`
	Status             string     `json:"status"` // active, suspended, terminated
	EffectiveFrom      time.Time  `json:"effective_from"`
	RenewalDate        time.Time  `json:"renewal_date"`
	ContactEmail       string     `json:"contact_email"`
	ComplianceOfficer  string     `json:"compliance_officer"`
}

// BINRange defines a range of BINs owned by the PSP.
type BINRange struct {
	Low      string `json:"low"`
	High     string `json:"high"`
	Scheme   string `json:"scheme"`
	CardType string `json:"card_type"`
	Country  string `json:"country"`
}

// BINLookupResult is the result of a BIN lookup.
type BINLookupResult struct {
	BIN         string `json:"bin"`
	Scheme      string `json:"scheme"`
	CardType    string `json:"card_type"`
	CardBrand   string `json:"card_brand"`
	IssuingBank string `json:"issuing_bank"`
	Country     string `json:"country"`
	IsDebit     bool   `json:"is_debit"`
	IsCredit    bool   `json:"is_credit"`
	IsPrepaid   bool   `json:"is_prepaid"`
	IsCorporate bool   `json:"is_corporate"`
	IsSponsored bool   `json:"is_sponsored"` // true if under PSP's BIN sponsorship
	SponsorID   string `json:"sponsor_id,omitempty"`
}

// ─── GetSchemeMembership ──────────────────────────────────────────────────────

// GetSchemeMembership handles GET /v1/scheme/membership
func GetSchemeMembership(w http.ResponseWriter, r *http.Request) {
	scheme := r.URL.Query().Get("scheme")
	ctx := r.Context()
	rdb := redis.Get()

	cacheKey := fmt.Sprintf("scheme:membership:%s", scheme)
	if cached, err := rdb.Get(ctx, cacheKey); err == nil {
		var memberships []SchemeMembership
		if json.Unmarshal([]byte(cached), &memberships) == nil {
			writeJSON(w, http.StatusOK, map[string]any{"memberships": memberships})
			return
		}
	}

	// Fetch from portal DB
	memberships, err := fetchSchemeMembershipsFromDB(ctx, scheme)
	if err != nil {
		slog.Warn("[scheme] failed to fetch memberships from DB, using defaults", "err", err)
		memberships = defaultMemberships()
	}

	// Cache for 10 minutes
	if data, _ := json.Marshal(memberships); data != nil {
		_ = rdb.SetWithTTL(ctx, cacheKey, string(data), 10*time.Minute)
	}

	writeJSON(w, http.StatusOK, map[string]any{"memberships": memberships})
}

// ─── BINLookup ────────────────────────────────────────────────────────────────

// BINLookup handles POST /v1/scheme/bin-lookup
// Looks up card scheme, type, and issuer from the first 6-8 digits of a PAN.
func BINLookup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		BIN        string `json:"bin"` // first 6-8 digits
		MerchantID string `json:"merchant_id"`
	}
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(req.BIN) < 6 {
		writeError(w, http.StatusBadRequest, "BIN must be at least 6 digits")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	bin6 := req.BIN[:6]
	cacheKey := fmt.Sprintf("bin:lookup:%s", bin6)

	if cached, err := rdb.Get(ctx, cacheKey); err == nil {
		var result BINLookupResult
		if json.Unmarshal([]byte(cached), &result) == nil {
			writeJSON(w, http.StatusOK, result)
			return
		}
	}

	// Determine scheme from BIN prefix
	result := lookupBINLocally(bin6)

	// Check if this BIN is under PSP sponsorship
	if req.MerchantID != "" {
		memberships, _ := fetchSchemeMembershipsFromDB(ctx, result.Scheme)
		for _, m := range memberships {
			for _, binRange := range m.BINRanges {
				if isBINInRange(bin6, binRange.Low, binRange.High) {
					result.IsSponsored = true
					result.SponsorID = m.MemberID
					break
				}
			}
		}
	}

	// Cache for 1 hour (BIN data rarely changes)
	if data, _ := json.Marshal(result); data != nil {
		_ = rdb.SetWithTTL(ctx, cacheKey, string(data), time.Hour)
	}

	writeJSON(w, http.StatusOK, result)
}

// ─── SubmitSchemeDispute ──────────────────────────────────────────────────────

// SubmitSchemeDispute handles POST /v1/scheme/dispute/submit
// Submits a chargeback dispute directly to the card scheme's arbitration portal.
func SubmitSchemeDispute(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ChargebackID    string   `json:"chargeback_id"`
		Scheme          string   `json:"scheme"`
		DisputeType     string   `json:"dispute_type"` // chargeback, pre_arbitration, arbitration
		ARN             string   `json:"arn"`          // acquirer reference number
		TransactionDate string   `json:"transaction_date"`
		AmountKobo      int64    `json:"amount_kobo"`
		Currency        string   `json:"currency"`
		ReasonCode      string   `json:"reason_code"`
		EvidenceURLs    []string `json:"evidence_urls"`
		NarrativeText   string   `json:"narrative_text"`
		MerchantID      string   `json:"merchant_id"`
		ContactEmail    string   `json:"contact_email"`
	}
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.ChargebackID == "" || req.Scheme == "" || req.ARN == "" {
		writeError(w, http.StatusBadRequest, "chargeback_id, scheme, and arn required")
		return
	}

	ctx := r.Context()

	// Submit to scheme-specific endpoint
	ref, err := submitToSchemePortal(ctx, req.Scheme, map[string]any{
		"chargeback_id":    req.ChargebackID,
		"dispute_type":     req.DisputeType,
		"arn":              req.ARN,
		"transaction_date": req.TransactionDate,
		"amount_kobo":      req.AmountKobo,
		"currency":         req.Currency,
		"reason_code":      req.ReasonCode,
		"evidence_urls":    req.EvidenceURLs,
		"narrative":        req.NarrativeText,
		"merchant_id":      req.MerchantID,
		"contact_email":    req.ContactEmail,
	})
	if err != nil {
		slog.Error("[scheme] dispute submission failed",
			"chargeback_id", req.ChargebackID,
			"scheme", req.Scheme,
			"err", err,
		)
		writeError(w, http.StatusBadGateway, fmt.Sprintf("scheme portal error: %v", err))
		return
	}

	// Publish to Kafka
	kc := kafka.GetProducer()
	eventData, _ := json.Marshal(map[string]any{
		"chargeback_id": req.ChargebackID,
		"scheme":        req.Scheme,
		"dispute_type":  req.DisputeType,
		"scheme_ref":    ref,
		"submitted_at":  time.Now().UTC(),
		"merchant_id":   req.MerchantID,
	})
	_ = kc.Publish(ctx, "scheme.dispute.submitted", "", string(eventData))

	slog.Info("[scheme] dispute submitted",
		"chargeback_id", req.ChargebackID,
		"scheme", req.Scheme,
		"ref", ref,
	)

	writeJSON(w, http.StatusOK, map[string]any{
		"chargeback_id": req.ChargebackID,
		"scheme_ref":    ref,
		"scheme":        req.Scheme,
		"status":        "submitted",
		"submitted_at":  time.Now().UTC(),
	})
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

// lookupBINLocally determines card scheme and type from BIN prefix using standard ranges.
func lookupBINLocally(bin6 string) BINLookupResult {
	result := BINLookupResult{BIN: bin6, Country: "NG"}

	// Verve (domestic Nigerian scheme): 5061, 6500, 6501, 6502, 6503, 6504
	if strings.HasPrefix(bin6, "5061") || strings.HasPrefix(bin6, "6500") ||
		strings.HasPrefix(bin6, "6501") || strings.HasPrefix(bin6, "6502") ||
		strings.HasPrefix(bin6, "6503") || strings.HasPrefix(bin6, "6504") {
		result.Scheme = "verve"
		result.CardBrand = "Verve"
		result.IsDebit = true
		result.IssuingBank = "Nigerian Bank"
		return result
	}

	// Visa: starts with 4
	if strings.HasPrefix(bin6, "4") {
		result.Scheme = "visa"
		result.CardBrand = "Visa"
		// Visa debit ranges (simplified)
		if strings.HasPrefix(bin6, "417500") || strings.HasPrefix(bin6, "4532") ||
			strings.HasPrefix(bin6, "4916") {
			result.IsDebit = true
		} else {
			result.IsCredit = true
		}
		return result
	}

	// Mastercard: starts with 51-55 or 2221-2720
	first2 := bin6[:2]
	if first2 >= "51" && first2 <= "55" {
		result.Scheme = "mastercard"
		result.CardBrand = "Mastercard"
		result.IsCredit = true
		return result
	}
	first4 := bin6[:4]
	if first4 >= "2221" && first4 <= "2720" {
		result.Scheme = "mastercard"
		result.CardBrand = "Mastercard"
		result.IsCredit = true
		return result
	}

	// Mastercard debit (Maestro): 6304, 6759, 6761, 6762, 6763
	if strings.HasPrefix(bin6, "6304") || strings.HasPrefix(bin6, "6759") ||
		strings.HasPrefix(bin6, "6761") || strings.HasPrefix(bin6, "6762") ||
		strings.HasPrefix(bin6, "6763") {
		result.Scheme = "mastercard"
		result.CardBrand = "Maestro"
		result.IsDebit = true
		return result
	}

	// American Express: 34, 37
	if strings.HasPrefix(bin6, "34") || strings.HasPrefix(bin6, "37") {
		result.Scheme = "amex"
		result.CardBrand = "American Express"
		result.IsCredit = true
		return result
	}

	result.Scheme = "unknown"
	result.CardBrand = "Unknown"
	return result
}

// isBINInRange checks if a BIN falls within a range.
func isBINInRange(bin, low, high string) bool {
	return bin >= low && bin <= high
}

// fetchSchemeMembershipsFromDB fetches scheme memberships from the portal DB.
func fetchSchemeMembershipsFromDB(ctx context.Context, scheme string) ([]SchemeMembership, error) {
	url := getEnvOrDefault("PORTAL_TRPC_URL", "http://localhost:3000") + "/api/internal/scheme-memberships"
	if scheme != "" {
		url += "?scheme=" + scheme
	}
	reqHTTP, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	reqHTTP.Header.Set("X-Internal-Key", getEnvOrDefault("MIDDLEWARE_INTERNAL_KEY", ""))

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(reqHTTP)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Memberships []SchemeMembership `json:"memberships"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Memberships, nil
}

// defaultMemberships returns placeholder memberships for dev/test environments.
func defaultMemberships() []SchemeMembership {
	return []SchemeMembership{
		{
			Scheme:         "verve",
			MembershipType: "principal",
			MemberID:       "PAYGATE-VERVE-001",
			Status:         "active",
			EffectiveFrom:  time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
			RenewalDate:    time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC),
			BINRanges: []BINRange{
				{Low: "506100", High: "506199", Scheme: "verve", CardType: "debit", Country: "NG"},
			},
		},
	}
}

// submitToSchemePortal submits a dispute to the card scheme's portal.
func submitToSchemePortal(ctx context.Context, scheme string, payload map[string]any) (string, error) {
	// Route to scheme-specific regulatory reporting service
	body, _ := json.Marshal(payload)
	url := getEnvOrDefault("REGULATORY_REPORTING_URL", "http://regulatory-reporting:9053") +
		"/scheme/" + scheme + "/dispute"

	reqHTTP, err := http.NewRequest(http.MethodPost, url, bytesReader(body))
	if err != nil {
		return "", err
	}
	reqHTTP.Header.Set("Content-Type", "application/json")
	reqHTTP.Header.Set("X-Internal-Key", getEnvOrDefault("REGULATORY_REPORTING_API_KEY", ""))

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(reqHTTP)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("scheme portal returned HTTP %d", resp.StatusCode)
	}

	var result struct {
		Ref string `json:"ref"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	return result.Ref, nil
}
