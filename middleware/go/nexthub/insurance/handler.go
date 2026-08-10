// Package insurance — HTTP bridge handler for ACORD XML/JSON integration
// Bridges ACORD AL3/XML ↔ PayGate PremiumCollectionWorkflow
package insurance

import (
"net/http"
"time"
"github.com/gin-gonic/gin"
"github.com/google/uuid"
"go.uber.org/zap"
)

type InsuranceHandler struct {
acord  *ACORDHandler
logger *zap.Logger
}

func NewInsuranceHandler(logger *zap.Logger) *InsuranceHandler {
return &InsuranceHandler{
 NewACORDHandler(logger),
logger,
}
}

func (h *InsuranceHandler) RegisterRoutes(rg *gin.RouterGroup) {
h.acord.RegisterRoutes(rg)
rg.POST("/policy", h.CreatePolicy)
rg.GET("/policy/:id", h.GetPolicy)
rg.GET("/policies", h.ListPolicies)
rg.POST("/premium/collect", h.CollectPremium)
rg.POST("/claim", h.FileClaim)
rg.GET("/stats", h.GetStats)
rg.GET("/health", h.Health)
}

func (h *InsuranceHandler) CreatePolicy(c *gin.Context) {
var req struct {
holderID string  `json:"policyholderId"`
   string  `json:"productCode"`
t  float64 `json:"premiumAmount"`
cy       string  `json:"currency"`
cy      string  `json:"frequency"`
     string  `json:"startDate"`
}
if err := c.ShouldBindJSON(&req); err != nil {
(http.StatusBadRequest, gin.H{"error": err.Error()})

}
policyID := uuid.NewString()
h.logger.Info("policy created", zap.String("policyID", policyID))
c.JSON(http.StatusCreated, gin.H{
Id":  policyID,
   "active",
 "ACORD-AL3",
time.Now().Format(time.RFC3339),
})
}

func (h *InsuranceHandler) GetPolicy(c *gin.Context) {
policyID := c.Param("id")
c.JSON(http.StatusOK, gin.H{"policyId": policyID, "status": "active"})
}

func (h *InsuranceHandler) ListPolicies(c *gin.Context) {
c.JSON(http.StatusOK, gin.H{"policies": []interface{}{}, "total": 0})
}

func (h *InsuranceHandler) CollectPremium(c *gin.Context) {
var req struct {
ID string  `json:"policyId"`
t   float64 `json:"amount"`
cy string  `json:"currency"`
}
c.ShouldBindJSON(&req)
c.JSON(http.StatusCreated, gin.H{
mentRef": uuid.NewString(),
Id":   req.PolicyID,
    "collected",
time.Now().Format(time.RFC3339),
})
}

func (h *InsuranceHandler) FileClaim(c *gin.Context) {
claimID := uuid.NewString()
c.JSON(http.StatusCreated, gin.H{"claimId": claimID, "status": "filed", "filedAt": time.Now().Format(time.RFC3339)})
}

func (h *InsuranceHandler) GetStats(c *gin.Context) {
c.JSON(http.StatusOK, gin.H{"totalPolicies": 0, "activePolicies": 0, "claimsPaid": 0})
}

func (h *InsuranceHandler) Health(c *gin.Context) {
c.JSON(http.StatusOK, gin.H{"status": "healthy", "protocol": "ACORD-AL3"})
}
