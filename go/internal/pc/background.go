package pc

import "strings"

// PHB background display titles (sheet / locked choices).
var backgroundLabelByID = map[string]struct {
	en string
	es string
}{
	"acolyte":       {en: "Acolyte", es: "Acolito"},
	"charlatan":     {en: "Charlatan", es: "Charlatán"},
	"criminal":      {en: "Criminal", es: "Criminal"},
	"entertainer":   {en: "Entertainer", es: "Artista"},
	"folk_hero":     {en: "Folk Hero", es: "Héroe del pueblo"},
	"guild_artisan": {en: "Guild Artisan", es: "Artesano gremial"},
	"hermit":        {en: "Hermit", es: "Ermitaño"},
	"noble":         {en: "Noble", es: "Nobleza"},
	"outlander":     {en: "Outlander", es: "Marginado"},
	"sage":          {en: "Sage", es: "Sabio"},
	"sailor":        {en: "Sailor", es: "Marino"},
	"soldier":       {en: "Soldier", es: "Soldado"},
	"urchin":        {en: "Urchin", es: "Golfillo"},
}

func localizedBackgroundLabel(id, locale string) string {
	row, ok := backgroundLabelByID[id]
	if !ok {
		return strings.ReplaceAll(id, "_", " ")
	}
	if locale == "es" && strings.TrimSpace(row.es) != "" {
		return row.es
	}
	return row.en
}
