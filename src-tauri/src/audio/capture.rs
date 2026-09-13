use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use crossbeam_channel::Sender;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig, SupportedStreamConfig};
use log::{error, info, warn};
use tauri::{AppHandle, Emitter};

use super::resample::process_raw_audio;
use super::vad::{VadDetector, VadSegment, VAD_FRAME_SIZE};
use crate::config::AppConfig;
use std::sync::atomic::AtomicU32;

/// Shared atomic storage for current audio levels (for polling fallback)
pub static CURRENT_MIC_LEVEL: AtomicU32 = AtomicU32::new(0);
pub static CURRENT_MIC_ACTIVE: AtomicBool = AtomicBool::new(false);
pub static CURRENT_LOOPBACK_LEVEL: AtomicU32 = AtomicU32::new(0);
pub static CURRENT_LOOPBACK_ACTIVE: AtomicBool = AtomicBool::new(false);

pub struct AudioCaptureManager {
    is_running: Arc<AtomicBool>,
    mic_stream: Option<Stream>,
    loopback_stream: Option<Stream>,
}

unsafe impl Send for AudioCaptureManager {}
unsafe impl Sync for AudioCaptureManager {}

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

        info!("=== Starting dual-channel audio capture ===");
        info!("  mic_enabled={}, loopback_enabled={}", config.mic_enabled, config.loopback_enabled);
        info!("  audio_input_device={:?}, audio_output_device={:?}", config.audio_input_device, config.audio_output_device);
        info!("  vad_sensitivity={}, speech_threshold_ms={}, silence_cutoff_ms={}", 
            config.vad_sensitivity, config.vad_speech_threshold_ms, config.vad_silence_cutoff_ms);
        self.is_running.store(true, Ordering::SeqCst);

        let host = cpal::default_host();
        info!("  CPAL host: {:?}", host.id());

        // Log available devices for diagnosis
        if let Ok(input_devs) = host.input_devices() {
            let names: Vec<String> = input_devs.filter_map(|d| d.name().ok()).collect();
            info!("  Available input devices: {:?}", names);
        }
        if let Ok(output_devs) = host.output_devices() {
            let names: Vec<String> = output_devs.filter_map(|d| d.name().ok()).collect();
            info!("  Available output devices: {:?}", names);
        }
        if let Some(d) = host.default_input_device() {
            info!("  System default input: {:?}", d.name().unwrap_or_default());
        } else {
            warn!("  NO system default input device found!");
        }
        if let Some(d) = host.default_output_device() {
            info!("  System default output: {:?}", d.name().unwrap_or_default());
        } else {
            warn!("  NO system default output device found!");
        }

        // 1. Microphone stream
        if config.mic_enabled {
            info!("  Setting up microphone stream...");
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
                        warn!("  FAILED to play mic stream: {}", e);
                    } else {
                        info!("  ✓ Microphone capture stream STARTED successfully.");
                        self.mic_stream = Some(stream);
                    }
                }
                Err(e) => {
                    warn!("  ✗ Microphone setup FAILED: {}", e);
                }
            }
        } else {
            info!("  Microphone disabled in config, skipping.");
        }

        // 2. Loopback audio stream
        if config.loopback_enabled {
            info!("  Setting up loopback stream...");
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
                        warn!("  FAILED to play loopback stream: {}", e);
                    } else {
                        info!("  ✓ System loopback capture stream STARTED successfully.");
                        self.loopback_stream = Some(stream);
                    }
                }
                Err(e) => {
                    warn!("  ✗ Loopback stream setup FAILED: {}", e);
                }
            }
        } else {
            info!("  Loopback disabled in config, skipping.");
        }

        info!("=== Audio capture setup complete. mic_stream={}, loopback_stream={} ===", 
            self.mic_stream.is_some(), self.loopback_stream.is_some());
        Ok(())
    }

    fn resolve_input_device(&self, host: &cpal::Host, device_name: Option<&str>) -> Result<Device, String> {
        if let Some(name) = device_name {
            let trimmed = name.trim();
            if !trimmed.is_empty() && trimmed != "default" {
                if let Ok(devices) = host.input_devices() {
                    for d in devices {
                        if let Ok(d_name) = d.name() {
                            if d_name == trimmed || d_name.contains(trimmed) || trimmed.contains(&d_name) {
                                info!("Found requested input device: '{}'", d_name);
                                return Ok(d);
                            }
                        }
                    }
                }
                warn!("Named input device '{}' not found, falling back to system default.", trimmed);
            }
        }

        if let Some(dev) = host.default_input_device() {
            if let Ok(name) = dev.name() {
                info!("Using Windows default input microphone: '{}'", name);
            }
            return Ok(dev);
        }

        if let Ok(mut devices) = host.input_devices() {
            if let Some(dev) = devices.next() {
                return Ok(dev);
            }
        }

        Err("No default input audio device found on system".to_string())
    }

    fn resolve_output_device(&self, host: &cpal::Host, device_name: Option<&str>) -> Result<Device, String> {
        if let Some(name) = device_name {
            let trimmed = name.trim();
            if !trimmed.is_empty() && trimmed != "default" {
                if let Ok(devices) = host.output_devices() {
                    for d in devices {
                        if let Ok(d_name) = d.name() {
                            if d_name == trimmed || d_name.contains(trimmed) || trimmed.contains(&d_name) {
                                info!("Found requested output device: '{}'", d_name);
                                return Ok(d);
                            }
                        }
                    }
                }
                warn!("Named output device '{}' not found, falling back to system default.", trimmed);
            }
        }

        if let Some(dev) = host.default_output_device() {
            if let Ok(name) = dev.name() {
                info!("Using Windows default output loopback device: '{}'", name);
            }
            return Ok(dev);
        }

        if let Ok(mut devices) = host.output_devices() {
            if let Some(dev) = devices.next() {
                return Ok(dev);
            }
        }

        Err("No default output audio device found on system".to_string())
    }

    fn get_device_input_config(&self, device: &Device) -> Result<SupportedStreamConfig, String> {
        if let Ok(cfg) = device.default_input_config() {
            return Ok(cfg);
        }
        // Fallback to first supported config
        let mut supported = device
            .supported_input_configs()
            .map_err(|e| format!("Failed to get supported input configs: {}", e))?;
        supported
            .next()
            .map(|c| c.with_max_sample_rate())
            .ok_or_else(|| "No supported input stream configs available".to_string())
    }

    fn get_device_output_config(&self, device: &Device) -> Result<SupportedStreamConfig, String> {
        if let Ok(cfg) = device.default_output_config() {
            return Ok(cfg);
        }
        let mut supported = device
            .supported_output_configs()
            .map_err(|e| format!("Failed to get supported output configs: {}", e))?;
        supported
            .next()
            .map(|c| c.with_max_sample_rate())
            .ok_or_else(|| "No supported output stream configs available".to_string())
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
        let device = self.resolve_input_device(host, device_name)?;
        let device_name_str = device.name().unwrap_or_else(|_| "Unknown Mic".to_string());
        let default_config = self.get_device_input_config(&device)?;

        let sample_format = default_config.sample_format();
        let channels = default_config.channels();
        let sample_rate = default_config.sample_rate().0;
        let stream_config: StreamConfig = default_config.into();

        info!(
            "Configuring Mic Stream on '{}': format={:?}, channels={}, rate={}",
            device_name_str, sample_format, channels, sample_rate
        );

        let mut vad = VadDetector::new(false, vad_thresh, min_speech_ms, silence_ms);
        let mut sample_accumulator: Vec<f32> = Vec::with_capacity(VAD_FRAME_SIZE * 4);

        let err_fn = |err| error!("Error occurred on mic audio stream: {}", err);

        let stream = match sample_format {
            SampleFormat::F32 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| {
                        Self::handle_audio_samples(
                            data,
                            channels,
                            sample_rate,
                            &mut sample_accumulator,
                            &mut vad,
                            &app_handle,
                            &segment_sender,
                            "audio-mic-level",
                            "Candidate",
                        );
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
                        Self::handle_audio_samples(
                            &f32_data,
                            channels,
                            sample_rate,
                            &mut sample_accumulator,
                            &mut vad,
                            &app_handle,
                            &segment_sender,
                            "audio-mic-level",
                            "Candidate",
                        );
                    },
                    err_fn,
                    None,
                )
            }
            SampleFormat::I32 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[i32], _| {
                        let f32_data: Vec<f32> = data.iter().map(|&s| s as f32 / 2147483648.0).collect();
                        Self::handle_audio_samples(
                            &f32_data,
                            channels,
                            sample_rate,
                            &mut sample_accumulator,
                            &mut vad,
                            &app_handle,
                            &segment_sender,
                            "audio-mic-level",
                            "Candidate",
                        );
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
                        Self::handle_audio_samples(
                            &f32_data,
                            channels,
                            sample_rate,
                            &mut sample_accumulator,
                            &mut vad,
                            &app_handle,
                            &segment_sender,
                            "audio-mic-level",
                            "Candidate",
                        );
                    },
                    err_fn,
                    None,
                )
            }
            SampleFormat::I8 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[i8], _| {
                        let f32_data: Vec<f32> = data.iter().map(|&s| s as f32 / 128.0).collect();
                        Self::handle_audio_samples(
                            &f32_data,
                            channels,
                            sample_rate,
                            &mut sample_accumulator,
                            &mut vad,
                            &app_handle,
                            &segment_sender,
                            "audio-mic-level",
                            "Candidate",
                        );
                    },
                    err_fn,
                    None,
                )
            }
            SampleFormat::U8 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[u8], _| {
                        let f32_data: Vec<f32> = data.iter().map(|&s| (s as f32 - 128.0) / 128.0).collect();
                        Self::handle_audio_samples(
                            &f32_data,
                            channels,
                            sample_rate,
                            &mut sample_accumulator,
                            &mut vad,
                            &app_handle,
                            &segment_sender,
                            "audio-mic-level",
                            "Candidate",
                        );
                    },
                    err_fn,
                    None,
                )
            }
            SampleFormat::F64 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[f64], _| {
                        let f32_data: Vec<f32> = data.iter().map(|&s| s as f32).collect();
                        Self::handle_audio_samples(
                            &f32_data,
                            channels,
                            sample_rate,
                            &mut sample_accumulator,
                            &mut vad,
                            &app_handle,
                            &segment_sender,
                            "audio-mic-level",
                            "Candidate",
                        );
                    },
                    err_fn,
                    None,
                )
            }
            _ => return Err(format!("Unsupported mic sample format: {:?}", sample_format)),
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
        let device = self.resolve_output_device(host, device_name)?;
        let device_name_str = device.name().unwrap_or_else(|_| "Unknown Speaker".to_string());
        let default_config = self.get_device_output_config(&device)?;

        let sample_format = default_config.sample_format();
        let channels = default_config.channels();
        let sample_rate = default_config.sample_rate().0;
        let stream_config: StreamConfig = default_config.into();

        info!(
            "Configuring Loopback Stream on '{}': format={:?}, channels={}, rate={}",
            device_name_str, sample_format, channels, sample_rate
        );

        let mut vad = VadDetector::new(true, vad_thresh, min_speech_ms, silence_ms);
        let mut sample_accumulator: Vec<f32> = Vec::with_capacity(VAD_FRAME_SIZE * 4);

        let err_fn = |err| error!("Error occurred on loopback audio stream: {}", err);

        // In Windows CPAL WASAPI, build_input_stream on an output device creates a loopback stream
        let stream = match sample_format {
            SampleFormat::F32 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| {
                        Self::handle_audio_samples(
                            data,
                            channels,
                            sample_rate,
                            &mut sample_accumulator,
                            &mut vad,
                            &app_handle,
                            &segment_sender,
                            "audio-loopback-level",
                            "Interviewer",
                        );
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
                        Self::handle_audio_samples(
                            &f32_data,
                            channels,
                            sample_rate,
                            &mut sample_accumulator,
                            &mut vad,
                            &app_handle,
                            &segment_sender,
                            "audio-loopback-level",
                            "Interviewer",
                        );
                    },
                    err_fn,
                    None,
                )
            }
            SampleFormat::I32 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[i32], _| {
                        let f32_data: Vec<f32> = data.iter().map(|&s| s as f32 / 2147483648.0).collect();
                        Self::handle_audio_samples(
                            &f32_data,
                            channels,
                            sample_rate,
                            &mut sample_accumulator,
                            &mut vad,
                            &app_handle,
                            &segment_sender,
                            "audio-loopback-level",
                            "Interviewer",
                        );
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
                        Self::handle_audio_samples(
                            &f32_data,
                            channels,
                            sample_rate,
                            &mut sample_accumulator,
                            &mut vad,
                            &app_handle,
                            &segment_sender,
                            "audio-loopback-level",
                            "Interviewer",
                        );
                    },
                    err_fn,
                    None,
                )
            }
            SampleFormat::I8 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[i8], _| {
                        let f32_data: Vec<f32> = data.iter().map(|&s| s as f32 / 128.0).collect();
                        Self::handle_audio_samples(
                            &f32_data,
                            channels,
                            sample_rate,
                            &mut sample_accumulator,
                            &mut vad,
                            &app_handle,
                            &segment_sender,
                            "audio-loopback-level",
                            "Interviewer",
                        );
                    },
                    err_fn,
                    None,
                )
            }
            SampleFormat::U8 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[u8], _| {
                        let f32_data: Vec<f32> = data.iter().map(|&s| (s as f32 - 128.0) / 128.0).collect();
                        Self::handle_audio_samples(
                            &f32_data,
                            channels,
                            sample_rate,
                            &mut sample_accumulator,
                            &mut vad,
                            &app_handle,
                            &segment_sender,
                            "audio-loopback-level",
                            "Interviewer",
                        );
                    },
                    err_fn,
                    None,
                )
            }
            SampleFormat::F64 => {
                device.build_input_stream(
                    &stream_config,
                    move |data: &[f64], _| {
                        let f32_data: Vec<f32> = data.iter().map(|&s| s as f32).collect();
                        Self::handle_audio_samples(
                            &f32_data,
                            channels,
                            sample_rate,
                            &mut sample_accumulator,
                            &mut vad,
                            &app_handle,
                            &segment_sender,
                            "audio-loopback-level",
                            "Interviewer",
                        );
                    },
                    err_fn,
                    None,
                )
            }
            _ => return Err(format!("Unsupported loopback sample format: {:?}", sample_format)),
        }.map_err(|e| format!("Failed to build loopback stream: {}", e))?;

        Ok(stream)
    }

    #[inline]
    fn handle_audio_samples(
        samples: &[f32],
        channels: u16,
        sample_rate: u32,
        accumulator: &mut Vec<f32>,
        vad: &mut VadDetector,
        app_handle: &AppHandle,
        segment_sender: &Sender<VadSegment>,
        event_name: &'static str,
        speaker: &'static str,
    ) {
        // Diagnostic: log raw sample info periodically
        use std::sync::atomic::{AtomicU64, Ordering as AtOrd};
        static CALLBACK_COUNT: AtomicU64 = AtomicU64::new(0);
        let count = CALLBACK_COUNT.fetch_add(1, AtOrd::Relaxed);
        
        if count % 500 == 0 {
            let raw_max = samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
            info!(
                "[AUDIO-DIAG] {} callback #{}: raw_samples={}, channels={}, rate={}, raw_max={:.6}",
                speaker, count, samples.len(), channels, sample_rate, raw_max
            );
        }

        let pcm16k = process_raw_audio(samples, channels, sample_rate);
        accumulator.extend_from_slice(&pcm16k);

        while accumulator.len() >= VAD_FRAME_SIZE {
            let frame: Vec<f32> = accumulator.drain(..VAD_FRAME_SIZE).collect();
            let (segment_opt, rms, is_active) = vad.process_frame(&frame);

            // Responsive logarithmic level calculation for clear visual movement
            let display_level = (rms.sqrt() * 4.8).clamp(0.0, 1.0);

            if count % 500 == 0 {
                info!(
                    "[AUDIO-DIAG] {} frame: rms={:.6}, display_level={:.4}, is_active={}, accum_remaining={}",
                    speaker, rms, display_level, is_active, accumulator.len()
                );
            }

            let payload = serde_json::json!({
                "level": display_level,
                "active": is_active || display_level > 0.12,
                "speaker": speaker
            });

            // Store in shared atomics for polling fallback
            let level_bits = display_level.to_bits();
            let is_active_flag = is_active || display_level > 0.12;
            if event_name == "audio-mic-level" {
                CURRENT_MIC_LEVEL.store(level_bits, Ordering::Relaxed);
                CURRENT_MIC_ACTIVE.store(is_active_flag, Ordering::Relaxed);
            } else {
                CURRENT_LOOPBACK_LEVEL.store(level_bits, Ordering::Relaxed);
                CURRENT_LOOPBACK_ACTIVE.store(is_active_flag, Ordering::Relaxed);
            }

            // Emit events to all webviews
            let _ = app_handle.emit_to("main", event_name, payload.clone());
            let _ = app_handle.emit(event_name, payload);

            if let Some(segment) = segment_opt {
                let _ = segment_sender.send(segment);
            }
        }
    }
}

