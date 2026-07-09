// lib.rs — PayGate terminal events crate
//
// Provides:
//   - Canonical serde/bincode event types (TerminalEvent, TerminalEventType, payloads)
//   - FluvioTerminalClient — high-throughput Fluvio producer/consumer
//   - TigerBeetleSettler — double-entry settlement on txn_completed events
//
// Architecture:
//   Terminal Device → APISIX → Go Bridge → Fluvio → [this crate consumer]
//                                                         ↓
//                                                   TigerBeetle (settlement)
//                                                   Redis (analytics cache)
//                                                   Lakehouse (audit trail)

pub mod events;
pub mod fluvio_client;
pub mod tigerbeetle;
pub mod error;

pub use events::{TerminalEvent, TerminalEventType, TxnPayload, RefundPayload,
                  ProvisionedPayload, HeartbeatPayload, StatusChangePayload};
pub use fluvio_client::FluvioTerminalClient;
pub use tigerbeetle::TigerBeetleSettler;
pub use error::TerminalError;
