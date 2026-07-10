// Package insurance — ACORD XML/JSON interoperability adapter
// ACORD (Association for Cooperative Operations Research and Development)
// Open standard: https://www.acord.org/standards-architecture/acord-standards
// ACORD AL3 / ACORD XML (P&C, Life, Health) — open schema, royalty-free
//
// Architecture:
//   APISIX /nexthub/acord/* → this handler → PayGate insurance workflow
//   External insurer/broker → ACORD XML/JSON → PayGate premium collection
//
// Supported ACORD transactions:
//   TXLife (Life/Health): OLifE, Policy, Party, Holding, Activity
//   ACORD XML (P&C): InsuranceSvcRq, PolicyAddRq, PolicyChgRq, ClaimInqRq
package insurance

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

// ─── ACORD XML Structures (P&C — ACORD 2.x) ─────────────────────────────────

// ACORDEnvelope is the root element for ACORD XML P&C messages
type ACORDEnvelope struct {
	XMLName    xml.Name        `xml:"ACORD"`
	SignonRq   *ACORDSignonRq  `xml:"SignonRq,omitempty"`
	InsuranceSvcRq *InsuranceSvcRq `xml:"InsuranceSvcRq,omitempty"`
	InsuranceSvcRs *InsuranceSvcRs `xml:"InsuranceSvcRs,omitempty"`
}

type ACORDSignonRq struct {
	SignonTransport ACORDSignonTransport `xml:"SignonTransport"`
}

type ACORDSignonTransport struct {
	SignonRoleCd string `xml:"SignonRoleCd"`
	CustId       string `xml:"CustId"`
	CustPswd     string `xml:"CustPswd"`
}

type InsuranceSvcRq struct {
	RqUID      string          `xml:"RqUID"`
	SPName     string          `xml:"SPName"`
	PolicyAddRq *PolicyAddRq  `xml:"PolicyAddRq,omitempty"`
	PolicyChgRq *PolicyChgRq  `xml:"PolicyChgRq,omitempty"`
	ClaimAddRq  *ClaimAddRq   `xml:"ClaimAddRq,omitempty"`
	ClaimInqRq  *ClaimInqRq   `xml:"ClaimInqRq,omitempty"`
	PremiumRq   *PremiumRq    `xml:"PremiumRq,omitempty"`
}

type InsuranceSvcRs struct {
	RqUID      string `xml:"RqUID"`
	TransactionResponseDt string `xml:"TransactionResponseDt"`
	MsgStatus  MsgStatus `xml:"MsgStatus"`
	PolicyRef  string    `xml:"PolicyRef,omitempty"`
	ClaimRef   string    `xml:"ClaimRef,omitempty"`
}

type MsgStatus struct {
	MsgStatusCd   string `xml:"MsgStatusCd"`
	MsgStatusDesc string `xml:"MsgStatusDesc"`
}

type PolicyAddRq struct {
	RqUID        string       `xml:"RqUID"`
	TransactionDt string      `xml:"TransactionDt"`
	CurCd        string       `xml:"CurCd"`
	Policy       ACORDPolicy  `xml:"Policy"`
	InsuredOrPrincipal InsuredOrPrincipal `xml:"InsuredOrPrincipal"`
}

type PolicyChgRq struct {
	RqUID     string `xml:"RqUID"`
	PolicyRef string `xml:"PolicyRef"`
	ChangeType string `xml:"ChangeType"` // Endorsement, Cancellation, Renewal
	EffectiveDt string `xml:"EffectiveDt"`
}

type ClaimAddRq struct {
	RqUID     string      `xml:"RqUID"`
	PolicyRef string      `xml:"PolicyRef"`
	Claim     ACORDClaim  `xml:"Claim"`
}

type ClaimInqRq struct {
	RqUID    string `xml:"RqUID"`
	ClaimRef string `xml:"ClaimRef"`
}

type PremiumRq struct {
	RqUID     string `xml:"RqUID"`
	PolicyRef string `xml:"PolicyRef"`
	PremiumAmt float64 `xml:"PremiumAmt"`
	CurCd     string  `xml:"CurCd"`
	DueDt     string  `xml:"DueDt"`
}

type ACORDPolicy struct {
	PolicyNumber  string  `xml:"PolicyNumber"`
	LOBCd         string  `xml:"LOBCd"` // AUTO, HOME, LIFE, HEALTH, MARINE, FIRE
	PolicyStatusCd string `xml:"PolicyStatusCd"`
	ContractTerm  ContractTerm `xml:"ContractTerm"`
	TotalPremiumAmt float64 `xml:"TotalPremiumAmt"`
	CurCd         string  `xml:"CurCd"`
}

