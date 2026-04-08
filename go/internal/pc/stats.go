package pc

import (
	"math"
	"math/rand"
	"sort"

	"github.com/deckofdmthings/gmai/internal/dice"
)

var statOrder = []string{"STR", "DEX", "CON", "INT", "WIS", "CHA"}

// ComputeStatsCoinageAndCombat overwrites model output for stats, coinage, max_hp, and ac.
// Stats: PHB-style 4d6 drop lowest, six times; deterministic PRNG from seed; assign highest rolls
// to class primary, then secondary (if defined), then CON, then remaining abilities (shuffled by seed). Then racial bumps.
// Coinage from PHB background gp table.
func ComputeStatsCoinageAndCombat(pc map[string]interface{}, language string) {
	if pc == nil {
		return
	}
	_ = language
	classID := normalizeClassID(str(pc["class"]))
	raceWire := normalizeRaceWireFromSheet(pc)
	subWire := wireSubraceFromSheet(pc)
	bgID := ResolveBackgroundID(str(pc["background"]))
	seed := hashSeed(str(pc["name"]), classID, raceWire, subWire, bgID)

	stats := stats4d6DropLowest(classID, seed)
	applyRacialBonuses(stats, raceWire, subWire)
	pc["stats"] = statsMapToInterface(stats)

	setStartingCoinage(pc, bgID)

	lv := 1
	if n, ok := toIntish(pc["level"]); ok && n >= 1 {
		lv = n
	}
	conMod := modFromScore(scoreFromMap(stats, "CON"))
	hd := classHitDie[classID]
	if hd <= 0 {
		hd = 8
	}
	maxHP := hd + conMod
	if lv > 1 {
		for i := 2; i <= lv; i++ {
			roll := (hd / 2) + 1
			maxHP += roll + conMod
		}
	}
	pc["max_hp"] = float64(maxHP)
	pc["ac"] = float64(estimateAC(stats, classID))
}

// stats4d6DropLowest rolls six ability scores (4d6 drop lowest each), sorts descending,
// and assigns to primary → secondary (if set) → CON → remaining stats in a seed-shuffled order.
func stats4d6DropLowest(classID string, seed uint64) map[string]int {
	rng := dice.NewSeededRNG(seed)
	order := statAssignmentOrder(classID, rng)
	rolls := make([]int, 6)
	for i := 0; i < 6; i++ {
		rolls[i] = dice.Roll4d6DropLowest(rng)
	}
	sort.Slice(rolls, func(i, j int) bool { return rolls[i] > rolls[j] })
	out := map[string]int{}
	for i, ab := range order {
		if i < len(rolls) {
			out[ab] = rolls[i]
		}
	}
	for _, ab := range statOrder {
		if _, ok := out[ab]; !ok {
			out[ab] = 8
		}
	}
	return out
}

// statAssignmentOrder: highest roll → primary, then secondary (if non-empty and not duplicate), then CON if not yet placed, then shuffled remainder.
// rng is used only to shuffle remaining abilities (same sequence as stats4d6DropLowest dice rolls).
func statAssignmentOrder(classID string, rng *rand.Rand) []string {
	primary := primaryAbility[classID]
	if primary == "" {
		primary = "STR"
	}
	sec := secondaryAbility[classID]
	if sec == primary {
		sec = ""
	}
	seen := map[string]bool{}
	var order []string
	add := func(ab string) {
		if ab == "" || seen[ab] {
			return
		}
		seen[ab] = true
		order = append(order, ab)
	}
	if primary == "CON" {
		add("CON")
	} else {
		add(primary)
		if sec != "" {
			add(sec)
		}
		add("CON")
	}
	var remaining []string
	for _, ab := range statOrder {
		if !seen[ab] {
			remaining = append(remaining, ab)
		}
	}
	dice.ShuffleStringSlice(rng, remaining)
	order = append(order, remaining...)
	return order
}

func statsMapToInterface(m map[string]int) map[string]interface{} {
	out := make(map[string]interface{}, len(m))
	for _, k := range statOrder {
		out[k] = float64(m[k])
	}
	return out
}

func scoreFromMap(m map[string]int, ab string) int {
	if v, ok := m[ab]; ok {
		return v
	}
	return 8
}

func modFromScore(score int) int {
	return int(math.Floor((float64(score) - 10) / 2))
}

func estimateAC(stats map[string]int, classID string) int {
	dexMod := modFromScore(scoreFromMap(stats, "DEX"))
	wisMod := modFromScore(scoreFromMap(stats, "WIS"))
	conMod := modFromScore(scoreFromMap(stats, "CON"))
	switch classID {
	case "barbarian":
		return 10 + dexMod + conMod
	case "monk":
		return 10 + dexMod + wisMod
	default:
		return 11 + dexMod
	}
}

// CombatPrecomputedKey marks a playerCharacter map whose stats/coinage/max_hp/ac were set before
// the LLM call (generate-character path) so EnsurePlayerCharacterSheetDefaults does not recompute them.
const CombatPrecomputedKey = "_gmCombatPrecomputed"

// CombatFromGameSetup computes stats, coinage, max_hp, and ac from resolved gameSetup
// before the character LLM call. Uses the same rules as ComputeStatsCoinageAndCombat.
func CombatFromGameSetup(gs map[string]interface{}, resolvedName, language string) map[string]interface{} {
	if gs == nil {
		gs = map[string]interface{}{}
	}
	pcTemp := map[string]interface{}{
		"name":       resolvedName,
		"class":      PickSetupChoice(gs, "class", "characterClass"),
		"race":       PickSetupChoice(gs, "race", "characterRace"),
		"background": PickSetupChoice(gs, "background", "characterBackground"),
	}
	if sr := PickSetupChoice(gs, "subrace", "subraceId"); sr != "" {
		pcTemp["subraceId"] = NormChoiceID(sr)
		pcTemp["subrace"] = sr
	}
	if lv := gs["level"]; lv != nil {
		pcTemp["level"] = lv
	}
	ComputeStatsCoinageAndCombat(pcTemp, language)
	return map[string]interface{}{
		"stats":   pcTemp["stats"],
		"coinage": pcTemp["coinage"],
		"max_hp":  pcTemp["max_hp"],
		"ac":      pcTemp["ac"],
	}
}

// MergePrecomputedCombat applies server-precomputed combat fields onto the parsed playerCharacter
// and sets CombatPrecomputedKey so defaults do not overwrite them.
func MergePrecomputedCombat(pc map[string]interface{}, combat map[string]interface{}) {
	if pc == nil || combat == nil {
		return
	}
	if s, ok := combat["stats"]; ok {
		pc["stats"] = s
	}
	if c, ok := combat["coinage"]; ok {
		pc["coinage"] = c
	}
	if m, ok := combat["max_hp"]; ok {
		pc["max_hp"] = m
	}
	if a, ok := combat["ac"]; ok {
		pc["ac"] = a
	}
	pc[CombatPrecomputedKey] = true
}

// CombatFieldsPresent returns true when stats, coinage, max_hp, and ac look usable for persistence.
func CombatFieldsPresent(pc map[string]interface{}) bool {
	if pc == nil {
		return false
	}
	stats, ok := asStatsMap(pc["stats"])
	if !ok || stats == nil || len(stats) == 0 {
		return false
	}
	if v, ok := toFloat64(pc["max_hp"]); !ok || math.IsNaN(v) {
		return false
	}
	if v, ok := toFloat64(pc["ac"]); !ok || math.IsNaN(v) {
		return false
	}
	if _, ok := pc["coinage"].(map[string]interface{}); !ok {
		return false
	}
	return true
}
