use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::Deserialize;

pub struct DeepgramClient {
    api_key: String,
    http_client: reqwest::Client,
}

#[derive(Debug, Deserialize)]
struct DeepgramResponse {
    results: Option<DeepgramResults>,
}

#[derive(Debug, Deserialize)]
struct DeepgramResults {
    channels: Option<Vec<DeepgramChannel>>,
}

#[derive(Debug, Deserialize)]
struct DeepgramChannel {
    alternatives: Option<Vec<DeepgramAlternative>>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct DeepgramAlternative {
    transcript: Option<String>,
    confidence: Option<f64>,
}

impl DeepgramClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            http_client: reqwest::Client::new(),
        }
    }

    /// Encode 16kHz f32 samples to 16-bit linear PCM byte buffer (WAV or raw PCM)
    pub fn samples_to_pcm16_bytes(samples: &[f32]) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(samples.len() * 2);
        for &s in samples {
            let clamped = s.clamp(-1.0, 1.0);
            let sample_i16 = (clamped * 32767.0) as i16;
            bytes.extend_from_slice(&sample_i16.to_le_bytes());
        }
        bytes
    }

    /// Transcribe 16kHz mono audio buffer via Deepgram Nova-2 API
    pub async fn transcribe_buffer(&self, samples: &[f32]) -> Result<String, String> {
        if self.api_key.trim().is_empty() {
            return Err("Deepgram API key is empty".to_string());
        }

        let pcm_bytes = Self::samples_to_pcm16_bytes(samples);
        if pcm_bytes.is_empty() {
            return Ok(String::new());
        }

        let url = "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&language=en";

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Token {}", self.api_key))
                .map_err(|e| format!("Invalid auth header: {}", e))?,
        );
        headers.insert(
            CONTENT_TYPE,
            HeaderValue::from_static("audio/raw;encoding=linear16;sample_rate=16000;channels=1"),
        );

        let response = self
            .http_client
            .post(url)
            .headers(headers)
            .body(pcm_bytes)
            .send()
            .await
            .map_err(|e| format!("Deepgram request failed: {}", e))?;

        if !response.status().is_success() {
            let err_text = response.text().await.unwrap_or_default();
            return Err(format!("Deepgram API returned error: {}", err_text));
        }

        let json_body: DeepgramResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Deepgram response: {}", e))?;

        let transcript = json_body
            .results
            .and_then(|r| r.channels)
            .and_then(|ch| ch.into_iter().next())
            .and_then(|c| c.alternatives)
            .and_then(|alts| alts.into_iter().next())
            .and_then(|a| a.transcript)
            .unwrap_or_default();

        Ok(transcript.trim().to_string())
    }
}
