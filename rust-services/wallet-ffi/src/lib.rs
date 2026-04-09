//! wallet-ffi — PayGate USDC Payout Signer
//!
//! This crate exposes a C-compatible FFI interface for signing Solana SPL token
//! transfer transactions. It is loaded by the Go bridge at runtime via cgo.
//!
//! # Safety
//! All exported `#[no_mangle] pub extern "C"` functions accept raw C strings and
//! return heap-allocated C strings. Callers MUST call `wallet_ffi_free_string` to
//! release each returned string to prevent memory leaks.
//!
//! # Architecture
//! The Go bridge calls `wallet_ffi_sign_usdc_transfer` with a JSON payload.
//! This function:
//!   1. Deserializes the request (sender keypair, recipient ATA, amount, blockhash)
//!   2. Builds the SPL `transfer_checked` instruction
//!   3. Signs the transaction with the sender keypair
//!   4. Serializes the signed transaction to base64 (wire format for Solana RPC)
//!   5. Returns a JSON response with the base64 transaction and the signature

use std::ffi::{CStr, CString};
use std::os::raw::c_char;

use serde::{Deserialize, Serialize};
use solana_sdk::{
    hash::Hash,
    message::Message,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use spl_token::instruction::transfer_checked;

// ─── USDC constants ───────────────────────────────────────────────────────────

/// USDC SPL token mint address on Solana mainnet-beta
const USDC_MINT_MAINNET: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/// USDC SPL token mint address on Solana devnet
const USDC_MINT_DEVNET: &str = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/// USDC has 6 decimal places (1 USDC = 1_000_000 lamports)
const USDC_DECIMALS: u8 = 6;

// ─── FFI request / response types ────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct SignUSDCTransferRequest {
    /// Base58-encoded sender keypair (64 bytes: 32 secret + 32 public)
    sender_keypair_base58: String,
    /// Base58-encoded recipient Associated Token Account (ATA) address
    recipient_ata: String,
    /// Amount in USDC lamports (1 USDC = 1_000_000)
    amount_lamports: u64,
    /// Recent blockhash from Solana RPC (base58-encoded)
    recent_blockhash: String,
    /// Network: "mainnet" | "devnet" (determines USDC mint address)
    #[serde(default = "default_network")]
    network: String,
}

fn default_network() -> String {
    "mainnet".to_string()
}

#[derive(Debug, Serialize)]
struct SignUSDCTransferResponse {
    /// Base64-encoded signed transaction (ready for Solana RPC sendTransaction)
    signed_transaction_base64: String,
    /// Base58-encoded transaction signature (for on-chain lookup)
    signature: String,
    /// The sender public key (for verification)
    sender_pubkey: String,
}

#[derive(Debug, Serialize)]
struct FFIError {
    error: String,
    code: &'static str,
}

// ─── Core signing logic ───────────────────────────────────────────────────────

/// Build and sign a USDC `transfer_checked` transaction.
///
/// This is the pure-Rust implementation called by both the FFI export and tests.
fn sign_usdc_transfer_inner(req: &SignUSDCTransferRequest) -> Result<SignUSDCTransferResponse, String> {
    // 1. Decode the sender keypair from base58
    let keypair_bytes = bs58::decode(&req.sender_keypair_base58)
        .into_vec()
        .map_err(|e| format!("invalid sender_keypair_base58: {}", e))?;
    if keypair_bytes.len() != 64 {
        return Err(format!(
            "sender keypair must be 64 bytes, got {}",
            keypair_bytes.len()
        ));
    }
    let keypair = Keypair::from_bytes(&keypair_bytes)
        .map_err(|e| format!("invalid keypair bytes: {}", e))?;

    // 2. Derive the sender's Associated Token Account (ATA) for USDC
    let mint_str = if req.network == "devnet" {
        USDC_MINT_DEVNET
    } else {
        USDC_MINT_MAINNET
    };
    let mint_pubkey: Pubkey = mint_str
        .parse()
        .map_err(|e| format!("invalid USDC mint address: {}", e))?;

    let sender_ata = spl_associated_token_account::get_associated_token_address(
        &keypair.pubkey(),
        &mint_pubkey,
    );

    // 3. Parse the recipient ATA
    let recipient_ata: Pubkey = req
        .recipient_ata
        .parse()
        .map_err(|e| format!("invalid recipient_ata: {}", e))?;

    // 4. Build the SPL transfer_checked instruction
    //    transfer_checked is preferred over transfer because it validates the mint
    //    and decimals, preventing accidental transfers of the wrong token.
    let transfer_ix = transfer_checked(
        &spl_token::id(),
        &sender_ata,       // source token account
        &mint_pubkey,      // USDC mint (for validation)
        &recipient_ata,    // destination token account
        &keypair.pubkey(), // authority (owner of source account)
        &[],               // no multisig signers
        req.amount_lamports,
        USDC_DECIMALS,
    )
    .map_err(|e| format!("failed to build transfer_checked instruction: {}", e))?;

    // 5. Parse the recent blockhash
    let blockhash: Hash = req
        .recent_blockhash
        .parse()
        .map_err(|e| format!("invalid recent_blockhash: {}", e))?;

    // 6. Build and sign the transaction
    let message = Message::new(&[transfer_ix], Some(&keypair.pubkey()));
    let mut tx = Transaction::new_unsigned(message);
    tx.sign(&[&keypair], blockhash);

    // 7. Serialize to base64 wire format
    let serialized = bincode::serialize(&tx)
        .map_err(|e| format!("failed to serialize transaction: {}", e))?;
    let signed_transaction_base64 = base64_encode(&serialized);

    // 8. Extract the signature (first signature is always the fee payer's)
    let signature = tx
        .signatures
        .first()
        .map(|s| bs58::encode(s.as_ref()).into_string())
        .unwrap_or_default();

    Ok(SignUSDCTransferResponse {
        signed_transaction_base64,
        signature,
        sender_pubkey: keypair.pubkey().to_string(),
    })
}

