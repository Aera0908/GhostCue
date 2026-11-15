use std::sync::Arc;
use crossbeam_channel::{unbounded, Receiver, Sender};
use parking_lot::Mutex;
use std::path::PathBuf;

use crate::audio::capture::AudioCaptureManager;
use crate::audio::vad::VadSegment;
use crate::config::{settings_dir, ConfigManager};
use crate::llm::orchestrator::LlmOrchestrator;
use crate::secrets::{KeyringStore, SecretStore};
use crate::stt::engine::SttEngineManager;

pub struct AppState {
    pub config_manager: Arc<ConfigManager>,
    pub secrets: Arc<dyn SecretStore>,
    pub audio_capture: Arc<Mutex<AudioCaptureManager>>,
    pub stt_engine: Arc<SttEngineManager>,
    pub llm_orchestrator: Arc<LlmOrchestrator>,
    pub vad_segment_sender: Sender<VadSegment>,
    pub vad_segment_receiver: Receiver<VadSegment>,
}

impl AppState {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let (sender, receiver) = unbounded::<VadSegment>();
        let secrets: Arc<dyn SecretStore> = Arc::new(KeyringStore::new());
        // Debug builds may borrow keys from the repository's .env for this run only.
        #[cfg(debug_assertions)]
        let dev_env = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../.env")).ok();
        #[cfg(not(debug_assertions))]
        let dev_env: Option<String> = None;
        let (config_manager, _outcome, _notice) =
            ConfigManager::load_with_env(
                settings_dir(app_data_dir, cfg!(debug_assertions)),
                secrets.as_ref(),
                dev_env.as_deref(),
            );
        Self {
            config_manager: Arc::new(config_manager),
            secrets,
            audio_capture: Arc::new(Mutex::new(AudioCaptureManager::new())),
            stt_engine: Arc::new(SttEngineManager::new()),
            llm_orchestrator: Arc::new(LlmOrchestrator::new()),
            vad_segment_sender: sender,
            vad_segment_receiver: receiver,
        }
    }
}
