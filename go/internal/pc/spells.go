package pc

import (
	"sort"
	"strings"

	"github.com/deckofdmthings/gmai/internal/dice"
)

// SpellsPrecomputedKey marks a playerCharacter whose spells/spell_slots were set before the LLM call
// (generate-character path) so EnsurePlayerCharacterSheetDefaults does not recompute them.
const SpellsPrecomputedKey = "_gmSpellsPrecomputed"

var spellDisplayEN = map[string]string{
	"tashas_hideous_laughter": "Tasha's Hideous Laughter",
}

// SpellsFromGameSetup computes spells and spell_slots from resolved gameSetup before the LLM call.
func SpellsFromGameSetup(gs map[string]interface{}, resolvedName, language string) map[string]interface{} {
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
	ComputeAndSetSpells(pcTemp, language)
	out := map[string]interface{}{}
	if s, ok := pcTemp["spells"]; ok {
		out["spells"] = s
	}
	if sl, ok := pcTemp["spell_slots"]; ok {
		out["spell_slots"] = sl
	}
	return out
}

// MergePrecomputedSpells applies server-precomputed spells onto the parsed playerCharacter
// and sets SpellsPrecomputedKey so defaults do not overwrite them.
func MergePrecomputedSpells(pc map[string]interface{}, pre map[string]interface{}) {
	if pc == nil || pre == nil {
		return
	}
	if s, ok := pre["spells"]; ok {
		pc["spells"] = s
	}
	if sl, ok := pre["spell_slots"]; ok {
		pc["spell_slots"] = sl
	} else {
		delete(pc, "spell_slots")
	}
	pc[SpellsPrecomputedKey] = true
}

// SpellsFieldsPresent returns true when spells were merged (or otherwise set) for validation skip.
func SpellsFieldsPresent(pc map[string]interface{}) bool {
	if pc == nil {
		return false
	}
	_, ok := pc["spells"]
	return ok
}

// ComputeAndSetSpells assigns PHB-style spells and spell slots at level 1 using deterministic random picks.
// Requires stats on pc (from ComputeStatsCoinageAndCombat or merge).
func ComputeAndSetSpells(pc map[string]interface{}, language string) {
	if pc == nil {
		return
	}
	classID := normalizeClassID(str(pc["class"]))
	lv := 1
	if n, ok := toIntish(pc["level"]); ok && n >= 1 {
		lv = n
	}
	if lv != 1 {
		// Level-up spell logic not implemented; leave empty for higher levels.
		pc["spells"] = []interface{}{}
		delete(pc, "spell_slots")
		return
	}
	stats, ok := asStatsMap(pc["stats"])
	if !ok || stats == nil {
		pc["spells"] = []interface{}{}
		delete(pc, "spell_slots")
		return
	}
	intMod := abilityModFromStats(stats, "INT")
	wisMod := abilityModFromStats(stats, "WIS")
	chaMod := abilityModFromStats(stats, "CHA")

	pool, hasPool := spellPools[classID]
	if !hasPool || !classHasSpellsAtLevel1(classID) {
		pc["spells"] = []interface{}{}
		delete(pc, "spell_slots")
		return
	}

	seed := spellSeedFromPC(pc)
	loc := spellLocale(language)

	rows := buildSpellRows(classID, pool, intMod, wisMod, chaMod, seed, loc)
	pc["spells"] = rows

	slots := spellSlotsForClass(classID)
	if len(slots) == 0 {
		delete(pc, "spell_slots")
	} else {
		pc["spell_slots"] = slots
	}
}

func classHasSpellsAtLevel1(classID string) bool {
	switch classID {
	case "wizard", "bard", "sorcerer", "warlock", "cleric", "druid", "artificer":
		return true
	default:
		return false
	}
}

func spellSeedFromPC(pc map[string]interface{}) uint64 {
	classID := normalizeClassID(str(pc["class"]))
	raceWire := normalizeRaceWireFromSheet(pc)
	subWire := wireSubraceFromSheet(pc)
	bgID := ResolveBackgroundID(str(pc["background"]))
	return hashSeed(str(pc["name"]), classID, raceWire, subWire, bgID)
}

func spellLocale(language string) string {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(language)), "span") {
		return "es"
	}
	return "en"
}

func spellSlotsForClass(classID string) map[string]interface{} {
	switch classID {
	case "warlock":
		return map[string]interface{}{"1": float64(1)}
	case "wizard", "sorcerer", "bard", "cleric", "druid", "artificer":
		return map[string]interface{}{"1": float64(2)}
	default:
		return nil
	}
}

