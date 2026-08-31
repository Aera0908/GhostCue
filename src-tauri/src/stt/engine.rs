use std::sync::Arc;
use chrono::Utc;
use crossbeam_channel::Receiver;
use log::{info, warn};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::audio::vad::VadSegment;
use crate::config::AppConfig;
use super::deepgram::DeepgramClient;
use super::whisper::LocalWhisperEngine;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub id: String,
    pub speaker: String, // "Interviewer" | "Candidate"
    pub text: String,
    pub timestamp: String,
    pub is_final: bool,
    pub confidence: f32,
    pub duration_secs: f32,
}

pub struct SttEngineManager {
    conversation_history: Arc<RwLock<Vec<TranscriptSegment>>>,
}

impl SttEngineManager {
    pub fn new() -> Self {
        Self {
            conversation_history: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn get_history(&self) -> Vec<TranscriptSegment> {
        self.conversation_history.read().clone()
    }

    pub fn clear_history(&self) {
        self.conversation_history.write().clear();
    }

    pub fn add_segment(&self, segment: TranscriptSegment) {
        let mut history = self.conversation_history.write();
        history.push(segment);
        // Keep max 50 turns in rolling buffer
        if history.len() > 50 {
            history.remove(0);
        }
    }

    /// Background worker loop processing completed VAD segments
    pub async fn run_worker(
        app_handle: AppHandle,
        receiver: Receiver<VadSegment>,
        history: Arc<RwLock<Vec<TranscriptSegment>>>,
        get_config_fn: impl Fn() -> AppConfig + Send + Sync + 'static,
        trigger_llm_fn: impl Fn(String) + Send + Sync + 'static,
    ) {
        info!("STT background worker loop started.");

        while let Ok(segment) = receiver.recv() {
            let config = get_config_fn();
            let speaker = if segment.speaker_is_interviewer {
                "Interviewer"
            } else {
                "Candidate"
            };

            let duration_secs = segment.duration.as_secs_f32();
            info!(
                "Processing speech segment from {} ({:.2}s, {} samples)",
                speaker,
                duration_secs,
                segment.samples.len()
            );

            // Execute transcription via selected STT provider
            let transcript_result = if config.stt_provider == "deepgram" && !config.deepgram_api_key.is_empty() {
                let deepgram = DeepgramClient::new(config.deepgram_api_key.clone());
                deepgram.transcribe_buffer(&segment.samples).await
            } else {
                // Whisper or fallback simulation
                let whisper = LocalWhisperEngine::new(if config.whisper_model_path.is_empty() {
                    None
                } else {
                    Some(std::path::PathBuf::from(&config.whisper_model_path))
                });
                whisper.transcribe(&segment.samples)
            };

            match transcript_result {
                Ok(text) => {
                    let cleaned_text = text.trim().to_string();
                    if cleaned_text.is_empty() {
                        continue;
                    }

                    let segment_id = uuid::Uuid::new_v4().to_string();
                    let timestamp = Utc::now().format("%H:%M:%S").to_string();

                    let transcript_segment = TranscriptSegment {
                        id: segment_id.clone(),
                        speaker: speaker.to_string(),
                        text: cleaned_text.clone(),
                        timestamp,
                        is_final: true,
                        confidence: 0.95,
                        duration_secs,
                    };

                    // Append to shared rolling history
                    {
                        let mut hist = history.write();
                        hist.push(transcript_segment.clone());
                        if hist.len() > 50 {
                            hist.remove(0);
                        }
                    }

                    // Emit transcript-event to frontend
                    let _ = app_handle.emit("transcript-event", &transcript_segment);

                    // Auto-trigger LLM heuristic:
                    // If interviewer speaks and ends with a question, trigger suggestion
                    if config.auto_trigger_enabled && segment.speaker_is_interviewer {
                        let is_question = cleaned_text.contains('?')
                            || cleaned_text.to_lowercase().starts_with("how")
                            || cleaned_text.to_lowercase().starts_with("what")
                            || cleaned_text.to_lowercase().starts_with("why")
                            || cleaned_text.to_lowercase().starts_with("can you")
                            || cleaned_text.to_lowercase().starts_with("tell me")
                            || cleaned_text.to_lowercase().starts_with("explain")
                            || cleaned_text.to_lowercase().starts_with("describe");

                        if is_question || cleaned_text.len() > 20 {
                            info!("Auto-trigger condition met for interviewer question: '{}'", cleaned_text);
                            trigger_llm_fn(cleaned_text);
                        }
                    }
                }
                Err(err) => {
                    warn!("STT transcription error: {}", err);
                }
            }
        }

        info!("STT background worker loop terminated.");
    }
}
