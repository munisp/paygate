// PayGate Loyalty & Rewards Engine — Rust FFI
// Provides points calculation, tier evaluation, and redemption logic.
// Used by the Go bridge loyalty handler via FFI.

use libc::c_char;
use serde::{Deserialize, Serialize};
use std::ffi::{CStr, CString};

/// Loyalty tier definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoyaltyTier {
    pub name: String,
    pub min_points: u64,
    pub points_multiplier: f64,
    pub cashback_pct: f64,
    pub benefits: Vec<String>,
}

/// Standard tier configuration
pub fn default_tiers() -> Vec<LoyaltyTier> {
    vec![
        LoyaltyTier {
            name: "Bronze".to_string(),
            min_points: 0,
            points_multiplier: 1.0,
            cashback_pct: 0.5,
            benefits: vec!["Basic rewards".to_string()],
        },
        LoyaltyTier {
            name: "Silver".to_string(),
            min_points: 5_000,
            points_multiplier: 1.5,
            cashback_pct: 1.0,
            benefits: vec!["1.5x points".to_string(), "Priority support".to_string()],
        },
        LoyaltyTier {
            name: "Gold".to_string(),
            min_points: 25_000,
            points_multiplier: 2.0,
            cashback_pct: 1.5,
            benefits: vec!["2x points".to_string(), "Free transfers".to_string(), "Dedicated manager".to_string()],
        },
        LoyaltyTier {
            name: "Platinum".to_string(),
            min_points: 100_000,
            points_multiplier: 3.0,
            cashback_pct: 2.5,
            benefits: vec!["3x points".to_string(), "Concierge service".to_string(), "Airport lounge".to_string(), "Zero FX fees".to_string()],
        },
    ]
}

/// Points calculation request
#[derive(Debug, Serialize, Deserialize)]
pub struct PointsCalculationRequest {
    /// Transaction amount in kobo
    pub amount_kobo: u64,
    /// Current tier name
    pub current_tier: String,
    /// Transaction category (affects bonus multiplier)
    pub category: String,
    /// Whether this is a bonus event (e.g. first transaction, referral)
    pub is_bonus_event: bool,
    /// Bonus multiplier for special events (1.0 = no bonus)
    pub bonus_multiplier: f64,
}

/// Points calculation result
#[derive(Debug, Serialize, Deserialize)]
pub struct PointsCalculationResult {
    /// Base points earned (1 point per ₦100 = 10,000 kobo)
    pub base_points: u64,
    /// Tier multiplier applied
    pub tier_multiplier: f64,
    /// Category bonus multiplier
    pub category_multiplier: f64,
    /// Event bonus multiplier
    pub event_multiplier: f64,
    /// Total points earned
    pub total_points: u64,
    /// Cashback amount in kobo
    pub cashback_kobo: u64,
    /// Breakdown description
    pub description: String,
}

/// Tier evaluation request
#[derive(Debug, Serialize, Deserialize)]
pub struct TierEvaluationRequest {
    pub total_points: u64,
    pub current_tier: String,
}

/// Tier evaluation result
#[derive(Debug, Serialize, Deserialize)]
pub struct TierEvaluationResult {
    pub new_tier: String,
    pub tier_changed: bool,
    pub points_to_next_tier: u64,
    pub next_tier_name: String,
    pub cashback_pct: f64,
    pub points_multiplier: f64,
}

/// Redemption calculation request
#[derive(Debug, Serialize, Deserialize)]
pub struct RedemptionRequest {
    pub points_to_redeem: u64,
    pub available_points: u64,
    pub redemption_type: String, // "cashback" | "voucher" | "transfer_fee_waiver"
}

/// Redemption calculation result
#[derive(Debug, Serialize, Deserialize)]
pub struct RedemptionResult {
    pub valid: bool,
    pub points_redeemed: u64,
    pub value_kobo: u64,
    pub remaining_points: u64,
    pub error: Option<String>,
}

// ─── Core logic ───────────────────────────────────────────────────────────────

