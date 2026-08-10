/*!
 * paygate-wallet-ffi
 * ═══════════════════════════════════════════════════════════════════════════════
 * TigerBeetle double-entry ledger operations exposed via C ABI for CGo FFI.
 *
 * # Architecture
 * Each exported function:
 *   1. Deserialises a JSON request from the caller (Go/CGo)
 *   2. Executes the TigerBeetle operation via the global client
 *   3. Serialises the result to JSON and writes it into the caller-provided buffer
 *   4. Returns the number of bytes written (≥0) or a negative error code
 *
 * # Account ID convention
 * TigerBeetle uses 128-bit account IDs.  We encode wallet IDs as UUIDs and
 * map them to u128 by treating the UUID bytes as a big-endian integer.
 *
 * # Ledger / code convention
 *   ledger 1  — NGN (kobo)
 *   ledger 2  — USD (cents)
 *   ledger 3  — GHS (pesewas)
 *   code  1   — wallet (merchant / consumer)
 *   code  2   — escrow / reserve
 *   code  3   — fee collection
 *
 * # Thread safety
 * The global CLIENT is initialised once via `once_cell::sync::OnceCell` and
 * shared across all FFI calls.  Each call blocks on a dedicated Tokio runtime.
 */

use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use tokio::runtime::Runtime;
use tracing::{error, info, warn};
use uuid::Uuid;

// ─── Global Tokio runtime ─────────────────────────────────────────────────────
static RUNTIME: OnceCell<Runtime> = OnceCell::new();

fn runtime() -> &'static Runtime {
    RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(4)
            .enable_all()
            .build()
            .expect("Failed to build Tokio runtime")
    })
}

// ─── TigerBeetle address ──────────────────────────────────────────────────────
static TB_ADDRESS: OnceCell<String> = OnceCell::new();

fn tb_address() -> &'static str {
    TB_ADDRESS.get_or_init(|| {
        std::env::var("TIGERBEETLE_ADDRESS").unwrap_or_else(|_| "127.0.0.1:3902".to_string())
    })
}

// ─── TigerBeetle client wrapper ───────────────────────────────────────────────
// We use the real tigerbeetle client when the "live" feature is enabled,
// and a mock implementation otherwise (for unit tests and CI).

#[cfg(feature = "live")]
mod tb_client {
    use tigerbeetle_unofficial::{Account, AccountFlags, Client, Transfer, TransferFlags};
    use once_cell::sync::OnceCell;

    static CLIENT: OnceCell<Client> = OnceCell::new();

    pub fn get_or_init(address: &str) -> Result<&'static Client, String> {
        CLIENT.get_or_try_init(|| {
            Client::new(0, &[address.to_string()], 32)
                .map_err(|e| format!("TigerBeetle client init failed: {e:?}"))
        })
    }

    pub use tigerbeetle_unofficial::{Account, AccountFlags, Client, Transfer, TransferFlags};
}

#[cfg(not(feature = "live"))]
mod tb_client {
    //! In-process mock that mirrors the TigerBeetle API surface.
    //! Balances are stored in a thread-safe in-memory map.

    use once_cell::sync::Lazy;
    use std::collections::HashMap;
    use std::sync::Mutex;

    #[derive(Clone, Debug)]
    pub struct Account {
        pub id: u128,
        pub ledger: u32,
        pub code: u16,
        pub credits_posted: u128,
        pub debits_posted: u128,
    }

    #[derive(Clone, Debug)]
    pub struct Transfer {
        pub id: u128,
        pub debit_account_id: u128,
        pub credit_account_id: u128,
        pub amount: u128,
        pub ledger: u32,
        pub code: u16,
        pub user_data_128: u128,
    }

    #[derive(Debug)]
    pub struct MockError(pub String);

    static ACCOUNTS: once_cell::sync::Lazy<Mutex<HashMap<u128, Account>>> =
        once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

    pub struct Client;

    impl Client {
        pub fn new(_cluster: u64, _addresses: &[String], _concurrency: u32) -> Result<Self, MockError> {
            Ok(Client)
        }

        pub fn create_accounts(&self, accounts: &[Account]) -> Result<Vec<()>, MockError> {
            let mut store = ACCOUNTS.lock().unwrap();
            for acc in accounts {
                store.entry(acc.id).or_insert_with(|| acc.clone());
            }
            Ok(vec![])
        }

