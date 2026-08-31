use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use crossbeam_channel::Sender;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig};
use log::{error, info, warn};
use tauri::{AppHandle, Emitter};

use super::resample::process_raw_audio;
use super::vad::{VadDetector, VadSegment, VAD_FRAME_SIZE};
use crate::config::AppConfig;

pub struct AudioCaptureManager {
    is_running: Arc<AtomicBool>,
    mic_stream: Option<Stream>,
    loopback_stream: Option<Stream>,
}

unsafe impl Send for AudioCaptureManager {}
unsafe impl Sync for AudioCaptureManager {}

#[derive(Clone, serde::Serialize)]
pub struct AudioLevelPayload {
    pub mic_level: f32,
    pub loopback_level: f32,
    pub mic_active: bool,
    pub loopback_active: bool,
}

impl AudioCaptureManager {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            mic_stream: None,
            loopback_stream: None,
        }
    }

    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    pub fn stop(&mut self) {
        info!("Stopping audio capture streams...");
        self.is_running.store(false, Ordering::SeqCst);
        self.mic_stream = None;
        self.loopback_stream = None;
    }

    pub fn start(
        &mut self,
        app_handle: AppHandle,
        config: &AppConfig,
        segment_sender: Sender<VadSegment>,
    ) -> Result<(), String> {
        self.stop();

        info!("Starting dual-channel audio capture...");
        self.is_running.store(true, Ordering::SeqCst);

        let host = cpal::default_host();

        // 1. Setup Candidate Microphone Stream
        if config.mic_enabled {
            match self.setup_mic_stream(
                &host,
                config.audio_input_device.as_deref(),
                config.vad_sensitivity,
                config.vad_speech_threshold_ms,
                config.vad_silence_cutoff_ms,
                app_handle.clone(),
                segment_sender.clone(),
            ) {
                Ok(stream) => {
                    if let Err(e) = stream.play() {
                        warn!("Failed to start mic stream: {}", e);
                    } else {
                        info!("Microphone capture stream successfully started.");
                        self.mic_stream = Some(stream);
                    }
                }
                Err(e) => {
                    warn!("Microphone setup failed: {}", e);
                }
            }
        }

        // 2. Setup Interviewer Loopback Stream (System Audio)
        if config.loopback_enabled {
            match self.setup_loopback_stream(
                &host,
                config.audio_output_device.as_deref(),
                config.vad_sensitivity,
                config.vad_speech_threshold_ms,
                config.vad_silence_cutoff_ms,
                app_handle,
                segment_sender,
            ) {
                Ok(stream) => {
                    if let Err(e) = stream.play() {
                        warn!("Failed to start loopback stream: {}", e);
                    } else {
                        info!("System loopback audio capture stream successfully started.");
                        self.loopback_stream = Some(stream);
                    }
                }
                Err(e) => {
                    warn!("Loopback stream setup failed: {}", e);
                }
            }
        }

        Ok(())
    }

    fn setup_mic_stream(
        &self,
        host: &cpal::Host,
        device_name: Option<&str>,
        vad_thresh: f32,
        min_speech_ms: u64,
        silence_ms: u64,
        app_handle: AppHandle,
        segment_sender: Sender<VadSegment>,
    ) -> Result<Stream, String> {
        let device = match device_name {
            Some(name) => host
                .input_devices()
                .map_err(|e| e.to_string())?
                .find(|d| d.name().map(|n| n == name).unwrap_or(false))
                .ok_or_else(|| format!("Input device '{}' not found", name))?,
            None => host
                .default_input_device()
                .ok_or_else(|| "No default input audio device found".to_string())?,
        };

        let default_config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get default input config: {}", e))?;

        let sample_format = default_config.sample_format();
        let channels = default_config.channels();
        let sample_rate = default_config.sample_rate().0;
        let stream_config: StreamConfig = default_config.into();

        let mut vad = VadDetector::new(false, vad_thresh, min_speech_ms, silence_ms);
        let mut sample_accumulator: Vec<f32> = Vec::with_capacity(VAD_FRAME_SIZE * 4);

        let err_fn = |err| error!("Error occurred on mic audio stream: {}", err);

        let stream = match sample_format {
            SampleFormat::F32 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| {
                        let pcm16k = process_raw_audio(data, channels, sample_rate);
                        sample_accumulator.extend_from_slice(&pcm16k);

                        while sample_accumulator.len() >= VAD_FRAME_SIZE {
                            let frame: Vec<f32> = sample_accumulator.drain(..VAD_FRAME_SIZE).collect();
                            let (segment_opt, rms, is_active) = vad.process_frame(&frame);

                            // Send level updates to UI
                            let _ = app_handle.emit(
                                "audio-mic-level",
                                serde_json::json!({
                                    "level": (rms * 12.0).min(1.0),
                                    "active": is_active,
                                    "speaker": "Candidate"
                                }),
                            );

                            if let Some(segment) = segment_opt {
                                let _ = segment_sender.send(segment);
                            }
                        }
                    },
                    err_fn,
                    None,
                )
            }
            SampleFormat::I16 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[i16], _| {
                        let f32_data: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                        let pcm16k = process_raw_audio(&f32_data, channels, sample_rate);
                        sample_accumulator.extend_from_slice(&pcm16k);

                        while sample_accumulator.len() >= VAD_FRAME_SIZE {
                            let frame: Vec<f32> = sample_accumulator.drain(..VAD_FRAME_SIZE).collect();
                            let (segment_opt, rms, is_active) = vad.process_frame(&frame);

                            let _ = app_handle.emit(
                                "audio-mic-level",
                                serde_json::json!({
                                    "level": (rms * 12.0).min(1.0),
                                    "active": is_active,
                                    "speaker": "Candidate"
                                }),
                            );

                            if let Some(segment) = segment_opt {
                                let _ = segment_sender.send(segment);
                            }
                        }
                    },
                    err_fn,
                    None,
                )
            }
            SampleFormat::U16 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[u16], _| {
                        let f32_data: Vec<f32> = data.iter().map(|&s| (s as f32 - 32768.0) / 32768.0).collect();
                        let pcm16k = process_raw_audio(&f32_data, channels, sample_rate);
                        sample_accumulator.extend_from_slice(&pcm16k);

                        while sample_accumulator.len() >= VAD_FRAME_SIZE {
                            let frame: Vec<f32> = sample_accumulator.drain(..VAD_FRAME_SIZE).collect();
                            let (segment_opt, rms, is_active) = vad.process_frame(&frame);

                            let _ = app_handle.emit(
                                "audio-mic-level",
                                serde_json::json!({
                                    "level": (rms * 12.0).min(1.0),
                                    "active": is_active,
                                    "speaker": "Candidate"
                                }),
                            );

                            if let Some(segment) = segment_opt {
                                let _ = segment_sender.send(segment);
                            }
                        }
                    },
                    err_fn,
                    None,
                )
            }
            _ => return Err("Unsupported mic sample format".to_string()),
        }.map_err(|e| format!("Failed to build mic stream: {}", e))?;

        Ok(stream)
    }

    fn setup_loopback_stream(
        &self,
        host: &cpal::Host,
        device_name: Option<&str>,
        vad_thresh: f32,
        min_speech_ms: u64,
        silence_ms: u64,
        app_handle: AppHandle,
        segment_sender: Sender<VadSegment>,
    ) -> Result<Stream, String> {
        // For Windows WASAPI Loopback, output device can be captured as an input stream
        let device = match device_name {
            Some(name) => host
                .output_devices()
                .map_err(|e| e.to_string())?
                .find(|d| d.name().map(|n| n == name).unwrap_or(false))
                .ok_or_else(|| format!("Output device '{}' not found", name))?,
            None => host
                .default_output_device()
                .ok_or_else(|| "No default output audio device found".to_string())?,
        };

        let default_config = device
            .default_output_config()
            .map_err(|e| format!("Failed to get default output config for loopback: {}", e))?;

        let sample_format = default_config.sample_format();
        let channels = default_config.channels();
        let sample_rate = default_config.sample_rate().0;
        let stream_config: StreamConfig = default_config.into();

        let mut vad = VadDetector::new(true, vad_thresh, min_speech_ms, silence_ms);
        let mut sample_accumulator: Vec<f32> = Vec::with_capacity(VAD_FRAME_SIZE * 4);

        let err_fn = |err| error!("Error occurred on loopback audio stream: {}", err);

        // On Windows cpal, loopback streams on output devices are built via build_input_stream
        let stream = match sample_format {
            SampleFormat::F32 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| {
                        let pcm16k = process_raw_audio(data, channels, sample_rate);
                        sample_accumulator.extend_from_slice(&pcm16k);

                        while sample_accumulator.len() >= VAD_FRAME_SIZE {
                            let frame: Vec<f32> = sample_accumulator.drain(..VAD_FRAME_SIZE).collect();
                            let (segment_opt, rms, is_active) = vad.process_frame(&frame);

                            let _ = app_handle.emit(
                                "audio-loopback-level",
                                serde_json::json!({
                                    "level": (rms * 12.0).min(1.0),
                                    "active": is_active,
                                    "speaker": "Interviewer"
                                }),
                            );

                            if let Some(segment) = segment_opt {
                                let _ = segment_sender.send(segment);
                            }
                        }
                    },
                    err_fn,
                    None,
                )
            }
            SampleFormat::I16 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[i16], _| {
                        let f32_data: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                        let pcm16k = process_raw_audio(&f32_data, channels, sample_rate);
                        sample_accumulator.extend_from_slice(&pcm16k);

                        while sample_accumulator.len() >= VAD_FRAME_SIZE {
                            let frame: Vec<f32> = sample_accumulator.drain(..VAD_FRAME_SIZE).collect();
                            let (segment_opt, rms, is_active) = vad.process_frame(&frame);

                            let _ = app_handle.emit(
                                "audio-loopback-level",
                                serde_json::json!({
                                    "level": (rms * 12.0).min(1.0),
                                    "active": is_active,
                                    "speaker": "Interviewer"
                                }),
                            );

                            if let Some(segment) = segment_opt {
                                let _ = segment_sender.send(segment);
                            }
                        }
                    },
                    err_fn,
                    None,
                )
            }
            _ => return Err("Unsupported loopback sample format".to_string()),
        }.map_err(|e| format!("Failed to build loopback stream: {}", e))?;

        Ok(stream)
    }
}
