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
    pub conversation_history: Arc<RwLock<Vec<TranscriptSegment>>>,
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
        _trigger_llm_fn: impl Fn(String) + Send + Sync + 'static,
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
            
            // Check average RMS of the segment to skip silent frames
            let rms_energy = if !segment.samples.is_empty() {
                let sum: f32 = segment.samples.iter().map(|&s| s * s).sum();
                (sum / (segment.samples.len() as f32)).sqrt()
            } else {
                0.0
            };

            // Only skip if practically silent (< 0.0018 RMS) or completely empty (< 0.18s)
            if duration_secs < 0.18 || rms_energy < 0.0018 {
                continue;
            }

            info!(
                "Transcribing speech segment from {} ({:.2}s, {} samples, RMS={:.4})",
                speaker,
                duration_secs,
                segment.samples.len(),
                rms_energy
            );

            // Execute transcription via selected STT provider
            let transcript_result = if config.stt_provider == "deepgram" && !config.deepgram_api_key.is_empty() {
                let deepgram = DeepgramClient::new(config.deepgram_api_key.clone());
                deepgram.transcribe_buffer(&segment.samples, &config.stt_language).await
            } else if !config.openai_api_key.is_empty() {
                super::whisper::transcribe_with_cloud_whisper(
                    &config.openai_api_key,
                    &config.openai_base_url,
                    &segment.samples,
                    &config.stt_language,
                ).await
            } else if !config.whisper_model_path.is_empty() {
                let whisper = LocalWhisperEngine::new(Some(std::path::PathBuf::from(&config.whisper_model_path)));
                whisper.transcribe(&segment.samples)
            } else {
                warn!("No active STT provider available. Configure OpenAI API Key or Deepgram Key in Settings.");
                Err("No STT key configured in Settings or .env".to_string())
            };

            match transcript_result {
                Ok(text) => {
                    let cleaned_text = text.trim().to_string();
                    if cleaned_text.is_empty() {
                        continue;
                    }

                    info!("✓ STT Transcribed for {}: '{}' ({:.2}s)", speaker, cleaned_text, duration_secs);

                    let mut hist = history.write();
                    let should_merge = if let Some(last) = hist.last() {
                        if last.speaker == speaker {
                            let prev_text = last.text.trim();
                            let ends_with_terminal = (prev_text.ends_with('.') && !prev_text.ends_with("..."))
                                || prev_text.ends_with('?')
                                || prev_text.ends_with('!');
                            let continues_thought = prev_text.ends_with(',') || prev_text.ends_with("...") || prev_text.ends_with('-');
                            
                            // Merge consecutive speech from the same speaker to prevent sentence fragmentation
                            !ends_with_terminal || continues_thought || (segment.speaker_is_interviewer && duration_secs < 14.0)
                        } else {
                            false
                        }
                    } else {
                        false
                    };

                    let transcript_segment = if should_merge && !hist.is_empty() {
                        let last_idx = hist.len() - 1;
                        let last = &mut hist[last_idx];
                        let mut merged_text = last.text.trim().to_string();
                        if merged_text.ends_with("...") {
                            merged_text.truncate(merged_text.len() - 3);
                        } else if merged_text.ends_with('-') || merged_text.ends_with(',') {
                            merged_text.truncate(merged_text.len() - 1);
                        }
                        merged_text = format!("{} {}", merged_text.trim(), cleaned_text);
                        last.text = merged_text;
                        last.duration_secs += duration_secs;
                        last.timestamp = Utc::now().format("%H:%M:%S").to_string();
                        info!("✓ Merged continuous sentence for {}: '{}'", speaker, last.text);
                        last.clone()
                    } else {
                        let segment_id = uuid::Uuid::new_v4().to_string();
                        let timestamp = Utc::now().format("%H:%M:%S").to_string();
                        let new_seg = TranscriptSegment {
                            id: segment_id,
                            speaker: speaker.to_string(),
                            text: cleaned_text.clone(),
                            timestamp,
                            is_final: true,
                            confidence: 0.95,
                            duration_secs,
                        };
                        hist.push(new_seg.clone());
                        if hist.len() > 50 {
                            hist.remove(0);
                        }
                        new_seg
                    };
                    drop(hist);

                    // Emit transcript-event to frontend
                    let _ = app_handle.emit_to("main", "transcript-event", &transcript_segment);
                    let _ = app_handle.emit("transcript-event", &transcript_segment);
                }
                Err(err) => {
                    warn!("STT transcription error for {}: {}", speaker, err);
                    let err_segment = TranscriptSegment {
                        id: uuid::Uuid::new_v4().to_string(),
                        speaker: "System".to_string(),
                        text: format!("[STT Error]: {}", err),
                        timestamp: Utc::now().format("%H:%M:%S").to_string(),
                        is_final: true,
                        confidence: 0.0,
                        duration_secs,
                    };
                    let _ = app_handle.emit_to("main", "transcript-event", &err_segment);
                    let _ = app_handle.emit("transcript-event", &err_segment);
                }
            }
        }

        info!("STT background worker loop terminated.");
    }
}
