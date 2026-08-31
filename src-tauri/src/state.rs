use std::sync::Arc;
use crossbeam_channel::{unbounded, Receiver, Sender};
use parking_lot::Mutex;
use std::path::PathBuf;

use crate::audio::capture::AudioCaptureManager;
use crate::audio::vad::VadSegment;
use crate::config::ConfigManager;
use crate::llm::orchestrator::LlmOrchestrator;
use crate::stt::engine::SttEngineManager;

pub struct AppState {
    pub config_manager: Arc<ConfigManager>,
    pub audio_capture: Arc<Mutex<AudioCaptureManager>>,
    pub stt_engine: Arc<SttEngineManager>,
    pub llm_orchestrator: Arc<LlmOrchestrator>,
    pub vad_segment_sender: Sender<VadSegment>,
    pub vad_segment_receiver: Receiver<VadSegment>,
}

impl AppState {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let (sender, receiver) = unbounded::<VadSegment>();
        Self {
            config_manager: Arc::new(ConfigManager::new(app_data_dir)),
            audio_capture: Arc::new(Mutex::new(AudioCaptureManager::new())),
            stt_engine: Arc::new(SttEngineManager::new()),
            llm_orchestrator: Arc::new(LlmOrchestrator::new()),
            vad_segment_sender: sender,
            vad_segment_receiver: receiver,
        }
    }
}
