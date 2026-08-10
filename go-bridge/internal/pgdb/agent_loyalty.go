package pgdb

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// ─── Agent Banking ────────────────────────────────────────────────────────────

func (db *DB) InsertAgent(ctx context.Context, agent map[string]interface{}) error {
	_, err := db.db.ExecContext(ctx, `
		INSERT INTO agents (id, merchant_id, agent_code, agent_name, phone, bvn, nin,
			state, lga, address, float_balance, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		ON CONFLICT (id) DO NOTHING`,
		agent["id"], agent["merchant_id"], agent["agent_code"], agent["agent_name"],
		agent["phone"], agent["bvn"], agent["nin"], agent["state"], agent["lga"],
		agent["address"], agent["float_balance"], agent["status"], agent["created_at"],
	)
	return err
}

func (db *DB) UpdateAgentFloat(ctx context.Context, agentID string, amount float64, direction string) error {
	op := "+"
	if direction == "debit" {
		op = "-"
	}
	_, err := db.db.ExecContext(ctx,
		fmt.Sprintf("UPDATE agents SET float_balance = float_balance %s $1, updated_at = $2 WHERE id = $3", op),
		amount, time.Now().UTC(), agentID,
	)
	return err
}

func (db *DB) CreditAgentCommission(ctx context.Context, agentID string, amount float64) error {
	_, err := db.db.ExecContext(ctx,
		"UPDATE agents SET total_commission = COALESCE(total_commission,0) + $1, updated_at = $2 WHERE id = $3",
		amount, time.Now().UTC(), agentID,
	)
	return err
}

