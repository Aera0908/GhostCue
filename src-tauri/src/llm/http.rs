use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use futures_util::StreamExt;

use super::error::{classify_http, classify_transport, LlmErrorKind, LlmFailure};

#[derive(Clone, Copy, Debug)]
pub struct HttpTimeouts {
    pub connect: Duration,
    pub read: Duration,
}

impl HttpTimeouts {
    pub fn cloud() -> Self {
        Self { connect: Duration::from_secs(10), read: Duration::from_secs(60) }
    }

    pub fn local() -> Self {
        Self { connect: Duration::from_secs(5), read: Duration::from_secs(180) }
    }
}

pub fn build_client(t: HttpTimeouts) -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(t.connect)
        .read_timeout(t.read)
        .build()
        .unwrap_or_default()
}

/// Reassembles a byte stream into lines. Splitting happens on the `\n` byte, which never
/// occurs inside a multi-byte UTF-8 sequence, so characters split across chunks stay intact.
#[derive(Default)]
pub struct LineReader {
    buf: Vec<u8>,
}

impl LineReader {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.buf.extend_from_slice(chunk);
        let mut lines = Vec::new();
        while let Some(pos) = self.buf.iter().position(|b| *b == b'\n') {
            let mut line: Vec<u8> = self.buf.drain(..=pos).collect();
            line.pop();
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            lines.push(String::from_utf8_lossy(&line).into_owned());
        }
        lines
    }

    pub fn finish(&mut self) -> Option<String> {
        let mut rest = std::mem::take(&mut self.buf);
        if rest.last() == Some(&b'\r') {
            rest.pop();
        }
        if rest.is_empty() {
            None
        } else {
            Some(String::from_utf8_lossy(&rest).into_owned())
        }
    }
}

#[derive(Clone, Copy)]
pub struct ChatRequest<'a> {
    pub system: &'a str,
    pub user: &'a str,
    pub image_jpeg_b64: Option<&'a str>,
    pub max_tokens: u32,
}

impl<'a> ChatRequest<'a> {
    /// The screenshot, if one was really supplied.
    pub fn image(&self) -> Option<&'a str> {
        self.image_jpeg_b64.map(str::trim).filter(|s| !s.is_empty())
    }
}

pub type OnToken<'a> = &'a (dyn Fn(&str) + Send + Sync);

#[derive(Clone, Copy)]
pub struct RetryPolicy {
    pub max_retries: u32,
    waits_ms: [u64; 3],
    min_ms: u64,
    max_ms: u64,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self { max_retries: 3, waits_ms: [1200, 2500, 4000], min_ms: 800, max_ms: 6000 }
    }
}

impl RetryPolicy {
    pub fn none() -> Self {
        Self { max_retries: 0, ..Self::default() }
    }

    #[cfg(test)]
    pub fn fast() -> Self {
        Self { max_retries: 3, waits_ms: [10, 10, 10], min_ms: 10, max_ms: 20 }
    }

    /// A `Retry-After` value is honoured within bounds; otherwise the wait grows per attempt.
    pub fn wait_ms(&self, attempt: u32, retry_after_secs: Option<u64>) -> u64 {
        match retry_after_secs {
            Some(secs) => secs.saturating_mul(1000).clamp(self.min_ms, self.max_ms),
            None => self.waits_ms[(attempt as usize).min(self.waits_ms.len() - 1)],
        }
    }
}

pub fn cancelled(provider: &str) -> LlmFailure {
    LlmFailure::new(provider, LlmErrorKind::Cancelled, "Cancelled.")
}

/// Runs `fut`, giving up within about 50 ms of `abort` being set. `None` means cancelled.
pub async fn or_cancel<T>(abort: &AtomicBool, fut: impl std::future::Future<Output = T>) -> Option<T> {
    tokio::pin!(fut);
    loop {
        if abort.load(Ordering::SeqCst) {
            return None;
        }
        tokio::select! {
            out = &mut fut => return Some(out),
            _ = tokio::time::sleep(Duration::from_millis(50)) => {}
        }
    }
}

/// A key that cannot be placed in a header is reported as a key problem, before any request.
pub fn header_safe<'a>(provider: &str, key: &'a str) -> Result<&'a str, LlmFailure> {
    let key = key.trim();
    if key.is_empty() || !key.chars().all(|c| c.is_ascii_graphic()) {
        return Err(LlmFailure::new(
            provider,
            LlmErrorKind::BadKey,
            format!("{provider} API key contains characters that cannot be sent. Save the key again."),
        ));
    }
    Ok(key)
}

/// Sends the request, retrying rate limits and server errors. Connection failures are not retried.
pub async fn send_with_retry(
    provider: &str,
    abort: &AtomicBool,
    policy: RetryPolicy,
    make: impl Fn() -> reqwest::RequestBuilder,
) -> Result<reqwest::Response, LlmFailure> {
    let mut attempt = 0;
    loop {
        let sent = or_cancel(abort, make().send()).await.ok_or_else(|| cancelled(provider))?;
        let response = sent.map_err(|e| classify_transport(provider, &e))?;
        if response.status().is_success() {
            return Ok(response);
        }
        let status = response.status().as_u16();
        let retry_after = response
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.trim().parse::<u64>().ok());
        let body = or_cancel(abort, response.text()).await.ok_or_else(|| cancelled(provider))?.unwrap_or_default();
        let failure = classify_http(provider, status, &body);
        if !failure.retriable || attempt >= policy.max_retries {
            return Err(failure);
        }
        let wait = Duration::from_millis(policy.wait_ms(attempt, retry_after));
        or_cancel(abort, tokio::time::sleep(wait)).await.ok_or_else(|| cancelled(provider))?;
        attempt += 1;
    }
}

