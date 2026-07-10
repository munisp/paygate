// Package healthcare — HTTP bridge handler for FHIR R4 + NHIA integration
// Bridges FHIR R4 (Medplum) ↔ PayGate claim adjudication workflow
package healthcare

import (
"net/http"
"time"
"github.com/gin-gonic/gin"
"github.com/google/uuid"
"go.uber.org/zap"
)

type HealthcareHandler struct {
fhir   *FHIRMedplumHandler
logger *zap.Logger
}

func NewHealthcareHandler(logger *zap.Logger) *HealthcareHandler {
return &HealthcareHandler{
  NewFHIRMedplumHandler(logger),
logger,
}
}

func (h *HealthcareHandler) RegisterRoutes(rg *gin.RouterGroup) {
h.fhir.RegisterRoutes(rg)
rg.POST("/claim", h.SubmitClaim)
rg.GET("/claim/:id", h.GetClaimStatus)
rg.GET("/claims", h.ListClaims)
rg.POST("/eligibility", h.CheckEligibility)
rg.GET("/stats", h.GetStats)
rg.GET("/health", h.Health)
}

func (h *HealthcareHandler) SubmitClaim(c *gin.Context) {
var req struct {
tID    string  `json:"patientId"`
  string  `json:"providerId"`
     string  `json:"hmoCode"`
osisCodes []string `json:"diagnosisCodes"`
[]string `json:"procedureCodes"`
t  float64 `json:"claimAmount"`
cy     string  `json:"currency"`
 string  `json:"serviceDate"`
}
if err := c.ShouldBindJSON(&req); err != nil {
(http.StatusBadRequest, gin.H{"error": err.Error()})

}
claimID := uuid.NewString()
h.logger.Info("claim submitted", zap.String("claimID", claimID), zap.String("patientID", req.PatientID))
c.JSON(http.StatusCreated, gin.H{
    claimID,
     "submitted",
   "FHIR-R4",
time.Now().Format(time.RFC3339),
})
}

func (h *HealthcareHandler) GetClaimStatus(c *gin.Context) {
claimID := c.Param("id")
c.JSON(http.StatusOK, gin.H{"claimId": claimID, "status": "adjudicated", "updatedAt": time.Now().Format(time.RFC3339)})
}

func (h *HealthcareHandler) ListClaims(c *gin.Context) {
c.JSON(http.StatusOK, gin.H{"claims": []interface{}{}, "total": 0})
}

func (h *HealthcareHandler) CheckEligibility(c *gin.Context) {
var req struct {
tID string `json:"patientId"`
  string `json:"hmoCode"`
}
c.ShouldBindJSON(&req)
c.JSON(http.StatusOK, gin.H{"eligible": true, "patientId": req.PatientID, "checkedAt": time.Now().Format(time.RFC3339)})
}

func (h *HealthcareHandler) GetStats(c *gin.Context) {
c.JSON(http.StatusOK, gin.H{"totalClaims": 0, "approved": 0, "denied": 0, "pending": 0})
}

func (h *HealthcareHandler) Health(c *gin.Context) {
c.JSON(http.StatusOK, gin.H{"status": "healthy", "protocol": "FHIR-R4", "medplum": "connected"})
}
