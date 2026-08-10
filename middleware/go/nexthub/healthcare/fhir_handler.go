// Package healthcare — FHIR R4 handler via Medplum open-source FHIR server
// Medplum: https://github.com/medplum/medplum (Apache 2.0)
// FHIR R4 spec: https://hl7.org/fhir/R4/
//
// Architecture:
//   APISIX /nexthub/fhir/* → this handler → Medplum FHIR server (http://medplum:8103)
//   PayGate claim workflow ← FHIR Claim resource ← NHIA/HMO systems
//
// Supported FHIR Resources:
//   Patient, Practitioner, Organization, Coverage, Claim, ClaimResponse,
//   ExplanationOfBenefit, Encounter, Condition, Procedure, MedicationRequest
package healthcare

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// MedplumConfig holds connection settings for the Medplum FHIR server
type MedplumConfig struct {
	BaseURL      string // e.g. http://medplum:8103/fhir/R4
	ClientID     string
	ClientSecret string
	ProjectID    string
}

// FHIRHandler bridges PayGate claim workflows to a Medplum FHIR R4 server
type FHIRHandler struct {
	cfg    MedplumConfig
	client *http.Client
	logger *zap.Logger
	token  string
	expiry time.Time
}

// NewFHIRHandler creates a new FHIR handler with Medplum configuration
func NewFHIRHandler(cfg MedplumConfig, logger *zap.Logger) *FHIRHandler {
	return &FHIRHandler{
		cfg:    cfg,
		client: &http.Client{Timeout: 30 * time.Second},
		logger: logger,
	}
}

// ─── OAuth2 Client Credentials (Medplum) ────────────────────────────────────

func (h *FHIRHandler) getToken(ctx context.Context) (string, error) {
	if time.Now().Before(h.expiry) && h.token != "" {
		return h.token, nil
	}
	body := fmt.Sprintf(
		"grant_type=client_credentials&client_id=%s&client_secret=%s",
		h.cfg.ClientID, h.cfg.ClientSecret,
	)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimSuffix(h.cfg.BaseURL, "/fhir/R4")+"/oauth2/token",
		strings.NewReader(body),
	)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := h.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("medplum token request: %w", err)
	}
	defer resp.Body.Close()
	var tok struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", fmt.Errorf("medplum token decode: %w", err)
	}
	h.token = tok.AccessToken
	h.expiry = time.Now().Add(time.Duration(tok.ExpiresIn-60) * time.Second)
	return h.token, nil
}

// ─── Generic FHIR CRUD ───────────────────────────────────────────────────────

func (h *FHIRHandler) fhirRequest(ctx context.Context, method, path string, body interface{}) (map[string]interface{}, int, error) {
	token, err := h.getToken(ctx)
	if err != nil {
		return nil, 0, err
	}
	var reqBody io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reqBody = bytes.NewReader(b)
	}
	url := h.cfg.BaseURL + "/" + strings.TrimPrefix(path, "/")
	req, _ := http.NewRequestWithContext(ctx, method, url, reqBody)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/fhir+json")
	req.Header.Set("Accept", "application/fhir+json")
	if h.cfg.ProjectID != "" {
		req.Header.Set("X-Medplum-Project", h.cfg.ProjectID)
	}
	resp, err := h.client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("fhir request %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()
	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, resp.StatusCode, nil
}

// ─── FHIR Resource Handlers (Gin) ───────────────────────────────────────────

// RegisterRoutes mounts FHIR R4 routes on a Gin router group
func (h *FHIRHandler) RegisterRoutes(rg *gin.RouterGroup) {
	// Patient
	rg.GET("/Patient/:id", h.GetPatient)
	rg.POST("/Patient", h.CreatePatient)
	rg.PUT("/Patient/:id", h.UpdatePatient)
	rg.GET("/Patient", h.SearchPatients)

	// Practitioner
	rg.GET("/Practitioner/:id", h.GetPractitioner)
	rg.POST("/Practitioner", h.CreatePractitioner)

	// Organization (hospital, HMO, NHIA)
	rg.GET("/Organization/:id", h.GetOrganization)
	rg.POST("/Organization", h.CreateOrganization)

	// Coverage (insurance plan / NHIS card)
	rg.GET("/Coverage/:id", h.GetCoverage)
	rg.POST("/Coverage", h.CreateCoverage)
	rg.GET("/Coverage", h.SearchCoverage)

	// Claim (pre-auth + adjudication)
	rg.POST("/Claim", h.SubmitClaim)
	rg.GET("/Claim/:id", h.GetClaim)
	rg.GET("/Claim", h.SearchClaims)

	// ClaimResponse (adjudication result)
	rg.GET("/ClaimResponse/:id", h.GetClaimResponse)
	rg.GET("/ClaimResponse", h.SearchClaimResponses)

	// ExplanationOfBenefit (EOB — final settlement)
	rg.GET("/ExplanationOfBenefit/:id", h.GetEOB)
	rg.GET("/ExplanationOfBenefit", h.SearchEOBs)

	// Encounter
	rg.POST("/Encounter", h.CreateEncounter)
	rg.GET("/Encounter/:id", h.GetEncounter)

	// Condition
	rg.POST("/Condition", h.CreateCondition)

	// MedicationRequest
	rg.POST("/MedicationRequest", h.CreateMedicationRequest)

	// Batch / Transaction bundle
	rg.POST("/", h.ProcessBundle)

	// $validate operation
	rg.POST("/:resourceType/$validate", h.ValidateResource)
}

