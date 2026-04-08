package pc

import (
	"fmt"
	"strings"

	"github.com/deckofdmthings/gmai/internal/dice"
	"github.com/deckofdmthings/gmai/internal/i18n"
)

func wireSubraceFromSheet(pc map[string]interface{}) string {
	if pc == nil {
		return ""
	}
	if raw := pc["subraceId"]; raw != nil {
		s := strings.TrimSpace(fmt.Sprint(raw))
		if s != "" && !strings.EqualFold(s, "random") {
			return NormChoiceID(raw)
		}
	}
	return normalizeSubraceWireFromLabel(str(pc["subrace"]))
}

func normalizeRaceWireFromSheet(pc map[string]interface{}) string {
	if pc == nil {
		return ""
	}
	raw := str(pc["race"])
	if s := normalizeRaceWireFromLabel(raw); s != "" {
		return s
	}
	return ""
}

func normalizeRaceWireFromLabel(raw string) string {
	s := foldLabel(raw)
	if s == "" || s == "random" {
		return ""
	}
	for _, id := range []string{
		"dwarf", "elf", "gnome", "half_elf", "half_orc", "halfling", "human", "tiefling",
	} {
		if s == id || s == strings.ReplaceAll(id, "_", "") {
			return id
		}
		en := i18n.CharacterChoiceLabel("race", id, "en")
		es := i18n.CharacterChoiceLabel("race", id, "es")
		if foldLabel(en) == s || foldLabel(es) == s {
			return id
		}
	}
	return ""
}

func normalizeSubraceWireFromLabel(raw string) string {
	s := foldLabel(raw)
	if s == "" || s == "random" {
		return ""
	}
	for id := range subraceIDs() {
		en := i18n.CharacterChoiceLabel("subrace", id, "en")
		es := i18n.CharacterChoiceLabel("subrace", id, "es")
		if foldLabel(en) == s || foldLabel(es) == s || s == id || s == strings.ReplaceAll(id, "_", "") {
			return id
		}
	}
	return ""
}

func subraceIDs() map[string]struct{} {
	return map[string]struct{}{
		"high_elf": {}, "wood_elf": {}, "drow": {},
		"hill_dwarf": {}, "mountain_dwarf": {},
		"lightfoot": {}, "stout": {},
		"forest_gnome": {}, "rock_gnome": {},
	}
}

func applyRacialBonuses(stats map[string]int, raceID, subraceID string) {
	rid := strings.ToLower(strings.TrimSpace(raceID))
	sr := strings.ToLower(strings.TrimSpace(subraceID))
	switch rid {
	case "human":
		for _, k := range statOrder {
			stats[k]++
		}
	case "half_elf":
		stats["CHA"] += 2
		opts := []string{"STR", "DEX", "CON", "INT", "WIS"}
		pick := dice.PickNFromPool(opts, 2, hashSeed("halfelf", sr, fmt.Sprint(stats["STR"])))
		for _, a := range pick {
			stats[a]++
		}
	case "tiefling":
		stats["CHA"] += 2
		stats["INT"] += 1
	case "half_orc":
		stats["STR"] += 2
		stats["CON"] += 1
	case "dwarf":
		stats["CON"] += 2
		if sr == "mountain_dwarf" {
			stats["STR"] += 2
		} else {
			stats["WIS"] += 1
		}
	case "elf":
		stats["DEX"] += 2
		switch sr {
		case "high_elf":
			stats["INT"] += 1
		case "wood_elf":
			stats["WIS"] += 1
		case "drow":
			stats["CHA"] += 1
		}
	case "halfling":
		stats["DEX"] += 2
		if sr == "stout" {
			stats["CON"] += 1
		} else {
			stats["CHA"] += 1
		}
	case "gnome":
		stats["INT"] += 2
		if sr == "rock_gnome" {
			stats["CON"] += 1
		} else {
			stats["DEX"] += 1
		}
	}
	for k := range stats {
		if stats[k] > 20 {
			stats[k] = 20
		}
		if stats[k] < 1 {
			stats[k] = 1
		}
	}
}
