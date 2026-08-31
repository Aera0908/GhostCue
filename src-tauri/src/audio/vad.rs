use std::time::{Duration, Instant};
use log::{debug, info};

pub const VAD_FRAME_SIZE: usize = 512; // 32ms at 16kHz
pub const SAMPLE_RATE: usize = 16000;

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
    pub min_speech_duration: Duration, // e.g. 300ms
    pub silence_cutoff_duration: Duration, // e.g. 800ms

    state: VadState,
    speech_start_instant: Option<Instant>,
    silence_start_instant: Option<Instant>,
    accumulated_samples: Vec<f32>,
    
    // Dynamic noise floor tracking
    noise_floor: f32,
    alpha: f32, // Smoothing factor
}

impl VadDetector {
    pub fn new(is_interviewer: bool, threshold: f32, min_speech_ms: u64, silence_cutoff_ms: u64) -> Self {
        Self {
            is_interviewer,
            threshold: threshold.clamp(0.05, 0.95),
            min_speech_duration: Duration::from_millis(min_speech_ms),
            silence_cutoff_duration: Duration::from_millis(silence_cutoff_ms),
            state: VadState::Silence,
            speech_start_instant: None,
            silence_start_instant: None,
            accumulated_samples: Vec::with_capacity(SAMPLE_RATE * 15),
            noise_floor: 0.005,
            alpha: 0.98,
        }
    }

    /// Calculate RMS (Root Mean Square) energy of 512-sample frame
    pub fn calculate_rms(frame: &[f32]) -> f32 {
        if frame.is_empty() {
            return 0.0;
        }
        let sum_sq: f32 = frame.iter().map(|&s| s * s).sum();
        (sum_sq / (frame.len() as f32)).sqrt()
    }

    /// Compute zero-crossing rate of frame
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

    /// Evaluate speech probability for a 512-sample chunk
    pub fn compute_speech_probability(&mut self, frame: &[f32]) -> (f32, f32) {
        let rms = Self::calculate_rms(frame);
        let zcr = Self::calculate_zcr(frame);

        // Update noise floor slowly during low-energy periods
        if rms < self.noise_floor * 1.5 {
            self.noise_floor = self.alpha * self.noise_floor + (1.0 - self.alpha) * rms;
            self.noise_floor = self.noise_floor.max(0.001);
        }

        let snr = rms / self.noise_floor;
        
        // Non-linear sigmoid mapping for speech probability
        let energy_factor = (snr - 2.5).clamp(-5.0, 5.0);
        let zcr_bonus = if (0.02..=0.35).contains(&zcr) { 0.5 } else { -0.3 };
        let logit = energy_factor + zcr_bonus;
        let prob = 1.0 / (1.0 + (-logit).exp());

        (prob, rms)
    }

    /// Feed a frame into the VAD state machine.
    /// Returns Some(VadSegment) when a complete speech turn has finished (after silence timeout).
    pub fn process_frame(&mut self, frame: &[f32]) -> (Option<VadSegment>, f32, bool) {
        let (prob, rms) = self.compute_speech_probability(frame);
        let is_speech_frame = prob >= self.threshold;
        let now = Instant::now();
        let mut completed_segment = None;

        match self.state {
            VadState::Silence => {
                if is_speech_frame {
                    self.state = VadState::SpeechPossible;
                    self.speech_start_instant = Some(now);
                    self.silence_start_instant = None;
                    self.accumulated_samples.clear();
                    self.accumulated_samples.extend_from_slice(frame);
                }
            }
            VadState::SpeechPossible => {
                self.accumulated_samples.extend_from_slice(frame);
                if is_speech_frame {
                    if let Some(start) = self.speech_start_instant {
                        if now.duration_since(start) >= self.min_speech_duration {
                            self.state = VadState::SpeechConfirmed;
                            debug!("VAD speech confirmed for speaker (interviewer={})", self.is_interviewer);
                        }
                    }
                } else {
                    // False trigger, fell back to silence before threshold
                    self.state = VadState::Silence;
                    self.speech_start_instant = None;
                    self.accumulated_samples.clear();
                }
            }
            VadState::SpeechConfirmed => {
                self.accumulated_samples.extend_from_slice(frame);

                if is_speech_frame {
                    self.silence_start_instant = None; // Reset silence counter
                } else {
                    if self.silence_start_instant.is_none() {
                        self.silence_start_instant = Some(now);
                    } else if let Some(silence_start) = self.silence_start_instant {
                        if now.duration_since(silence_start) >= self.silence_cutoff_duration {
                            // Speech ended! Finalize segment
                            let total_duration = self.speech_start_instant
                                .map(|s| now.duration_since(s))
                                .unwrap_or_else(|| Duration::from_millis(1000));

                            info!(
                                "VAD segment completed for (interviewer={}): {} samples ({:.2}s)",
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

                            // Reset state
                            self.state = VadState::Silence;
                            self.speech_start_instant = None;
                            self.silence_start_instant = None;
                            self.accumulated_samples.clear();
                        }
                    }
                }
            }
        }

        let is_active = self.state == VadState::SpeechConfirmed || self.state == VadState::SpeechPossible;
        (completed_segment, rms, is_active)
    }
}
