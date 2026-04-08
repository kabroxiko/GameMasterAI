package pc

// PHB/SRD-style spell ids (snake_case). Used for deterministic random picks; display names come from spellDisplay* maps.

type spellPool struct {
	Cantrips []string
	Level1   []string
}

// spellPools: class spell lists for level-1 random selection (SRD-style names).
var spellPools = map[string]spellPool{
	"wizard": {
		Cantrips: []string{
			"acid_splash", "blade_ward", "chill_touch", "dancing_lights", "fire_bolt", "friends",
			"light", "mage_hand", "mending", "message", "minor_illusion", "poison_spray",
			"prestidigitation", "ray_of_frost", "shocking_grasp", "true_strike",
		},
		Level1: []string{
			"alarm", "burning_hands", "charm_person", "color_spray", "comprehend_languages", "detect_magic",
			"disguise_self", "expeditious_retreat", "false_life", "feather_fall", "find_familiar", "fog_cloud",
			"grease", "identify", "illusory_script", "jump", "longstrider", "mage_armor", "magic_missile",
			"protection_from_evil_and_good", "shield", "silent_image", "sleep", "tashas_hideous_laughter",
			"thunderwave", "unseen_servant",
		},
	},
	"bard": {
		Cantrips: []string{
			"blade_ward", "dancing_lights", "friends", "light", "mage_hand", "mending", "message",
			"minor_illusion", "prestidigitation", "true_strike", "vicious_mockery",
		},
		Level1: []string{
			"animal_friendship", "bane", "charm_person", "comprehend_languages", "cure_wounds", "detect_magic",
			"disguise_self", "faerie_fire", "feather_fall", "healing_word", "heroism", "identify",
			"illusory_script", "longstrider", "silent_image", "sleep", "speak_with_animals", "thunderwave",
			"unseen_servant",
		},
	},
	"cleric": {
		Cantrips: []string{
			"guidance", "light", "mending", "resistance", "sacred_flame", "spare_the_dying", "thaumaturgy",
		},
		Level1: []string{
			"bane", "bless", "command", "create_or_destroy_water", "cure_wounds", "detect_evil_and_good",
			"detect_magic", "detect_poison_and_disease", "guiding_bolt", "healing_word", "inflict_wounds",
			"protection_from_evil_and_good", "purify_food_and_drink", "sanctuary", "shield_of_faith",
		},
	},
	"druid": {
		Cantrips: []string{
			"druidcraft", "guidance", "mending", "poison_spray", "produce_flame", "resistance", "shillelagh",
		},
		Level1: []string{
			"animal_friendship", "charm_person", "create_or_destroy_water", "cure_wounds", "detect_magic",
			"detect_poison_and_disease", "entangle", "faerie_fire", "fog_cloud", "speak_with_animals", "thunderwave",
		},
	},
	"sorcerer": {
		Cantrips: []string{
			"acid_splash", "blade_ward", "chill_touch", "dancing_lights", "fire_bolt", "friends",
			"light", "mage_hand", "mending", "message", "minor_illusion", "poison_spray",
			"prestidigitation", "ray_of_frost", "shocking_grasp", "true_strike",
		},
		Level1: []string{
			"burning_hands", "charm_person", "chromatic_orb", "color_spray", "comprehend_languages", "detect_magic",
			"disguise_self", "expeditious_retreat", "false_life", "feather_fall", "fog_cloud", "jump",
			"mage_armor", "magic_missile", "shield", "silent_image", "sleep", "thunderwave", "witch_bolt",
		},
	},
	"warlock": {
		Cantrips: []string{
			"chill_touch", "eldritch_blast", "mage_hand", "minor_illusion", "poison_spray", "prestidigitation",
			"true_strike",
		},
		Level1: []string{
			"arms_of_hadar", "charm_person", "comprehend_languages", "expeditious_retreat", "hellish_rebuke", "hex",
			"illusory_script", "protection_from_evil_and_good", "unseen_servant", "witch_bolt",
		},
	},
	"artificer": {
		Cantrips: []string{
			"acid_splash", "dancing_lights", "fire_bolt", "guidance", "light", "mage_hand", "mending",
			"prestidigitation", "resistance", "shocking_grasp",
		},
		Level1: []string{
			"alarm", "cure_wounds", "detect_magic", "disguise_self", "expeditious_retreat", "false_life",
			"jump", "longstrider", "sanctuary", "snare",
		},
	},
}

// spellDisplayES maps spell id → Spanish PHB-style name for the character sheet.
var spellDisplayES = map[string]string{
	"acid_splash": "Salpicadura de ácido", "alarm": "Alarma", "animal_friendship": "Amistad con los animales",
	"arms_of_hadar": "Brazos de Hadar", "bane": "Funesto", "blade_ward": "Barrera cortante", "bless": "Bendecir",
	"burning_hands": "Manos ardientes", 	"charm_person": "Hechizar persona", "chill_touch": "Toque helado",
	"chromatic_orb": "Orbe cromático", "color_spray": "Rociada de color", "command": "Ordenar",
	"create_or_destroy_water": "Crear o destruir agua",
	"comprehend_languages": "Comprender idiomas",
	"cure_wounds": "Curar heridas", "dancing_lights": "Luces danzantes", "detect_evil_and_good": "Detectar el bien y el mal",
	"detect_magic": "Detectar magia", "detect_poison_and_disease": "Detectar veneno y enfermedad",
	"disguise_self": "Disfrazarse", "druidcraft": "Artesanía druídica", "eldritch_blast": "Ráfaga sobrenatural",
	"entangle": "Enredar", "expeditious_retreat": "Retirada expeditiva", "faerie_fire": "Fuego feérico",
	"false_life": "Vida falsa", "feather_fall": "Caída de pluma", "find_familiar": "Encontrar familiar",
	"fire_bolt": "Rayo de fuego", "fog_cloud": "Nube de niebla", "friends": "Amigos", "grease": "Grasa",
	"guidance": "Guía", "guiding_bolt": "Rayo guiador", "healing_word": "Palabra curativa", "hellish_rebuke": "Reprensión infernal",
	"heroism": "Heroísmo", "hex": "Maleficio", "identify": "Identificar", 	"illusory_script": "Escritura ilusoria", "inflict_wounds": "Infligir heridas", "jump": "Saltar",
	"light": "Luz", "longstrider": "Zancada larga", "mage_armor": "Armadura de mago", "mage_hand": "Mano de mago",
	"magic_missile": "Proyectil mágico", "mending": "Remendar", "message": "Mensaje", "minor_illusion": "Ilusión menor",
	"poison_spray": "Rociada venenosa", "prestidigitation": "Prestidigitación", "produce_flame": "Producir llama",
	"protection_from_evil_and_good": "Protección contra el bien y el mal", "purify_food_and_drink": "Purificar comida y bebida",
	"ray_of_frost": "Rayo de escarcha", "resistance": "Resistencia", "sacred_flame": "Llama sagrada",
	"sanctuary": "Santuario", "shield": "Escudo", "shield_of_faith": "Escudo de fe", "shillelagh": "Shillelagh",
	"shocking_grasp": "Toque electrizante", "silent_image": "Imagen silenciosa", "sleep": "Dormir", "snare": "Trampa",
	"spare_the_dying": "Estabilizar", "speak_with_animals": "Hablar con los animales", "tashas_hideous_laughter": "Risa horrible de Tasha",
	"thaumaturgy": "Taumaturgia", "thunderwave": "Onda atronadora", "true_strike": "Golpe certero",
	"unseen_servant": "Sirviente invisible", "vicious_mockery": "Mofa cruel", "witch_bolt": "Rayo de bruja",
}
