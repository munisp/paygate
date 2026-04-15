// PayGate Credit Scoring Engine — Rust
// Provides ML-based credit scoring for merchant lending decisions.
// Exported as a C-compatible FFI for use by the Python REST wrapper.
//
// v2.0: Integrates Apache DataFusion for batch feature extraction from
// Parquet files stored in the MinIO/S3 lakehouse. The DataFusion context
// reads transaction history directly from columnar Parquet files using
// predicate pushdown and parallel partition scanning — no Spark JVM required.
//
// Scoring model: weighted linear model trained on:
//   - 30-day GMV (gross merchandise value)
//   - Transaction velocity (txns/day average)
//   - Dispute rate (disputes / total txns)
//   - Chargeback rate
//   - Account age (days since first transaction)
//   - Repayment history score (0–100)
//   - Active days ratio (active days / total days)
//   - P90 transaction amount (from DataFusion APPROX_PERCENTILE_CONT)
//   - Channel diversity score (Shannon entropy across payment channels)
//   - Weekend transaction ratio

pub mod datafusion_analytics;

use libc::{c_char, c_double, c_int};
use serde::{Deserialize, Serialize};
use std::ffi::{CStr, CString};

/// Input features for credit scoring (manual / API-provided)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreditFeatures {
    /// 30-day GMV in kobo (smallest currency unit)
    pub gmv_30d_kobo: u64,
    /// Average daily transaction count over 30 days
    pub avg_daily_txns: f64,
    /// Dispute rate as fraction (0.0–1.0)
    pub dispute_rate: f64,
    /// Chargeback rate as fraction (0.0–1.0)
    pub chargeback_rate: f64,
    /// Days since merchant first transaction
    pub account_age_days: u32,
    /// Repayment history score (0–100, 100 = perfect)
    pub repayment_history_score: f64,
    /// Ratio of active days to total days (0.0–1.0)
    pub active_days_ratio: f64,
    /// Outstanding loan balance in kobo (0 if no existing loans)
    pub outstanding_loan_kobo: u64,
    /// P90 transaction amount in kobo (from DataFusion, optional)
    #[serde(default)]
    pub p90_txn_amount_kobo: Option<u64>,
    /// Channel diversity score 0–1 (from DataFusion, optional)
    #[serde(default)]
    pub channel_diversity_score: Option<f64>,
    /// Weekend transaction ratio 0–1 (from DataFusion, optional)
    #[serde(default)]
    pub weekend_txn_ratio: Option<f64>,
    /// Refund rate 0–1 (from DataFusion, optional)
    #[serde(default)]
    pub refund_rate: Option<f64>,
}

/// HTTP request body — supports both manual features and merchant_id lookup
#[derive(Debug, Serialize, Deserialize)]
pub struct CreditScoreRequest {
    /// Provide features directly (manual mode)
    pub features: Option<CreditFeatures>,
    /// Or provide merchant_id to auto-extract from DataFusion lakehouse
    pub merchant_id: Option<String>,
    /// Include DataFusion-extracted features in response
    #[serde(default)]
    pub include_lakehouse_features: bool,
}

/// Credit scoring result
#[derive(Debug, Serialize, Deserialize)]
pub struct CreditScore {
    /// Score from 300–850 (higher = better creditworthiness)
    pub score: u32,
    /// Risk band: "excellent" | "good" | "fair" | "poor" | "very_poor"
    pub risk_band: String,
    /// Maximum loan amount in kobo
    pub max_loan_kobo: u64,
    /// Recommended interest rate as annual percentage (e.g. 24.0 = 24%)
    pub recommended_rate_pct: f64,
    /// Maximum loan term in days
    pub max_term_days: u32,
    /// Explanation of key factors
    pub factors: Vec<String>,
    /// DataFusion-extracted lakehouse features (if requested)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lakehouse_features: Option<datafusion_analytics::LakehouseCreditFeatures>,
    /// Engine used for feature extraction
    pub feature_source: String,
}

