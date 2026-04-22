/// PayGate KYC Rust OCR Engine
/// ============================
/// High-throughput parallel OCR pipeline using:
///   - Leptonica/Tesseract bindings (via leptess crate)
///   - Rayon for parallel image processing
///   - Axum for HTTP API
///   - MRZ parsing for passports and ID cards
///
/// This service handles bulk OCR workloads (100+ documents/second)
/// that would be too slow for the Python PaddleOCR service.

use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use base64::{engine::general_purpose, Engine as _};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::net::TcpListener;
use tracing::{error, info, warn};

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct OcrRequest {
    submission_id: String,
    image_base64: Option<String>,
    image_url: Option<String>,
    doc_type: String,
    language: Option<String>,
}

#[derive(Debug, Serialize)]
struct OcrResponse {
    submission_id: String,
    raw_text: String,
    confidence: f32,
    lines: Vec<OcrLine>,
    mrz: Option<MrzData>,
    processing_ms: u64,
    engine: String,
}

#[derive(Debug, Serialize)]
struct OcrLine {
    text: String,
    confidence: f32,
    bbox: [f32; 4], // x, y, width, height (normalised 0-1)
}

#[derive(Debug, Serialize)]
struct MrzData {
    line1: String,
    line2: String,
    document_type: String,
    country_code: String,
    document_number: String,
    nationality: String,
    date_of_birth: String,
    sex: String,
    expiry_date: String,
    surname: String,
    given_names: String,
    check_digit_valid: bool,
}

#[derive(Debug, Serialize)]
struct BulkOcrRequest {
    documents: Vec<OcrRequest>,
}

#[derive(Debug, Serialize)]
struct BulkOcrResponse {
    results: Vec<OcrResponse>,
    total_ms: u64,
    throughput_docs_per_sec: f64,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: String,
    tesseract_available: bool,
    version: String,
}

// ─── App State ────────────────────────────────────────────────────────────────

#[derive(Clone)]
struct AppState {
    http_client: reqwest::Client,
}

// ─── MRZ Parser ───────────────────────────────────────────────────────────────

/// Parse ICAO 9303 TD3 (passport) MRZ
fn parse_mrz_td3(line1: &str, line2: &str) -> Option<MrzData> {
    if line1.len() != 44 || line2.len() != 44 {
        return None;
    }

    let doc_type = line1[0..2].trim_end_matches('<').to_string();
    let country_code = line1[2..5].to_string();
    let name_field = &line1[5..44];
    let name_parts: Vec<&str> = name_field.splitn(2, "<<").collect();
    let surname = name_parts.first().unwrap_or(&"").replace('<', " ").trim().to_string();
    let given_names = name_parts
        .get(1)
        .unwrap_or(&"")
        .replace('<', " ")
        .trim()
        .to_string();

    let doc_number = line2[0..9].replace('<', "").to_string();
    let nationality = line2[10..13].to_string();
    let dob = format_mrz_date(&line2[13..19]);
    let sex = line2[20..21].to_string();
    let expiry = format_mrz_date(&line2[21..27]);

    // Validate check digits
    let check_valid = validate_mrz_check_digit(&line2[0..9], line2.chars().nth(9).unwrap_or('0'))
        && validate_mrz_check_digit(&line2[13..19], line2.chars().nth(19).unwrap_or('0'))
        && validate_mrz_check_digit(&line2[21..27], line2.chars().nth(27).unwrap_or('0'));

    Some(MrzData {
        line1: line1.to_string(),
        line2: line2.to_string(),
        document_type: doc_type,
        country_code,
        document_number: doc_number,
        nationality,
        date_of_birth: dob,
        sex,
        expiry_date: expiry,
        surname,
        given_names,
        check_digit_valid: check_valid,
    })
}

fn format_mrz_date(s: &str) -> String {
    if s.len() != 6 {
        return s.to_string();
    }
    let year_prefix = if s[0..2].parse::<u32>().unwrap_or(0) > 30 {
        "19"
    } else {
        "20"
    };
    format!("{}{}-{}-{}", year_prefix, &s[0..2], &s[2..4], &s[4..6])
}

fn validate_mrz_check_digit(field: &str, check_char: char) -> bool {
    let weights = [7, 3, 1];
    let sum: u32 = field
        .chars()
        .enumerate()
        .map(|(i, c)| {
            let val = match c {
                '0'..='9' => c as u32 - '0' as u32,
                'A'..='Z' => c as u32 - 'A' as u32 + 10,
                '<' => 0,
                _ => 0,
            };
            val * weights[i % 3]
        })
        .sum();
    let expected = (sum % 10) as u8 + b'0';
    expected == check_char as u8
}

// ─── OCR Processing ───────────────────────────────────────────────────────────