/// Calculate points earned for a transaction.
pub fn calculate_points(req: &PointsCalculationRequest) -> PointsCalculationResult {
    let tiers = default_tiers();

    // Base: 1 point per ₦100 (10,000 kobo)
    let base_points = req.amount_kobo / 10_000;

    // Tier multiplier
    let tier_multiplier = tiers
        .iter()
        .find(|t| t.name.to_lowercase() == req.current_tier.to_lowercase())
        .map(|t| t.points_multiplier)
        .unwrap_or(1.0);

    // Category multiplier
    let category_multiplier = match req.category.as_str() {
        "food_beverage" => 1.5,
        "fuel" => 1.2,
        "utilities" => 1.3,
        "healthcare" => 1.4,
        "education" => 1.5,
        "travel" => 2.0,
        _ => 1.0,
    };

    let event_multiplier = if req.is_bonus_event {
        req.bonus_multiplier.max(1.0)
    } else {
        1.0
    };

    let total_points = (base_points as f64 * tier_multiplier * category_multiplier * event_multiplier).round() as u64;

    // Cashback
    let cashback_pct = tiers
        .iter()
        .find(|t| t.name.to_lowercase() == req.current_tier.to_lowercase())
        .map(|t| t.cashback_pct)
        .unwrap_or(0.5);
    let cashback_kobo = (req.amount_kobo as f64 * cashback_pct / 100.0).round() as u64;

    PointsCalculationResult {
        base_points,
        tier_multiplier,
        category_multiplier,
        event_multiplier,
        total_points,
        cashback_kobo,
        description: format!(
            "{}pts base × {:.1}x tier × {:.1}x category × {:.1}x event = {}pts + ₦{:.2} cashback",
            base_points, tier_multiplier, category_multiplier, event_multiplier,
            total_points, cashback_kobo as f64 / 100.0
        ),
    }
}

/// Evaluate tier based on total accumulated points.
pub fn evaluate_tier(req: &TierEvaluationRequest) -> TierEvaluationResult {
    let tiers = default_tiers();

    // Find current tier
    let new_tier = tiers
        .iter()
        .rev()
        .find(|t| req.total_points >= t.min_points)
        .unwrap_or(&tiers[0]);

    let tier_changed = new_tier.name.to_lowercase() != req.current_tier.to_lowercase();

    // Find next tier
    let next_tier = tiers
        .iter()
        .find(|t| t.min_points > req.total_points);

    let (points_to_next, next_tier_name) = match next_tier {
        Some(t) => (t.min_points - req.total_points, t.name.clone()),
        None => (0, "Max tier reached".to_string()),
    };

    TierEvaluationResult {
        new_tier: new_tier.name.clone(),
        tier_changed,
        points_to_next_tier: points_to_next,
        next_tier_name,
        cashback_pct: new_tier.cashback_pct,
        points_multiplier: new_tier.points_multiplier,
    }
}

/// Calculate redemption value for a points redemption request.
pub fn calculate_redemption(req: &RedemptionRequest) -> RedemptionResult {
    if req.points_to_redeem > req.available_points {
        return RedemptionResult {
            valid: false,
            points_redeemed: 0,
            value_kobo: 0,
            remaining_points: req.available_points,
            error: Some(format!(
                "Insufficient points: have {}, need {}",
                req.available_points, req.points_to_redeem
            )),
        };
    }

    // Minimum redemption: 500 points
    if req.points_to_redeem < 500 {
        return RedemptionResult {
            valid: false,
            points_redeemed: 0,
            value_kobo: 0,
            remaining_points: req.available_points,
            error: Some("Minimum redemption is 500 points".to_string()),
        };
    }

    // Conversion rate: 1 point = ₦0.50 (5,000 kobo)
    let value_kobo = match req.redemption_type.as_str() {
        "cashback" => req.points_to_redeem * 5_000,
        "voucher" => (req.points_to_redeem as f64 * 5_500.0) as u64, // 10% bonus for vouchers
        "transfer_fee_waiver" => req.points_to_redeem * 4_000,
        _ => req.points_to_redeem * 5_000,
    };

    RedemptionResult {
        valid: true,
        points_redeemed: req.points_to_redeem,
        value_kobo,
        remaining_points: req.available_points - req.points_to_redeem,
        error: None,
    }
}

