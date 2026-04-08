package pc

// classHitDie: PHB hit dice by class (level 1).
var classHitDie = map[string]int{
	"artificer": 8,
	"barbarian": 12,
	"bard":      8,
	"cleric":    8,
	"druid":     8,
	"fighter":   10,
	"monk":      8,
	"paladin":   10,
	"ranger":    10,
	"rogue":     8,
	"sorcerer":  6,
	"warlock":   8,
	"wizard":    6,
}

// primaryAbility: first 4d6 roll (highest) goes here, then secondaryAbility (if set), then CON, then shuffled rest.
var primaryAbility = map[string]string{
	"artificer": "INT",
	"barbarian": "STR",
	"bard":      "CHA",
	"cleric":    "WIS",
	"druid":     "WIS",
	"fighter":   "STR",
	"monk":      "DEX",
	"paladin":   "STR",
	"ranger":    "DEX",
	"rogue":     "DEX",
	"sorcerer":  "CHA",
	"warlock":   "CHA",
	"wizard":    "INT",
}

// secondaryAbility: second-highest roll (when distinct from primary). Empty keeps legacy order: primary, CON, shuffle.
// Barbarian/druid omit secondary so CON stays immediately after primary.
var secondaryAbility = map[string]string{
	"artificer": "DEX",
	"barbarian": "",
	"bard":      "DEX",
	"cleric":    "STR",
	"druid":     "",
	"fighter":   "DEX",
	"monk":      "WIS",
	"paladin":   "CHA",
	"ranger":    "WIS",
	"rogue":     "WIS",
	"sorcerer":  "DEX",
	"warlock":   "DEX",
	"wizard":    "DEX",
}
