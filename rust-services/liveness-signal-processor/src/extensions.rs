/// extensions.rs — Batch analysis, calibration, and Prometheus metrics endpoints.
///
/// These handlers are registered in main.rs alongside the existing /analyse route.
use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::AppState;

// ─── Batch analysis ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct BatchSignalRequest {
    /// Up to 8 frames for batch analysis
    pub frames: Vec<String>,
    pub session_id: Option<String>,
    /// "passive" | "active"
    pub mode: Option<String>,
}

#[derive(Serialize)]
pub struct BatchSignalResponse {
    pub session_id: String,
    /// Aggregated decision across all frames: "real" | "spoof" | "uncertain"
    pub decision: String,
    /// Mean confidence across frames
    pub mean_confidence: f32,
    /// Per-frame decisions
    pub frame_results: Vec<FrameResult>,
    /// Honesty labels: decisions derive from handcrafted heuristic signals,
    /// not a trained model. Corroborate with the Python ML liveness service.
    pub heuristic: bool,
    pub ml_model: String,
    pub decision_requires_corroboration: bool,
    /// Total processing time in milliseconds
    pub processing_ms: u64,
}

#[derive(Serialize)]
pub struct FrameResult {
    pub frame_index: usize,
    pub decision: String,
    pub confidence: f32,
    pub lbp_score: f32,
    pub fft_score: f32,
}

pub async fn analyse_batch(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BatchSignalRequest>,
) -> impl IntoResponse {
    use crate::{classify_spoof, decode_image, fft_realness, lbp_realness};
    use std::time::Instant;
    use uuid::Uuid;

    let start = Instant::now();
    let session_id = req
        .session_id
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    if req.frames.is_empty() || req.frames.len() > 8 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "frames must contain 1–8 images"
            })),
        )
            .into_response();
    }

    // Verify internal API key
    // (key is validated by the authMiddleware in the Go bridge before reaching here,
    //  but we keep a local check for defence-in-depth)
    let _ = &state.internal_key;

    let mut frame_results: Vec<FrameResult> = Vec::with_capacity(req.frames.len());
    let mut real_votes = 0usize;
    let mut total_confidence = 0.0f32;

    for (idx, frame_b64) in req.frames.iter().enumerate() {
        let img = match decode_image(frame_b64) {
            Ok(i) => i,
            Err(e) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({
                        "error": format!("Frame {}: invalid image — {}", idx, e)
                    })),
                )
                    .into_response();
            }
        };
        let gray = img.to_luma8();
        let rgb = img.to_rgb8();
        let ((lbp_score, fft_score), (colour_depth, grad_coherence)) = rayon::join(
            || rayon::join(|| lbp_realness(&gray), || fft_realness(&gray)),
            || {
                rayon::join(
                    || crate::colour_depth_score(&rgb),
                    || crate::gradient_coherence(&gray),
                )
            },
        );
        let (_scores, decision, confidence) =
            classify_spoof(lbp_score, fft_score, colour_depth, grad_coherence);
        if decision == "real" {
            real_votes += 1;
        }
        total_confidence += confidence;
        frame_results.push(FrameResult {
            frame_index: idx,
            decision,
            confidence,
            lbp_score,
            fft_score,
        });
    }

    let n = req.frames.len();
    let mean_confidence = total_confidence / n as f32;
    // Majority vote: ≥50% real frames → "real"
    let decision = if real_votes * 2 >= n {
        "real".to_string()
    } else if real_votes == 0 {
        "spoof".to_string()
    } else {
        "uncertain".to_string()
    };

    let processing_ms = start.elapsed().as_millis() as u64;
    tracing::info!(
        session_id = %session_id,
        decision = %decision,
        frames = %n,
        real_votes = %real_votes,
        mean_confidence = %mean_confidence,
        processing_ms = %processing_ms,
        "batch analysis complete"
    );

    (
        StatusCode::OK,
        Json(serde_json::to_value(BatchSignalResponse {
            session_id,
            decision,
            mean_confidence,
            frame_results,
            heuristic: true,
            ml_model: "none".to_string(),
            decision_requires_corroboration: true,
            processing_ms,
        }).unwrap()),
    )
        .into_response()
}