pub enum Flow {
    Continue,
    Stop,
}

/// Feeds each line of a streaming response to `on_line`, which appends to `text`.
/// A failure after some text has arrived ends the stream and keeps that text.
pub async fn read_lines(
    provider: &str,
    response: reqwest::Response,
    abort: &AtomicBool,
    text: &mut String,
    mut on_line: impl FnMut(&str, &mut String) -> Result<Flow, LlmFailure>,
) -> Result<(), LlmFailure> {
    let mut stream = response.bytes_stream();
    let mut reader = LineReader::new();
    loop {
        let next = or_cancel(abort, stream.next()).await.ok_or_else(|| cancelled(provider))?;
        let (lines, ended) = match next {
            Some(Ok(chunk)) => (reader.push(&chunk), false),
            Some(Err(err)) => {
                if text.trim().is_empty() {
                    return Err(classify_transport(provider, &err));
                }
                return Ok(());
            }
            None => (reader.finish().into_iter().collect(), true),
        };
        for line in lines {
            match on_line(&line, text) {
                Ok(Flow::Continue) => {}
                Ok(Flow::Stop) => return Ok(()),
                Err(failure) => {
                    if text.trim().is_empty() {
                        return Err(failure);
                    }
                    return Ok(());
                }
            }
        }
        if ended {
            return Ok(());
        }
    }
}

/// The payload of a server-sent `data:` line.
pub fn sse_data(line: &str) -> Option<&str> {
    line.strip_prefix("data:").map(str::trim)
}

/// The last step of every client: cancelled, empty, or the answer.
pub fn finish(provider: &str, abort: &AtomicBool, text: String, why_empty: Option<String>) -> Result<String, LlmFailure> {
    if abort.load(Ordering::SeqCst) {
        return Err(cancelled(provider));
    }
    if text.trim().is_empty() {
        let message = why_empty.unwrap_or_else(|| format!("{provider} returned an empty answer. Try again."));
        return Err(LlmFailure::new(provider, LlmErrorKind::EmptyResponse, message));
    }
    Ok(text)
}

/// Sends a request that returns one JSON document.
pub async fn fetch_json(provider: &str, request: reqwest::RequestBuilder) -> Result<serde_json::Value, LlmFailure> {
    let response = request.send().await.map_err(|e| classify_transport(provider, &e))?;
    let status = response.status();
    let body = response.text().await.map_err(|e| classify_transport(provider, &e))?;
    if !status.is_success() {
        return Err(classify_http(provider, status.as_u16(), &body));
    }
    serde_json::from_str(&body).map_err(|_| {
        LlmFailure::new(
            provider,
            LlmErrorKind::ProviderError,
            format!("{provider} sent a reply GhostCue could not read. Check the address."),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn timeouts_have_spec_values() {
        assert_eq!(HttpTimeouts::cloud().connect, Duration::from_secs(10));
        assert_eq!(HttpTimeouts::cloud().read, Duration::from_secs(60));
        assert_eq!(HttpTimeouts::local().connect, Duration::from_secs(5));
        assert_eq!(HttpTimeouts::local().read, Duration::from_secs(180));
    }

    #[test]
    fn splits_across_chunks() {
        let mut r = LineReader::new();
        assert_eq!(r.push(b"data: he"), Vec::<String>::new());
        assert_eq!(r.push(b"llo\ndata: wor"), vec!["data: hello".to_string()]);
        assert_eq!(r.push(b"ld\n\n"), vec!["data: world".to_string(), String::new()]);
        assert_eq!(r.finish(), None);
    }

    #[test]
    fn crlf() {
        let mut r = LineReader::new();
        assert_eq!(r.push(b"a\r\nb\r"), vec!["a".to_string()]);
        assert_eq!(r.push(b"\nc\r\n"), vec!["b".to_string(), "c".to_string()]);
    }

    #[test]
    fn utf8_split_mid_character() {
        let bytes = "x\u{1F511}y\n".as_bytes();
        let cut = 1 + 2; // two bytes into the four-byte character
        let mut r = LineReader::new();
        assert_eq!(r.push(&bytes[..cut]), Vec::<String>::new());
        assert_eq!(r.push(&bytes[cut..]), vec!["x\u{1F511}y".to_string()]);
    }

    #[test]
    fn trailing_line_without_newline_is_returned_by_finish() {
        let mut r = LineReader::new();
        assert_eq!(r.push(b"one\ntwo"), vec!["one".to_string()]);
        assert_eq!(r.finish(), Some("two".to_string()));
    }

    #[test]
    fn finish_on_empty_or_whitespace_remainder_is_none() {
        let mut r = LineReader::new();
        assert_eq!(r.push(b"one\n\r"), vec!["one".to_string()]);
        assert_eq!(r.finish(), None);
    }

    #[test]
    fn invalid_utf8_does_not_panic() {
        let mut r = LineReader::new();
        let lines = r.push(&[0xff, 0xfe, b'a', b'\n']);
        assert_eq!(lines.len(), 1);
        assert!(lines[0].ends_with('a'));
    }
}
