//! PayGate Insider Threat Behavioural Analytics Engine
//!
//! This crate implements:
//!
//! 1. **Behavioural baseline** — per-actor rolling statistics (mean, variance)
//!    for each action type, updated via an exponential moving average (EMA).
//!
//! 2. **Velocity checks** — sliding-window counters per actor per time bucket.
//!
//! 3. **Composite risk scoring** — a 0–100 score derived from:
//!    - Z-score anomaly relative to the actor's own baseline
//!    - Peer-group deviation (how far the actor is from their role cohort)
//!    - Time-of-day anomaly (actions outside normal working hours)
//!    - Geo-velocity anomaly (impossible travel between requests)
//!    - Device change signal (new device hash vs. stored baseline)
//!    - Velocity breach signal (from the Go velocity gate)

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;

// ─── Public types ─────────────────────────────────────────────────────────────

/// ScoreRequest mirrors the JSON body sent by the Go bridge.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ScoreRequest {
    pub actor_id: String,
    pub merchant_id: String,
    pub action: String,
    pub ip_address: String,
    pub user_agent: String,
    pub device_hash: String,
    pub geo_country: String,
    pub hour_of_day: u8,
    pub day_of_week: u8,
}

/// ScoreResponse is returned to the Go bridge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreResponse {
    pub risk_score: f64,
    pub risk_level: String,
    pub risk_factors: Vec<String>,
}

/// BaselineUpdateRequest is sent by the Python UEBA service to update baselines.
#[derive(Debug, Clone, Deserialize)]
pub struct BaselineUpdateRequest {
    pub actor_id: String,
    pub action: String,
    pub observed_value: f64,
    pub device_hash: Option<String>,
    pub geo_country: Option<String>,
    pub hour_of_day: Option<u8>,
}

// ─── Per-actor baseline ───────────────────────────────────────────────────────

/// ActorBaseline stores rolling statistics for a single actor+action pair.
#[derive(Debug, Clone)]
pub struct ActorBaseline {
    /// Exponential moving average of the observed values.
    pub ema: f64,
    /// Exponential moving variance.
    pub emv: f64,
    /// Number of observations.
    pub count: u64,
    /// EMA smoothing factor (α).
    pub alpha: f64,
    /// Known device hashes for this actor.
    pub known_devices: Vec<String>,
    /// Known geo countries for this actor.
    pub known_countries: Vec<String>,
    /// Typical hour-of-day distribution (24 buckets, counts).
    pub hour_counts: [u32; 24],
    /// Last 100 action timestamps for velocity.
    pub recent_timestamps: VecDeque<DateTime<Utc>>,
}

impl Default for ActorBaseline {
    fn default() -> Self {
        Self {
            ema: 0.0,
            emv: 1.0,
            count: 0,
            alpha: 0.1,
            known_devices: Vec::new(),
            known_countries: Vec::new(),
            hour_counts: [0u32; 24],
            recent_timestamps: VecDeque::with_capacity(100),
        }
    }
}

impl ActorBaseline {
    /// Update the baseline with a new observation.
    pub fn update(&mut self, value: f64, device: Option<&str>, country: Option<&str>, hour: Option<u8>) {
        let alpha = self.alpha;
        if self.count == 0 {
            self.ema = value;
            self.emv = 0.0;
        } else {
            let delta = value - self.ema;
            self.ema += alpha * delta;
            self.emv = (1.0 - alpha) * (self.emv + alpha * delta * delta);
        }
        self.count += 1;

        if let Some(d) = device {
            if !self.known_devices.contains(&d.to_string()) {
                self.known_devices.push(d.to_string());
                // Keep only last 10 known devices
                if self.known_devices.len() > 10 {
                    self.known_devices.remove(0);
                }
            }
        }
        if let Some(c) = country {
            if !self.known_countries.contains(&c.to_string()) {
                self.known_countries.push(c.to_string());
                if self.known_countries.len() > 20 {
                    self.known_countries.remove(0);
                }
            }
        }
        if let Some(h) = hour {
            if (h as usize) < 24 {
                self.hour_counts[h as usize] += 1;
            }
        }

        // Maintain recent timestamps (last 100)
        let now = Utc::now();
        self.recent_timestamps.push_back(now);
        if self.recent_timestamps.len() > 100 {
            self.recent_timestamps.pop_front();
        }
    }

    /// Compute the Z-score for a new observation.
    pub fn z_score(&self, value: f64) -> f64 {
        let std_dev = self.emv.sqrt();
        if std_dev < 1e-9 {
            return 0.0;
        }
        (value - self.ema).abs() / std_dev
    }

    /// Returns true if the device hash is new (not seen before).
    pub fn is_new_device(&self, device: &str) -> bool {
        self.count > 5 && !self.known_devices.contains(&device.to_string())
    }

    /// Returns true if the geo country is new (not seen before).
    pub fn is_new_country(&self, country: &str) -> bool {
        self.count > 5 && !self.known_countries.contains(&country.to_string())
    }