func buildSpellRows(classID string, pool spellPool, intMod, wisMod, _ int, seed uint64, loc string) []interface{} {
	switch classID {
	case "wizard":
		return buildWizardRows(pool, intMod, seed, loc)
	case "bard":
		return buildKnownRows(pool, 2, 4, seed, loc, false)
	case "sorcerer":
		return buildKnownRows(pool, 4, 2, seed, loc, false)
	case "warlock":
		return buildKnownRows(pool, 2, 2, seed, loc, false)
	case "cleric":
		return buildPreparedRows(pool, 3, maxInt(1, wisMod+1), seed, loc)
	case "druid":
		return buildPreparedRows(pool, 2, maxInt(1, wisMod+1), seed, loc)
	case "artificer":
		return buildPreparedRows(pool, 2, maxInt(1, intMod), seed, loc)
	default:
		return nil
	}
}

func buildWizardRows(pool spellPool, intMod int, seed uint64, loc string) []interface{} {
	cantripIDs := dice.PickNFromPool(pool.Cantrips, 3, seed+11)
	bookIDs := dice.PickNFromPool(pool.Level1, 6, seed+17)
	nPrep := intMod + 1
	if nPrep < 1 {
		nPrep = 1
	}
	if nPrep > len(bookIDs) {
		nPrep = len(bookIDs)
	}
	preparedIDs := dice.PickNFromPool(append([]string(nil), bookIDs...), nPrep, seed+23)
	prepSet := map[string]bool{}
	for _, id := range preparedIDs {
		prepSet[id] = true
	}
	var rows []spellRowSort
	for _, id := range cantripIDs {
		rows = append(rows, spellRowSort{id: id, level: 0, prepared: nil})
	}
	for _, id := range bookIDs {
		p := prepSet[id]
		rows = append(rows, spellRowSort{id: id, level: 1, prepared: &p})
	}
	return sortAndEmit(rows, loc, true)
}

func buildKnownRows(pool spellPool, nCantrip, nLv1 int, seed uint64, loc string, wizard bool) []interface{} {
	cantripIDs := dice.PickNFromPool(pool.Cantrips, nCantrip, seed+11)
	lv1IDs := dice.PickNFromPool(pool.Level1, nLv1, seed+19)
	var rows []spellRowSort
	for _, id := range cantripIDs {
		rows = append(rows, spellRowSort{id: id, level: 0, prepared: nil})
	}
	for _, id := range lv1IDs {
		rows = append(rows, spellRowSort{id: id, level: 1, prepared: nil})
	}
	return sortAndEmit(rows, loc, wizard)
}

func buildPreparedRows(pool spellPool, nCantrip, nLv1 int, seed uint64, loc string) []interface{} {
	cantripIDs := dice.PickNFromPool(pool.Cantrips, nCantrip, seed+11)
	lv1IDs := dice.PickNFromPool(pool.Level1, nLv1, seed+19)
	var rows []spellRowSort
	for _, id := range cantripIDs {
		rows = append(rows, spellRowSort{id: id, level: 0, prepared: nil})
	}
	for _, id := range lv1IDs {
		rows = append(rows, spellRowSort{id: id, level: 1, prepared: nil})
	}
	return sortAndEmit(rows, loc, false)
}

type spellRowSort struct {
	id       string
	level    int
	prepared *bool
}

func sortAndEmit(rows []spellRowSort, loc string, wizard bool) []interface{} {
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].level != rows[j].level {
			return rows[i].level < rows[j].level
		}
		return spellDisplayName(rows[i].id, loc) < spellDisplayName(rows[j].id, loc)
	})
	out := make([]interface{}, 0, len(rows))
	for _, r := range rows {
		m := map[string]interface{}{
			"name":  spellDisplayName(r.id, loc),
			"level": float64(r.level),
		}
		if wizard && r.level >= 1 && r.prepared != nil {
			m["prepared"] = *r.prepared
		}
		out = append(out, m)
	}
	return out
}

func spellDisplayName(id, loc string) string {
	if loc == "es" {
		if s, ok := spellDisplayES[id]; ok {
			return s
		}
	}
	if s, ok := spellDisplayEN[id]; ok {
		return s
	}
	return titleSpellID(id)
}

func titleSpellID(id string) string {
	parts := strings.Split(id, "_")
	for i, p := range parts {
		if p == "" {
			continue
		}
		parts[i] = strings.ToUpper(p[:1]) + strings.ToLower(p[1:])
	}
	return strings.Join(parts, " ")
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
