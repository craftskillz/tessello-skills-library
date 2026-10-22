// The English and French catalogs of the Skills Library Module. The language follows the `locale` of the handshake;
// English is the default.

const en = {
  loading: "Loading…",
  load_retry: "Try again",

  tabs: "Sections",
  tab_library: "Library",
  tab_radar: "Radar",
  tab_editions: "Editions",
  coming_soon: "Coming soon.",

  paste_label: "Paste a GitHub URL",
  paste_placeholder: "github.com/owner/repo/tree/main/skills/my-skill",
  reading: "Reading SKILL.md…",
  already_there: "Already in your Library.",
  not_a_skill_url: "This is not the GitHub URL of a skill.",
  skill_not_found: "No SKILL.md was found at this URL.",
  skill_unreadable: "The SKILL.md could not be read (check your connection).",

  add_manually: "Add manually",
  add_title: "Add a skill",
  name: "Name",
  url: "URL",
  description: "Description",
  add: "Add",
  cancel: "Cancel",

  empty: "No skills yet. Click Add manually to keep your first one.",
  ring_recommended: "Recommended",
  ring_try: "Try",
  ring_watch: "Watch",
  ring_deprecated: "Deprecated",
  stars: "{score} out of 5",

  module_name: "Skills Library",
  widget_count: "{count} skills",
  widget_count_one: "1 skill",
  widget_open: "Open",
  widget_error: "Your skills could not be read.",

  load_error: "Your skills could not be read ({reason}). Nothing can be added until they are read, so that nothing is lost.",
  save_error: "Your last change could not be saved ({reason}). It is still on screen, but will be lost when you leave.",
  save_error_quota: "Your last change could not be saved: the storage of the Skills Library Module is full. It is still on screen, but will be lost when you leave.",
};

type Messages = typeof en;

const fr: Messages = {
  loading: "Chargement…",
  load_retry: "Réessayer",

  tabs: "Sections",
  tab_library: "Library",
  tab_radar: "Radar",
  tab_editions: "Éditions",
  coming_soon: "Bientôt disponible.",

  paste_label: "Collez une URL GitHub",
  paste_placeholder: "github.com/owner/repo/tree/main/skills/ma-skill",
  reading: "Lecture du SKILL.md…",
  already_there: "Déjà dans votre Library.",
  not_a_skill_url: "Ce n'est pas l'URL GitHub d'une skill.",
  skill_not_found: "Aucun SKILL.md n'a été trouvé à cette URL.",
  skill_unreadable: "Le SKILL.md n'a pas pu être lu (vérifiez votre connexion).",

  add_manually: "Ajouter à la main",
  add_title: "Ajouter une skill",
  name: "Nom",
  url: "URL",
  description: "Description",
  add: "Ajouter",
  cancel: "Annuler",

  empty: "Aucune skill pour l'instant. Cliquez sur « Ajouter à la main » pour garder la première.",
  ring_recommended: "Recommandée",
  ring_try: "À essayer",
  ring_watch: "À surveiller",
  ring_deprecated: "Dépréciée",
  stars: "{score} sur 5",

  module_name: "Skills Library",
  widget_count: "{count} skills",
  widget_count_one: "1 skill",
  widget_open: "Ouvrir",
  widget_error: "Vos skills n'ont pas pu être lues.",

  load_error: "Vos skills n'ont pas pu être lues ({reason}). Rien ne peut être ajouté tant qu'elles ne sont pas lues, pour ne rien perdre.",
  save_error: "Votre dernière modification n'a pas pu être enregistrée ({reason}). Elle reste à l'écran, mais sera perdue en quittant.",
  save_error_quota:
    "Votre dernière modification n'a pas pu être enregistrée : le stockage du Module Skills Library est plein. Elle reste à l'écran, mais sera perdue en quittant.",
};

export type MessageKey = keyof Messages;

let messages: Messages = en;

/** Chooses the catalog for a BCP 47 tag, such as "fr-FR"; English for any other language. */
export function setLocale(locale: string): void {
  messages = locale.toLowerCase().split("-")[0] === "fr" ? fr : en;
}

/** The message in the current language, with each `{name}` replaced by its value. */
export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  return messages[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