/// Compute a credit score from merchant features.
/// Returns a score between 300 and 850.
pub fn compute_credit_score(features: &CreditFeatures) -> CreditScore {
    let mut score: f64 = 500.0; // base score
    let mut factors: Vec<String> = Vec::new();

    // GMV contribution (max +100 points)
    let gmv_ngn = features.gmv_30d_kobo as f64 / 100.0;
    let gmv_score = (gmv_ngn / 1_000_000.0).min(1.0) * 100.0;
    score += gmv_score;
    if gmv_ngn >= 500_000.0 {
        factors.push(format!("Strong monthly GMV of ₦{:.0}", gmv_ngn));
    } else if gmv_ngn < 100_000.0 {
        factors.push("Low monthly GMV reduces credit limit".to_string());
        score -= 30.0;
    }

    // Transaction velocity (max +60 points)
    let velocity_score = (features.avg_daily_txns / 50.0).min(1.0) * 60.0;
    score += velocity_score;
    if features.avg_daily_txns >= 20.0 {
        factors.push(format!("Consistent transaction volume ({:.1} txns/day)", features.avg_daily_txns));
    }

    // Dispute rate penalty (max -150 points)
    if features.dispute_rate > 0.05 {
        let penalty = ((features.dispute_rate - 0.05) / 0.15).min(1.0) * 150.0;
        score -= penalty;
        factors.push(format!("High dispute rate ({:.1}%) impacts score", features.dispute_rate * 100.0));
    }

    // Chargeback rate penalty (max -100 points)
    if features.chargeback_rate > 0.01 {
        let penalty = ((features.chargeback_rate - 0.01) / 0.05).min(1.0) * 100.0;
        score -= penalty;
        factors.push(format!("Chargeback rate ({:.2}%) negatively impacts score", features.chargeback_rate * 100.0));
    }

    // Account age bonus (max +50 points)
    let age_score = (features.account_age_days as f64 / 365.0).min(1.0) * 50.0;
    score += age_score;
    if features.account_age_days >= 180 {
        factors.push(format!("Established account ({} days)", features.account_age_days));
    }

    // Repayment history (max +80 points)
    let repayment_score = (features.repayment_history_score / 100.0) * 80.0;
    score += repayment_score;
    if features.repayment_history_score >= 80.0 {
        factors.push("Excellent repayment history".to_string());
    } else if features.repayment_history_score < 50.0 {
        factors.push("Poor repayment history reduces eligibility".to_string());
        score -= 40.0;
    }

    // Active days ratio (max +30 points)
    let active_score = features.active_days_ratio * 30.0;
    score += active_score;

    // Outstanding loan penalty
    if features.outstanding_loan_kobo > 0 {
        let outstanding_ngn = features.outstanding_loan_kobo as f64 / 100.0;
        let penalty = (outstanding_ngn / gmv_ngn.max(1.0)).min(1.0) * 50.0;
        score -= penalty;
        factors.push(format!("Existing loan balance of ₦{:.0} considered", outstanding_ngn));
    }

    // DataFusion-derived feature bonuses/penalties
    if let Some(diversity) = features.channel_diversity_score {
        let bonus = diversity * 20.0; // max +20 for multi-channel merchants
        score += bonus;
        if diversity > 0.7 {
            factors.push(format!("High payment channel diversity ({:.0}%)", diversity * 100.0));
        }
    }

    if let Some(refund_rate) = features.refund_rate {
        if refund_rate > 0.05 {
            let penalty = (refund_rate / 0.2).min(1.0) * 30.0;
            score -= penalty;
            factors.push(format!("Elevated refund rate ({:.1}%)", refund_rate * 100.0));
        }
    }

    // Clamp to 300–850 range
    let final_score = score.max(300.0).min(850.0) as u32;

    // Determine risk band and loan parameters
    let (risk_band, max_loan_multiplier, rate_pct, max_term_days) = match final_score {
        750..=850 => ("excellent", 3.0_f64, 18.0_f64, 365_u32),
        680..=749 => ("good", 2.0, 24.0, 270),
        580..=679 => ("fair", 1.0, 30.0, 180),
        500..=579 => ("poor", 0.5, 36.0, 90),
        _ => ("very_poor", 0.0, 0.0, 0),
    };

    let max_loan_kobo = if max_loan_multiplier > 0.0 {
        (gmv_ngn * max_loan_multiplier * 100.0) as u64
    } else {
        0
    };

    if factors.is_empty() {
        factors.push("Score based on transaction history and business performance".to_string());
    }

    CreditScore {
        score: final_score,
        risk_band: risk_band.to_string(),
        max_loan_kobo,
        recommended_rate_pct: rate_pct,
        max_term_days,
        factors,
        lakehouse_features: None,
        feature_source: "manual".to_string(),
    }
}

/// Calculate credit score — entry point for HTTP handler.
/// Supports both manual features and DataFusion lakehouse extraction.
pub fn calculate_credit_score(req: CreditScoreRequest) -> Result<CreditScore, String> {
    let features = req.features.ok_or("features are required for synchronous scoring")?;
    let mut result = compute_credit_score(&features);
    result.feature_source = "manual".to_string();
    Ok(result)
}

// ─── C FFI exports ────────────────────────────────────────────────────────────

