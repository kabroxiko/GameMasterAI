// Package dice provides deterministic RNG helpers for rolls and pool picks (e.g. D&D-style 4d6 drop lowest).
package dice

import (
	"math/rand"
	"sort"
)

// NewSeededRNG returns a deterministic PRNG from a 64-bit seed.
func NewSeededRNG(seed uint64) *rand.Rand {
	return rand.New(rand.NewSource(int64(seed)))
}

// Roll4d6DropLowest rolls 4d6 and drops the lowest die (PHB-style ability score roll).
func Roll4d6DropLowest(rng *rand.Rand) int {
	rolls := []int{
		rng.Intn(6) + 1,
		rng.Intn(6) + 1,
		rng.Intn(6) + 1,
		rng.Intn(6) + 1,
	}
	sort.Ints(rolls)
	return rolls[1] + rolls[2] + rolls[3]
}

// ShuffleStringSlice shuffles s in place (Fisher–Yates).
func ShuffleStringSlice(rng *rand.Rand, s []string) {
	rng.Shuffle(len(s), func(i, j int) { s[i], s[j] = s[j], s[i] })
}

// PickNFromPool picks n distinct items from pool using a deterministic seed.
// Pool is sorted for stability, then shuffled; the chosen subset is returned sorted lexicographically.
func PickNFromPool(pool []string, n int, seed uint64) []string {
	if n <= 0 || len(pool) == 0 {
		return nil
	}
	cp := append([]string(nil), pool...)
	sort.Strings(cp)
	if n >= len(cp) {
		return cp
	}
	rng := NewSeededRNG(seed)
	ShuffleStringSlice(rng, cp)
	out := append([]string(nil), cp[:n]...)
	sort.Strings(out)
	return out
}
