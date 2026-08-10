use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    pub server_port: u16,
    pub database_url: String,
    pub redis_url: String,
    pub tigerbeetle_url: String,
    pub kafka_brokers: String,
    pub kafka_group_id: String,
    pub kafka_topic_payment_completed: String,
    pub kafka_topic_billing_computed: String,
    pub otel_endpoint: String,
    pub otel_service_name: String,
    pub log_level: String,
}

impl AppConfig {
    pub fn from_env() -> Result<Self, config::ConfigError> {
        config::Config::builder()
            .set_default("server_port", 8090)?
            .set_default("kafka_group_id", "billing-core")?
            .set_default("kafka_topic_payment_completed", "payment.completed")?
            .set_default("kafka_topic_billing_computed", "billing.computed")?
            .set_default("otel_service_name", "paygate-billing-core")?
            .set_default("log_level", "info")?
            .add_source(config::Environment::default().separator("__"))
            .build()?
            .try_deserialize()
    }
}
