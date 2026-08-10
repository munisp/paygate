/*!
PayGate NextHub — TigerBeetle Account ID Derivation
====================================================
Derives deterministic 128-bit TigerBeetle account IDs from DFSP NIP codes.

## Design Principles

TigerBeetle account IDs are 128-bit unsigned integers. We derive them
deterministically from (dfsp_id, currency, account_type) using a UUID v5
namespace, then convert the 128-bit UUID to a u128 TigerBeetle account ID.

This means:
- The same DFSP always gets the same account ID across all hub instances
- No central registry is needed for account ID allocation
- Account IDs can be computed offline for provisioning scripts
- Collision probability is negligible (UUID v5 SHA-1 namespace)

## Account Types

| Type | Description |
|------|-------------|
| POSITION | DFSP current position (debit-normal) |
| SETTLEMENT | DFSP settlement account (credit-normal) |
| SUSPENSE | In-flight transfer suspense (credit-normal) |
| FEE_RESERVE | Fee reserve for pending transfers |
| INTERCHANGE | Interchange fee collection |
| FX_BUFFER | Cross-currency FX conversion buffer |
| SCHEME_FEE | Scheme fee collection account |
| LIQUIDITY | Liquidity threshold monitoring |
| HUB_MULTILATERAL | Hub multilateral net settlement |
| INVOICE | Monthly billing invoice account |
*/

use uuid::Uuid;

/// TigerBeetle account types for NextHub
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum AccountType {
    Position        = 0x01,
    Settlement      = 0x02,
    Suspense        = 0x03,
    FeeReserve      = 0x04,
    Interchange     = 0x05,
    FxBuffer        = 0x06,
    SchemeFee       = 0x07,
    Liquidity       = 0x08,
    HubMultilateral = 0x09,
    Invoice         = 0x0A,
}

impl AccountType {
    pub fn as_str(&self) -> &'static str {
        match self {
            AccountType::Position        => "POSITION",
            AccountType::Settlement      => "SETTLEMENT",
            AccountType::Suspense        => "SUSPENSE",
            AccountType::FeeReserve      => "FEE_RESERVE",
            AccountType::Interchange     => "INTERCHANGE",
            AccountType::FxBuffer        => "FX_BUFFER",
            AccountType::SchemeFee       => "SCHEME_FEE",
            AccountType::Liquidity       => "LIQUIDITY",
            AccountType::HubMultilateral => "HUB_MULTILATERAL",
            AccountType::Invoice         => "INVOICE",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "POSITION"         => Some(AccountType::Position),
            "SETTLEMENT"       => Some(AccountType::Settlement),
            "SUSPENSE"         => Some(AccountType::Suspense),
            "FEE_RESERVE"      => Some(AccountType::FeeReserve),
            "INTERCHANGE"      => Some(AccountType::Interchange),
            "FX_BUFFER"        => Some(AccountType::FxBuffer),
            "SCHEME_FEE"       => Some(AccountType::SchemeFee),
            "LIQUIDITY"        => Some(AccountType::Liquidity),
            "HUB_MULTILATERAL" => Some(AccountType::HubMultilateral),
            "INVOICE"          => Some(AccountType::Invoice),
            _ => None,
        }
    }

    /// Whether this account type is debit-normal (position increases on debit)
    pub fn is_debit_normal(&self) -> bool {
        matches!(self, AccountType::Position | AccountType::FeeReserve | AccountType::Liquidity)
    }
}

/// Supported currencies
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum Currency {
    Ngn  = 0x01,
    Usd  = 0x02,
    Eur  = 0x03,
    Gbp  = 0x04,
    Kes  = 0x05,
    Ghs  = 0x06,
    Zar  = 0x07,
    Xof  = 0x08,
    Usdc = 0x09,
    ENgn = 0x0A,
}

impl Currency {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_uppercase().as_str() {
            "NGN"  => Some(Currency::Ngn),
            "USD"  => Some(Currency::Usd),
            "EUR"  => Some(Currency::Eur),
            "GBP"  => Some(Currency::Gbp),
            "KES"  => Some(Currency::Kes),
            "GHS"  => Some(Currency::Ghs),
            "ZAR"  => Some(Currency::Zar),
            "XOF"  => Some(Currency::Xof),
            "USDC" => Some(Currency::Usdc),
            "ENGN" => Some(Currency::ENgn),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Currency::Ngn  => "NGN",
            Currency::Usd  => "USD",
            Currency::Eur  => "EUR",
            Currency::Gbp  => "GBP",
            Currency::Kes  => "KES",
            Currency::Ghs  => "GHS",
            Currency::Zar  => "ZAR",
            Currency::Xof  => "XOF",
            Currency::Usdc => "USDC",
            Currency::ENgn => "ENGN",
        }
    }

    /// ISO 4217 numeric code (0 for non-ISO currencies like stablecoins/CBDCs)
    pub fn iso_numeric(&self) -> u16 {
        match self {
            Currency::Ngn  => 566,
            Currency::Usd  => 840,
            Currency::Eur  => 978,
            Currency::Gbp  => 826,
            Currency::Kes  => 404,
            Currency::Ghs  => 936,
            Currency::Zar  => 710,
            Currency::Xof  => 952,
            Currency::Usdc => 0,
            Currency::ENgn => 0,
        }
    }
}

