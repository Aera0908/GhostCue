use std::collections::VecDeque;
use std::time::{Duration, Instant};
use log::info;

pub const VAD_FRAME_SIZE: usize = 512; // 32ms at 16kHz
pub const SAMPLE_RATE: usize = 16000;
const PRE_SPEECH_FRAMES: usize = 10; // ~320ms pre-roll buffer
const MAX_SEGMENT_DURATION_SECS: u64 = 30; // Maximum segment duration

#[derive(Debug, Clone, PartialEq)]
pub enum VadState {
    Silence,
    SpeechPossible,
    SpeechConfirmed,
}

#[derive(Debug, Clone)]
pub struct VadSegment {
    pub speaker_is_interviewer: bool,
    pub samples: Vec<f32>,
    pub start_time: Instant,
    pub duration: Duration,
}

pub struct VadDetector {
    pub is_interviewer: bool,
    pub threshold: f32, // 0.0 to 1.0 (default ~0.5)
    pub min_speech_duration: Duration, // e.g. 180ms
    pub silence_cutoff_duration: Duration, // e.g. 1600ms

    state: VadState,
    speech_start_instant: Option<Instant>,
    silence_start_instant: Option<Instant>,
    accumulated_samples: Vec<f32>,
    pre_speech_ring: VecDeque<Vec<f32>>,

    // Hangover counters
    consecutive_silence_frames: usize,
    consecutive_speech_frames: usize,

    // Dynamic background noise floor tracking
    noise_floor: f32,
    
    // High-pass filter state for noise cancellation
    filter_prev_x: f32,
    filter_prev_y: f32,
}

impl VadDetector {
    pub fn new(is_interviewer: bool, threshold: f32, _min_speech_ms: u64, silence_cutoff_ms: u64) -> Self {
        // Use longer cutoff for interviewer to avoid splitting sentences
        let effective_cutoff_ms = if is_interviewer {
            silence_cutoff_ms.max(1600).clamp(500, 3500)
        } else {
            silence_cutoff_ms.max(1000).clamp(400, 3000)
        };

        Self {
            is_interviewer,
            threshold: threshold.clamp(0.1, 0.9),
            min_speech_duration: Duration::from_millis(100),
            silence_cutoff_duration: Duration::from_millis(effective_cutoff_ms),
            state: VadState::Silence,
            speech_start_instant: None,
            silence_start_instant: None,
            accumulated_samples: Vec::with_capacity(SAMPLE_RATE * 32),
            pre_speech_ring: VecDeque::with_capacity(PRE_SPEECH_FRAMES + 2),
            consecutive_silence_frames: 0,
            consecutive_speech_frames: 0,
            noise_floor: 0.002,
            filter_prev_x: 0.0,
            filter_prev_y: 0.0,
        }
    }

    /// 85Hz highpass filter to reduce low-frequency noise and DC offset
    pub fn filter_noise(&mut self, frame: &[f32]) -> Vec<f32> {
        let r = 0.967f32;
        let mut filtered = Vec::with_capacity(frame.len());
        for &x in frame {
            let y = x - self.filter_prev_x + r * self.filter_prev_y;
            self.filter_prev_x = x;
            self.filter_prev_y = y;
            filtered.push(y);
        }
        filtered
    }

    /// Calculate RMS (Root Mean Square) energy of 512-sample frame
    pub fn calculate_rms(frame: &[f32]) -> f32 {
        if frame.is_empty() {
            return 0.0;
        }
        let sum_sq: f32 = frame.iter().map(|&s| s * s).sum();
        (sum_sq / (frame.len() as f32)).sqrt()
    }

    /// Compute zero-crossing rate (ZCR)
    pub fn calculate_zcr(frame: &[f32]) -> f32 {
        if frame.len() < 2 {
            return 0.0;
        }
        let mut count = 0;
        for i in 1..frame.len() {
            if (frame[i] >= 0.0 && frame[i - 1] < 0.0) || (frame[i] < 0.0 && frame[i - 1] >= 0.0) {
                count += 1;
            }
        }
        count as f32 / (frame.len() as f32)
    }

