/// PayGate Liveness Signal Processor (Rust)
///
/// Responsibilities:
///   - Fourier-domain frequency analysis (detect screen flicker / replay artefacts)
///   - Local Binary Pattern (LBP) texture analysis (detect printed photos / paper masks)
///   - Colour-depth scoring (detect 2-D flat surfaces)
///   - Gradient coherence (detect deepfake blending boundaries)
///   - 6-type spoof classification with per-class confidence scores
///   - Expose REST API consumed by the Go liveness-gateway
///
/// Language rationale: Rust gives zero-copy pixel access, SIMD-accelerated FFT via
/// rustfft, and Rayon data-parallelism — all without a GIL or GC pause.

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::post,
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use image::{DynamicImage, GrayImage, ImageBuffer, Luma, Rgb, RgbImage};
use rayon::prelude::*;
use rustfft::{num_complex::Complex, FftPlanner};
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Instant};
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info};
use uuid::Uuid;

// ─── Config ──────────────────────────────────────────────────────────────────

#[derive(Clone)]
struct AppState {
    internal_key: String,
    node_callback_url: String,
    http_client: reqwest::Client,
}

// ─── Request / Response types ────────────────────────────────────────────────

#[derive(Deserialize)]
struct SignalRequest {
    /// Base64-encoded JPEG/PNG image
    image_b64: String,
    /// Optional second frame for temporal analysis (active liveness)
    image_b64_2: Option<String>,
    session_id: Option<String>,
    /// "passive" | "active" | "face_match" | "detect"
    mode: Option<String>,
}

#[derive(Serialize, Clone)]
struct SpoofScores {
    printed_photo: f32,
    screen_replay: f32,
    paper_mask: f32,
    #[serde(rename = "3d_mask")]
    mask_3d: f32,
    deepfake: f32,
    high_quality_photo: f32,
}

#[derive(Serialize)]
struct SignalResponse {
    session_id: String,
    /// "real" | "spoof" | "uncertain"
    decision: String,
    /// Dominant spoof type if decision == "spoof"
    spoof_type: Option<String>,
    /// 0.0–1.0 overall anti-spoof confidence
    confidence: f32,
    spoof_scores: SpoofScores,
    /// Individual signal scores
    lbp_score: f32,
    fft_score: f32,
    colour_depth_score: f32,
    gradient_coherence: f32,
    /// Processing time in milliseconds
    processing_ms: u64,
}

// ─── Signal Analysis ─────────────────────────────────────────────────────────

/// Decode base64 image → DynamicImage
fn decode_image(b64: &str) -> anyhow::Result<DynamicImage> {
    let bytes = B64.decode(b64.trim())?;
    let img = image::load_from_memory(&bytes)?;
    Ok(img)
}

/// Local Binary Pattern histogram — detects flat printed textures.
/// Returns a "realness" score: high = natural skin texture, low = flat surface.
fn lbp_realness(gray: &GrayImage) -> f32 {
    let (w, h) = gray.dimensions();
    if w < 3 || h < 3 {
        return 0.5;
    }

    let mut hist = [0u32; 256];
    let total = ((w - 2) * (h - 2)) as f32;

    // Compute LBP for each interior pixel
    for y in 1..(h - 1) {
        for x in 1..(w - 1) {
            let center = gray.get_pixel(x, y)[0] as i16;
            let neighbours: [i16; 8] = [
                gray.get_pixel(x - 1, y - 1)[0] as i16,
                gray.get_pixel(x,     y - 1)[0] as i16,
                gray.get_pixel(x + 1, y - 1)[0] as i16,
                gray.get_pixel(x + 1, y    )[0] as i16,
                gray.get_pixel(x + 1, y + 1)[0] as i16,
                gray.get_pixel(x,     y + 1)[0] as i16,
                gray.get_pixel(x - 1, y + 1)[0] as i16,
                gray.get_pixel(x - 1, y    )[0] as i16,
            ];
            let mut code: u8 = 0;
            for (i, &n) in neighbours.iter().enumerate() {
                if n >= center {
                    code |= 1 << i;
                }
            }
            hist[code as usize] += 1;
        }
    }

    // Uniform LBP patterns (≤2 bit transitions) are dominant in real skin.
    // Count fraction of uniform patterns as realness proxy.
    let uniform_count: u32 = (0u8..=255).filter(|&code| {
        let transitions = (0..8).filter(|&i| {
            let a = (code >> i) & 1;
            let b = (code >> ((i + 1) % 8)) & 1;
            a != b
        }).count();
        transitions <= 2
    }).map(|code| hist[code as usize]).sum();

    (uniform_count as f32 / total).min(1.0)
}

