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

        loop {
            let segment = match receiver.try_recv() {
                Ok(seg) => seg,
                Err(crossbeam_channel::TryRecvError::Empty) => {
                    tokio::time::sleep(std::time::Duration::from_millis(35)).await;
                    continue;
                }
                Err(crossbeam_channel::TryRecvError::Disconnected) => {
                    info!("STT channel disconnected, worker shutting down.");
                    break;
                }
            };

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

            // Skip frames below silence or minimum duration threshold (allows fast short questions)
            if duration_secs < 0.14 || rms_energy < 0.0010 {
                continue;
            }

            info!(
                "Transcribing speech segment from {} ({:.2}s, {} samples, RMS={:.4})",
                speaker,
                duration_secs,
                segment.samples.len(),
                rms_energy
            );

            // Run transcription with configured STT provider
            let transcript_result = if config.stt_provider == "groq" || (config.stt_provider == "cloud_whisper" && !config.groq_api_key.is_empty() && config.openai_api_key.is_empty()) {
                super::whisper::transcribe_with_groq_whisper(
                    &config.groq_api_key,
                    &config.groq_whisper_model,
                    &segment.samples,
                    &config.stt_language,
                ).await
            } else if config.stt_provider == "openrouter" {
                super::whisper::transcribe_with_openrouter(
                    &config.openrouter_api_key,
                    "google/gemini-2.5-flash",
                    &segment.samples,
                    &config.stt_language,
                ).await
            } else if config.stt_provider == "deepgram" && !config.deepgram_api_key.is_empty() {
                let deepgram = DeepgramClient::new(config.deepgram_api_key.clone());
                deepgram.transcribe_buffer(&segment.samples, &config.stt_language).await
            } else if config.stt_provider == "local_whisper" || !config.whisper_model_path.is_empty() {
                let samples = segment.samples.clone();
                let m_path = config.whisper_model_path.clone();
                let m_size = config.whisper_model_size.clone();
                let lang = config.stt_language.clone();

                tokio::task::spawn_blocking(move || {
                    let preferred = if !m_path.is_empty() { Some(std::path::Path::new(&m_path)) } else { None };
                    let valid_path = super::whisper::find_valid_model_path(preferred, &m_size);
                    let whisper = LocalWhisperEngine::new(valid_path);
                    whisper.transcribe(&samples, &lang)
                }).await.unwrap_or_else(|e| Err(format!("Whisper task failed: {}", e)))
            } else if !config.openai_api_key.is_empty() {
                super::whisper::transcribe_with_cloud_whisper(
                    &config.openai_api_key,
                    &config.openai_base_url,
                    &segment.samples,
                    &config.stt_language,
                ).await
            } else if !config.groq_api_key.is_empty() {
                super::whisper::transcribe_with_groq_whisper(
                    &config.groq_api_key,
                    &config.groq_whisper_model,
                    &segment.samples,
                    &config.stt_language,
                ).await
            } else if !config.openrouter_api_key.is_empty() {
                super::whisper::transcribe_with_openrouter(
                    &config.openrouter_api_key,
                    "google/gemini-2.5-flash",
                    &segment.samples,
                    &config.stt_language,
                ).await
            } else {
                // If any local model exists in APPDATA models, automatically use it!
                let samples = segment.samples.clone();
                let lang = config.stt_language.clone();
                let auto_local = tokio::task::spawn_blocking(move || {
                    let valid_path = super::whisper::find_valid_model_path(None, "base.en");
                    if let Some(m) = valid_path {
                        let whisper = LocalWhisperEngine::new(Some(m));
                        whisper.transcribe(&samples, &lang)
                    } else {
                        Err("No active STT provider available. Configure Local Whisper GGML, Groq (free), OpenRouter, or Deepgram in Settings.".to_string())
                    }
                }).await.unwrap_or_else(|e| Err(format!("Local Whisper error: {}", e)));

                auto_local
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
                            
                            // NEVER merge if previous segment ended with terminal punctuation (especially '?') and does not continue thought
                            if ends_with_terminal && !continues_thought {
                                false
                            } else if continues_thought {
                                last.duration_secs + duration_secs < 25.0
                            } else {
                                // Incomplete sentence without terminal punctuation: merge only within reasonable phrase duration (< 18s)
                                last.duration_secs + duration_secs < 18.0
                            }
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
