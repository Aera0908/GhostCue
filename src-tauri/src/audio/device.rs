use cpal::traits::{DeviceTrait, HostTrait};
use serde::{Deserialize, Serialize};
use log::error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub is_input: bool,
    pub channels: u16,
    pub sample_rate: u32,
}

/// Enumerate all audio input devices (Microphones)
pub fn list_input_devices() -> Vec<AudioDeviceInfo> {
    let host = cpal::default_host();
    let mut devices = Vec::new();

    let default_device_name = host
        .default_input_device()
        .and_then(|d| d.name().ok());

    match host.input_devices() {
        Ok(device_list) => {
            for device in device_list {
                if let Ok(name) = device.name() {
                    let is_default = default_device_name.as_ref().map(|d| d == &name).unwrap_or(false);
                    let (channels, sample_rate) = match device.default_input_config() {
                        Ok(config) => (config.channels(), config.sample_rate().0),
                        Err(_) => (1, 48000),
                    };

                    devices.push(AudioDeviceInfo {
                        id: name.clone(),
                        name,
                        is_default,
                        is_input: true,
                        channels,
                        sample_rate,
                    });
                }
            }
        }
        Err(e) => {
            error!("Failed to enumerate input devices: {}", e);
        }
    }

    devices
}

/// Enumerate all audio output devices (Speakers / Loopback endpoints)
pub fn list_output_devices() -> Vec<AudioDeviceInfo> {
    let host = cpal::default_host();
    let mut devices = Vec::new();

    let default_device_name = host
        .default_output_device()
        .and_then(|d| d.name().ok());

    match host.output_devices() {
        Ok(device_list) => {
            for device in device_list {
                if let Ok(name) = device.name() {
                    let is_default = default_device_name.as_ref().map(|d| d == &name).unwrap_or(false);
                    let (channels, sample_rate) = match device.default_output_config() {
                        Ok(config) => (config.channels(), config.sample_rate().0),
                        Err(_) => (2, 48000),
                    };

                    devices.push(AudioDeviceInfo {
                        id: name.clone(),
                        name,
                        is_default,
                        is_input: false,
                        channels,
                        sample_rate,
                    });
                }
            }
        }
        Err(e) => {
            error!("Failed to enumerate output devices: {}", e);
        }
    }

    devices
}