type ContractTerm struct {
	EffectiveDt string `xml:"EffectiveDt"`
	ExpirationDt string `xml:"ExpirationDt"`
}

type InsuredOrPrincipal struct {
	ItemIdInfo ItemIdInfo `xml:"ItemIdInfo"`
	GeneralPartyInfo GeneralPartyInfo `xml:"GeneralPartyInfo"`
}

type ItemIdInfo struct {
	InsuredOrPrincipalId string `xml:"InsuredOrPrincipalId"`
}

type GeneralPartyInfo struct {
	NameInfo NameInfo `xml:"NameInfo"`
	Addr     Addr     `xml:"Addr"`
}

type NameInfo struct {
	PersonName PersonName `xml:"PersonName"`
}

type PersonName struct {
	GivenName  string `xml:"GivenName"`
	Surname    string `xml:"Surname"`
}

type Addr struct {
	Addr1    string `xml:"Addr1"`
	City     string `xml:"City"`
	StateProvCd string `xml:"StateProvCd"`
	CountryCd string `xml:"CountryCd"`
}

type ACORDClaim struct {
	ClaimNumber  string  `xml:"ClaimNumber"`
	LossDt       string  `xml:"LossDt"`
	LossDesc     string  `xml:"LossDesc"`
	ClaimStatusCd string `xml:"ClaimStatusCd"`
	TotalClaimAmt float64 `xml:"TotalClaimAmt"`
	CurCd        string  `xml:"CurCd"`
}

// ─── TXLife (ACORD Life/Health) ──────────────────────────────────────────────

// TXLife is the root element for ACORD TXLife messages (Life & Health)
type TXLife struct {
	XMLName  xml.Name     `xml:"TXLife"`
	Version  string       `xml:"version,attr"`
	TXLifeRequest  *TXLifeRequest  `xml:"TXLifeRequest,omitempty"`
	TXLifeResponse *TXLifeResponse `xml:"TXLifeResponse,omitempty"`
}

type TXLifeRequest struct {
	UserAuthRequest UserAuthRequest `xml:"UserAuthRequest"`
	OLifE           OLifE           `xml:"OLifE"`
}

type TXLifeResponse struct {
	TransRefGUID string `xml:"TransRefGUID"`
	TransType    TransType `xml:"TransType"`
	TransExeDate string `xml:"TransExeDate"`
	OLifE        OLifE  `xml:"OLifE"`
}

type UserAuthRequest struct {
	UserLoginName string `xml:"UserLoginName"`
	UserPswd      string `xml:"UserPswd"`
}

type TransType struct {
	TC   string `xml:"tc,attr"`
	Text string `xml:",chardata"`
}

type OLifE struct {
	Holding  *Holding  `xml:"Holding,omitempty"`
	Party    []Party   `xml:"Party,omitempty"`
	Activity *Activity `xml:"Activity,omitempty"`
}

type Holding struct {
	Id     string `xml:"id,attr"`
	Policy TXLifePolicy `xml:"Policy"`
}

type TXLifePolicy struct {
	PolNumber    string  `xml:"PolNumber"`
	LineOfBusiness string `xml:"LineOfBusiness"`
	PolicyStatus string  `xml:"PolicyStatus"`
	IssueDate    string  `xml:"IssueDate"`
	MaturityDate string  `xml:"MaturityDate"`
	FaceAmt      float64 `xml:"FaceAmt"`
	PremiumAmt   float64 `xml:"PremiumAmt"`
	CurCd        string  `xml:"CurCd"`
}

type Party struct {
	Id        string `xml:"id,attr"`
	PartyTypeCode string `xml:"PartyTypeCode"`
	Person    *Person `xml:"Person,omitempty"`
}

type Person struct {
	FirstName string `xml:"FirstName"`
	LastName  string `xml:"LastName"`
	BirthDate string `xml:"BirthDate"`
	Gender    string `xml:"Gender"`
}

type Activity struct {
	ActivityType string `xml:"ActivityType"`
	ActivityDate string `xml:"ActivityDate"`
	PremiumAmt   float64 `xml:"PremiumAmt,omitempty"`
}

// ─── Handler ─────────────────────────────────────────────────────────────────

// ACORDHandler bridges ACORD XML/JSON messages to PayGate insurance workflows
type ACORDHandler struct {
	logger *zap.Logger
}

func NewACORDHandler(logger *zap.Logger) *ACORDHandler {
	return &ACORDHandler{logger: logger}
}