/// UUID v5 namespace for PayGate NextHub TigerBeetle account IDs.
/// This is a fixed, well-known UUID that identifies this derivation scheme.
/// Changing it would invalidate all existing account IDs.
const NEXTHUB_ACCOUNT_NAMESPACE: Uuid = Uuid::from_bytes([
    0x6b, 0xa7, 0xb8, 0x10,
    0x9d, 0xad,
    0x11, 0xd1,
    0x80, 0xb4,
    0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8,
]);

/// Derive a deterministic TigerBeetle account ID from DFSP ID, currency, and account type.
///
/// # Arguments
/// * `dfsp_id` — The DFSP's unique identifier (e.g., "ACCESS_BANK", "GTB")
/// * `currency` — The currency for this account
/// * `account_type` — The type of account
///
/// # Returns
/// A u128 TigerBeetle account ID that is stable across all hub instances.
pub fn derive_account_id(dfsp_id: &str, currency: Currency, account_type: AccountType) -> u128 {
    let key = format!("{}:{}:{}", dfsp_id, currency.as_str(), account_type.as_str());
    let uuid = Uuid::new_v5(&NEXTHUB_ACCOUNT_NAMESPACE, key.as_bytes());
    u128::from_be_bytes(*uuid.as_bytes())
}

/// Derive a deterministic TigerBeetle account ID from a NIP institution code.
///
/// NIP codes are 6-digit numeric strings (e.g., "000014" for ACCESS BANK).
/// This is the primary derivation path for Nigerian DFSPs.
///
/// # Arguments
/// * `nip_code` — The 6-digit NIP institution code (will be zero-padded to 6 digits)
/// * `currency` — The currency for this account
/// * `account_type` — The type of account
pub fn derive_account_id_from_nip(nip_code: &str, currency: Currency, account_type: AccountType) -> u128 {
    let normalised = format!("{:0>6}", nip_code.trim());
    derive_account_id(&normalised, currency, account_type)
}

/// Derive a transfer ID from an ILP condition hash.
///
/// ILP conditions are 32-byte SHA-256 hashes encoded as base64url.
/// We derive a deterministic u128 transfer ID from the condition to ensure
/// idempotency: the same ILP condition always maps to the same TigerBeetle transfer.
pub fn derive_transfer_id_from_condition(ilp_condition: &str) -> u128 {
    let key = format!("transfer:condition:{}", ilp_condition);
    let uuid = Uuid::new_v5(&NEXTHUB_ACCOUNT_NAMESPACE, key.as_bytes());
    u128::from_be_bytes(*uuid.as_bytes())
}

/// Derive a transfer ID from a transfer UUID (for non-ILP transfers).
pub fn derive_transfer_id_from_uuid(transfer_uuid: &str) -> u128 {
    let key = format!("transfer:uuid:{}", transfer_uuid);
    let uuid = Uuid::new_v5(&NEXTHUB_ACCOUNT_NAMESPACE, key.as_bytes());
    u128::from_be_bytes(*uuid.as_bytes())
}

/// Derive a fee transfer ID from a parent transfer ID and fee type.
pub fn derive_fee_transfer_id(parent_transfer_id: u128, fee_type: &str) -> u128 {
    let key = format!("fee:{}:{}", parent_transfer_id, fee_type);
    let uuid = Uuid::new_v5(&NEXTHUB_ACCOUNT_NAMESPACE, key.as_bytes());
    u128::from_be_bytes(*uuid.as_bytes())
}

/// Derive an invoice transfer ID from a billing invoice ID.
pub fn derive_invoice_transfer_id(invoice_id: &str) -> u128 {
    let key = format!("invoice:{}", invoice_id);
    let uuid = Uuid::new_v5(&NEXTHUB_ACCOUNT_NAMESPACE, key.as_bytes());
    u128::from_be_bytes(*uuid.as_bytes())
}

/// Full account set for a DFSP in a given currency.
#[derive(Debug, Clone)]
pub struct DfspAccountSet {
    pub dfsp_id: String,
    pub nip_code: String,
    pub currency: Currency,
    pub position_id: u128,
    pub settlement_id: u128,
    pub suspense_id: u128,
    pub fee_reserve_id: u128,
    pub liquidity_id: u128,
}