/// FFT-based frequency analysis — detects screen refresh artefacts (moire, banding).
/// Returns a "realness" score: high = natural frequency distribution, low = periodic artefacts.
fn fft_realness(gray: &GrayImage) -> f32 {
    let (w, h) = gray.dimensions();
    let n = (w as usize).min(256); // Analyse centre strip up to 256px wide

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(n);

    // Sample `n` rows and average the FFT magnitude spectra
    let step = (h as usize / 16).max(1);
    let mut avg_spectrum = vec![0f32; n / 2];
    let mut row_count = 0usize;

    for row_y in (0..h as usize).step_by(step) {
        let mut buffer: Vec<Complex<f32>> = (0..n)
            .map(|x| {
                let px = gray.get_pixel(x.min(w as usize - 1) as u32, row_y as u32)[0] as f32;
                Complex::new(px / 255.0, 0.0)
            })
            .collect();
        fft.process(&mut buffer);
        for (i, c) in buffer[..n / 2].iter().enumerate() {
            avg_spectrum[i] += c.norm();
        }
        row_count += 1;
    }
    if row_count == 0 {
        return 0.5;
    }
    for v in &mut avg_spectrum {
        *v /= row_count as f32;
    }

    // Natural images have 1/f spectrum (energy falls off with frequency).
    // Screen replays introduce periodic spikes at refresh harmonics.
    // Measure: ratio of DC+low-freq energy to total energy.
    let total: f32 = avg_spectrum.iter().sum();
    if total < 1e-6 {
        return 0.5;
    }
    let low_freq_cutoff = (n / 16).max(2);
    let low_energy: f32 = avg_spectrum[1..low_freq_cutoff].iter().sum(); // skip DC
    let ratio = low_energy / total;

    // Real faces: ratio ~0.6–0.85. Screen replay: ratio drops due to harmonic spikes.
    // Map to [0,1] realness: 0.7 maps to 1.0, 0.3 maps to 0.0
    ((ratio - 0.3) / 0.4).clamp(0.0, 1.0)
}

/// Colour-depth score — real faces have smooth HSV gradients across skin regions.
/// Flat printed photos and screens have abrupt colour transitions at edges.
fn colour_depth_score(rgb: &RgbImage) -> f32 {
    let (w, h) = rgb.dimensions();
    if w < 4 || h < 4 {
        return 0.5;
    }

    // Sample a grid of pixels and compute local colour variance
    let step_x = (w / 16).max(1);
    let step_y = (h / 16).max(1);
    let mut variances: Vec<f32> = Vec::new();

    for y in (step_y..(h - step_y)).step_by(step_y as usize) {
        for x in (step_x..(w - step_x)).step_by(step_x as usize) {
            let pixels: Vec<[u8; 3]> = [
                (x, y), (x + step_x, y), (x, y + step_y), (x + step_x, y + step_y),
            ]
            .iter()
            .map(|&(px, py)| {
                let p = rgb.get_pixel(px, py);
                [p[0], p[1], p[2]]
            })
            .collect();

            // Compute variance of each channel across the 2×2 block
            for ch in 0..3 {
                let vals: Vec<f32> = pixels.iter().map(|p| p[ch] as f32).collect();
                let mean = vals.iter().sum::<f32>() / vals.len() as f32;
                let var = vals.iter().map(|v| (v - mean).powi(2)).sum::<f32>() / vals.len() as f32;
                variances.push(var);
            }
        }
    }

    if variances.is_empty() {
        return 0.5;
    }

    // Real skin: moderate variance (20–80). Flat surface: very low (<5). Screen: very high (>100).
    let mean_var = variances.iter().sum::<f32>() / variances.len() as f32;
    // Map mean_var to realness: peak at 40, falls off on both sides
    let normalised = ((mean_var - 5.0) / 75.0).clamp(0.0, 1.0);
    // Penalise extremely high variance (screen noise) and extremely low (flat photo)
    if mean_var > 120.0 {
        (1.0 - (mean_var - 120.0) / 200.0).clamp(0.0, 1.0)
    } else {
        normalised
    }
}