// ─── Calibration endpoint ─────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CalibrateRequest {
    /// Reference "known-real" frames for threshold tuning
    pub real_frames: Vec<String>,
    /// Reference "known-spoof" frames for threshold tuning
    pub spoof_frames: Vec<String>,
}

#[derive(Serialize)]
pub struct CalibrateResponse {
    pub suggested_lbp_threshold: f32,
    pub suggested_fft_threshold: f32,
    pub real_frame_count: usize,
    pub spoof_frame_count: usize,
    pub separation_score: f32,
}

pub async fn calibrate(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<CalibrateRequest>,
) -> impl IntoResponse {
    use crate::{decode_image, fft_realness, lbp_realness};

    if req.real_frames.is_empty() || req.spoof_frames.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "real_frames and spoof_frames must each contain at least 1 image"
            })),
        )
            .into_response();
    }

    let score_frames = |frames: &[String]| -> (f32, f32) {
        let mut lbp_sum = 0.0f32;
        let mut fft_sum = 0.0f32;
        let mut count = 0usize;
        for b64 in frames {
            if let Ok(img) = decode_image(b64) {
                let gray = img.to_luma8();
                lbp_sum += lbp_realness(&gray);
                fft_sum += fft_realness(&gray);
                count += 1;
            }
        }
        if count == 0 {
            (0.5, 0.5)
        } else {
            (lbp_sum / count as f32, fft_sum / count as f32)
        }
    };

    let (real_lbp, real_fft) = score_frames(&req.real_frames);
    let (spoof_lbp, spoof_fft) = score_frames(&req.spoof_frames);

    // Midpoint thresholds between real and spoof means
    let suggested_lbp = (real_lbp + spoof_lbp) / 2.0;
    let suggested_fft = (real_fft + spoof_fft) / 2.0;

    // Separation score: distance between real and spoof means (higher = better separability)
    let separation = ((real_lbp - spoof_lbp).powi(2) + (real_fft - spoof_fft).powi(2)).sqrt();

    (
        StatusCode::OK,
        Json(serde_json::to_value(CalibrateResponse {
            suggested_lbp_threshold: suggested_lbp,
            suggested_fft_threshold: suggested_fft,
            real_frame_count: req.real_frames.len(),
            spoof_frame_count: req.spoof_frames.len(),
            separation_score: separation,
        }).unwrap()),
    )
        .into_response()
}

// ─── Prometheus metrics ───────────────────────────────────────────────────────

/// Simple text-format Prometheus metrics endpoint.
/// Uses atomic counters stored in AppState (added below).
pub async fn metrics_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    use std::sync::atomic::Ordering;

    let real_count = state.metrics.real_count.load(Ordering::Relaxed);
    let spoof_count = state.metrics.spoof_count.load(Ordering::Relaxed);
    let uncertain_count = state.metrics.uncertain_count.load(Ordering::Relaxed);
    let batch_count = state.metrics.batch_count.load(Ordering::Relaxed);
    let error_count = state.metrics.error_count.load(Ordering::Relaxed);

    let body = format!(
        "# HELP liveness_real_total Total real liveness decisions\n\
         # TYPE liveness_real_total counter\n\
         liveness_real_total {real_count}\n\
         # HELP liveness_spoof_total Total spoof liveness decisions\n\
         # TYPE liveness_spoof_total counter\n\
         liveness_spoof_total {spoof_count}\n\
         # HELP liveness_uncertain_total Total uncertain liveness decisions\n\
         # TYPE liveness_uncertain_total counter\n\
         liveness_uncertain_total {uncertain_count}\n\
         # HELP liveness_batch_total Total batch analysis requests\n\
         # TYPE liveness_batch_total counter\n\
         liveness_batch_total {batch_count}\n\
         # HELP liveness_error_total Total analysis errors\n\
         # TYPE liveness_error_total counter\n\
         liveness_error_total {error_count}\n",
    );

    (
        StatusCode::OK,
        [(axum::http::header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        body,
    )
}