        pub fn lookup_accounts(&self, ids: &[u128]) -> Result<Vec<Account>, MockError> {
            let store = ACCOUNTS.lock().unwrap();
            Ok(ids.iter().filter_map(|id| store.get(id).cloned()).collect())
        }

        pub fn create_transfers(&self, transfers: &[Transfer]) -> Result<Vec<()>, MockError> {
            let mut store = ACCOUNTS.lock().unwrap();
            for t in transfers {
                // Ensure both accounts exist
                store.entry(t.debit_account_id).or_insert(Account {
                    id: t.debit_account_id,
                    ledger: t.ledger,
                    code: 1,
                    credits_posted: 0,
                    debits_posted: 0,
                });
                store.entry(t.credit_account_id).or_insert(Account {
                    id: t.credit_account_id,
                    ledger: t.ledger,
                    code: 1,
                    credits_posted: 0,
                    debits_posted: 0,
                });
                // Apply the transfer
                if let Some(debit_acc) = store.get_mut(&t.debit_account_id) {
                    debit_acc.debits_posted += t.amount;
                }
                if let Some(credit_acc) = store.get_mut(&t.credit_account_id) {
                    credit_acc.credits_posted += t.amount;
                }
            }
            Ok(vec![])
        }
    }

    static MOCK_CLIENT: once_cell::sync::Lazy<Client> =
        once_cell::sync::Lazy::new(|| Client::new(0, &[], 32).unwrap());

    pub fn get_or_init(_address: &str) -> Result<&'static Client, String> {
        Ok(&*MOCK_CLIENT)
    }
}

// ─── Ledger helpers ───────────────────────────────────────────────────────────

fn currency_to_ledger(currency: &str) -> u32 {
    match currency.to_uppercase().as_str() {
        "NGN" => 1,
        "USD" => 2,
        "GHS" => 3,
        "KES" => 4,
        "ZAR" => 5,
        "EUR" => 6,
        "GBP" => 7,
        _ => 1, // default NGN
    }
}

/// Convert a wallet ID string (UUID or numeric) to a TigerBeetle u128 account ID.
fn wallet_id_to_u128(wallet_id: &str) -> Result<u128, String> {
    // Try UUID first
    if let Ok(uuid) = Uuid::parse_str(wallet_id) {
        return Ok(u128::from_be_bytes(*uuid.as_bytes()));
    }
    // Try plain integer
    wallet_id
        .parse::<u128>()
        .map_err(|_| format!("Invalid wallet ID: {wallet_id}"))
}

/// Ensure a TigerBeetle account exists for the given wallet ID.
/// Creates it if it does not already exist (idempotent).
fn ensure_account(
    client: &tb_client::Client,
    wallet_id: u128,
    ledger: u32,
) -> Result<(), String> {
    let existing = client
        .lookup_accounts(&[wallet_id])
        .map_err(|e| format!("lookup_accounts failed: {e:?}"))?;

    if existing.is_empty() {
        let account = tb_client::Account {
            id: wallet_id,
            ledger,
            code: 1, // wallet
            credits_posted: 0,
            debits_posted: 0,
        };
        client
            .create_accounts(&[account])
            .map_err(|e| format!("create_accounts failed: {e:?}"))?;
        info!("Created TigerBeetle account for wallet {wallet_id}");
    }
    Ok(())
}

// ─── JSON request / response types ───────────────────────────────────────────

#[derive(Deserialize)]
struct DebitRequest {
    wallet_id: String,
    amount: u64,         // in smallest currency unit (kobo, cents, etc.)
    currency: String,
    reference: String,
    description: Option<String>,
    /// System float account that receives the debit (e.g. merchant settlement pool)
    float_account_id: Option<String>,
}

#[derive(Serialize)]
struct DebitResponse {
    wallet_id: String,
    ledger_entry_id: String,
    new_balance: u64,
    status: String,
}

#[derive(Deserialize)]
struct CreditRequest {
    wallet_id: String,
    amount: u64,
    currency: String,
    reference: String,
    description: Option<String>,
    float_account_id: Option<String>,
}

#[derive(Serialize)]
struct CreditResponse {
    wallet_id: String,
    ledger_entry_id: String,
    new_balance: u64,
    status: String,
}

#[derive(Deserialize)]
struct BalanceRequest {
    wallet_id: String,
    currency: String,
}

#[derive(Serialize)]
struct BalanceResponse {
    wallet_id: String,
    balance: u64,
    currency: String,
}