// ─── Patient ─────────────────────────────────────────────────────────────────

func (h *FHIRHandler) GetPatient(c *gin.Context) {
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodGet, "Patient/"+c.Param("id"), nil)
	h.respond(c, result, status, err)
}

func (h *FHIRHandler) CreatePatient(c *gin.Context) {
	var patient map[string]interface{}
	if err := c.ShouldBindJSON(&patient); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	patient["resourceType"] = "Patient"
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodPost, "Patient", patient)
	h.respond(c, result, status, err)
}

func (h *FHIRHandler) UpdatePatient(c *gin.Context) {
	var patient map[string]interface{}
	if err := c.ShouldBindJSON(&patient); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	patient["resourceType"] = "Patient"
	patient["id"] = c.Param("id")
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodPut, "Patient/"+c.Param("id"), patient)
	h.respond(c, result, status, err)
}

func (h *FHIRHandler) SearchPatients(c *gin.Context) {
	path := "Patient?" + c.Request.URL.RawQuery
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodGet, path, nil)
	h.respond(c, result, status, err)
}

// ─── Practitioner ────────────────────────────────────────────────────────────

func (h *FHIRHandler) GetPractitioner(c *gin.Context) {
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodGet, "Practitioner/"+c.Param("id"), nil)
	h.respond(c, result, status, err)
}

func (h *FHIRHandler) CreatePractitioner(c *gin.Context) {
	var prac map[string]interface{}
	if err := c.ShouldBindJSON(&prac); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	prac["resourceType"] = "Practitioner"
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodPost, "Practitioner", prac)
	h.respond(c, result, status, err)
}

// ─── Organization ────────────────────────────────────────────────────────────

func (h *FHIRHandler) GetOrganization(c *gin.Context) {
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodGet, "Organization/"+c.Param("id"), nil)
	h.respond(c, result, status, err)
}

func (h *FHIRHandler) CreateOrganization(c *gin.Context) {
	var org map[string]interface{}
	if err := c.ShouldBindJSON(&org); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	org["resourceType"] = "Organization"
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodPost, "Organization", org)
	h.respond(c, result, status, err)
}

// ─── Coverage ────────────────────────────────────────────────────────────────

func (h *FHIRHandler) GetCoverage(c *gin.Context) {
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodGet, "Coverage/"+c.Param("id"), nil)
	h.respond(c, result, status, err)
}

func (h *FHIRHandler) CreateCoverage(c *gin.Context) {
	var cov map[string]interface{}
	if err := c.ShouldBindJSON(&cov); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cov["resourceType"] = "Coverage"
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodPost, "Coverage", cov)
	h.respond(c, result, status, err)
}

func (h *FHIRHandler) SearchCoverage(c *gin.Context) {
	path := "Coverage?" + c.Request.URL.RawQuery
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodGet, path, nil)
	h.respond(c, result, status, err)
}

// ─── Claim ───────────────────────────────────────────────────────────────────

