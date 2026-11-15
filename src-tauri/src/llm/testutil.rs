//! Shared helpers for the client tests. Only the HTTP boundary is faked.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};

use super::http::{ChatRequest, HttpTimeouts};
use super::provider::{def, ProviderId, ResolvedProvider};

pub fn provider(slug: &str, base_url: &str, key: Option<&str>, model: &str) -> ResolvedProvider {
    ResolvedProvider {
        def: def(ProviderId::from_slug(slug).unwrap()),
        base_url: base_url.to_string(),
        api_key: key.map(str::to_string),
        model: model.to_string(),
        smart_routed: false,
    }
}

pub fn req<'a>() -> ChatRequest<'a> {
    ChatRequest { system: "sys", user: "hello", image_jpeg_b64: None, max_tokens: 64 }
}

pub fn req_with_image<'a>() -> ChatRequest<'a> {
    ChatRequest { image_jpeg_b64: Some("QUJD"), ..req() }
}

pub fn quick() -> HttpTimeouts {
    HttpTimeouts { connect: Duration::from_secs(2), read: Duration::from_secs(5) }
}

pub fn flag() -> Arc<AtomicBool> {
    Arc::new(AtomicBool::new(false))
}

/// Sets the flag after `ms`, as the Cancel button would.
pub fn cancel_after(abort: &Arc<AtomicBool>, ms: u64) {
    let abort = abort.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(ms)).await;
        abort.store(true, Ordering::SeqCst);
    });
}

#[derive(Default)]
pub struct Tokens(Mutex<Vec<String>>);

impl Tokens {
    pub fn push(&self, token: &str) {
        self.0.lock().unwrap().push(token.to_string());
    }
    pub fn all(&self) -> Vec<String> {
        self.0.lock().unwrap().clone()
    }
}

pub fn sse(events: &[&str]) -> String {
    events.iter().map(|e| format!("data: {e}\n\n")).collect()
}

pub fn ndjson(lines: &[&str]) -> String {
    lines.iter().map(|l| format!("{l}\n")).collect()
}

/// A port with nothing listening on it.
pub fn dead_url() -> String {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    format!("http://127.0.0.1:{port}")
}

pub enum After {
    /// Close the socket, as a dropped connection does.
    Close,
    /// Keep the socket open and send nothing more.
    Hang,
}

/// A response head that promises more bytes than the test will send.
pub const UNFINISHED_HEAD: &str =
    "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: 99999\r\n\r\n";

/// A server that reads one request, writes `bytes` verbatim, then closes or stalls.
pub async fn raw_server(bytes: String, after: After) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let hang = matches!(after, After::Hang);
    tokio::spawn(async move {
        while let Ok((mut socket, _)) = listener.accept().await {
            let bytes = bytes.clone();
            tokio::spawn(async move {
                let mut seen = Vec::new();
                let mut buf = vec![0u8; 16384];
                loop {
                    let n = socket.read(&mut buf).await.unwrap_or(0);
                    if n == 0 {
                        break;
                    }
                    seen.extend_from_slice(&buf[..n]);
                    if let Some(pos) = seen.windows(4).position(|w| w == b"\r\n\r\n") {
                        let head = String::from_utf8_lossy(&seen[..pos]).to_lowercase();
                        let len = head
                            .lines()
                            .find_map(|l| l.strip_prefix("content-length:"))
                            .and_then(|v| v.trim().parse::<usize>().ok())
                            .unwrap_or(0);
                        if seen.len() >= pos + 4 + len {
                            break;
                        }
                    }
                }
                let _ = socket.write_all(bytes.as_bytes()).await;
                let _ = socket.flush().await;
                if hang {
                    tokio::time::sleep(Duration::from_secs(30)).await;
                }
            });
        }
    });
    format!("http://{addr}")
}