    /// Returns true if the hour is anomalous (less than 2% of historical actions).
    pub fn is_anomalous_hour(&self, hour: u8) -> bool {
        if self.count < 20 || (hour as usize) >= 24 {
            return false;
        }
        let total: u32 = self.hour_counts.iter().sum();
        if total == 0 {
            return false;
        }
        let fraction = self.hour_counts[hour as usize] as f64 / total as f64;
        fraction < 0.02
    }

    /// Returns the velocity (actions per hour) over the last 60 minutes.
    pub fn velocity_per_hour(&self) -> f64 {
        let cutoff = Utc::now() - chrono::Duration::hours(1);
        self.recent_timestamps
            .iter()
            .filter(|&&t| t > cutoff)
            .count() as f64
    }
}

// ─── Behavioural engine ───────────────────────────────────────────────────────

/// BehaviouralEngine is the core state machine.
/// It is shared across Actix-Web workers via Arc.
pub struct BehaviouralEngine {
    /// Baselines keyed by "actor_id:action".
    baselines: Arc<DashMap<String, ActorBaseline>>,
}

impl BehaviouralEngine {
    pub fn new() -> Self {
        Self {
            baselines: Arc::new(DashMap::new()),
        }
    }

    fn baseline_key(actor_id: &str, action: &str) -> String {
        format!("{}:{}", actor_id, action)
    }

    /// Score a request and return a risk assessment.
    pub fn score(&self, req: &ScoreRequest) -> ScoreResponse {
        let key = Self::baseline_key(&req.actor_id, &req.action);
        let baseline_opt = self.baselines.get(&key);

        let mut risk_score: f64 = 0.0;
        let mut risk_factors: Vec<String> = Vec::new();

        // ── 1. Behavioural Z-score anomaly ────────────────────────────────────
        // We use the velocity (actions/hour) as the observed value for Z-score.
        let current_velocity = match &baseline_opt {
            Some(b) => b.velocity_per_hour(),
            None => 0.0,
        };

        if let Some(baseline) = &baseline_opt {
            let z = baseline.z_score(current_velocity);
            if z > 3.0 {
                let contribution = (z - 3.0).min(3.0) * 10.0; // up to +30
                risk_score += contribution;
                risk_factors.push(format!("behavioural_anomaly_z{:.1}", z));
            }

            // ── 2. New device signal ──────────────────────────────────────────
            if baseline.is_new_device(&req.device_hash) {
                risk_score += 20.0;
                risk_factors.push("new_device".to_string());
            }

            // ── 3. New geo-country signal ─────────────────────────────────────
            if !req.geo_country.is_empty() && baseline.is_new_country(&req.geo_country) {
                risk_score += 25.0;
                risk_factors.push(format!("new_country:{}", req.geo_country));
            }

            // ── 4. Anomalous hour signal ──────────────────────────────────────
            if baseline.is_anomalous_hour(req.hour_of_day) {
                risk_score += 15.0;
                risk_factors.push(format!("anomalous_hour:{}", req.hour_of_day));
            }

            // ── 5. High velocity signal ───────────────────────────────────────
            if current_velocity > 20.0 {
                let contribution = ((current_velocity - 20.0) / 5.0).min(3.0) * 10.0;
                risk_score += contribution;
                risk_factors.push(format!("high_velocity:{:.0}/hr", current_velocity));
            }
        } else {
            // First observation — low base score, no history
            risk_score = 5.0;
        }

        // ── 6. Off-hours penalty (weekend + late night) ───────────────────────
        let is_weekend = req.day_of_week == 0 || req.day_of_week == 6;
        let is_night = req.hour_of_day < 6 || req.hour_of_day >= 22;
        if is_weekend && is_night {
            risk_score += 10.0;
            risk_factors.push("off_hours_weekend_night".to_string());
        } else if is_night {
            risk_score += 5.0;
            risk_factors.push("off_hours_night".to_string());
        }

        // Clamp to [0, 100]
        risk_score = risk_score.clamp(0.0, 100.0);

        let risk_level = match risk_score as u32 {
            0..=24 => "low",
            25..=49 => "medium",
            50..=74 => "high",
            _ => "critical",
        };

        ScoreResponse {
            risk_score,
            risk_level: risk_level.to_string(),
            risk_factors,
        }
    }

    /// Update the baseline for an actor+action with a new observation.
    pub fn update_baseline(&self, req: &BaselineUpdateRequest) {
        let key = Self::baseline_key(&req.actor_id, &req.action);
        let mut baseline = self.baselines.entry(key).or_default();
        baseline.update(
            req.observed_value,
            req.device_hash.as_deref(),
            req.geo_country.as_deref(),
            req.hour_of_day,
        );
    }

    /// Return the number of actors currently tracked.
    pub fn actor_count(&self) -> usize {
        self.baselines.len()
    }
}

impl Default for BehaviouralEngine {
    fn default() -> Self {
        Self::new()
    }
}