#[derive(Deserialize)]
struct P2PRequest {
    sender_wallet_id: String,
    receiver_wallet_id: String,
    amount: u64,
    currency: String,
    reference: String,
}

#[derive(Serialize)]
struct P2PResponse {
    transfer_id: String,
    sender_new_balance: u64,
    receiver_new_balance: u64,
    status: String,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

// ─── Buffer helpers ───────────────────────────────────────────────────────────

/// Write a JSON-serialisable value into the caller-provided C buffer.
/// Returns the number of bytes written, or -1 on error.
fn write_json<T: Serialize>(value: &T, buf: *mut c_char, buf_len: usize) -> c_int {
    match serde_json::to_string(value) {
        Ok(json) => {
            let bytes = json.as_bytes();
            if bytes.len() + 1 > buf_len {
                error!("Response buffer too small: need {} have {}", bytes.len() + 1, buf_len);
                return -2;
            }
            unsafe {
                std::ptr::copy_nonoverlapping(bytes.as_ptr(), buf as *mut u8, bytes.len());
                *buf.add(bytes.len()) = 0; // null-terminate
            }
            bytes.len() as c_int
        }
        Err(e) => {
            error!("JSON serialisation failed: {e}");
            -1
        }
    }
}

fn write_error(msg: &str, buf: *mut c_char, buf_len: usize) -> c_int {
    write_json(&ErrorResponse { error: msg.to_string() }, buf, buf_len)
}

// ─── FFI exports ─────────────────────────────────────────────────────────────

/// Initialise the TigerBeetle client.
/// Must be called once before any other FFI function.
/// Returns 0 on success, -1 on failure.
#[no_mangle]
pub extern "C" fn paygate_wallet_init() -> c_int {
    // Initialise tracing
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "paygate_wallet_ffi=info".parse().unwrap()),
        )
        .try_init();

    match tb_client::get_or_init(tb_address()) {
        Ok(_) => {
            info!("TigerBeetle client initialised at {}", tb_address());
            0
        }
        Err(e) => {
            error!("TigerBeetle client init failed: {e}");
            -1
        }
    }
}

/// Debit a wallet account in TigerBeetle.
///
/// # Parameters
/// - `request_json`: null-terminated JSON string matching `DebitRequest`
/// - `response_buf`: caller-allocated buffer for the JSON response
/// - `response_buf_len`: size of `response_buf` in bytes
///
/// # Returns
/// Number of bytes written to `response_buf` on success, negative on error.
#[no_mangle]
pub extern "C" fn paygate_wallet_debit(
    request_json: *const c_char,
    response_buf: *mut c_char,
    response_buf_len: usize,
) -> c_int {
    // Parse request
    let req_str = unsafe {
        match CStr::from_ptr(request_json).to_str() {
            Ok(s) => s,
            Err(_) => return write_error("Invalid UTF-8 in request", response_buf, response_buf_len),
        }
    };
    let req: DebitRequest = match serde_json::from_str(req_str) {
        Ok(r) => r,
        Err(e) => return write_error(&format!("JSON parse error: {e}"), response_buf, response_buf_len),
    };

    let result = runtime().block_on(async {
        let client = tb_client::get_or_init(tb_address())
            .map_err(|e| e.to_string())?;

        let ledger = currency_to_ledger(&req.currency);
        let wallet_id = wallet_id_to_u128(&req.wallet_id)?;

        // System float account — defaults to a well-known settlement pool account
        // Use a large fixed ID that won't collide with UUID-derived wallet IDs
        let float_id = req
            .float_account_id
            .as_deref()
            .map(wallet_id_to_u128)
            .transpose()?
            .unwrap_or(u128::MAX - 1); // settlement pool sentinel

        // Ensure both accounts exist
        ensure_account(client, wallet_id, ledger)?;
        ensure_account(client, float_id, ledger)?;

        // Generate a deterministic transfer ID from the reference
        let transfer_id = {
            let hash = md5_u128(req.reference.as_bytes());
            hash
        };

        // Debit: wallet → float (wallet loses funds)
        let transfer = tb_client::Transfer {
            id: transfer_id,
            debit_account_id: wallet_id,
            credit_account_id: float_id,
            amount: req.amount as u128,
            ledger,
            code: 1,
            user_data_128: 0,
        };

        client
            .create_transfers(&[transfer])
            .map_err(|e| format!("create_transfers failed: {e:?}"))?;

        // Read back the new balance
        let accounts = client
            .lookup_accounts(&[wallet_id])
            .map_err(|e| format!("lookup_accounts failed: {e:?}"))?;

        let new_balance = accounts
            .first()
            .map(|a| {
                // Available balance = credits_posted - debits_posted
                a.credits_posted.saturating_sub(a.debits_posted) as u64
            })
            .unwrap_or(0);

        Ok::<DebitResponse, String>(DebitResponse {
            wallet_id: req.wallet_id.clone(),
            ledger_entry_id: format!("{transfer_id:032x}"),
            new_balance,
            status: "debited".to_string(),
        })
    });

    match result {
        Ok(resp) => write_json(&resp, response_buf, response_buf_len),
        Err(e) => {
            error!("paygate_wallet_debit error: {e}");
            write_error(&e, response_buf, response_buf_len)
        }
    }
}