/// Gradient coherence — measures smoothness of edge transitions.
/// Deepfakes often have incoherent blending boundaries around the face swap region.
fn gradient_coherence(gray: &GrayImage) -> f32 {
    let (w, h) = gray.dimensions();
    if w < 3 || h < 3 {
        return 0.5;
    }

    let mut coherence_sum = 0f32;
    let mut count = 0u32;

    // Sobel gradient at each interior pixel
    for y in 1..(h - 1) {
        for x in 1..(w - 1) {
            let gx = gray.get_pixel(x + 1, y)[0] as f32 - gray.get_pixel(x - 1, y)[0] as f32;
            let gy = gray.get_pixel(x, y + 1)[0] as f32 - gray.get_pixel(x, y - 1)[0] as f32;
            let mag = (gx * gx + gy * gy).sqrt();

            // Compare with neighbours — coherent gradients have similar magnitude
            let right_gx = gray.get_pixel((x + 1).min(w - 2), y)[0] as f32
                - gray.get_pixel((x - 1).max(1), y)[0] as f32;
            let right_gy = gray.get_pixel(x + 1, (y + 1).min(h - 2))[0] as f32
                - gray.get_pixel(x + 1, (y - 1).max(1))[0] as f32;
            let right_mag = (right_gx * right_gx + right_gy * right_gy).sqrt();

            if mag > 5.0 && right_mag > 5.0 {
                // Coherence = normalised dot product of gradient vectors
                let dot = (gx * right_gx + gy * right_gy) / (mag * right_mag);
                coherence_sum += dot.abs();
                count += 1;
            }
        }
    }

    if count == 0 {
        return 0.7; // No strong edges — assume real
    }
    (coherence_sum / count as f32).clamp(0.0, 1.0)
}

