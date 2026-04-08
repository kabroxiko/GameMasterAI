package validate

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"go.mongodb.org/mongo-driver/bson/primitive"

	playerchar "github.com/deckofdmthings/gmai/internal/pc"
)

// asStringMap decodes BSON/JSON subdocuments for playerCharacter rows (weapons, skills, etc.).
func asStringMap(v interface{}) (map[string]interface{}, bool) {
	if v == nil {
		return nil, false
	}
	switch m := v.(type) {
	case map[string]interface{}:
		return m, true
	case primitive.M:
		return map[string]interface{}(m), true
	default:
		return nil, false
	}
}

var damageDiceRe = regexp.MustCompile(`(?i)\d*d\d+`)

// CurrencyKeys order.
var CurrencyKeys = []string{"pp", "gp", "ep", "sp", "cp"}

// NormalizeCoinageObject returns full coin bag.
func NormalizeCoinageObject(raw map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{"pp": 0, "gp": 0, "ep": 0, "sp": 0, "cp": 0}
	if raw == nil {
		return out
	}
	for _, k := range CurrencyKeys {
		if v, ok := raw[k]; ok {
			if n := normalizeCoinAmount(v); n != nil {
				out[k] = *n
			}
		}
	}
	return out
}

func normalizeCoinAmount(raw interface{}) *int {
	if raw == nil {
		return nil
	}
	var n int
	switch t := raw.(type) {
	case int:
		n = t
	case int32:
		n = int(t)
	case int64:
		n = int(t)
	case float64:
		n = int(t)
	default:
		s := strings.TrimSpace(fmt.Sprint(t))
		s = strings.TrimPrefix(s, "+")
		for _, r := range s {
			if r >= '0' && r <= '9' {
				n = n*10 + int(r-'0')
			} else {
				break
			}
		}
	}
	if n < 0 {
		return nil
	}
	if n > 9999999 {
		n = 9999999
	}
	return &n
}

// EnsurePlayerCharacterSheetDefaults applies idempotent defaults (subset of Node).
func EnsurePlayerCharacterSheetDefaults(pc map[string]interface{}, language string) map[string]interface{} {
	if pc == nil {
		return nil
	}
	out := shallowClone(pc)
	if strings.TrimSpace(str(out["name"])) == "" {
		if id, ok := out["identity"].(map[string]interface{}); ok {
			if n, ok := id["name"].(string); ok && strings.TrimSpace(n) != "" {
				out["name"] = strings.TrimSpace(n)
			}
		}
	}
	applyCoinageInPlace(out)
	if out[playerchar.CombatPrecomputedKey] == true && playerchar.CombatFieldsPresent(out) {
		delete(out, playerchar.CombatPrecomputedKey)
	} else {
		delete(out, playerchar.CombatPrecomputedKey)
		playerchar.ComputeStatsCoinageAndCombat(out, language)
	}
	if out[playerchar.SpellsPrecomputedKey] == true && playerchar.SpellsFieldsPresent(out) {
		delete(out, playerchar.SpellsPrecomputedKey)
	} else {
		delete(out, playerchar.SpellsPrecomputedKey)
		playerchar.ComputeAndSetSpells(out, language)
	}
	playerchar.ComputeAndSetSkills(out, language)
	lang := strings.ToLower(language)
	langs, _ := out["languages"].([]interface{})
	if len(langs) == 0 {
		if strings.HasPrefix(lang, "span") {
			out["languages"] = []interface{}{"Común"}
		} else {
			out["languages"] = []interface{}{"Common"}
		}
	}
	return out
}

func applyCoinageInPlace(pc map[string]interface{}) {
	if c, ok := pc["coinage"].(map[string]interface{}); ok && c != nil {
		pc["coinage"] = NormalizeCoinageObject(c)
		return
	}
	if c, ok := pc["currency"].(map[string]interface{}); ok {
		pc["coinage"] = NormalizeCoinageObject(c)
		delete(pc, "currency")
		return
	}
	pc["coinage"] = map[string]interface{}{"pp": 0, "gp": 15, "ep": 0, "sp": 0, "cp": 0}
}