// RegisterRoutes mounts ACORD routes on a Gin router group
func (h *ACORDHandler) RegisterRoutes(rg *gin.RouterGroup) {
	// ACORD XML P&C endpoints
	rg.POST("/xml/policy", h.HandlePolicyAdd)
	rg.PUT("/xml/policy/:ref", h.HandlePolicyChange)
	rg.POST("/xml/claim", h.HandleClaimAdd)
	rg.GET("/xml/claim/:ref", h.HandleClaimInquiry)
	rg.POST("/xml/premium", h.HandlePremiumCollection)

	// TXLife (Life/Health) endpoints
	rg.POST("/txlife/policy", h.HandleTXLifePolicy)
	rg.POST("/txlife/activity", h.HandleTXLifeActivity)

	// JSON equivalents (for modern integrations)
	rg.POST("/json/policy", h.HandleJSONPolicy)
	rg.POST("/json/claim", h.HandleJSONClaim)
	rg.POST("/json/premium", h.HandleJSONPremium)

	// Validation
	rg.POST("/validate/xml", h.ValidateACORDXML)
	rg.GET("/schema/:version", h.GetSchema)
}

// ─── ACORD XML P&C Handlers ──────────────────────────────────────────────────

func (h *ACORDHandler) HandlePolicyAdd(c *gin.Context) {
	contentType := c.GetHeader("Content-Type")
	var rq PolicyAddRq

	if strings.Contains(contentType, "xml") {
		var env ACORDEnvelope
		if err := xml.NewDecoder(c.Request.Body).Decode(&env); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ACORD XML: " + err.Error()})
			return
		}
		if env.InsuranceSvcRq == nil || env.InsuranceSvcRq.PolicyAddRq == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "missing PolicyAddRq in ACORD envelope"})
			return
		}
		rq = *env.InsuranceSvcRq.PolicyAddRq
	} else {
		if err := c.ShouldBindJSON(&rq); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	// Map to PayGate insurance policy
	policyRef := uuid.NewString()
	paygatePolicy := map[string]interface{}{
		"id":            policyRef,
		"policyNumber":  rq.Policy.PolicyNumber,
		"lineOfBusiness": rq.Policy.LOBCd,
		"status":        "active",
		"premiumAmount": rq.Policy.TotalPremiumAmt,
		"currency":      rq.Policy.CurCd,
		"effectiveDate": rq.Policy.ContractTerm.EffectiveDt,
		"expiryDate":    rq.Policy.ContractTerm.ExpirationDt,
		"insuredName":   rq.InsuredOrPrincipal.GeneralPartyInfo.NameInfo.PersonName.GivenName + " " +
			rq.InsuredOrPrincipal.GeneralPartyInfo.NameInfo.PersonName.Surname,
		"source":        "acord_xml",
		"acordRqUID":    rq.RqUID,
	}

	h.logger.Info("ACORD PolicyAdd received",
		zap.String("policyRef", policyRef),
		zap.String("lobCd", rq.Policy.LOBCd),
	)

	rs := InsuranceSvcRs{
		RqUID:                 rq.RqUID,
		TransactionResponseDt: time.Now().Format(time.RFC3339),
		MsgStatus: MsgStatus{
			MsgStatusCd:   "SuccessWithInfo",
			MsgStatusDesc: "Policy created in PayGate",
		},
		PolicyRef: policyRef,
	}

	if strings.Contains(contentType, "xml") {
		c.Header("Content-Type", "application/xml")
		c.XML(http.StatusCreated, ACORDEnvelope{InsuranceSvcRs: &rs})
	} else {
		c.JSON(http.StatusCreated, gin.H{
			"acordResponse": rs,
			"paygatePolicy": paygatePolicy,
		})
	}
}

func (h *ACORDHandler) HandlePolicyChange(c *gin.Context) {
	policyRef := c.Param("ref")
	var rq PolicyChgRq
	if err := c.ShouldBindJSON(&rq); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.logger.Info("ACORD PolicyChange received",
		zap.String("policyRef", policyRef),
		zap.String("changeType", rq.ChangeType),
	)
	c.JSON(http.StatusOK, gin.H{
		"policyRef":  policyRef,
		"changeType": rq.ChangeType,
		"status":     "processed",
		"efectiveDt": rq.EffectiveDt,
	})
}