// SubmitClaim converts a PayGate claim request to a FHIR R4 Claim resource
// and submits it to Medplum. The FHIR Claim.id is stored in PayGate's
// healthcare_claims.fhir_claim_id column for correlation.
func (h *FHIRHandler) SubmitClaim(c *gin.Context) {
	var req struct {
		PatientID      string  `json:"patientId"`
		ProviderID     string  `json:"providerId"`
		PayerID        string  `json:"payerId"`
		CoverageID     string  `json:"coverageId"`
		EncounterID    string  `json:"encounterId"`
		DiagnosisCodes []string `json:"diagnosisCodes"` // ICD-10
		ProcedureCodes []string `json:"procedureCodes"` // CPT/SNOMED
		TotalAmount    float64 `json:"totalAmount"`
		Currency       string  `json:"currency"`
		ServiceDate    string  `json:"serviceDate"`
		PreAuthRef     string  `json:"preAuthRef,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Build FHIR R4 Claim resource
	diagnoses := make([]map[string]interface{}, len(req.DiagnosisCodes))
	for i, code := range req.DiagnosisCodes {
		diagnoses[i] = map[string]interface{}{
			"sequence": i + 1,
			"diagnosisCodeableConcept": map[string]interface{}{
				"coding": []map[string]interface{}{{
					"system": "http://hl7.org/fhir/sid/icd-10",
					"code":   code,
				}},
			},
		}
	}
	procedures := make([]map[string]interface{}, len(req.ProcedureCodes))
	for i, code := range req.ProcedureCodes {
		procedures[i] = map[string]interface{}{
			"sequence": i + 1,
			"procedureCodeableConcept": map[string]interface{}{
				"coding": []map[string]interface{}{{
					"system": "http://www.ama-assn.org/go/cpt",
					"code":   code,
				}},
			},
		}
	}

	claim := map[string]interface{}{
		"resourceType": "Claim",
		"id":           uuid.NewString(),
		"status":       "active",
		"type": map[string]interface{}{
			"coding": []map[string]interface{}{{
				"system": "http://terminology.hl7.org/CodeSystem/claim-type",
				"code":   "institutional",
			}},
		},
		"use":         "claim",
		"patient":     map[string]interface{}{"reference": "Patient/" + req.PatientID},
		"created":     time.Now().Format(time.RFC3339),
		"provider":    map[string]interface{}{"reference": "Practitioner/" + req.ProviderID},
		"priority":    map[string]interface{}{"coding": []map[string]interface{}{{"code": "normal"}}},
		"insurance": []map[string]interface{}{{
			"sequence":  1,
			"focal":     true,
			"coverage":  map[string]interface{}{"reference": "Coverage/" + req.CoverageID},
			"preAuthRef": []string{req.PreAuthRef},
		}},
		"diagnosis": diagnoses,
		"procedure": procedures,
		"total": map[string]interface{}{
			"value":    req.TotalAmount,
			"currency": req.Currency,
		},
		"billablePeriod": map[string]interface{}{
			"start": req.ServiceDate,
			"end":   req.ServiceDate,
		},
	}

	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodPost, "Claim", claim)
	h.respond(c, result, status, err)
}

func (h *FHIRHandler) GetClaim(c *gin.Context) {
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodGet, "Claim/"+c.Param("id"), nil)
	h.respond(c, result, status, err)
}

func (h *FHIRHandler) SearchClaims(c *gin.Context) {
	path := "Claim?" + c.Request.URL.RawQuery
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodGet, path, nil)
	h.respond(c, result, status, err)
}

// ─── ClaimResponse ───────────────────────────────────────────────────────────

func (h *FHIRHandler) GetClaimResponse(c *gin.Context) {
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodGet, "ClaimResponse/"+c.Param("id"), nil)
	h.respond(c, result, status, err)
}

func (h *FHIRHandler) SearchClaimResponses(c *gin.Context) {
	path := "ClaimResponse?" + c.Request.URL.RawQuery
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodGet, path, nil)
	h.respond(c, result, status, err)
}

// ─── ExplanationOfBenefit ────────────────────────────────────────────────────

func (h *FHIRHandler) GetEOB(c *gin.Context) {
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodGet, "ExplanationOfBenefit/"+c.Param("id"), nil)
	h.respond(c, result, status, err)
}

func (h *FHIRHandler) SearchEOBs(c *gin.Context) {
	path := "ExplanationOfBenefit?" + c.Request.URL.RawQuery
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodGet, path, nil)
	h.respond(c, result, status, err)
}

// ─── Encounter ───────────────────────────────────────────────────────────────

func (h *FHIRHandler) CreateEncounter(c *gin.Context) {
	var enc map[string]interface{}
	if err := c.ShouldBindJSON(&enc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	enc["resourceType"] = "Encounter"
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodPost, "Encounter", enc)
	h.respond(c, result, status, err)
}

func (h *FHIRHandler) GetEncounter(c *gin.Context) {
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodGet, "Encounter/"+c.Param("id"), nil)
	h.respond(c, result, status, err)
}

// ─── Condition ───────────────────────────────────────────────────────────────

func (h *FHIRHandler) CreateCondition(c *gin.Context) {
	var cond map[string]interface{}
	if err := c.ShouldBindJSON(&cond); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cond["resourceType"] = "Condition"
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodPost, "Condition", cond)
	h.respond(c, result, status, err)
}

// ─── MedicationRequest ───────────────────────────────────────────────────────

func (h *FHIRHandler) CreateMedicationRequest(c *gin.Context) {
	var med map[string]interface{}
	if err := c.ShouldBindJSON(&med); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	med["resourceType"] = "MedicationRequest"
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodPost, "MedicationRequest", med)
	h.respond(c, result, status, err)
}

// ─── Bundle (batch/transaction) ──────────────────────────────────────────────

// ProcessBundle handles FHIR batch and transaction bundles — used for
// bulk claim submission (e.g. end-of-day hospital batch to NHIA)
func (h *FHIRHandler) ProcessBundle(c *gin.Context) {
	var bundle map[string]interface{}
	if err := c.ShouldBindJSON(&bundle); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	bundle["resourceType"] = "Bundle"
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodPost, "", bundle)
	h.respond(c, result, status, err)
}

// ─── $validate ───────────────────────────────────────────────────────────────

func (h *FHIRHandler) ValidateResource(c *gin.Context) {
	resourceType := c.Param("resourceType")
	var resource map[string]interface{}
	if err := c.ShouldBindJSON(&resource); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	path := resourceType + "/$validate"
	result, status, err := h.fhirRequest(c.Request.Context(), http.MethodPost, path, resource)
	h.respond(c, result, status, err)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func (h *FHIRHandler) respond(c *gin.Context, result map[string]interface{}, status int, err error) {
	if err != nil {
		h.logger.Error("fhir request failed", zap.Error(err))
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	if status == 0 {
		status = http.StatusOK
	}
	c.JSON(status, result)
}

// ─── PayGate ↔ FHIR Claim Mapper ────────────────────────────────────────────

// PayGateClaimToFHIR converts a PayGate healthcare_claims row to a FHIR R4 Claim resource.
// This is used by the ClaimAdjudicationWorkflow to register claims in Medplum.
func PayGateClaimToFHIR(claimID, patientFHIRID, providerFHIRID, coverageFHIRID string,
	diagnosisCodes, procedureCodes []string,
	totalAmount float64, currency, serviceDate string) map[string]interface{} {

	diagnoses := make([]map[string]interface{}, len(diagnosisCodes))
	for i, code := range diagnosisCodes {
		diagnoses[i] = map[string]interface{}{
			"sequence": i + 1,
			"diagnosisCodeableConcept": map[string]interface{}{
				"coding": []map[string]interface{}{{
					"system": "http://hl7.org/fhir/sid/icd-10",
					"code":   code,
				}},
			},
		}
	}
	items := make([]map[string]interface{}, len(procedureCodes))
	for i, code := range procedureCodes {
		items[i] = map[string]interface{}{
			"sequence": i + 1,
			"productOrService": map[string]interface{}{
				"coding": []map[string]interface{}{{
					"system": "http://www.ama-assn.org/go/cpt",
					"code":   code,
				}},
			},
			"net": map[string]interface{}{
				"value":    totalAmount / float64(len(procedureCodes)),
				"currency": currency,
			},
		}
	}
	return map[string]interface{}{
		"resourceType": "Claim",
		"id":           claimID,
		"status":       "active",
		"type": map[string]interface{}{
			"coding": []map[string]interface{}{{
				"system": "http://terminology.hl7.org/CodeSystem/claim-type",
				"code":   "institutional",
			}},
		},
		"use":      "claim",
		"patient":  map[string]interface{}{"reference": "Patient/" + patientFHIRID},
		"created":  time.Now().Format(time.RFC3339),
		"provider": map[string]interface{}{"reference": "Practitioner/" + providerFHIRID},
		"priority": map[string]interface{}{"coding": []map[string]interface{}{{"code": "normal"}}},
		"insurance": []map[string]interface{}{{
			"sequence": 1,
			"focal":    true,
			"coverage": map[string]interface{}{"reference": "Coverage/" + coverageFHIRID},
		}},
		"diagnosis": diagnoses,
		"item":      items,
		"total": map[string]interface{}{
			"value":    totalAmount,
			"currency": currency,
		},
		"billablePeriod": map[string]interface{}{
			"start": serviceDate,
			"end":   serviceDate,
		},
	}
}