func shallowClone(m map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{}
	for k, v := range m {
		out[k] = v
	}
	return out
}

func str(v interface{}) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return strings.TrimSpace(fmt.Sprint(v))
}

func toFloat(v interface{}) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case int32:
		return float64(t), true
	case int64:
		return float64(t), true
	default:
		s := strings.TrimSpace(str(v))
		s = strings.TrimPrefix(s, "+")
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return math.NaN(), false
		}
		return f, true
	}
}

func compactDamage(v interface{}) string {
	return strings.TrimSpace(str(v))
}

// asIfaceSlice accepts BSON-decoded arrays (primitive.A) and plain []interface{}.
func asIfaceSlice(v interface{}) ([]interface{}, bool) {
	if v == nil {
		return nil, false
	}
	switch x := v.(type) {
	case []interface{}:
		return x, true
	case primitive.A:
		return []interface{}(x), true
	default:
		return nil, false
	}
}

// StripAcBonusFromArmorWeaponsInPlace removes ac_bonus from armor and weapon rows (generate-character contract).
func StripAcBonusFromArmorWeaponsInPlace(pc map[string]interface{}) {
	if pc == nil {
		return
	}
	if arm, ok := asIfaceSlice(pc["armor"]); ok {
		for i, it := range arm {
			if m, ok := asStringMap(it); ok && m != nil {
				delete(m, "ac_bonus")
				arm[i] = m
			}
		}
		pc["armor"] = arm
	}
	if wpn, ok := asIfaceSlice(pc["weapons"]); ok {
		for i, it := range wpn {
			if m, ok := asStringMap(it); ok && m != nil {
				delete(m, "ac_bonus")
				wpn[i] = m
			}
		}
		pc["weapons"] = wpn
	}
}

func coercePrimitiveSliceFieldsInPlace(pc map[string]interface{}) {
	if pc == nil {
		return
	}
	for _, key := range []string{"armor", "equipment", "tools", "weapons", "languages"} {
		if sl, ok := asIfaceSlice(pc[key]); ok {
			pc[key] = sl
		}
	}
	// Optional: coerce `ammunition` when present (model output); server does not create or repair it.
	if sl, ok := asIfaceSlice(pc["ammunition"]); ok {
		pc["ammunition"] = sl
	}
}

// coerceSkillsArrayInPlace normalizes `skills` to an array; rejects non-array values.
func coerceSpellsArrayInPlace(pc map[string]interface{}) string {
	if pc == nil {
		return ""
	}
	raw := pc["spells"]
	if raw == nil {
		pc["spells"] = []interface{}{}
		return ""
	}
	sl, ok := asIfaceSlice(raw)
	if !ok {
		return "playerCharacter.spells must be an array (use [] if none)."
	}
	pc["spells"] = sl
	return ""
}

// coerceSkillsArrayInPlace normalizes `skills` to an array; rejects non-array values.
func coerceSkillsArrayInPlace(pc map[string]interface{}) string {
	if pc == nil {
		return ""
	}
	raw := pc["skills"]
	if raw == nil {
		pc["skills"] = []interface{}{}
		return ""
	}
	sl, ok := asIfaceSlice(raw)
	if !ok {
		return "playerCharacter.skills must be an array (use [] if none)."
	}
	pc["skills"] = sl
	return ""
}

