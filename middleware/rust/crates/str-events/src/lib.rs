// middleware/rust/crates/str-events/src/lib.rs
// STR (Suspicious Transaction Report) and Mobile Money event types.
// Provides: serde/bincode serialisation, Fluvio producer, schema validation.

pub mod events;
pub mod fluvio_producer;
pub mod schema;
pub mod error;

pub use events::{StrEvent, MoMoEvent, StrEventType, MoMoEventType};
pub use fluvio_producer::FluvioProducer;
pub use error::StrEventError;
