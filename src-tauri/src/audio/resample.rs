/// Convert multi-channel audio to mono by averaging channels
pub fn convert_to_mono(interleaved_samples: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 {
        return interleaved_samples.to_vec();
    }

    let ch = channels as usize;
    if ch == 0 {
        return Vec::new();
    }
    let frame_count = interleaved_samples.len() / ch;
    let mut mono = Vec::with_capacity(frame_count);

    for i in 0..frame_count {
        let mut sum = 0.0f32;
        let base = i * ch;
        for c in 0..ch {
            sum += interleaved_samples[base + c];
        }
        mono.push(sum / (channels as f32));
    }

    mono
}

/// Linear resampler from source_rate to target_rate (typically 16,000 Hz)
pub fn resample_linear(input: &[f32], source_rate: u32, target_rate: u32) -> Vec<f32> {
    if source_rate == target_rate || input.is_empty() || source_rate == 0 || target_rate == 0 {
        return input.to_vec();
    }

    let ratio = source_rate as f64 / target_rate as f64;
    let target_len = ((input.len() as f64) / ratio).floor() as usize;
    let mut output = Vec::with_capacity(target_len);

    for i in 0..target_len {
        let src_pos = (i as f64) * ratio;
        let idx = src_pos.floor() as usize;
        let frac = (src_pos - idx as f64) as f32;

        if idx + 1 < input.len() {
            let sample = input[idx] * (1.0 - frac) + input[idx + 1] * frac;
            output.push(sample);
        } else if idx < input.len() {
            output.push(input[idx]);
        } else {
            output.push(0.0);
        }
    }

    output
}

/// Process raw input chunk: convert to mono, resample to 16kHz
pub fn process_raw_audio(samples: &[f32], source_channels: u16, source_rate: u32) -> Vec<f32> {
    let mono = convert_to_mono(samples, source_channels);
    resample_linear(&mono, source_rate, 16000)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mono_conversion() {
        let stereo = vec![1.0, 0.0, 0.5, 0.5, -1.0, 1.0];
        let mono = convert_to_mono(&stereo, 2);
        assert_eq!(mono.len(), 3);
        assert_eq!(mono[0], 0.5);
        assert_eq!(mono[1], 0.5);
        assert_eq!(mono[2], 0.0);
    }

    #[test]
    fn test_resample_length() {
        let input = vec![0.1f32; 48000]; // 1 second at 48kHz
        let resampled = resample_linear(&input, 48000, 16000);
        assert_eq!(resampled.len(), 16000);
    }
}