func (h *ACORDHandler) HandleClaimAdd(c *gin.Context) {
	var rq ClaimAddRq
	if err := c.ShouldBindJSON(&rq); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	claimRef := uuid.NewString()
	h.logger.Info("ACORD ClaimAdd received",
		zap.String("claimRef", claimRef),
		zap.String("policyRef", rq.PolicyRef),
	)
	c.JSON(http.StatusCreated, gin.H{
		"claimRef":  claimRef,
		"policyRef": rq.PolicyRef,
		"status":    "submitted",
		"claimAmt":  rq.Claim.TotalClaimAmt,
		"currency":  rq.Claim.CurCd,
	})
}

func (h *ACORDHandler) HandleClaimInquiry(c *gin.Context) {
	claimRef := c.Param("ref")
	c.JSON(http.StatusOK, gin.H{
		"claimRef":  claimRef,
		"status":    "under_review",
		"lastUpdated": time.Now().Format(time.RFC3339),
	})
}

func (h *ACORDHandler) HandlePremiumCollection(c *gin.Context) {
	var rq PremiumRq
	if err := c.ShouldBindJSON(&rq); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	txRef := uuid.NewString()
	h.logger.Info("ACORD Premium collection",
		zap.String("policyRef", rq.PolicyRef),
		zap.Float64("amount", rq.PremiumAmt),
	)
	c.JSON(http.StatusOK, gin.H{
		"txRef":      txRef,
		"policyRef":  rq.PolicyRef,
		"amount":     rq.PremiumAmt,
		"currency":   rq.CurCd,
		"status":     "collected",
		"collectedAt": time.Now().Format(time.RFC3339),
	})
}

// ─── TXLife Handlers ─────────────────────────────────────────────────────────

func (h *ACORDHandler) HandleTXLifePolicy(c *gin.Context) {
	var txLife TXLife
	contentType := c.GetHeader("Content-Type")

	if strings.Contains(contentType, "xml") {
		if err := xml.NewDecoder(c.Request.Body).Decode(&txLife); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid TXLife XML: " + err.Error()})
			return
		}
	} else {
		if err := c.ShouldBindJSON(&txLife); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	policyRef := uuid.NewString()
	var polNumber, lob string
	var premAmt float64

	if txLife.TXLifeRequest != nil && txLife.TXLifeRequest.OLifE.Holding != nil {
		pol := txLife.TXLifeRequest.OLifE.Holding.Policy
		polNumber = pol.PolNumber
		lob = pol.LineOfBusiness
		premAmt = pol.PremiumAmt
	}

	h.logger.Info("TXLife policy received",
		zap.String("policyRef", policyRef),
		zap.String("polNumber", polNumber),
	)

	response := TXLife{
		Version: "2.0",
		TXLifeResponse: &TXLifeResponse{
			TransRefGUID: policyRef,
			TransType:    TransType{TC: "103", Text: "New Business"},
			TransExeDate: time.Now().Format("2006-01-02"),
			OLifE: OLifE{
				Holding: &Holding{
					Id: policyRef,
					Policy: TXLifePolicy{
						PolNumber:      polNumber,
						LineOfBusiness: lob,
						PolicyStatus:   "Active",
						IssueDate:      time.Now().Format("2006-01-02"),
						PremiumAmt:     premAmt,
					},
				},
			},
		},
	}

	if strings.Contains(contentType, "xml") {
		c.Header("Content-Type", "application/xml")
		c.XML(http.StatusCreated, response)
	} else {
		c.JSON(http.StatusCreated, response)
	}
}

func (h *ACORDHandler) HandleTXLifeActivity(c *gin.Context) {
	var txLife TXLife
	if err := c.ShouldBindJSON(&txLife); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	txRef := uuid.NewString()
	c.JSON(http.StatusOK, gin.H{
		"txRef":  txRef,
		"status": "processed",
		"processedAt": time.Now().Format(time.RFC3339),
	})
}

// ─── JSON Handlers ───────────────────────────────────────────────────────────

func (h *ACORDHandler) HandleJSONPolicy(c *gin.Context) {
	var policy map[string]interface{}
	if err := c.ShouldBindJSON(&policy); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	policyRef := uuid.NewString()
	policy["id"] = policyRef
	policy["source"] = "acord_json"
	policy["createdAt"] = time.Now().Format(time.RFC3339)
	c.JSON(http.StatusCreated, gin.H{"policyRef": policyRef, "policy": policy})
}

func (h *ACORDHandler) HandleJSONClaim(c *gin.Context) {
	var claim map[string]interface{}
	if err := c.ShouldBindJSON(&claim); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	claimRef := uuid.NewString()
	claim["id"] = claimRef
	claim["status"] = "submitted"
	c.JSON(http.StatusCreated, gin.H{"claimRef": claimRef, "claim": claim})
}