// ValidateModelCharacterOutput checks fields required from the LLM output after server merges
// (stats, coinage, max_hp, ac, skills, spells, spell_slots are already applied for generate-character).
func ValidateModelCharacterOutput(pc map[string]interface{}) (bool, string) {
	if pc == nil {
		return false, "playerCharacter must be an object"
	}
	coercePrimitiveSliceFieldsInPlace(pc)
	if errStr := coerceSpellsArrayInPlace(pc); errStr != "" {
		return false, errStr
	}
	if strings.TrimSpace(str(pc["name"])) == "" {
		return false, "playerCharacter.name is required"
	}
	if _, ok := asIfaceSlice(pc["armor"]); !ok {
		return false, "playerCharacter.armor must be an array (use [] if none)."
	}
	if _, ok := asIfaceSlice(pc["equipment"]); !ok {
		return false, "playerCharacter.equipment must be an array (may be [])."
	}
	if _, ok := asIfaceSlice(pc["tools"]); !ok {
		return false, "playerCharacter.tools must be an array (may be [])."
	}
	if _, ok := asIfaceSlice(pc["weapons"]); !ok {
		return false, "playerCharacter.weapons must be an array (may be [])."
	}
	langs, langOk := asIfaceSlice(pc["languages"])
	if !langOk || len(langs) == 0 {
		return false, "playerCharacter.languages must be a non-empty array of strings"
	}
	for i, x := range langs {
		if strings.TrimSpace(str(x)) == "" {
			return false, fmt.Sprintf("playerCharacter.languages[%d] must be a non-empty string.", i)
		}
	}
	weapons, _ := asIfaceSlice(pc["weapons"])
	for i, w := range weapons {
		row, ok := asStringMap(w)
		if !ok {
			return false, fmt.Sprintf("weapons[%d] must be an object", i)
		}
		if strings.TrimSpace(str(row["name"])) == "" {
			return false, fmt.Sprintf("weapons[%d].name is required when weapons are listed", i)
		}
		dmg := compactDamage(row["damage"])
		if !damageDiceRe.MatchString(dmg) {
			return false, fmt.Sprintf("weapons[%d].damage must include dice", i)
		}
	}
	return true, ""
}