/// Credit a wallet account in TigerBeetle.
#[no_mangle]
pub extern "C" fn paygate_wallet_credit(
    request_json: *const c_char,
    response_buf: *mut c_char,
    response_buf_len: usize,
) -> c_int {
    let req_str = unsafe {
        match CStr::from_ptr(request_json).to_str() {
            Ok(s) => s,
            Err(_) => return write_error("Invalid UTF-8 in request", response_buf, response_buf_len),
        }
    };
    let req: CreditRequest = match serde_json::from_str(req_str) {
        Ok(r) => r,
        Err(e) => return write_error(&format!("JSON parse error: {e}"), response_buf, response_buf_len),
    };

    let result = runtime().block_on(async {
        let client = tb_client::get_or_init(tb_address())
            .map_err(|e| e.to_string())?;

        let ledger = currency_to_ledger(&req.currency);
        let wallet_id = wallet_id_to_u128(&req.wallet_id)?;
        let float_id = req
            .float_account_id
            .as_deref()
            .map(wallet_id_to_u128)
            .transpose()?
            .unwrap_or(u128::MAX - 1); // settlement pool sentinel

        ensure_account(client, wallet_id, ledger)?;
        ensure_account(client, float_id, ledger)?;

        let transfer_id = md5_u128(req.reference.as_bytes());

        // Credit: float → wallet (wallet gains funds)
        let transfer = tb_client::Transfer {
            id: transfer_id,
            debit_account_id: float_id,
            credit_account_id: wallet_id,
            amount: req.amount as u128,
            ledger,
            code: 1,
            user_data_128: 0,
        };

        client
            .create_transfers(&[transfer])
            .map_err(|e| format!("create_transfers failed: {e:?}"))?;

        let accounts = client
            .lookup_accounts(&[wallet_id])
            .map_err(|e| format!("lookup_accounts failed: {e:?}"))?;

        let new_balance = accounts
            .first()
            .map(|a| a.credits_posted.saturating_sub(a.debits_posted) as u64)
            .unwrap_or(0);

        Ok::<CreditResponse, String>(CreditResponse {
            wallet_id: req.wallet_id.clone(),
            ledger_entry_id: format!("{transfer_id:032x}"),
            new_balance,
            status: "credited".to_string(),
        })
    });

    match result {
        Ok(resp) => write_json(&resp, response_buf, response_buf_len),
        Err(e) => {
            error!("paygate_wallet_credit error: {e}");
            write_error(&e, response_buf, response_buf_len)
        }
    }
}

/// Query the current balance of a wallet account.
#[no_mangle]
pub extern "C" fn paygate_wallet_balance(
    request_json: *const c_char,
    response_buf: *mut c_char,
    response_buf_len: usize,
) -> c_int {
    let req_str = unsafe {
        match CStr::from_ptr(request_json).to_str() {
            Ok(s) => s,
            Err(_) => return write_error("Invalid UTF-8 in request", response_buf, response_buf_len),
        }
    };
    let req: BalanceRequest = match serde_json::from_str(req_str) {
        Ok(r) => r,
        Err(e) => return write_error(&format!("JSON parse error: {e}"), response_buf, response_buf_len),
    };

    let result = runtime().block_on(async {
        let client = tb_client::get_or_init(tb_address())
            .map_err(|e| e.to_string())?;

        let ledger = currency_to_ledger(&req.currency);
        let wallet_id = wallet_id_to_u128(&req.wallet_id)?;

        ensure_account(client, wallet_id, ledger)?;

        let accounts = client
            .lookup_accounts(&[wallet_id])
            .map_err(|e| format!("lookup_accounts failed: {e:?}"))?;

        let balance = accounts
            .first()
            .map(|a| a.credits_posted.saturating_sub(a.debits_posted) as u64)
            .unwrap_or(0);

        Ok::<BalanceResponse, String>(BalanceResponse {
            wallet_id: req.wallet_id.clone(),
            balance,
            currency: req.currency.clone(),
        })
    });

    match result {
        Ok(resp) => write_json(&resp, response_buf, response_buf_len),
        Err(e) => {
            error!("paygate_wallet_balance error: {e}");
            write_error(&e, response_buf, response_buf_len)
        }
    }
}