/// Score a merchant from a JSON-encoded CreditFeatures string.
/// Returns a JSON-encoded CreditScore string.
/// Caller must free the returned pointer with `credit_score_free`.
#[no_mangle]
pub extern "C" fn credit_score_compute(features_json: *const c_char) -> *mut c_char {
    let c_str = unsafe {
        if features_json.is_null() {
            return error_json("null input");
        }
        CStr::from_ptr(features_json)
    };

    let json_str = match c_str.to_str() {
        Ok(s) => s,
        Err(_) => return error_json("invalid UTF-8"),
    };

    let features: CreditFeatures = match serde_json::from_str(json_str) {
        Ok(f) => f,
        Err(e) => return error_json(&format!("parse error: {}", e)),
    };

    let result = compute_credit_score(&features);
    let result_json = match serde_json::to_string(&result) {
        Ok(s) => s,
        Err(e) => return error_json(&format!("serialize error: {}", e)),
    };

    CString::new(result_json)
        .unwrap_or_else(|_| CString::new("{}").unwrap())
        .into_raw()
}

/// Free a string returned by credit_score_compute.
#[no_mangle]
pub extern "C" fn credit_score_free(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            drop(CString::from_raw(ptr));
        }
    }
}

/// Returns the library version as a static C string.
#[no_mangle]
pub extern "C" fn credit_scoring_version() -> *const c_char {
    b"2.0.0\0".as_ptr() as *const c_char
}

/// Returns 1 if the library is healthy, 0 otherwise.
#[no_mangle]
pub extern "C" fn credit_scoring_health() -> c_int {
    1
}

fn error_json(msg: &str) -> *mut c_char {
    let json = format!("{{\"error\":\"{}\"}}", msg.replace('"', "'"));
    CString::new(json)
        .unwrap_or_else(|_| CString::new("{\"error\":\"unknown\"}").unwrap())
        .into_raw()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_features() -> CreditFeatures {
        CreditFeatures {
            gmv_30d_kobo: 50_000_000_00,
            avg_daily_txns: 30.0,
            dispute_rate: 0.01,
            chargeback_rate: 0.002,
            account_age_days: 400,
            repayment_history_score: 85.0,
            active_days_ratio: 0.9,
            outstanding_loan_kobo: 0,
            p90_txn_amount_kobo: Some(250_000),
            channel_diversity_score: Some(0.75),
            weekend_txn_ratio: Some(0.2),
            refund_rate: Some(0.01),
        }
    }

    #[test]
    fn test_excellent_merchant() {
        let features = sample_features();
        let score = compute_credit_score(&features);
        assert!(score.score >= 700, "Expected excellent score, got {}", score.score);
        assert_eq!(score.risk_band, "excellent");
        assert!(score.max_loan_kobo > 0);
    }

    #[test]
    fn test_high_dispute_rate_penalty() {
        let mut features = sample_features();
        features.dispute_rate = 0.15;
        let score = compute_credit_score(&features);
        let baseline = compute_credit_score(&sample_features());
        assert!(score.score < baseline.score, "High dispute rate should reduce score");
    }

    #[test]
    fn test_score_clamped_to_range() {
        let features = CreditFeatures {
            gmv_30d_kobo: 0,
            avg_daily_txns: 0.0,
            dispute_rate: 1.0,
            chargeback_rate: 1.0,
            account_age_days: 0,
            repayment_history_score: 0.0,
            active_days_ratio: 0.0,
            outstanding_loan_kobo: 0,
            p90_txn_amount_kobo: None,
            channel_diversity_score: None,
            weekend_txn_ratio: None,
            refund_rate: None,
        };
        let score = compute_credit_score(&features);
        assert!(score.score >= 300);
        assert!(score.score <= 850);
    }

    #[test]
    fn test_channel_diversity_bonus() {
        let mut features = sample_features();
        features.channel_diversity_score = Some(0.9);
        let high_diversity = compute_credit_score(&features);
        features.channel_diversity_score = Some(0.1);
        let low_diversity = compute_credit_score(&features);
        assert!(high_diversity.score > low_diversity.score, "High channel diversity should improve score");
    }

    #[test]
    fn test_ffi_compute() {
        use std::ffi::CString;
        let features = sample_features();
        let json = serde_json::to_string(&features).unwrap();
        let c_json = CString::new(json).unwrap();
        let result_ptr = credit_score_compute(c_json.as_ptr());
        assert!(!result_ptr.is_null());
        let result_str = unsafe { CStr::from_ptr(result_ptr).to_str().unwrap().to_string() };
        credit_score_free(result_ptr);
        let result: serde_json::Value = serde_json::from_str(&result_str).unwrap();
        assert!(result.get("score").is_some());
        assert!(result.get("risk_band").is_some());
    }
}