// ValidateGeneratedPlayerCharacter mirrors Node checks used by persist and lobby.
func ValidateGeneratedPlayerCharacter(pc map[string]interface{}) (bool, string) {
	if pc == nil {
		return false, "playerCharacter must be an object"
	}
	coercePrimitiveSliceFieldsInPlace(pc)
	if errStr := coerceSkillsArrayInPlace(pc); errStr != "" {
		return false, errStr
	}
	if errStr := coerceSpellsArrayInPlace(pc); errStr != "" {
		return false, errStr
	}
	if strings.TrimSpace(str(pc["name"])) == "" {
		return false, "playerCharacter.name is required"
	}
	hp, hpOk := toFloat(pc["max_hp"])
	ac, acOk := toFloat(pc["ac"])
	if !hpOk || math.IsNaN(hp) {
		return false, "playerCharacter.max_hp must be a finite number"
	}
	if !acOk || math.IsNaN(ac) {
		return false, "playerCharacter.ac must be a finite number"
	}
	if _, ok := asIfaceSlice(pc["armor"]); !ok {
		return false, "playerCharacter.armor must be an array (use [] if none)."
	}
	if _, ok := asIfaceSlice(pc["equipment"]); !ok {
		return false, "playerCharacter.equipment must be an array (may be [])."
	}
	if _, ok := asIfaceSlice(pc["tools"]); !ok {
		return false, "playerCharacter.tools must be an array (may be [])."
	}
	if _, ok := asIfaceSlice(pc["weapons"]); !ok {
		return false, "playerCharacter.weapons must be an array (may be [])."
	}
	cur, _ := pc["coinage"].(map[string]interface{})
	if cur == nil {
		return false, "playerCharacter.coinage must be an object { pp, gp, ep, sp, cp } (D&D 5e)."
	}
	norm := NormalizeCoinageObject(cur)
	for _, k := range CurrencyKeys {
		v := norm[k]
		n := 0
		switch t := v.(type) {
		case int:
			n = t
		case float64:
			n = int(t)
		default:
			return false, "playerCharacter.coinage." + k + " must be a non-negative integer."
		}
		if n < 0 {
			return false, "playerCharacter.coinage." + k + " must be a non-negative integer."
		}
	}
	langs, langOk := asIfaceSlice(pc["languages"])
	if !langOk || len(langs) == 0 {
		return false, "playerCharacter.languages must be a non-empty array of strings"
	}
	for i, x := range langs {
		if strings.TrimSpace(str(x)) == "" {
			return false, fmt.Sprintf("playerCharacter.languages[%d] must be a non-empty string.", i)
		}
	}
	skills, _ := asIfaceSlice(pc["skills"])
	for i, item := range skills {
		row, ok := asStringMap(item)
		if !ok {
			return false, fmt.Sprintf("playerCharacter.skills[%d] must be an object", i)
		}
		if strings.TrimSpace(str(row["name"])) == "" {
			return false, fmt.Sprintf("playerCharacter.skills[%d].name is required when skills are listed", i)
		}
		bonus, bOk := toFloat(row["bonus"])
		if !bOk || math.IsNaN(bonus) {
			return false, fmt.Sprintf("playerCharacter.skills[%d].bonus must be a finite number", i)
		}
	}
	spells, _ := asIfaceSlice(pc["spells"])
	for i, item := range spells {
		row, ok := asStringMap(item)
		if !ok {
			return false, fmt.Sprintf("playerCharacter.spells[%d] must be an object", i)
		}
		if strings.TrimSpace(str(row["name"])) == "" {
			return false, fmt.Sprintf("playerCharacter.spells[%d].name is required when spells are listed", i)
		}
		lv, lvOk := toFloat(row["level"])
		if !lvOk || math.IsNaN(lv) {
			return false, fmt.Sprintf("playerCharacter.spells[%d].level must be a finite number", i)
		}
	}
	if rawSlots := pc["spell_slots"]; rawSlots != nil {
		slots, ok := asStringMap(rawSlots)
		if !ok {
			return false, "playerCharacter.spell_slots must be an object with string keys when present."
		}
		for k, v := range slots {
			n, nOk := toFloat(v)
			if !nOk || math.IsNaN(n) || n < 0 {
				return false, fmt.Sprintf("playerCharacter.spell_slots[%s] must be a non-negative number.", k)
			}
		}
	}
	weapons, _ := asIfaceSlice(pc["weapons"])
	for i, w := range weapons {
		row, ok := asStringMap(w)
		if !ok {
			return false, fmt.Sprintf("weapons[%d] must be an object", i)
		}
		if strings.TrimSpace(str(row["name"])) == "" {
			return false, fmt.Sprintf("weapons[%d].name is required when weapons are listed", i)
		}
		dmg := compactDamage(row["damage"])
		if !damageDiceRe.MatchString(dmg) {
			return false, fmt.Sprintf("weapons[%d].damage must include dice", i)
		}
	}
	return true, ""
}

// SheetLooksValid matches partyLobbyState sheetLooksValid.
func SheetLooksValid(sheet map[string]interface{}, language string) bool {
	if sheet == nil {
		return false
	}
	coerceLanguagesSliceInPlace(sheet)
	norm := EnsurePlayerCharacterSheetDefaults(sheet, language)
	ok, _ := ValidateGeneratedPlayerCharacter(norm)
	return ok
}

// coerceLanguagesSliceInPlace normalizes BSON/JSON shapes so validation matches Node after load.
func coerceLanguagesSliceInPlace(pc map[string]interface{}) {
	if pc == nil {
		return
	}
	raw := pc["languages"]
	switch v := raw.(type) {
	case nil:
		return
	case []interface{}:
		return
	case primitive.A:
		pc["languages"] = []interface{}(v)
	case []string:
		out := make([]interface{}, 0, len(v))
		for _, s := range v {
			out = append(out, s)
		}
		pc["languages"] = out
	case string:
		if strings.TrimSpace(v) != "" {
			pc["languages"] = []interface{}{strings.TrimSpace(v)}
		}
	default:
		// single element or odd types — leave for EnsurePlayerCharacterSheetDefaults
	}
}