/// Classify spoof type and compute per-class confidence scores.
fn classify_spoof(
    lbp: f32,
    fft: f32,
    colour: f32,
    gradient: f32,
) -> (SpoofScores, String, f32) {
    // Heuristic decision tree based on signal combination:
    //
    //  printed_photo:      low LBP (flat texture), moderate colour, high FFT (no screen artefacts)
    //  screen_replay:      low FFT (periodic artefacts), moderate LBP
    //  paper_mask:         very low LBP, very low colour depth
    //  3d_mask:            moderate LBP (texture), low colour depth, high gradient coherence
    //  deepfake:           low gradient coherence (blending boundary), high LBP, high colour
    //  high_quality_photo: high LBP (fine texture), high colour, high FFT, low gradient coherence

    let printed_photo   = ((1.0 - lbp) * 0.5 + (1.0 - colour) * 0.3 + fft * 0.2).clamp(0.0, 1.0);
    let screen_replay   = ((1.0 - fft) * 0.6 + (1.0 - lbp) * 0.2 + colour * 0.2).clamp(0.0, 1.0);
    let paper_mask      = ((1.0 - lbp) * 0.4 + (1.0 - colour) * 0.4 + (1.0 - fft) * 0.2).clamp(0.0, 1.0);
    let mask_3d         = (lbp * 0.3 + (1.0 - colour) * 0.4 + gradient * 0.3).clamp(0.0, 1.0);
    let deepfake        = ((1.0 - gradient) * 0.5 + lbp * 0.3 + colour * 0.2).clamp(0.0, 1.0);
    let high_quality    = (lbp * 0.3 + colour * 0.3 + fft * 0.2 + (1.0 - gradient) * 0.2).clamp(0.0, 1.0);

    let scores = SpoofScores {
        printed_photo,
        screen_replay,
        paper_mask,
        mask_3d,
        deepfake,
        high_quality_photo: high_quality,
    };

    // Overall realness = weighted average of signal scores
    let realness = lbp * 0.30 + fft * 0.25 + colour * 0.25 + gradient * 0.20;

    // Dominant spoof type
    let candidates = [
        ("printed_photo",   printed_photo),
        ("screen_replay",   screen_replay),
        ("paper_mask",      paper_mask),
        ("3d_mask",         mask_3d),
        ("deepfake",        deepfake),
        ("high_quality_photo", high_quality),
    ];
    let (dominant_type, dominant_conf) = candidates
        .iter()
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
        .copied()
        .unwrap_or(("unknown", 0.0));

    let decision = if realness >= 0.65 {
        "real".to_string()
    } else if realness >= 0.45 {
        "uncertain".to_string()
    } else {
        "spoof".to_string()
    };

    let confidence = if decision == "real" { realness } else { dominant_conf };

    (scores, decision, confidence)
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async fn analyse_signal(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SignalRequest>,
) -> impl IntoResponse {
    let start = Instant::now();
    let session_id = req.session_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    // Decode image
    let img = match decode_image(&req.image_b64) {
        Ok(i) => i,
        Err(e) => {
            error!("Image decode error: {}", e);
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": format!("Invalid image: {}", e) })),
            )
                .into_response();
        }
    };

    // Run all 4 signal analyses in parallel via Rayon
    let gray: GrayImage = img.to_luma8();
    let rgb: RgbImage = img.to_rgb8();

    let (lbp, fft, colour, gradient) = rayon::join(
        || rayon::join(|| lbp_realness(&gray), || fft_realness(&gray)),
        || rayon::join(|| colour_depth_score(&rgb), || gradient_coherence(&gray)),
    );
    let (lbp_score, fft_score) = lbp;
    let (colour_depth, grad_coherence) = gradient;

    // Classify
    let (spoof_scores, decision, confidence) =
        classify_spoof(lbp_score, fft_score, colour_depth, grad_coherence);

    let spoof_type = if decision != "real" {
        Some(match (
            spoof_scores.printed_photo,
            spoof_scores.screen_replay,
            spoof_scores.paper_mask,
            spoof_scores.mask_3d,
            spoof_scores.deepfake,
            spoof_scores.high_quality_photo,
        ) {
            (p, s, pm, m, d, h)
                if p >= s && p >= pm && p >= m && p >= d && p >= h =>
                "printed_photo".to_string(),
            (_, s, pm, m, d, h) if s >= pm && s >= m && s >= d && s >= h => "screen_replay".to_string(),
            (_, _, pm, m, d, h) if pm >= m && pm >= d && pm >= h => "paper_mask".to_string(),
            (_, _, _, m, d, h) if m >= d && m >= h => "3d_mask".to_string(),
            (_, _, _, _, d, h) if d >= h => "deepfake".to_string(),
            _ => "high_quality_photo".to_string(),
        })
    } else {
        None
    };

    let processing_ms = start.elapsed().as_millis() as u64;

    info!(
        session_id = %session_id,
        decision = %decision,
        confidence = %confidence,
        lbp = %lbp_score,
        fft = %fft_score,
        colour = %colour_depth,
        gradient = %grad_coherence,
        processing_ms = %processing_ms,
        "signal analysis complete"
    );

    let response = SignalResponse {
        session_id,
        decision,
        spoof_type,
        confidence,
        spoof_scores,
        lbp_score,
        fft_score,
        colour_depth_score: colour_depth,
        gradient_coherence: grad_coherence,
        processing_ms,
    };

    (StatusCode::OK, Json(serde_json::to_value(response).unwrap())).into_response()
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "service": "liveness-signal-processor",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "liveness_signal_processor=info,tower_http=warn".into()),
        )
        .json()
        .init();

    let internal_key = std::env::var("INTERNAL_API_KEY").unwrap_or_else(|_| "dev-internal-key".into());
    let node_callback_url = std::env::var("NODE_CALLBACK_URL")
        .unwrap_or_else(|_| "http://localhost:3000/api/internal/liveness/result".into());
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8090".into())
        .parse()
        .unwrap_or(8090);

    let state = Arc::new(AppState {
        internal_key,
        node_callback_url,
        http_client: reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?,
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/analyse", post(analyse_signal))
        .route("/health", axum::routing::get(health))
        .layer(cors)
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    info!("liveness-signal-processor listening on {}", addr);
    let listener = TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