// ─── C FFI exports ────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn loyalty_calculate_points(request_json: *const c_char) -> *mut c_char {
    let json_str = unsafe {
        if request_json.is_null() { return loyalty_error("null input"); }
        match CStr::from_ptr(request_json).to_str() {
            Ok(s) => s,
            Err(_) => return loyalty_error("invalid UTF-8"),
        }
    };
    let req: PointsCalculationRequest = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => return loyalty_error(&format!("parse error: {}", e)),
    };
    let result = calculate_points(&req);
    to_c_str(&serde_json::to_string(&result).unwrap_or_default())
}

#[no_mangle]
pub extern "C" fn loyalty_evaluate_tier(request_json: *const c_char) -> *mut c_char {
    let json_str = unsafe {
        if request_json.is_null() { return loyalty_error("null input"); }
        match CStr::from_ptr(request_json).to_str() {
            Ok(s) => s,
            Err(_) => return loyalty_error("invalid UTF-8"),
        }
    };
    let req: TierEvaluationRequest = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => return loyalty_error(&format!("parse error: {}", e)),
    };
    let result = evaluate_tier(&req);
    to_c_str(&serde_json::to_string(&result).unwrap_or_default())
}

#[no_mangle]
pub extern "C" fn loyalty_calculate_redemption(request_json: *const c_char) -> *mut c_char {
    let json_str = unsafe {
        if request_json.is_null() { return loyalty_error("null input"); }
        match CStr::from_ptr(request_json).to_str() {
            Ok(s) => s,
            Err(_) => return loyalty_error("invalid UTF-8"),
        }
    };
    let req: RedemptionRequest = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => return loyalty_error(&format!("parse error: {}", e)),
    };
    let result = calculate_redemption(&req);
    to_c_str(&serde_json::to_string(&result).unwrap_or_default())
}

#[no_mangle]
pub extern "C" fn loyalty_free(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe { drop(CString::from_raw(ptr)); }
    }
}

fn loyalty_error(msg: &str) -> *mut c_char {
    to_c_str(&format!("{{\"error\":\"{}\"}}", msg.replace('"', "'")))
}

fn to_c_str(s: &str) -> *mut c_char {
    CString::new(s).unwrap_or_else(|_| CString::new("{}").unwrap()).into_raw()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bronze_tier_points() {
        let req = PointsCalculationRequest {
            amount_kobo: 100_000_00, // ₦100,000
            current_tier: "Bronze".to_string(),
            category: "general".to_string(),
            is_bonus_event: false,
            bonus_multiplier: 1.0,
        };
        let result = calculate_points(&req);
        assert_eq!(result.base_points, 1000); // ₦100,000 / ₦100 = 1000 points
        assert_eq!(result.tier_multiplier, 1.0);
        assert_eq!(result.total_points, 1000);
    }

    #[test]
    fn test_gold_tier_travel_bonus() {
        let req = PointsCalculationRequest {
            amount_kobo: 50_000_00, // ₦50,000
            current_tier: "Gold".to_string(),
            category: "travel".to_string(),
            is_bonus_event: false,
            bonus_multiplier: 1.0,
        };
        let result = calculate_points(&req);
        assert_eq!(result.base_points, 500);
        assert_eq!(result.tier_multiplier, 2.0);
        assert_eq!(result.category_multiplier, 2.0);
        assert_eq!(result.total_points, 2000); // 500 × 2.0 × 2.0
    }

    #[test]
    fn test_tier_upgrade_to_silver() {
        let req = TierEvaluationRequest {
            total_points: 6000,
            current_tier: "Bronze".to_string(),
        };
        let result = evaluate_tier(&req);
        assert_eq!(result.new_tier, "Silver");
        assert!(result.tier_changed);
    }

    #[test]
    fn test_redemption_insufficient_points() {
        let req = RedemptionRequest {
            points_to_redeem: 1000,
            available_points: 500,
            redemption_type: "cashback".to_string(),
        };
        let result = calculate_redemption(&req);
        assert!(!result.valid);
        assert!(result.error.is_some());
    }

    #[test]
    fn test_redemption_cashback() {
        let req = RedemptionRequest {
            points_to_redeem: 1000,
            available_points: 5000,
            redemption_type: "cashback".to_string(),
        };
        let result = calculate_redemption(&req);
        assert!(result.valid);
        assert_eq!(result.value_kobo, 5_000_000); // 1000 × 5000 kobo = ₦50,000
        assert_eq!(result.remaining_points, 4000);
    }
}
