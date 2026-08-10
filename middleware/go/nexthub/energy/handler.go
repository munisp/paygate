// Package energy — HTTP bridge handler for DLMS/COSEM + STS integration
// Bridges DLMS/COSEM ↔ PayGate VendWorkflow ↔ Rust STS token engine
package energy

import (
"net/http"
"time"
"github.com/gin-gonic/gin"
"github.com/google/uuid"
"go.uber.org/zap"
)

type EnergyBridgeHandler struct {
dlms   *DLMSHandler
logger *zap.Logger
}

func NewEnergyBridgeHandler(logger *zap.Logger) *EnergyBridgeHandler {
return &EnergyBridgeHandler{
  NewDLMSHandler(logger),
logger,
}
}

func (h *EnergyBridgeHandler) RegisterRoutes(rg *gin.RouterGroup) {
h.dlms.RegisterRoutes(rg)
rg.POST("/pay-and-vend", h.PayAndVend)
rg.GET("/transaction/:ref", h.GetTransaction)
rg.GET("/transactions", h.ListTransactions)
rg.GET("/stats", h.GetStats)
rg.GET("/health", h.Health)
}

func (h *EnergyBridgeHandler) PayAndVend(c *gin.Context) {
var req struct {
string  `json:"meterSerial"`
t      float64 `json:"amount"`
cy    string  `json:"currency"`
  string  `json:"discoCode"`
mentRef  string  `json:"paymentRef"`
}
if err := c.ShouldBindJSON(&req); err != nil {
(http.StatusBadRequest, gin.H{"error": err.Error()})

}
vendRef := uuid.NewString()
discoConfig, ok := DISCOConfigs[req.DISCOCode]
if !ok {
(http.StatusBadRequest, gin.H{"error": "unknown DISCO: " + req.DISCOCode})

}
tariff := discoConfig["tariff"].(float64)
units := req.Amount / tariff
token := generateSTSToken20Digit(req.MeterSerial, units)
h.logger.Info("pay-and-vend", zap.String("vendRef", vendRef), zap.Float64("units", units))
c.JSON(http.StatusCreated, gin.H{
dRef":     vendRef,
":       token,
its":       units,
t":      req.Amount,
cy":    req.Currency,
ame":   discoConfig["name"],
   "DLMS-COSEM + STS-IEC62055-41",
time.Now().Format(time.RFC3339),
})
}

func (h *EnergyBridgeHandler) GetTransaction(c *gin.Context) {
c.JSON(http.StatusOK, gin.H{"vendRef": c.Param("ref"), "status": "completed"})
}

func (h *EnergyBridgeHandler) ListTransactions(c *gin.Context) {
c.JSON(http.StatusOK, gin.H{"transactions": []interface{}{}, "total": 0})
}

func (h *EnergyBridgeHandler) GetStats(c *gin.Context) {
c.JSON(http.StatusOK, gin.H{"totalVends": 0, "totalUnits": 0, "totalRevenue": 0})
}

func (h *EnergyBridgeHandler) Health(c *gin.Context) {
c.JSON(http.StatusOK, gin.H{"status": "healthy", "protocol": "DLMS-COSEM + STS-IEC62055-41", "discos": len(DISCOConfigs)})
}
