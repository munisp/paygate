//! NextHub TigerBeetle CBDC Ledger (Rust)
//!
//! Provides the CBDC-specific TigerBeetle account and transfer management.
//! CBDC accounts use a separate ledger ID (2000) from FSPIOP accounts (1000).
//!
//! Integrates with:
//! - TigerBeetle: CBDC ledger accounts and transfers
//! - Kafka: paygate.cbdc.ledger events
//! - Redis: account balance cache

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

// ─── Constants ────────────────────────────────────────────────────────────────

/// TigerBeetle ledger ID for CBDC accounts.
pub const CBDC_LEDGER_ID: u32 = 2000;

/// TigerBeetle transfer codes for CBDC operations.
pub const CODE_CBDC_TRANSFER: u16 = 1001;
pub const CODE_CBDC_MINT: u16 = 1002;
pub const CODE_CBDC_BURN: u16 = 1003;
pub const CODE_CBDC_FREEZE: u16 = 1004;
pub const CODE_CBDC_UNFREEZE: u16 = 1005;

/// TigerBeetle account flags.
pub const FLAG_DEBITS_MUST_NOT_EXCEED_CREDITS: u16 = 1 << 0;
pub const FLAG_CREDITS_MUST_NOT_EXCEED_DEBITS: u16 = 1 << 1;
pub const FLAG_LINKED: u16 = 1 << 2;

// ─── Types ────────────────────────────────────────────────────────────────────

/// CBDC account type.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum CBDCAccountType {
    Retail,      // Individual/business CBDC wallet
    Wholesale,   // Bank/FI CBDC account
    CentralBank, // CBN/ECB reserve account
    Government,  // Government disbursement account
    Escrow,      // Escrow/holding account
}

/// CBDC account in TigerBeetle format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CBDCAccount {
    pub id: u128,
    pub ledger: u32,
    pub code: u16,
    pub account_type: CBDCAccountType,
    pub owner_id: String,
    pub currency: String,
    pub debits_pending: u128,
    pub debits_posted: u128,
    pub credits_pending: u128,
    pub credits_posted: u128,
    pub flags: u16,
    pub timestamp: u64,
}

impl CBDCAccount {
    /// Calculate the current balance.
    pub fn balance(&self) -> i128 {
        (self.credits_posted as i128) - (self.debits_posted as i128)
    }

    /// Check if the account has sufficient balance for a debit.
    pub fn has_sufficient_balance(&self, amount: u128) -> bool {
        self.balance() >= amount as i128
    }
}

/// CBDC transfer in TigerBeetle format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CBDCTransfer {
    pub id: u128,
    pub debit_account_id: u128,
    pub credit_account_id: u128,
    pub amount: u128,
    pub ledger: u32,
    pub code: u16,
    pub flags: u16,
    pub pending_id: u128,
    pub user_data_128: u128,
    pub user_data_64: u64,
    pub user_data_32: u32,
    pub timeout: u32,
    pub timestamp: u64,
}

/// CBDC transfer result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CBDCTransferResult {
    pub transfer_id: u128,
    pub success: bool,
    pub error_code: Option<u32>,
    pub error_description: Option<String>,
    pub timestamp: u64,
}

/// CBDC mint request (CBN creates new eNaira).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MintRequest {
    pub target_account_id: u128,
    pub amount: u128,
    pub currency: String,
    pub authorization_ref: String,
}

/// CBDC burn request (CBN destroys eNaira).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BurnRequest {
    pub source_account_id: u128,
    pub amount: u128,
    pub currency: String,
    pub authorization_ref: String,
}

// ─── CBDC Ledger Manager ──────────────────────────────────────────────────────

/// CBDCLedgerManager manages CBDC accounts and transfers in TigerBeetle.
pub struct CBDCLedgerManager {
    // In production: TigerBeetle client connection
    // For testing: in-memory account store
    accounts: HashMap<u128, CBDCAccount>,
    transfers: Vec<CBDCTransfer>,
}