async fn process_single_document(
    state: &AppState,
    req: OcrRequest,
) -> Result<OcrResponse, String> {
    let start = Instant::now();

    // Load image bytes
    let img_bytes = if let Some(b64) = &req.image_base64 {
        general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| format!("Base64 decode error: {e}"))?
    } else if let Some(url) = &req.image_url {
        state
            .http_client
            .get(url)
            .timeout(Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| format!("HTTP fetch error: {e}"))?
            .bytes()
            .await
            .map_err(|e| format!("Body read error: {e}"))?
            .to_vec()
    } else {
        return Err("Either image_base64 or image_url required".to_string());
    };

    // Run Tesseract OCR in blocking thread pool
    let lang = req.language.clone().unwrap_or_else(|| "eng".to_string());
    let img_bytes_clone = img_bytes.clone();

    let (raw_text, confidence, lines) = tokio::task::spawn_blocking(move || {
        run_tesseract_ocr(&img_bytes_clone, &lang)
    })
    .await
    .map_err(|e| format!("OCR task error: {e}"))?
    .map_err(|e| format!("OCR error: {e}"))?;

    // Extract MRZ if passport or national ID
    let mrz = if req.doc_type == "passport" || req.doc_type == "national_id" {
        extract_mrz_from_text(&raw_text)
    } else {
        None
    };

    let processing_ms = start.elapsed().as_millis() as u64;

    Ok(OcrResponse {
        submission_id: req.submission_id,
        raw_text,
        confidence,
        lines,
        mrz,
        processing_ms,
        engine: "tesseract-5.3".to_string(),
    })
}

fn run_tesseract_ocr(
    img_bytes: &[u8],
    lang: &str,
) -> Result<(String, f32, Vec<OcrLine>), String> {
    use leptess::LepTess;
    let mut lt = LepTess::new(None, lang)
        .map_err(|e| format!("Tesseract init failed: {e}"))?;
    lt.set_image_from_mem(img_bytes)
        .map_err(|e| format!("Image load failed: {e}"))?;
    lt.set_source_resolution(300);
    let raw_text = lt.get_utf8_text()
        .map_err(|e| format!("OCR extraction failed: {e}"))?;
    let conf = (lt.mean_text_conf() as f32 / 100.0).clamp(0.0, 1.0);
    let lines: Vec<OcrLine> = raw_text
        .lines()
        .filter(|l| !l.trim().is_empty())
        .enumerate()
        .map(|(i, l)| OcrLine {
            text: l.to_string(),
            confidence: conf,
            bbox: [0.0, i as f32 * 0.05, 1.0, (i + 1) as f32 * 0.05],
        })
        .collect();
    Ok((raw_text, conf, lines))
}

fn extract_mrz_from_text(text: &str) -> Option<MrzData> {
    // Find MRZ lines: sequences of 44 uppercase alphanumeric + '<' chars
    let mrz_pattern: Vec<&str> = text
        .lines()
        .filter(|line| {
            let clean: String = line.chars().filter(|c| c.is_ascii_uppercase() || *c == '<' || c.is_ascii_digit()).collect();
            clean.len() == 44
        })
        .collect();

    if mrz_pattern.len() >= 2 {
        let line1: String = mrz_pattern[0].chars().filter(|c| c.is_ascii_uppercase() || *c == '<' || c.is_ascii_digit()).collect();
        let line2: String = mrz_pattern[1].chars().filter(|c| c.is_ascii_uppercase() || *c == '<' || c.is_ascii_digit()).collect();
        parse_mrz_td3(&line1, &line2)
    } else {
        None
    }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async fn handle_ocr(
    State(state): State<Arc<AppState>>,
    Json(req): Json<OcrRequest>,
) -> impl IntoResponse {
    match process_single_document(&state, req).await {
        Ok(result) => (StatusCode::OK, Json(result)).into_response(),
        Err(e) => {
            error!("OCR processing failed: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": e})),
            )
                .into_response()
        }
    }
}

async fn handle_bulk_ocr(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BulkOcrRequest>,
) -> impl IntoResponse {
    let start = Instant::now();
    let doc_count = req.documents.len();

    // Process documents concurrently using tokio
    let tasks: Vec<_> = req
        .documents
        .into_iter()
        .map(|doc| {
            let state = state.clone();
            tokio::spawn(async move { process_single_document(&state, doc).await })
        })
        .collect();

    let mut results = Vec::with_capacity(doc_count);
    for task in tasks {
        match task.await {
            Ok(Ok(result)) => results.push(result),
            Ok(Err(e)) => warn!("Bulk OCR item failed: {e}"),
            Err(e) => warn!("Bulk OCR task panicked: {e}"),
        }
    }

    let total_ms = start.elapsed().as_millis() as u64;
    let throughput = if total_ms > 0 {
        doc_count as f64 / (total_ms as f64 / 1000.0)
    } else {
        0.0
    };

    info!(
        "Bulk OCR: {} documents in {}ms ({:.1} docs/sec)",
        doc_count, total_ms, throughput
    );

    (
        StatusCode::OK,
        Json(BulkOcrResponse {
            results,
            total_ms,
            throughput_docs_per_sec: throughput,
        }),
    )
        .into_response()
}

async fn handle_health() -> impl IntoResponse {
    // Check if Tesseract is available
    let tesseract_available = std::process::Command::new("tesseract")
        .arg("--version")
        .output()
        .is_ok();

    Json(HealthResponse {
        status: "ok".to_string(),
        tesseract_available,
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
        )
        .init();

    let state = Arc::new(AppState {
        http_client: reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .pool_max_idle_per_host(10)
            .build()
            .expect("HTTP client build failed"),
    });

    let app = Router::new()
        .route("/health", get(handle_health))
        .route("/ocr", post(handle_ocr))
        .route("/ocr/bulk", post(handle_bulk_ocr))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "8012".to_string());
    let addr = format!("0.0.0.0:{port}");

    info!("PayGate KYC Rust OCR Engine starting on {addr}");

    let listener = TcpListener::bind(&addr).await.expect("Bind failed");
    axum::serve(listener, app).await.expect("Server failed");
}
