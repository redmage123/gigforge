//! Imperative shell: download a CourtListener bulk dump to disk.
//!
//! Sprint-3: added User-Agent header (required by CourtListener API ToS) and
//! extracted `bulk_url` as a pure function so URL construction is unit-testable.
//! The response body is still buffered in memory; switch to chunked streaming
//! for courts > ~30 MB as a follow-up if needed.

use std::path::PathBuf;

use anyhow::{Context, Result};

const COURTLISTENER_BULK_BASE: &str = "https://www.courtlistener.com/api/bulk-data/opinions";

/// Identify ourselves to CourtListener per their API terms of service.
const USER_AGENT: &str = "JudicialPredict-Ingest/0.1 (https://judicialpredict.io; contact@judicialpredict.io)";

/// Build the bulk-dump URL for a given court identifier.
///
/// Extracted as a pure function so tests can verify URL construction without
/// making a real network request.
pub fn bulk_url(court: &str) -> String {
    format!("{COURTLISTENER_BULK_BASE}/{court}.tar.gz")
}

/// Download the bulk dump for a single court to `/tmp/jp-ingest-<court>.tar.gz`.
pub async fn download_dump(court: &str) -> Result<PathBuf> {
    let url = bulk_url(court);
    let dest = PathBuf::from(format!("/tmp/jp-ingest-{court}.tar.gz"));

    tracing::info!(url = %url, dest = %dest.display(), "downloading bulk dump");

    // Use an explicit client so we can set a User-Agent. CourtListener's API ToS
    // requires clients to identify themselves; omitting User-Agent can trigger
    // CloudFront WAF blocks.
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .context("build reqwest client")?;

    let resp = client
        .get(&url)
        .send()
        .await
        .with_context(|| format!("GET {url}"))?
        .error_for_status()
        .with_context(|| format!("non-2xx from {url}"))?;

    let bytes = resp.bytes().await.context("read response body")?;
    tokio::fs::write(&dest, &bytes)
        .await
        .with_context(|| format!("write {}", dest.display()))?;

    tracing::info!(bytes = bytes.len(), "download complete");
    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bulk_url_uses_tax_court_identifier() {
        let url = bulk_url("tax");
        assert_eq!(
            url,
            "https://www.courtlistener.com/api/bulk-data/opinions/tax.tar.gz"
        );
    }

    #[test]
    fn bulk_url_encodes_court_identifier() {
        // Verify that arbitrary court IDs are interpolated correctly.
        assert!(bulk_url("cafc").ends_with("/cafc.tar.gz"));
        assert!(bulk_url("scotus").ends_with("/scotus.tar.gz"));
        assert!(bulk_url("tcc").ends_with("/tcc.tar.gz"));
    }
}
