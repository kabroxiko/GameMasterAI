package pc

// PHB Chapter 4 — background starting gold pouch (gp only for our generator).
var backgroundStartingGP = map[string]int{
	"acolyte":       15,
	"charlatan":     15,
	"criminal":      15,
	"entertainer":   15,
	"folk_hero":     10,
	"guild_artisan": 15,
	"hermit":        5,
	"noble":         25,
	"outlander":     10,
	"sage":          10,
	"sailor":        10,
	"soldier":       10,
	"urchin":        10,
}

// setStartingCoinage sets D&D 5e coin bag from resolved background id (gp from PHB table; other coins 0).
func setStartingCoinage(pc map[string]interface{}, bgID string) {
	gp := 0
	if bgID != "" {
		if n, ok := backgroundStartingGP[bgID]; ok {
			gp = n
		}
	}
	pc["coinage"] = map[string]interface{}{"pp": 0, "gp": gp, "ep": 0, "sp": 0, "cp": 0}
}
