/// SplitMix64: a small, fixed pseudo-random generator.
///
/// Written out here, not taken from a crate, so its output can never change under us:
/// a replay must draw exactly the numbers the game drew. Not for anything secret.
#[derive(Debug, Clone)]
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Rng(seed)
    }

    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// A number in `0..n`, without modulo bias. `n` must not be 0.
    pub fn below(&mut self, n: u64) -> u64 {
        assert!(n > 0, "below(0)");
        let zone = u64::MAX - (u64::MAX % n);
        loop {
            let value = self.next_u64();
            if value < zone {
                return value % n;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Rng;

    /// Reference values for seed 1234567 from the published SplitMix64 algorithm.
    /// If this test ever needs changing, old action logs no longer replay.
    #[test]
    fn output_is_pinned() {
        let mut rng = Rng::new(1_234_567);
        assert_eq!(rng.next_u64(), 6_457_827_717_110_365_317);
        assert_eq!(rng.next_u64(), 3_203_168_211_198_807_973);
        assert_eq!(rng.next_u64(), 9_817_491_932_198_370_423);
    }

    #[test]
    fn below_stays_in_range() {
        let mut rng = Rng::new(7);
        assert!((0..1000).all(|_| rng.below(3) < 3));
    }
}