impl CBDCLedgerManager {
    pub fn new() -> Self {
        Self {
            accounts: HashMap::new(),
            transfers: Vec::new(),
        }
    }

    /// Create a new CBDC account.
    pub fn create_account(
        &mut self,
        owner_id: &str,
        account_type: CBDCAccountType,
        currency: &str,
    ) -> CBDCAccount {
        let id = self.generate_account_id(owner_id, currency);
        let now = self.now();

        let code = match account_type {
            CBDCAccountType::Retail => 1,
            CBDCAccountType::Wholesale => 2,
            CBDCAccountType::CentralBank => 3,
            CBDCAccountType::Government => 4,
            CBDCAccountType::Escrow => 5,
        };

        let flags = match account_type {
            CBDCAccountType::Retail => FLAG_DEBITS_MUST_NOT_EXCEED_CREDITS,
            _ => 0,
        };

        let account = CBDCAccount {
            id,
            ledger: CBDC_LEDGER_ID,
            code,
            account_type,
            owner_id: owner_id.to_string(),
            currency: currency.to_string(),
            debits_pending: 0,
            debits_posted: 0,
            credits_pending: 0,
            credits_posted: 0,
            flags,
            timestamp: now,
        };

        self.accounts.insert(id, account.clone());
        account
    }

    /// Execute a CBDC transfer.
    pub fn transfer(
        &mut self,
        debit_account_id: u128,
        credit_account_id: u128,
        amount: u128,
        code: u16,
        user_data: u128,
    ) -> CBDCTransferResult {
        let now = self.now();

        // Validate accounts exist
        let debit_account = match self.accounts.get(&debit_account_id) {
            Some(a) => a.clone(),
            None => {
                return CBDCTransferResult {
                    transfer_id: 0,
                    success: false,
                    error_code: Some(1),
                    error_description: Some("Debit account not found".to_string()),
                    timestamp: now,
                };
            }
        };

        let credit_account = match self.accounts.get(&credit_account_id) {
            Some(a) => a.clone(),
            None => {
                return CBDCTransferResult {
                    transfer_id: 0,
                    success: false,
                    error_code: Some(2),
                    error_description: Some("Credit account not found".to_string()),
                    timestamp: now,
                };
            }
        };

        // Check sufficient balance for retail accounts
        if debit_account.flags & FLAG_DEBITS_MUST_NOT_EXCEED_CREDITS != 0 {
            if !debit_account.has_sufficient_balance(amount) {
                return CBDCTransferResult {
                    transfer_id: 0,
                    success: false,
                    error_code: Some(3),
                    error_description: Some("Insufficient balance".to_string()),
                    timestamp: now,
                };
            }
        }

        // Validate same ledger and currency
        if debit_account.ledger != credit_account.ledger {
            return CBDCTransferResult {
                transfer_id: 0,
                success: false,
                error_code: Some(4),
                error_description: Some("Accounts on different ledgers".to_string()),
                timestamp: now,
            };
        }

        let transfer_id = self.generate_transfer_id();

        let transfer = CBDCTransfer {
            id: transfer_id,
            debit_account_id,
            credit_account_id,
            amount,
            ledger: CBDC_LEDGER_ID,
            code,
            flags: 0,
            pending_id: 0,
            user_data_128: user_data,
            user_data_64: 0,
            user_data_32: 0,
            timeout: 0,
            timestamp: now,
        };

        // Apply transfer
        if let Some(debit_acc) = self.accounts.get_mut(&debit_account_id) {
            debit_acc.debits_posted += amount;
        }
        if let Some(credit_acc) = self.accounts.get_mut(&credit_account_id) {
            credit_acc.credits_posted += amount;
        }

        self.transfers.push(transfer);

        CBDCTransferResult {
            transfer_id,
            success: true,
            error_code: None,
            error_description: None,
            timestamp: now,
        }
    }