    /// Determine if frame contains human speech vs ambient room noise
    pub fn classify_frame(&mut self, filtered_frame: &[f32]) -> (bool, f32) {
        let rms = Self::calculate_rms(filtered_frame);
        let zcr = Self::calculate_zcr(filtered_frame);

        // Adaptive noise floor tracking
        if rms < self.noise_floor * 1.4 {
            self.noise_floor = 0.96 * self.noise_floor + 0.04 * rms;
        } else {
            self.noise_floor = 0.998 * self.noise_floor + 0.002 * rms;
        }
        self.noise_floor = self.noise_floor.clamp(0.0005, 0.020);

        let snr_multiplier = 1.4 + (1.0 - self.threshold) * 1.2;
        let min_energy_gate = 0.0025 + (1.0 - self.threshold) * 0.004;

        let energy_ok = rms >= (self.noise_floor * snr_multiplier) && rms >= min_energy_gate;
        let zcr_ok = zcr >= 0.01 && zcr <= 0.52;

        let is_speech = energy_ok && zcr_ok;
        (is_speech, rms)
    }

    /// Feed a frame into the VAD state machine.
    /// Returns (Option<VadSegment>, display_level, is_active).
    pub fn process_frame(&mut self, frame: &[f32]) -> (Option<VadSegment>, f32, bool) {
        let filtered = self.filter_noise(frame);
        let (is_speech_frame, raw_rms) = self.classify_frame(&filtered);
        let now = Instant::now();
        let mut completed_segment = None;

        if is_speech_frame {
            self.consecutive_speech_frames += 1;
            self.consecutive_silence_frames = 0;
        } else {
            self.consecutive_silence_frames += 1;
            self.consecutive_speech_frames = 0;
        }

        match self.state {
            VadState::Silence => {
                if self.pre_speech_ring.len() >= PRE_SPEECH_FRAMES {
                    self.pre_speech_ring.pop_front();
                }
                self.pre_speech_ring.push_back(frame.to_vec());

                // Voice onset: 1 speech frame is enough to begin buffering
                if is_speech_frame {
                    self.state = VadState::SpeechConfirmed;
                    self.speech_start_instant = Some(now);
                    self.silence_start_instant = None;
                    self.accumulated_samples.clear();

                    for pre_frame in self.pre_speech_ring.drain(..) {
                        self.accumulated_samples.extend_from_slice(&pre_frame);
                    }
                    self.accumulated_samples.extend_from_slice(frame);
                }
            }
            VadState::SpeechPossible => {
                self.accumulated_samples.extend_from_slice(frame);
                self.state = VadState::SpeechConfirmed;
            }
            VadState::SpeechConfirmed => {
                self.accumulated_samples.extend_from_slice(frame);

                if is_speech_frame {
                    self.silence_start_instant = None;
                } else if self.silence_start_instant.is_none() {
                    self.silence_start_instant = Some(now);
                }

                let silence_timed_out = self.silence_start_instant
                    .map(|silence_start| now.duration_since(silence_start) >= self.silence_cutoff_duration)
                    .unwrap_or(false);

                let is_max_duration = self.accumulated_samples.len() >= (SAMPLE_RATE * MAX_SEGMENT_DURATION_SECS as usize);

                if silence_timed_out || is_max_duration {
                    let total_duration = self.speech_start_instant
                        .map(|s| now.duration_since(s))
                        .unwrap_or_else(|| Duration::from_millis(600));

                    // Keep any utterance with at least ~200ms of audio (catches "hello", "yes", "no")
                    if self.accumulated_samples.len() >= (SAMPLE_RATE * 200 / 1000) {
                        info!(
                            "VAD segment finalized (interviewer={}): {} samples ({:.2}s)",
                            self.is_interviewer,
                            self.accumulated_samples.len(),
                            total_duration.as_secs_f32()
                        );

                        completed_segment = Some(VadSegment {
                            speaker_is_interviewer: self.is_interviewer,
                            samples: self.accumulated_samples.clone(),
                            start_time: self.speech_start_instant.unwrap_or(now),
                            duration: total_duration,
                        });
                    }

                    self.state = VadState::Silence;
                    self.speech_start_instant = None;
                    self.silence_start_instant = None;
                    self.accumulated_samples.clear();
                    self.pre_speech_ring.clear();
                }
            }
        }

        let is_active = self.state == VadState::SpeechConfirmed || is_speech_frame;
        (completed_segment, raw_rms, is_active)
    }
}


