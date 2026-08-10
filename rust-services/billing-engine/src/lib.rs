// PayGate Billing Engine — Rust FFI
// Provides proration calculation and metered billing aggregation.
// Used by the Temporal RecurringBillingWorkflow via the Go bridge.

use libc::c_char;
use serde::{Deserialize, Serialize};
use std::ffi::{CStr, CString};

/// Proration calculation request
#[derive(Debug, Serialize, Deserialize)]
pub struct ProrationRequest {
    /// Plan price per billing period in kobo
    pub plan_price_kobo: u64,
    /// Billing period in days (e.g. 30 for monthly)
    pub period_days: u32,
    /// Day of period when change occurs (1-indexed)
    pub change_day: u32,
    /// Old plan price in kobo (for upgrade/downgrade)
    pub old_plan_price_kobo: u64,
    /// New plan price in kobo
    pub new_plan_price_kobo: u64,
    /// Whether this is an upgrade (true) or downgrade (false)
    pub is_upgrade: bool,
}

/// Proration result
#[derive(Debug, Serialize, Deserialize)]
pub struct ProrationResult {
    /// Credit for unused days on old plan (kobo)
    pub credit_kobo: u64,
    /// Charge for remaining days on new plan (kobo)
    pub charge_kobo: u64,
    /// Net amount due immediately (charge - credit, can be negative for downgrade)
    pub net_kobo: i64,
    /// Days remaining in period
    pub days_remaining: u32,
    /// Days used in period
    pub days_used: u32,
    /// Explanation
    pub description: String,
}

/// Metered billing usage record
#[derive(Debug, Serialize, Deserialize)]
pub struct UsageRecord {
    /// Metric name (e.g. "api_calls", "transactions", "storage_gb")
    pub metric: String,
    /// Quantity used
    pub quantity: f64,
    /// Timestamp (Unix seconds)
    pub timestamp: i64,
}

/// Metered billing tier
#[derive(Debug, Serialize, Deserialize)]
pub struct BillingTier {
    /// Upper bound of this tier (None = unlimited)
    pub up_to: Option<f64>,
    /// Price per unit in kobo
    pub unit_price_kobo: u64,
    /// Flat fee for this tier in kobo (0 = none)
    pub flat_fee_kobo: u64,
}

/// Metered billing calculation request
#[derive(Debug, Serialize, Deserialize)]
pub struct MeteredBillingRequest {
    /// Usage records to aggregate
    pub usage_records: Vec<UsageRecord>,
    /// Billing tiers (sorted by up_to ascending)
    pub tiers: Vec<BillingTier>,
    /// Included units (free tier)
    pub included_units: f64,
}

/// Metered billing result
#[derive(Debug, Serialize, Deserialize)]
pub struct MeteredBillingResult {
    /// Total units consumed
    pub total_units: f64,
    /// Billable units (after included_units deduction)
    pub billable_units: f64,
    /// Total charge in kobo
    pub total_kobo: u64,
    /// Breakdown by tier
    pub tier_breakdown: Vec<TierCharge>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TierCharge {
    pub tier_label: String,
    pub units: f64,
    pub unit_price_kobo: u64,
    pub flat_fee_kobo: u64,
    pub subtotal_kobo: u64,
}

/// Calculate proration for a plan change mid-period.
pub fn calculate_proration(req: &ProrationRequest) -> ProrationResult {
    let days_used = req.change_day.saturating_sub(1).min(req.period_days);
    let days_remaining = req.period_days.saturating_sub(days_used);

    // Credit for unused days on old plan
    let daily_old = req.old_plan_price_kobo as f64 / req.period_days as f64;
    let credit_kobo = (daily_old * days_remaining as f64).round() as u64;

    // Charge for remaining days on new plan
    let daily_new = req.new_plan_price_kobo as f64 / req.period_days as f64;
    let charge_kobo = (daily_new * days_remaining as f64).round() as u64;

    let net_kobo = charge_kobo as i64 - credit_kobo as i64;

    let description = if req.is_upgrade {
        format!(
            "Upgrade proration: {} days remaining. Credit ₦{:.2} for old plan, charge ₦{:.2} for new plan.",
            days_remaining,
            credit_kobo as f64 / 100.0,
            charge_kobo as f64 / 100.0
        )
    } else {
        format!(
            "Downgrade proration: {} days remaining. Credit ₦{:.2} applied to next invoice.",
            days_remaining,
            credit_kobo as f64 / 100.0
        )
    };

    ProrationResult {
        credit_kobo,
        charge_kobo,
        net_kobo,
        days_remaining,
        days_used,
        description,
    }
}

/// Aggregate metered billing usage and calculate charges using tiered pricing.
pub fn calculate_metered_billing(req: &MeteredBillingRequest) -> MeteredBillingResult {
    // Aggregate total usage
    let total_units: f64 = req.usage_records.iter().map(|r| r.quantity).sum();
    let billable_units = (total_units - req.included_units).max(0.0);

    let mut remaining = billable_units;
    let mut total_kobo = 0u64;
    let mut tier_breakdown = Vec::new();
    let mut prev_up_to = 0.0f64;

    for (i, tier) in req.tiers.iter().enumerate() {
        if remaining <= 0.0 {
            break;
        }

        let tier_capacity = match tier.up_to {
            Some(up_to) => (up_to - prev_up_to).max(0.0),
            None => remaining,
        };

        let units_in_tier = remaining.min(tier_capacity);
        if units_in_tier <= 0.0 {
            prev_up_to = tier.up_to.unwrap_or(prev_up_to);
            continue;
        }

        let usage_charge = (units_in_tier * tier.unit_price_kobo as f64).round() as u64;
        let subtotal = usage_charge + tier.flat_fee_kobo;
        total_kobo += subtotal;

        tier_breakdown.push(TierCharge {
            tier_label: format!("Tier {}", i + 1),
            units: units_in_tier,
            unit_price_kobo: tier.unit_price_kobo,
            flat_fee_kobo: tier.flat_fee_kobo,
            subtotal_kobo: subtotal,
        });

        remaining -= units_in_tier;
        prev_up_to = tier.up_to.unwrap_or(prev_up_to);
    }

    MeteredBillingResult {
        total_units,
        billable_units,
        total_kobo,
        tier_breakdown,
    }
}

// ─── C FFI exports ────────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn billing_proration_calculate(request_json: *const c_char) -> *mut c_char {
    let json_str = unsafe {
        if request_json.is_null() {
            return billing_error_json("null input");
        }
        match CStr::from_ptr(request_json).to_str() {
            Ok(s) => s,
            Err(_) => return billing_error_json("invalid UTF-8"),
        }
    };