/// Atomic P2P transfer: debit sender, credit receiver in a single TigerBeetle transfer.
#[no_mangle]
pub extern "C" fn paygate_wallet_p2p_transfer(
    request_json: *const c_char,
    response_buf: *mut c_char,
    response_buf_len: usize,
) -> c_int {
    let req_str = unsafe {
        match CStr::from_ptr(request_json).to_str() {
            Ok(s) => s,
            Err(_) => return write_error("Invalid UTF-8 in request", response_buf, response_buf_len),
        }
    };
    let req: P2PRequest = match serde_json::from_str(req_str) {
        Ok(r) => r,
        Err(e) => return write_error(&format!("JSON parse error: {e}"), response_buf, response_buf_len),
    };

    let result = runtime().block_on(async {
        let client = tb_client::get_or_init(tb_address())
            .map_err(|e| e.to_string())?;

        let ledger = currency_to_ledger(&req.currency);
        let sender_id = wallet_id_to_u128(&req.sender_wallet_id)?;
        let receiver_id = wallet_id_to_u128(&req.receiver_wallet_id)?;

        ensure_account(client, sender_id, ledger)?;
        ensure_account(client, receiver_id, ledger)?;

        let transfer_id = md5_u128(req.reference.as_bytes());

        // Single atomic transfer: sender → receiver
        let transfer = tb_client::Transfer {
            id: transfer_id,
            debit_account_id: sender_id,
            credit_account_id: receiver_id,
            amount: req.amount as u128,
            ledger,
            code: 1,
            user_data_128: 0,
        };

        client
            .create_transfers(&[transfer])
            .map_err(|e| format!("create_transfers failed: {e:?}"))?;

        let accounts = client
            .lookup_accounts(&[sender_id, receiver_id])
            .map_err(|e| format!("lookup_accounts failed: {e:?}"))?;

        let balance_of = |id: u128| -> u64 {
            accounts
                .iter()
                .find(|a| a.id == id)
                .map(|a| a.credits_posted.saturating_sub(a.debits_posted) as u64)
                .unwrap_or(0)
        };

        Ok::<P2PResponse, String>(P2PResponse {
            transfer_id: format!("{transfer_id:032x}"),
            sender_new_balance: balance_of(sender_id),
            receiver_new_balance: balance_of(receiver_id),
            status: "transferred".to_string(),
        })
    });

    match result {
        Ok(resp) => write_json(&resp, response_buf, response_buf_len),
        Err(e) => {
            error!("paygate_wallet_p2p_transfer error: {e}");
            write_error(&e, response_buf, response_buf_len)
        }
    }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/// Deterministic 128-bit hash of bytes (MD5-derived, not cryptographic).
/// Used to generate idempotent TigerBeetle transfer IDs from payment references.
fn md5_u128(data: &[u8]) -> u128 {
    // Simple FNV-1a 128-bit hash (no external dep required)
    const FNV_OFFSET: u128 = 144066263297769815596495629667062367629;
    const FNV_PRIME: u128 = 309485009821345068724781371;
    let mut hash = FNV_OFFSET;
    for &byte in data {
        hash ^= byte as u128;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::CString;

    fn call_ffi(
        func: unsafe extern "C" fn(*const c_char, *mut c_char, usize) -> c_int,
        req: &str,
    ) -> String {
        let req_c = CString::new(req).unwrap();
        let mut buf = vec![0u8; 4096];
        let n = unsafe { func(req_c.as_ptr(), buf.as_mut_ptr() as *mut c_char, buf.len()) };
        assert!(n > 0, "FFI call returned error code: {n}");
        let s = std::str::from_utf8(&buf[..n as usize]).unwrap().to_string();
        s
    }

    #[test]
    fn test_init() {
        let rc = paygate_wallet_init();
        assert_eq!(rc, 0);
    }

    #[test]
    fn test_credit_and_balance() {
        paygate_wallet_init();

        let wallet_id = "00000000-0000-0000-0000-000000000001";
        let credit_req = serde_json::json!({
            "wallet_id": wallet_id,
            "amount": 100_000u64,
            "currency": "NGN",
            "reference": "test-credit-001",
        })
        .to_string();

        let credit_resp = call_ffi(paygate_wallet_credit, &credit_req);
        let parsed: serde_json::Value = serde_json::from_str(&credit_resp).unwrap();
        assert_eq!(parsed["status"], "credited");
        assert_eq!(parsed["new_balance"], 100_000u64);

        // Check balance
        let bal_req = serde_json::json!({
            "wallet_id": wallet_id,
            "currency": "NGN",
        })
        .to_string();
        let bal_resp = call_ffi(paygate_wallet_balance, &bal_req);
        let bal: serde_json::Value = serde_json::from_str(&bal_resp).unwrap();
        assert_eq!(bal["balance"], 100_000u64);
    }

    #[test]
    fn test_debit_reduces_balance() {
        paygate_wallet_init();

        let wallet_id = "00000000-0000-0000-0000-000000000002";

        // Fund the wallet first
        let credit_req = serde_json::json!({
            "wallet_id": wallet_id,
            "amount": 500_000u64,
            "currency": "NGN",
            "reference": "test-fund-002",
        })
        .to_string();
        call_ffi(paygate_wallet_credit, &credit_req);

        // Debit 200_000
        let debit_req = serde_json::json!({
            "wallet_id": wallet_id,
            "amount": 200_000u64,
            "currency": "NGN",
            "reference": "test-debit-002",
        })
        .to_string();
        let debit_resp = call_ffi(paygate_wallet_debit, &debit_req);
        let parsed: serde_json::Value = serde_json::from_str(&debit_resp).unwrap();
        assert_eq!(parsed["status"], "debited");
        assert_eq!(parsed["new_balance"], 300_000u64);
    }

    #[test]
    fn test_p2p_transfer() {
        paygate_wallet_init();

        let sender = "00000000-0000-0000-0000-000000000003";
        let receiver = "00000000-0000-0000-0000-000000000004";

        // Fund sender
        let fund_req = serde_json::json!({
            "wallet_id": sender,
            "amount": 1_000_000u64,
            "currency": "NGN",
            "reference": "test-fund-sender-003",
        })
        .to_string();
        call_ffi(paygate_wallet_credit, &fund_req);

        // P2P transfer
        let p2p_req = serde_json::json!({
            "sender_wallet_id": sender,
            "receiver_wallet_id": receiver,
            "amount": 400_000u64,
            "currency": "NGN",
            "reference": "test-p2p-003",
        })
        .to_string();
        let p2p_resp = call_ffi(paygate_wallet_p2p_transfer, &p2p_req);
        let parsed: serde_json::Value = serde_json::from_str(&p2p_resp).unwrap();
        assert_eq!(parsed["status"], "transferred");
        assert_eq!(parsed["sender_new_balance"], 600_000u64);
        assert_eq!(parsed["receiver_new_balance"], 400_000u64);
    }

    #[test]
    fn test_deterministic_transfer_id() {
        let id1 = md5_u128(b"REF-001");
        let id2 = md5_u128(b"REF-001");
        let id3 = md5_u128(b"REF-002");
        assert_eq!(id1, id2, "Same reference must produce same transfer ID");
        assert_ne!(id1, id3, "Different references must produce different IDs");
    }

    #[test]
    fn test_wallet_id_to_u128_uuid() {
        let id = wallet_id_to_u128("550e8400-e29b-41d4-a716-446655440000").unwrap();
        assert!(id > 0);
    }

    #[test]
    fn test_wallet_id_to_u128_numeric() {
        let id = wallet_id_to_u128("12345").unwrap();
        assert_eq!(id, 12345u128);
    }

    #[test]
    fn test_currency_to_ledger() {
        assert_eq!(currency_to_ledger("NGN"), 1);
        assert_eq!(currency_to_ledger("USD"), 2);
        assert_eq!(currency_to_ledger("GHS"), 3);
        assert_eq!(currency_to_ledger("KES"), 4);
        assert_eq!(currency_to_ledger("ZAR"), 5);
        assert_eq!(currency_to_ledger("EUR"), 6);
        assert_eq!(currency_to_ledger("GBP"), 7);
        assert_eq!(currency_to_ledger("XYZ"), 1); // default
    }
}
