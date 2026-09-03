//! velocity-counter: sliding-window rate limiter backed by Redis.
//! Uses a sorted-set per (merchant, channel, window) key.
use redis::{Client, Commands, RedisError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CounterResult {
    pub count: u64,
    pub amount_kobo: u64,
}

/// Increment the sliding-window counter and return the current totals.
/// Key format: `vc:{merchant_id}:{channel}:{window_seconds}`
pub fn increment_and_get(
    client: &Client,
    merchant_id: &str,
    channel: &str,
    window_seconds: u64,
    amount_kobo: u64,
) -> Result<CounterResult, RedisError> {
    let mut con = client.get_connection()?;
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let window_ms = window_seconds * 1000;
    let cutoff = now_ms.saturating_sub(window_ms);

    let count_key = format!("vc:count:{}:{}:{}", merchant_id, channel, window_seconds);
    let amount_key = format!("vc:amount:{}:{}:{}", merchant_id, channel, window_seconds);

    // Remove expired entries from both sorted sets
    let _: () = redis::cmd("ZREMRANGEBYSCORE")
        .arg(&count_key).arg(0).arg(cutoff)
        .query(&mut con)?;
    let _: () = redis::cmd("ZREMRANGEBYSCORE")
        .arg(&amount_key).arg(0).arg(cutoff)
        .query(&mut con)?;

    // Add current transaction
    let member = format!("{}:{}", now_ms, uuid::Uuid::new_v4());
    let _: () = con.zadd(&count_key, &member, now_ms)?;
    let _: () = con.zadd(&amount_key, format!("{}:{}", amount_kobo, member), now_ms)?;
    let _: () = con.expire(&count_key, (window_seconds + 60) as i64)?;
    let _: () = con.expire(&amount_key, (window_seconds + 60) as i64)?;

    // Count entries in window
    let count: u64 = redis::cmd("ZCOUNT")
        .arg(&count_key).arg(cutoff).arg("+inf")
        .query(&mut con)?;

    // Sum amounts in window
    let members: Vec<String> = redis::cmd("ZRANGEBYSCORE")
        .arg(&amount_key).arg(cutoff).arg("+inf")
        .query(&mut con)?;
    let total_amount: u64 = members.iter().filter_map(|m| {
        m.split(':').next().and_then(|s| s.parse::<u64>().ok())
    }).sum();

    Ok(CounterResult { count, amount_kobo: total_amount })
}

/// Get current window totals without incrementing.
pub fn get_current(
    client: &Client,
    merchant_id: &str,
    channel: &str,
    window_seconds: u64,
) -> Result<CounterResult, RedisError> {
    let mut con = client.get_connection()?;
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let window_ms = window_seconds * 1000;
    let cutoff = now_ms.saturating_sub(window_ms);

    let count_key = format!("vc:count:{}:{}:{}", merchant_id, channel, window_seconds);
    let amount_key = format!("vc:amount:{}:{}:{}", merchant_id, channel, window_seconds);

    let count: u64 = redis::cmd("ZCOUNT")
        .arg(&count_key).arg(cutoff).arg("+inf")
        .query(&mut con).unwrap_or(0);

    let members: Vec<String> = redis::cmd("ZRANGEBYSCORE")
        .arg(&amount_key).arg(cutoff).arg("+inf")
        .query(&mut con).unwrap_or_default();
    let total_amount: u64 = members.iter().filter_map(|m| {
        m.split(':').next().and_then(|s| s.parse::<u64>().ok())
    }).sum();

    Ok(CounterResult { count, amount_kobo: total_amount })
}