    let req: ProrationRequest = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => return billing_error_json(&format!("parse error: {}", e)),
    };

    let result = calculate_proration(&req);
    let json = match serde_json::to_string(&result) {
        Ok(s) => s,
        Err(e) => return billing_error_json(&format!("serialize error: {}", e)),
    };

    CString::new(json).unwrap_or_else(|_| CString::new("{}").unwrap()).into_raw()
}

#[no_mangle]
pub extern "C" fn billing_metered_calculate(request_json: *const c_char) -> *mut c_char {
    let json_str = unsafe {
        if request_json.is_null() {
            return billing_error_json("null input");
        }
        match CStr::from_ptr(request_json).to_str() {
            Ok(s) => s,
            Err(_) => return billing_error_json("invalid UTF-8"),
        }
    };

    let req: MeteredBillingRequest = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => return billing_error_json(&format!("parse error: {}", e)),
    };

    let result = calculate_metered_billing(&req);
    let json = match serde_json::to_string(&result) {
        Ok(s) => s,
        Err(e) => return billing_error_json(&format!("serialize error: {}", e)),
    };

    CString::new(json).unwrap_or_else(|_| CString::new("{}").unwrap()).into_raw()
}

#[no_mangle]
pub extern "C" fn billing_engine_free(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe { drop(CString::from_raw(ptr)); }
    }
}

fn billing_error_json(msg: &str) -> *mut c_char {
    let json = format!("{{\"error\":\"{}\"}}", msg.replace('"', "'"));
    CString::new(json).unwrap_or_else(|_| CString::new("{\"error\":\"unknown\"}").unwrap()).into_raw()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_upgrade_proration() {
        let req = ProrationRequest {
            plan_price_kobo: 10_000_00, // ₦10,000/month
            period_days: 30,
            change_day: 16, // halfway through
            old_plan_price_kobo: 10_000_00,
            new_plan_price_kobo: 20_000_00,
            is_upgrade: true,
        };
        let result = calculate_proration(&req);
        assert_eq!(result.days_remaining, 15);
        assert_eq!(result.days_used, 15);
        assert!(result.net_kobo > 0, "Upgrade should result in positive net charge");
    }

    #[test]
    fn test_downgrade_proration() {
        let req = ProrationRequest {
            plan_price_kobo: 20_000_00,
            period_days: 30,
            change_day: 11,
            old_plan_price_kobo: 20_000_00,
            new_plan_price_kobo: 10_000_00,
            is_upgrade: false,
        };
        let result = calculate_proration(&req);
        assert!(result.net_kobo < 0, "Downgrade should result in credit (negative net)");
    }

    #[test]
    fn test_metered_billing_tiered() {
        let req = MeteredBillingRequest {
            usage_records: vec![
                UsageRecord { metric: "api_calls".to_string(), quantity: 1500.0, timestamp: 0 },
                UsageRecord { metric: "api_calls".to_string(), quantity: 500.0, timestamp: 1 },
            ],
            tiers: vec![
                BillingTier { up_to: Some(1000.0), unit_price_kobo: 0, flat_fee_kobo: 0 }, // free
                BillingTier { up_to: Some(5000.0), unit_price_kobo: 10, flat_fee_kobo: 0 }, // ₦0.10/call
                BillingTier { up_to: None, unit_price_kobo: 5, flat_fee_kobo: 0 }, // ₦0.05/call
            ],
            included_units: 1000.0, // first 1000 free
        };
        let result = calculate_metered_billing(&req);
        assert_eq!(result.total_units, 2000.0);
        assert_eq!(result.billable_units, 1000.0);
        assert!(result.total_kobo > 0);
    }

    #[test]
    fn test_metered_billing_within_free_tier() {
        let req = MeteredBillingRequest {
            usage_records: vec![
                UsageRecord { metric: "txns".to_string(), quantity: 50.0, timestamp: 0 },
            ],
            tiers: vec![
                BillingTier { up_to: Some(100.0), unit_price_kobo: 0, flat_fee_kobo: 0 },
                BillingTier { up_to: None, unit_price_kobo: 100, flat_fee_kobo: 0 },
            ],
            included_units: 100.0,
        };
        let result = calculate_metered_billing(&req);
        assert_eq!(result.total_kobo, 0, "Usage within free tier should cost nothing");
    }
}
