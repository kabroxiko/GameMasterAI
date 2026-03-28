import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import store from './store';
import axios from 'axios';

const app = createApp(App);

// Use environment-provided API base URL when available, otherwise default to backend on port 5001
axios.defaults.baseURL = process.env.DM_API_BASE
  ? process.env.DM_API_BASE.replace(/\/$/, '')
  : (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:5001` : '');

// Add request interceptor
axios.interceptors.request.use(
    function (config) {
        console.log('Request:', config);
        return config;
    },
    function (error) {
        console.log('Request Error:', error);
        return Promise.reject(error);
    }
);

// Add response interceptor
axios.interceptors.response.use(
    function (response) {
        console.log('Response:', response);
        return response;
    },
    function (error) {
        console.log('Response Error:', error);
        return Promise.reject(error);
    }
);

app.use(router);
app.use(store);
app.config.globalProperties.$http = axios;
// Listen for language-changed events dispatched from the header and notify the store.
window.addEventListener('language-changed', () => {
  try {
    store.commit('notifyLanguageChanged');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('language-changed handler failed', e);
  }
});

// Global mixin: force components to re-render when languageVersion changes.
app.mixin({
  created() {
    if (this.$store && typeof this.$watch === 'function') {
      // watch store.languageVersion and force update when it increments
      this.__unwatchLang = this.$watch(
        () => this.$store.state.languageVersion,
        () => {
          try {
            this.$forceUpdate && this.$forceUpdate();
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('forceUpdate in mixin failed', e);
          }
        }
      );
    }
  },
  beforeUnmount() {
    if (this.__unwatchLang) {
      this.__unwatchLang();
      this.__unwatchLang = null;
    }
  }
});

// Simple translation helper that reads the reactive store language
const translations = {
  English: {
    chat_placeholder: 'What would you like to do?',
    send: 'Send',
    sending: 'Sending...',
    start_game: 'Start Game',
    new_game: 'New Game',
    load_game: 'Load Game',
    setup_title: 'The Start of Your Adventure',
    setup_desc: 'Select the building blocks of your character and story.',
    starting: 'Starting...',
    generating_campaign: 'Generating campaign...',
    campaign_generated: 'Campaign generated. Generating character...',
    generating_character: 'Generating character...',
    error_generating_character: 'Error generating character',
    saving_game: 'Saving game...',
    error_saving_game: 'Error saving game',
    loading: 'Loading...',
    welcome: 'Welcome to Dungeon Master',
    attributes: 'Attributes',
    dm_label: 'Dungeon Master',
    subtitle: 'Dark Fantasy — DnD inspired',
    background: 'Background',
    equipment: 'Equipment',
    level_prefix: 'Level ',
    character_gender: 'Gender',
    gender_male: 'Male',
    gender_female: 'Female',
    character_name: 'Name',
    character_class: 'Class',
    character_race: 'Race',
    character_level: 'Level',
    subclass: 'Subclass',
    /* short labels for form placeholders */
    character_name_short: 'Name',
    character_class_short: 'Class',
    character_race_short: 'Race',
    character_level_short: 'Level',
    gender_male_short: 'Male',
    gender_female_short: 'Female',
    random: 'Random',
    classes: [
      { id: 'random', label: 'Random' },
      { id: 'barbarian', label: 'Barbarian' },
      { id: 'bard', label: 'Bard' },
      { id: 'cleric', label: 'Cleric' },
      { id: 'druid', label: 'Druid' },
      { id: 'fighter', label: 'Fighter' },
      { id: 'monk', label: 'Monk' },
      { id: 'paladin', label: 'Paladin' },
      { id: 'ranger', label: 'Ranger' },
      { id: 'rogue', label: 'Rogue' },
      { id: 'sorcerer', label: 'Sorcerer' },
      { id: 'warlock', label: 'Warlock' },
      { id: 'wizard', label: 'Wizard' },
      { id: 'artificer', label: 'Artificer' }
    ],
    races: [
      { id: 'random', label: 'Random' },
      { id: 'human', label: 'Human' },
      { id: 'elf', label: 'Elf' },
      { id: 'dwarf', label: 'Dwarf' },
      { id: 'halfling', label: 'Halfling' },
      { id: 'half-elf', label: 'Half-Elf' },
      { id: 'half-orc', label: 'Half-Orc' },
      { id: 'gnome', label: 'Gnome' },
      { id: 'tiefling', label: 'Tiefling' }
    ]
  },
  Spanish: {
    chat_placeholder: '¿Qué quieres hacer?',
    send: 'Enviar',
    sending: 'Enviando...',
    start_game: 'Iniciar Juego',
    new_game: 'Nuevo Juego',
    load_game: 'Cargar Partida',
    setup_title: 'El comienzo de tu aventura',
    setup_desc: 'Selecciona los elementos básicos de tu personaje y la historia.',
    starting: 'Iniciando...',
    generating_campaign: 'Generando campaña...',
    campaign_generated: 'Campaña generada. Generando personaje...',
    generating_character: 'Generando personaje...',
    error_generating_character: 'Error generando personaje',
    saving_game: 'Guardando partida...',
    error_saving_game: 'Error guardando partida',
    loading: 'Cargando...',
    welcome: 'Bienvenido a Dungeon Master',
    attributes: 'Atributos',
    dm_label: 'Dungeon Master',
    subtitle: 'Dark Fantasy — DnD inspirado',
    background: 'Historia',
    equipment: 'Equipo',
    level_prefix: 'Nivel ',
    character_gender: 'Género',
    gender_male: 'Masculino',
    gender_female: 'Femenino',
    character_name: 'Nombre',
    character_class: 'Clase',
    character_race: 'Raza',
    character_level: 'Nivel',
    subclass: 'Subclase',
    /* short labels for form placeholders */
    character_name_short: 'Nombre',
    character_class_short: 'Clase',
    character_race_short: 'Raza',
    character_level_short: 'Nivel',
    gender_male_short: 'Masculino',
    gender_female_short: 'Femenino',
    random: 'Aleatorio',
    classes: [
      { id: 'random', label: 'Aleatorio' },
      { id: 'barbarian', label: 'Bárbaro' },
      { id: 'bard', label: 'Bardo' },
      { id: 'cleric', label: 'Clérigo' },
      { id: 'druid', label: 'Druida' },
      { id: 'fighter', label: 'Guerrero' },
      { id: 'monk', label: 'Monje' },
      { id: 'paladin', label: 'Paladín' },
      { id: 'ranger', label: 'Explorador' },
      { id: 'rogue', label: 'Pícaro' },
      { id: 'sorcerer', label: 'Hechicero' },
      { id: 'warlock', label: 'Brujo' },
      { id: 'wizard', label: 'Mago' },
      { id: 'artificer', label: 'Artífice' }
    ],
    races: [
      { id: 'random', label: 'Aleatorio' },
      { id: 'human', label: 'Humano' },
      { id: 'elf', label: 'Elfo' },
      { id: 'dwarf', label: 'Enano' },
      { id: 'halfling', label: 'Mediano' },
      { id: 'half-elf', label: 'Medio elfo' },
      { id: 'half-orc', label: 'Medio orco' },
      { id: 'gnome', label: 'Gnomo' },
      { id: 'tiefling', label: 'Tiflin' }
    ]
  }
};

app.config.globalProperties.$t = (key) => {
  try {
    const lang = store.state.language || 'English';
    return (translations[lang] && translations[lang][key]) || key;
  } catch (e) {
    return key;
  }
};

// Provide a reactive computed translations object to all components via a global mixin.
// Components can use `$i18n` in templates (e.g. `{{ $i18n.send }}`) and it will update reactively.
app.mixin({
  computed: {
    $i18n() {
      const lang = (this.$store && this.$store.state && this.$store.state.language) || 'English';
      return translations[lang] || translations.English;
    }
  }
});

app.mount('#app');