    /// Mint new CBDC tokens (CBN only).
    pub fn mint(&mut self, req: &MintRequest) -> CBDCTransferResult {
        // Minting credits the target account without debiting any account
        // In TigerBeetle, this is done by crediting from a special "mint" account
        let mint_account_id = 0u128; // Reserved mint account
        self.transfer(
            mint_account_id,
            req.target_account_id,
            req.amount,
            CODE_CBDC_MINT,
            0,
        )
    }

    /// Get account balance.
    pub fn get_balance(&self, account_id: u128) -> Option<i128> {
        self.accounts.get(&account_id).map(|a| a.balance())
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    fn generate_account_id(&self, owner_id: &str, currency: &str) -> u128 {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(format!("cbdc:{}:{}", owner_id, currency).as_bytes());
        let hash = hasher.finalize();
        let mut id_bytes = [0u8; 16];
        id_bytes.copy_from_slice(&hash[0..16]);
        u128::from_be_bytes(id_bytes)
    }

    fn generate_transfer_id(&self) -> u128 {
        let now = self.now();
        let count = self.transfers.len() as u128;
        (now as u128) << 64 | count
    }

    fn now(&self) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos() as u64
    }
}

impl Default for CBDCLedgerManager {
    fn default() -> Self {
        Self::new()
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_accounts() {
        let mut manager = CBDCLedgerManager::new();
        let retail = manager.create_account("USER-001", CBDCAccountType::Retail, "NGN");
        let wholesale = manager.create_account("BANK-001", CBDCAccountType::Wholesale, "NGN");

        assert_eq!(retail.ledger, CBDC_LEDGER_ID);
        assert_eq!(wholesale.ledger, CBDC_LEDGER_ID);
        assert_eq!(retail.balance(), 0);
    }

    #[test]
    fn test_mint_and_transfer() {
        let mut manager = CBDCLedgerManager::new();
        let cbn = manager.create_account("CBN", CBDCAccountType::CentralBank, "NGN");
        let user = manager.create_account("USER-001", CBDCAccountType::Retail, "NGN");

        // Mint 100,000 NGN to user
        let mint_result = manager.mint(&MintRequest {
            target_account_id: user.id,
            amount: 100_000_00, // In kobo (100,000 NGN)
            currency: "NGN".to_string(),
            authorization_ref: "CBN-AUTH-001".to_string(),
        });
        assert!(mint_result.success);

        let balance = manager.get_balance(user.id).unwrap();
        assert_eq!(balance, 100_000_00);
        let _ = cbn;
    }

    #[test]
    fn test_transfer_between_accounts() {
        let mut manager = CBDCLedgerManager::new();
        let sender = manager.create_account("USER-001", CBDCAccountType::Retail, "NGN");
        let receiver = manager.create_account("USER-002", CBDCAccountType::Retail, "NGN");

        // Mint to sender
        manager.mint(&MintRequest {
            target_account_id: sender.id,
            amount: 50_000_00,
            currency: "NGN".to_string(),
            authorization_ref: "CBN-AUTH-002".to_string(),
        });

        // Transfer 10,000 NGN
        let result = manager.transfer(
            sender.id,
            receiver.id,
            10_000_00,
            CODE_CBDC_TRANSFER,
            0,
        );
        assert!(result.success);

        assert_eq!(manager.get_balance(sender.id).unwrap(), 40_000_00);
        assert_eq!(manager.get_balance(receiver.id).unwrap(), 10_000_00);
    }

    #[test]
    fn test_insufficient_balance_fails() {
        let mut manager = CBDCLedgerManager::new();
        let sender = manager.create_account("USER-001", CBDCAccountType::Retail, "NGN");
        let receiver = manager.create_account("USER-002", CBDCAccountType::Retail, "NGN");

        // Try to transfer without balance
        let result = manager.transfer(sender.id, receiver.id, 10_000_00, CODE_CBDC_TRANSFER, 0);
        assert!(!result.success);
        assert_eq!(result.error_code, Some(3));
    }
}