/// Simple base64 encoder (avoids adding the `base64` crate dependency)
fn base64_encode(input: &[u8]) -> String {
    use std::fmt::Write;
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        out.push(CHARS[(b0 >> 2)] as char);
        out.push(CHARS[((b0 & 3) << 4) | (b1 >> 4)] as char);
        if chunk.len() > 1 {
            out.push(CHARS[((b1 & 0xf) << 2) | (b2 >> 6)] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(CHARS[b2 & 0x3f] as char);
        } else {
            out.push('=');
        }
        let _ = out; // suppress unused warning
    }
    out
}

// ─── FFI exports ──────────────────────────────────────────────────────────────

/// Sign a USDC SPL transfer transaction.
///
/// # Parameters
/// - `request_json`: Pointer to a null-terminated JSON string matching `SignUSDCTransferRequest`
///
/// # Returns
/// A heap-allocated null-terminated JSON string. On success, the JSON matches
/// `SignUSDCTransferResponse`. On error, the JSON matches `FFIError`.
///
/// # Safety
/// The caller MUST call `wallet_ffi_free_string` on the returned pointer.
/// The `request_json` pointer must remain valid for the duration of this call.
#[no_mangle]
pub extern "C" fn wallet_ffi_sign_usdc_transfer(request_json: *const c_char) -> *mut c_char {
    // Safety: we trust the Go caller to pass a valid null-terminated string
    let json_str = match unsafe { CStr::from_ptr(request_json) }.to_str() {
        Ok(s) => s,
        Err(e) => {
            let err = serde_json::to_string(&FFIError {
                error: format!("invalid UTF-8 in request: {}", e),
                code: "INVALID_UTF8",
            })
            .unwrap_or_default();
            return CString::new(err).unwrap().into_raw();
        }
    };

    let req: SignUSDCTransferRequest = match serde_json::from_str(json_str) {
        Ok(r) => r,
        Err(e) => {
            let err = serde_json::to_string(&FFIError {
                error: format!("JSON parse error: {}", e),
                code: "JSON_PARSE_ERROR",
            })
            .unwrap_or_default();
            return CString::new(err).unwrap().into_raw();
        }
    };

    let result = match sign_usdc_transfer_inner(&req) {
        Ok(resp) => serde_json::to_string(&resp).unwrap_or_default(),
        Err(e) => serde_json::to_string(&FFIError {
            error: e,
            code: "SIGNING_ERROR",
        })
        .unwrap_or_default(),
    };

    CString::new(result).unwrap().into_raw()
}