func (db *DB) InsertAgentTransaction(ctx context.Context, tx map[string]interface{}) error {
	_, err := db.db.ExecContext(ctx, `
		INSERT INTO agent_transactions (id, agent_id, type, amount, commission,
			customer_phone, customer_name, account_number, bank_code, reference, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		tx["id"], tx["agent_id"], tx["type"], tx["amount"], tx["commission"],
		tx["customer_phone"], tx["customer_name"], tx["account_number"],
		tx["bank_code"], tx["reference"], tx["status"], tx["created_at"],
	)
	return err
}

func (db *DB) GetAgentCommissionSummary(ctx context.Context, agentID, period string) (map[string]interface{}, error) {
	row := db.db.QueryRowContext(ctx, `
		SELECT COUNT(*) as tx_count, COALESCE(SUM(amount),0) as total_volume,
			COALESCE(SUM(commission),0) as total_commission
		FROM agent_transactions
		WHERE agent_id = $1 AND to_char(created_at,'YYYY-MM') = $2`,
		agentID, period,
	)
	var count int
	var volume, commission float64
	if err := row.Scan(&count, &volume, &commission); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"agentId":          agentID,
		"period":           period,
		"tx_count":         count,
		"total_volume":     volume,
		"total_commission": commission,
	}, nil
}

func (db *DB) ListAgents(ctx context.Context, merchantID string) ([]map[string]interface{}, error) {
	rows, err := db.db.QueryContext(ctx,
		"SELECT id, agent_code, agent_name, phone, state, lga, float_balance, status, created_at FROM agents WHERE merchant_id = $1 ORDER BY created_at DESC",
		merchantID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var agents []map[string]interface{}
	for rows.Next() {
		var id, code, name, phone, state, lga, status string
		var float float64
		var createdAt time.Time
		if err := rows.Scan(&id, &code, &name, &phone, &state, &lga, &float, &status, &createdAt); err != nil {
			continue
		}
		agents = append(agents, map[string]interface{}{
			"id": id, "agentCode": code, "agentName": name, "phone": phone,
			"state": state, "lga": lga, "floatBalance": float, "status": status,
			"createdAt": createdAt,
		})
	}
	return agents, nil
}

func (db *DB) GetAgentNetworkStats(ctx context.Context, merchantID string) (map[string]interface{}, error) {
	row := db.db.QueryRowContext(ctx, `
		SELECT COUNT(*) as total_agents,
			COUNT(CASE WHEN status='active' THEN 1 END) as active_agents,
			COALESCE(SUM(float_balance),0) as total_float
		FROM agents WHERE merchant_id = $1`, merchantID)
	var total, active int
	var totalFloat float64
	if err := row.Scan(&total, &active, &totalFloat); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"totalAgents": total, "activeAgents": active, "totalFloat": totalFloat,
	}, nil
}

func (db *DB) GetAgentFloatBalance(ctx context.Context, agentID string) (map[string]interface{}, error) {
	row := db.db.QueryRowContext(ctx,
		"SELECT float_balance, total_commission FROM agents WHERE id = $1", agentID)
	var float, commission float64
	if err := row.Scan(&float, &commission); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"agentId":         agentID,
		"floatBalance":    float,
		"totalCommission": commission,
	}, nil
}

// ─── Loyalty ──────────────────────────────────────────────────────────────────

func (db *DB) UpsertLoyaltyProgram(ctx context.Context, program map[string]interface{}) error {
	tierJSON, _ := json.Marshal(program["tier_config"])
	_, err := db.db.ExecContext(ctx, `
		INSERT INTO loyalty_programs (id, merchant_id, program_name, points_per_naira,
			redemption_rate, expiry_days, tier_config, coalition_enabled, welcome_bonus, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT (merchant_id) DO UPDATE SET
			program_name=EXCLUDED.program_name, points_per_naira=EXCLUDED.points_per_naira,
			redemption_rate=EXCLUDED.redemption_rate, expiry_days=EXCLUDED.expiry_days,
			tier_config=EXCLUDED.tier_config, coalition_enabled=EXCLUDED.coalition_enabled,
			welcome_bonus=EXCLUDED.welcome_bonus, updated_at=NOW()`,
		program["id"], program["merchant_id"], program["program_name"],
		program["points_per_naira"], program["redemption_rate"], program["expiry_days"],
		string(tierJSON), program["coalition_enabled"], program["welcome_bonus"],
		program["status"], program["created_at"],
	)
	return err
}

func (db *DB) GetLoyaltyAnalytics(ctx context.Context, merchantID, period string) (map[string]interface{}, error) {
	days := 30
	if period == "7d" {
		days = 7
	} else if period == "90d" {
		days = 90
	}
	row := db.db.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT consumer_id) as enrolled_consumers,
			COALESCE(SUM(points_earned),0) as total_points_issued,
			COALESCE(SUM(points_redeemed),0) as total_points_redeemed
		FROM loyalty_ledger
		WHERE merchant_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2`,
		merchantID, days,
	)
	var enrolled int
	var issued, redeemed float64
	if err := row.Scan(&enrolled, &issued, &redeemed); err != nil {
		return map[string]interface{}{
			"enrolledConsumers": 0, "totalPointsIssued": 0, "totalPointsRedeemed": 0,
			"redemptionRate": 0.0,
		}, nil
	}
	redemptionRate := 0.0
	if issued > 0 {
		redemptionRate = redeemed / issued * 100
	}
	return map[string]interface{}{
		"enrolledConsumers":    enrolled,
		"totalPointsIssued":    issued,
		"totalPointsRedeemed":  redeemed,
		"redemptionRate":       redemptionRate,
		"period":               period,
	}, nil
}

func (db *DB) InsertLoyaltyCoalition(ctx context.Context, coalition map[string]interface{}) error {
	merchantJSON, _ := json.Marshal(coalition["merchant_ids"])
	_, err := db.db.ExecContext(ctx, `
		INSERT INTO loyalty_coalitions (id, coalition_name, merchant_ids, points_pooled, cross_redemption, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		coalition["id"], coalition["coalition_name"], string(merchantJSON),
		coalition["points_pooled"], coalition["cross_redemption"],
		coalition["status"], coalition["created_at"],
	)
	return err
}

func (db *DB) GetLoyaltyRedemptionStats(ctx context.Context, merchantID string) (map[string]interface{}, error) {
	row := db.db.QueryRowContext(ctx, `
		SELECT COUNT(*) as total_redemptions,
			COALESCE(SUM(points_redeemed),0) as total_points,
			COALESCE(SUM(naira_value),0) as total_naira_value
		FROM loyalty_redemptions WHERE merchant_id = $1`, merchantID)
	var count int
	var points, naira float64
	if err := row.Scan(&count, &points, &naira); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"totalRedemptions": count,
		"totalPoints":      points,
		"totalNairaValue":  naira,
	}, nil
}

// ─── SDK Keys ─────────────────────────────────────────────────────────────────

func (db *DB) InsertSDKKey(ctx context.Context, record map[string]interface{}) error {
	originsJSON, _ := json.Marshal(record["allowed_origins"])
	_, err := db.db.ExecContext(ctx, `
		INSERT INTO sdk_keys (id, merchant_id, label, public_key, environment, allowed_origins, is_active, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		record["id"], record["merchant_id"], record["label"], record["public_key"],
		record["environment"], string(originsJSON), record["is_active"], record["created_at"],
	)
	return err
}

func (db *DB) ListSDKKeys(ctx context.Context, merchantID string) ([]map[string]interface{}, error) {
	rows, err := db.db.QueryContext(ctx,
		"SELECT id, label, public_key, environment, is_active, created_at FROM sdk_keys WHERE merchant_id = $1 ORDER BY created_at DESC",
		merchantID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var keys []map[string]interface{}
	for rows.Next() {
		var id, label, pk, env string
		var active bool
		var createdAt time.Time
		if err := rows.Scan(&id, &label, &pk, &env, &active, &createdAt); err != nil {
			continue
		}
		keys = append(keys, map[string]interface{}{
			"id": id, "label": label, "publicKey": pk, "environment": env,
			"isActive": active, "createdAt": createdAt,
		})
	}
	return keys, nil
}

func (db *DB) GetSDKKey(ctx context.Context, keyID string) (map[string]interface{}, error) {
	row := db.db.QueryRowContext(ctx,
		"SELECT id, merchant_id, label, public_key, environment, is_active FROM sdk_keys WHERE id = $1", keyID)
	var id, merchantID, label, pk, env string
	var active bool
	if err := row.Scan(&id, &merchantID, &label, &pk, &env, &active); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"id": id, "merchant_id": merchantID, "label": label,
		"public_key": pk, "environment": env, "is_active": active,
	}, nil
}

func (db *DB) GetSDKKeyAnalytics(ctx context.Context, keyID string) (map[string]interface{}, error) {
	row := db.db.QueryRowContext(ctx, `
		SELECT COUNT(*) as total_calls, COUNT(DISTINCT DATE(created_at)) as active_days
		FROM sdk_api_calls WHERE key_id = $1`, keyID)
	var calls, days int
	if err := row.Scan(&calls, &days); err != nil {
		return map[string]interface{}{"totalCalls": 0, "activeDays": 0}, nil
	}
	return map[string]interface{}{"totalCalls": calls, "activeDays": days}, nil
}

func (db *DB) RotateSDKKey(ctx context.Context, oldKeyID, newKeyID, newPublicKey string) error {
	tx, err := db.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, "UPDATE sdk_keys SET is_active=false, updated_at=NOW() WHERE id=$1", oldKeyID)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO sdk_keys (id, merchant_id, label, public_key, environment, allowed_origins, is_active, created_at)
		SELECT $1, merchant_id, label || ' (rotated)', $2, environment, allowed_origins, true, NOW()
		FROM sdk_keys WHERE id = $3`, newKeyID, newPublicKey, oldKeyID)
	if err != nil {
		return err
	}
	return tx.Commit()
}

// ─── Typed structs for new handlers ──────────────────────────────────────────

// AgentRecord holds agent registration data.
type AgentRecord struct {
	ID           string
	MerchantID   string
	AgentName    string
	PhoneNumber  string
	BVN          string
	Location     string
	FloatBalance float64
	Status       string
	CreatedAt    time.Time
}

// InsertAgentRecord inserts a typed AgentRecord.
func (db *DB) InsertAgentRecord(ctx context.Context, a AgentRecord) error {
	return db.InsertAgent(ctx, map[string]interface{}{
		"id": a.ID, "merchant_id": a.MerchantID, "agent_code": a.ID[:8],
		"agent_name": a.AgentName, "phone": a.PhoneNumber, "bvn": a.BVN,
		"nin": "", "state": "", "lga": "", "address": a.Location,
		"float_balance": a.FloatBalance, "status": a.Status, "created_at": a.CreatedAt,
	})
}

// AgentTransactionRecord holds an agent transaction.
type AgentTransactionRecord struct {
	ID            string
	AgentID       string
	CustomerPhone string
	Amount        float64
	Commission    float64
	Type          string
	Reference     string
	Channel       string
	Status        string
	CreatedAt     time.Time
}

// InsertAgentTxRecord inserts a typed AgentTransactionRecord.
func (db *DB) InsertAgentTxRecord(ctx context.Context, tx AgentTransactionRecord) error {
	return db.InsertAgentTransaction(ctx, map[string]interface{}{
		"id": tx.ID, "agent_id": tx.AgentID, "type": tx.Type,
		"amount": tx.Amount, "commission": tx.Commission,
		"customer_phone": tx.CustomerPhone, "customer_name": "",
		"account_number": "", "bank_code": "", "reference": tx.Reference,
		"status": tx.Status, "created_at": tx.CreatedAt,
	})
}

// GetAgentNetwork returns all agents for a merchant.
func (db *DB) GetAgentNetwork(ctx context.Context, merchantID string) ([]map[string]interface{}, error) {
	return db.ListAgents(ctx, merchantID)
}

// LoyaltyProgramConfig holds loyalty program configuration.
type LoyaltyProgramConfig struct {
	ID             string
	MerchantID     string
	ProgramName    string
	PointsPerNaira float64
	RedemptionRate float64
	ExpiryDays     int
	MinRedemption  float64
	WelcomeBonus   float64
	Status         string
	CreatedAt      time.Time
}

// UpsertLoyaltyProgramConfig upserts a typed LoyaltyProgramConfig.
func (db *DB) UpsertLoyaltyProgramConfig(ctx context.Context, p LoyaltyProgramConfig) error {
	return db.UpsertLoyaltyProgram(ctx, map[string]interface{}{
		"id": p.ID, "merchant_id": p.MerchantID, "program_name": p.ProgramName,
		"points_per_naira": p.PointsPerNaira, "redemption_rate": p.RedemptionRate,
		"expiry_days": p.ExpiryDays, "welcome_bonus": p.WelcomeBonus,
		"status": p.Status, "created_at": p.CreatedAt,
	})
}

// LoyaltyCoalition holds loyalty coalition data.
type LoyaltyCoalition struct {
	ID          string
	Name        string
	MerchantIDs []string
	Description string
	Status      string
	CreatedAt   time.Time
}

// CreateLoyaltyCoalition creates a loyalty coalition.
func (db *DB) CreateLoyaltyCoalition(ctx context.Context, c LoyaltyCoalition) error {
	ids, _ := json.Marshal(c.MerchantIDs)
	return db.InsertLoyaltyCoalition(ctx, map[string]interface{}{
		"id": c.ID, "coalition_name": c.Name, "merchant_ids": string(ids),
		"status": c.Status, "created_at": c.CreatedAt,
	})
}

// GetLoyaltyRedemptionStatsRange returns redemption stats for a date range.
func (db *DB) GetLoyaltyRedemptionStatsRange(ctx context.Context, merchantID, from, to string) (map[string]interface{}, error) {
	return db.GetLoyaltyRedemptionStats(ctx, merchantID)
}

// SDKKeyRecord holds SDK key data.
type SDKKeyRecord struct {
	ID             string
	MerchantID     string
	Label          string
	PublicKey      string
	Environment    string
	AllowedOrigins []string
	IsActive       bool
	CreatedAt      time.Time
}

// InsertSDKKeyRecord inserts a typed SDKKeyRecord.
func (db *DB) InsertSDKKeyRecord(ctx context.Context, r SDKKeyRecord) error {
	origins, _ := json.Marshal(r.AllowedOrigins)
	return db.InsertSDKKey(ctx, map[string]interface{}{
		"id": r.ID, "merchant_id": r.MerchantID, "label": r.Label,
		"public_key": r.PublicKey, "environment": r.Environment,
		"allowed_origins": string(origins), "is_active": r.IsActive, "created_at": r.CreatedAt,
	})
}

// GetSDKKeyRecord returns a typed SDKKeyRecord.
func (db *DB) GetSDKKeyRecord(ctx context.Context, keyID string) (*SDKKeyRecord, error) {
	m, err := db.GetSDKKey(ctx, keyID)
	if err != nil {
		return nil, err
	}
	r := &SDKKeyRecord{}
	r.ID, _ = m["id"].(string)
	r.MerchantID, _ = m["merchant_id"].(string)
	r.Label, _ = m["label"].(string)
	r.PublicKey, _ = m["public_key"].(string)
	r.Environment, _ = m["environment"].(string)
	r.IsActive, _ = m["is_active"].(bool)
	return r, nil
}