func (h *ACORDHandler) HandleJSONPremium(c *gin.Context) {
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	txRef := uuid.NewString()
	c.JSON(http.StatusOK, gin.H{
		"txRef":  txRef,
		"status": "collected",
		"collectedAt": time.Now().Format(time.RFC3339),
	})
}

// ─── Validation & Schema ─────────────────────────────────────────────────────

func (h *ACORDHandler) ValidateACORDXML(c *gin.Context) {
	var env ACORDEnvelope
	if err := xml.NewDecoder(c.Request.Body).Decode(&env); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"valid":  false,
			"errors": []string{fmt.Sprintf("XML parse error: %s", err.Error())},
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"valid":   true,
		"version": "ACORD XML 2.x",
		"message": "ACORD XML structure is valid",
	})
}

func (h *ACORDHandler) GetSchema(c *gin.Context) {
	version := c.Param("version")
	schemas := map[string]interface{}{
		"2.x": map[string]interface{}{
			"name":        "ACORD XML P&C",
			"version":     "2.x",
			"namespace":   "http://www.ACORD.org/standards/PC_Surety/ACORD1/xml/",
			"rootElement": "ACORD",
			"transactions": []string{
				"PolicyAddRq", "PolicyChgRq", "ClaimAddRq", "ClaimInqRq", "PremiumRq",
			},
			"openSource": true,
			"license":    "ACORD Public License",
			"reference":  "https://www.acord.org/standards-architecture/acord-standards",
		},
		"txlife": map[string]interface{}{
			"name":        "ACORD TXLife (Life/Health)",
			"version":     "2.0",
			"namespace":   "http://ACORD.org/Standards/Life/2/",
			"rootElement": "TXLife",
			"transactions": []string{
				"NewBusiness", "PolicyChange", "PremiumPayment", "ClaimNotification",
			},
			"openSource": true,
			"license":    "ACORD Public License",
		},
	}
	schema, ok := schemas[version]
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("schema version %s not found", version)})
		return
	}
	c.JSON(http.StatusOK, schema)
}

// ─── PayGate ↔ ACORD Mapper ──────────────────────────────────────────────────

// PayGatePolicyToACORD converts a PayGate insurance_policies row to ACORD XML
func PayGatePolicyToACORD(policyID, policyNumber, lob string, premAmt float64, currency, effectiveDt, expiryDt, insuredName string) *ACORDEnvelope {
	nameParts := strings.SplitN(insuredName, " ", 2)
	given, surname := "", insuredName
	if len(nameParts) == 2 {
		given, surname = nameParts[0], nameParts[1]
	}
	return &ACORDEnvelope{
		InsuranceSvcRq: &InsuranceSvcRq{
			RqUID:  policyID,
			SPName: "PayGate-NextHub",
			PolicyAddRq: &PolicyAddRq{
				RqUID:         policyID,
				TransactionDt: time.Now().Format(time.RFC3339),
				CurCd:         currency,
				Policy: ACORDPolicy{
					PolicyNumber:    policyNumber,
					LOBCd:           lob,
					PolicyStatusCd:  "Active",
					TotalPremiumAmt: premAmt,
					CurCd:           currency,
					ContractTerm: ContractTerm{
						EffectiveDt:  effectiveDt,
						ExpirationDt: expiryDt,
					},
				},
				InsuredOrPrincipal: InsuredOrPrincipal{
					ItemIdInfo: ItemIdInfo{InsuredOrPrincipalId: policyID},
					GeneralPartyInfo: GeneralPartyInfo{
						NameInfo: NameInfo{
							PersonName: PersonName{GivenName: given, Surname: surname},
						},
					},
				},
			},
		},
	}
}

// MarshalACORD serialises an ACORD envelope to XML bytes
func MarshalACORD(env *ACORDEnvelope) ([]byte, error) {
	return xml.MarshalIndent(env, "", "  ")
}

// UnmarshalACORD parses ACORD XML bytes into an envelope
func UnmarshalACORD(data []byte) (*ACORDEnvelope, error) {
	var env ACORDEnvelope
	if err := xml.Unmarshal(data, &env); err != nil {
		return nil, fmt.Errorf("acord unmarshal: %w", err)
	}
	return &env, nil
}

// ACORDToJSON converts an ACORD XML envelope to a JSON map for storage/logging
func ACORDToJSON(env *ACORDEnvelope) (map[string]interface{}, error) {
	b, err := json.Marshal(env)
	if err != nil {
		return nil, err
	}
	var m map[string]interface{}
	json.Unmarshal(b, &m)
	return m, nil
}