/// Validate a Solana public key string.
///
/// Returns a heap-allocated JSON string: `{"valid": true}` or `{"valid": false, "error": "..."}`.
///
/// # Safety
/// The caller MUST call `wallet_ffi_free_string` on the returned pointer.
#[no_mangle]
pub extern "C" fn wallet_ffi_validate_pubkey(pubkey_str: *const c_char) -> *mut c_char {
    let s = match unsafe { CStr::from_ptr(pubkey_str) }.to_str() {
        Ok(s) => s,
        Err(_) => {
            return CString::new(r#"{"valid":false,"error":"invalid UTF-8"}"#)
                .unwrap()
                .into_raw();
        }
    };

    let result = match s.parse::<Pubkey>() {
        Ok(_) => r#"{"valid":true}"#.to_string(),
        Err(e) => format!(r#"{{"valid":false,"error":"{}"}}"#, e),
    };

    CString::new(result).unwrap().into_raw()
}

/// Free a string returned by any wallet_ffi_* function.
///
/// # Safety
/// The pointer MUST have been returned by a wallet_ffi_* function.
/// Calling this with any other pointer is undefined behaviour.
#[no_mangle]
pub extern "C" fn wallet_ffi_free_string(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }
    // Safety: we own this allocation — it was created by CString::into_raw()
    unsafe {
        drop(CString::from_raw(ptr));
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use solana_sdk::signature::Keypair;

    fn make_test_keypair() -> String {
        let kp = Keypair::new();
        bs58::encode(kp.to_bytes()).into_string()
    }

    fn make_test_blockhash() -> String {
        // A valid-format blockhash (all zeros)
        bs58::encode([0u8; 32]).into_string()
    }

    #[test]
    fn test_validate_pubkey_valid() {
        let kp = Keypair::new();
        let pubkey = kp.pubkey().to_string();
        let result: serde_json::Value = {
            let req = CString::new(pubkey).unwrap();
            let ptr = wallet_ffi_validate_pubkey(req.as_ptr());
            let s = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_string();
            wallet_ffi_free_string(ptr);
            serde_json::from_str(&s).unwrap()
        };
        assert_eq!(result["valid"], true);
    }

    #[test]
    fn test_validate_pubkey_invalid() {
        let req = CString::new("not-a-valid-pubkey").unwrap();
        let ptr = wallet_ffi_validate_pubkey(req.as_ptr());
        let s = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_string();
        wallet_ffi_free_string(ptr);
        let result: serde_json::Value = serde_json::from_str(&s).unwrap();
        assert_eq!(result["valid"], false);
    }

    #[test]
    fn test_sign_usdc_transfer_invalid_keypair() {
        let req = serde_json::json!({
            "sender_keypair_base58": "invalid",
            "recipient_ata": Keypair::new().pubkey().to_string(),
            "amount_lamports": 1_000_000u64,
            "recent_blockhash": make_test_blockhash(),
            "network": "devnet"
        });
        let req_str = CString::new(req.to_string()).unwrap();
        let ptr = wallet_ffi_sign_usdc_transfer(req_str.as_ptr());
        let s = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_string();
        wallet_ffi_free_string(ptr);
        let result: serde_json::Value = serde_json::from_str(&s).unwrap();
        assert!(result["error"].as_str().is_some());
    }

    #[test]
    fn test_sign_usdc_transfer_invalid_json() {
        let req = CString::new("not json").unwrap();
        let ptr = wallet_ffi_sign_usdc_transfer(req.as_ptr());
        let s = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_string();
        wallet_ffi_free_string(ptr);
        let result: serde_json::Value = serde_json::from_str(&s).unwrap();
        assert_eq!(result["code"], "JSON_PARSE_ERROR");
    }

    #[test]
    fn test_sign_usdc_transfer_devnet_builds_transaction() {
        // This test verifies the transaction is built and signed without errors.
        // It will fail at the RPC broadcast stage in production (no real blockhash),
        // but confirms the signing logic is correct.
        let keypair_b58 = make_test_keypair();
        let recipient_ata = Keypair::new().pubkey().to_string();
        let blockhash = make_test_blockhash();

        let req = serde_json::json!({
            "sender_keypair_base58": keypair_b58,
            "recipient_ata": recipient_ata,
            "amount_lamports": 500_000u64,  // 0.5 USDC
            "recent_blockhash": blockhash,
            "network": "devnet"
        });
        let req_str = CString::new(req.to_string()).unwrap();
        let ptr = wallet_ffi_sign_usdc_transfer(req_str.as_ptr());
        let s = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_string();
        wallet_ffi_free_string(ptr);

        let result: serde_json::Value = serde_json::from_str(&s).unwrap();
        // Should have a signature (no "error" field)
        assert!(result.get("error").is_none(), "unexpected error: {}", result);
        assert!(result["signature"].as_str().unwrap().len() > 0);
        assert!(result["signed_transaction_base64"].as_str().unwrap().len() > 0);
    }

    #[test]
    fn test_free_null_pointer_is_safe() {
        // Must not panic or segfault
        wallet_ffi_free_string(std::ptr::null_mut());
    }
}

// ─── HTTP server types (used by src/server.rs binary) ────────────────────────

/// HTTP-compatible request type for the wallet-ffi HTTP server.
/// Mirrors `SignUSDCTransferRequest` but is `pub` so the server binary can use it.
#[derive(Debug, Deserialize, Serialize)]
pub struct SignUSDCTransferHttpRequest {
    pub sender_keypair_base58: String,
    pub recipient_ata: String,
    pub amount_lamports: u64,
    pub recent_blockhash: String,
    #[serde(default = "default_network")]
    pub network: String,
}

/// HTTP-compatible response type for the wallet-ffi HTTP server.
#[derive(Debug, Serialize, Deserialize)]
pub struct SignUSDCTransferHttpResponse {
    pub signed_tx_base64: String,
    pub signature: String,
    pub sender_pubkey: String,
}

/// Public entry point for the HTTP server binary.
/// Calls `sign_usdc_transfer_inner` and maps to HTTP-compatible types.
pub fn sign_usdc_transfer_http(req: SignUSDCTransferHttpRequest) -> Result<SignUSDCTransferHttpResponse, String> {
    let inner_req = SignUSDCTransferRequest {
        sender_keypair_base58: req.sender_keypair_base58,
        recipient_ata: req.recipient_ata,
        amount_lamports: req.amount_lamports,
        recent_blockhash: req.recent_blockhash,
        network: req.network,
    };
    let resp = sign_usdc_transfer_inner(&inner_req)?;
    Ok(SignUSDCTransferHttpResponse {
        signed_tx_base64: resp.signed_transaction_base64,
        signature: resp.signature,
        sender_pubkey: resp.sender_pubkey,
    })
}
