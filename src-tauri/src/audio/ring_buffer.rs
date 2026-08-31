use std::collections::VecDeque;
use parking_lot::Mutex;

/// Thread-safe circular audio buffer for 16kHz f32 PCM samples
pub struct AudioRingBuffer {
    buffer: Mutex<VecDeque<f32>>,
    capacity: usize,
}

impl AudioRingBuffer {
    /// Create new ring buffer with maximum capacity (e.g. 16000 * 30 = 30 seconds of audio)
    pub fn new(capacity: usize) -> Self {
        Self {
            buffer: Mutex::new(VecDeque::with_capacity(capacity)),
            capacity,
        }
    }

    /// Push new samples into the buffer, discarding oldest if over capacity
    pub fn push_samples(&self, samples: &[f32]) {
        let mut buf = self.buffer.lock();
        for &sample in samples {
            if buf.len() >= self.capacity {
                buf.pop_front();
            }
            buf.push_back(sample);
        }
    }

    /// Read all current samples and clear the buffer
    pub fn drain_all(&self) -> Vec<f32> {
        let mut buf = self.buffer.lock();
        buf.drain(..).collect()
    }

    /// Read up to `n` samples from the front
    pub fn drain_n(&self, n: usize) -> Vec<f32> {
        let mut buf = self.buffer.lock();
        let take_count = n.min(buf.len());
        buf.drain(..take_count).collect()
    }

    /// Peek the last `n` samples without removing them
    pub fn peek_last(&self, n: usize) -> Vec<f32> {
        let buf = self.buffer.lock();
        let len = buf.len();
        if len <= n {
            buf.iter().copied().collect()
        } else {
            buf.iter().skip(len - n).copied().collect()
        }
    }

    /// Current number of samples in the buffer
    pub fn len(&self) -> usize {
        self.buffer.lock().len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.buffer.lock().is_empty()
    }

    /// Clear all samples
    pub fn clear(&self) {
        self.buffer.lock().clear();
    }
}