impl DfspAccountSet {
    /// Derive the full account set for a DFSP in a given currency.
    pub fn derive(dfsp_id: &str, nip_code: &str, currency: Currency) -> Self {
        Self {
            dfsp_id: dfsp_id.to_string(),
            nip_code: nip_code.to_string(),
            currency,
            position_id:    derive_account_id_from_nip(nip_code, currency, AccountType::Position),
            settlement_id:  derive_account_id_from_nip(nip_code, currency, AccountType::Settlement),
            suspense_id:    derive_account_id_from_nip(nip_code, currency, AccountType::Suspense),
            fee_reserve_id: derive_account_id_from_nip(nip_code, currency, AccountType::FeeReserve),
            liquidity_id:   derive_account_id_from_nip(nip_code, currency, AccountType::Liquidity),
        }
    }

    /// Return all account IDs as a list of (type, id) pairs.
    pub fn all_accounts(&self) -> Vec<(AccountType, u128)> {
        vec![
            (AccountType::Position,   self.position_id),
            (AccountType::Settlement, self.settlement_id),
            (AccountType::Suspense,   self.suspense_id),
            (AccountType::FeeReserve, self.fee_reserve_id),
            (AccountType::Liquidity,  self.liquidity_id),
        ]
    }
}

/// Hub-level shared accounts (not DFSP-specific).
pub struct HubAccounts;

impl HubAccounts {
    pub fn scheme_fee(currency: Currency) -> u128 {
        derive_account_id("HUB", currency, AccountType::SchemeFee)
    }

    pub fn interchange(currency: Currency) -> u128 {
        derive_account_id("HUB", currency, AccountType::Interchange)
    }

    pub fn fx_buffer(from_currency: Currency, to_currency: Currency) -> u128 {
        let key = format!("HUB:FX:{}:{}", from_currency.as_str(), to_currency.as_str());
        let uuid = Uuid::new_v5(&NEXTHUB_ACCOUNT_NAMESPACE, key.as_bytes());
        u128::from_be_bytes(*uuid.as_bytes())
    }

    pub fn multilateral_net(currency: Currency) -> u128 {
        derive_account_id("HUB", currency, AccountType::HubMultilateral)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_account_id_deterministic() {
        let id1 = derive_account_id("ACCESS_BANK", Currency::Ngn, AccountType::Position);
        let id2 = derive_account_id("ACCESS_BANK", Currency::Ngn, AccountType::Position);
        assert_eq!(id1, id2, "Account ID derivation must be deterministic");
    }

    #[test]
    fn test_derive_account_id_unique_per_type() {
        let position   = derive_account_id("GTB", Currency::Ngn, AccountType::Position);
        let settlement = derive_account_id("GTB", Currency::Ngn, AccountType::Settlement);
        let suspense   = derive_account_id("GTB", Currency::Ngn, AccountType::Suspense);
        assert_ne!(position, settlement);
        assert_ne!(position, suspense);
        assert_ne!(settlement, suspense);
    }

    #[test]
    fn test_derive_account_id_unique_per_currency() {
        let ngn = derive_account_id("ACCESS_BANK", Currency::Ngn, AccountType::Position);
        let usd = derive_account_id("ACCESS_BANK", Currency::Usd, AccountType::Position);
        assert_ne!(ngn, usd);
    }

    #[test]
    fn test_derive_account_id_unique_per_dfsp() {
        let access = derive_account_id("ACCESS_BANK", Currency::Ngn, AccountType::Position);
        let gtb    = derive_account_id("GTB", Currency::Ngn, AccountType::Position);
        assert_ne!(access, gtb);
    }

    #[test]
    fn test_nip_code_padding_normalised() {
        let from_full    = derive_account_id_from_nip("000014", Currency::Ngn, AccountType::Position);
        let from_short   = derive_account_id_from_nip("14",     Currency::Ngn, AccountType::Position);
        assert_eq!(from_full, from_short, "NIP code padding must be normalised");
    }

    #[test]
    fn test_transfer_id_from_condition_deterministic() {
        let condition = "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";
        let id1 = derive_transfer_id_from_condition(condition);
        let id2 = derive_transfer_id_from_condition(condition);
        assert_eq!(id1, id2);
    }

    #[test]
    fn test_dfsp_account_set_all_unique() {
        let accounts = DfspAccountSet::derive("ACCESS_BANK", "000014", Currency::Ngn);
        let ids: Vec<u128> = accounts.all_accounts().iter().map(|(_, id)| *id).collect();
        let unique: std::collections::HashSet<u128> = ids.iter().cloned().collect();
        assert_eq!(ids.len(), unique.len(), "All account IDs in a set must be unique");
    }

    #[test]
    fn test_hub_accounts_unique() {
        let scheme_fee   = HubAccounts::scheme_fee(Currency::Ngn);
        let interchange  = HubAccounts::interchange(Currency::Ngn);
        let fx_buffer    = HubAccounts::fx_buffer(Currency::Ngn, Currency::Usd);
        let multilateral = HubAccounts::multilateral_net(Currency::Ngn);
        let ids = [scheme_fee, interchange, fx_buffer, multilateral];
        let unique: std::collections::HashSet<u128> = ids.iter().cloned().collect();
        assert_eq!(ids.len(), unique.len());
    }
}
