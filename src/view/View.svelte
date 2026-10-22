<script lang="ts">
  import { tick } from "svelte";
  import { fetchSkill, findDuplicate, parseSkillUrl } from "../lib/github.ts";
  import { t, type MessageKey } from "../lib/i18n.ts";
  import { type Filters, filterSkills, linkOf, newestFirst, type Ring, RINGS, type Skill, type Tab, TABS, DESCRIPTION_MAX, NAME_MAX, QUADRANT_NAME_MAX } from "../lib/skills.ts";
  import { add, load, renameQuadrant, setFilters, setTab, settings, skills, status } from "../lib/store.svelte.ts";
  import EditPanel from "./EditPanel.svelte";
  import Modal from "./Modal.svelte";
  import RadarTab from "./RadarTab.svelte";

  const shown = $derived(filterSkills(newestFirst(skills.list), settings.filters));
  const filtered = $derived(settings.filters.rings.length > 0 || settings.filters.quadrants.length > 0 || settings.filters.query.trim() !== "");

  let adding = $state(false);
  let name = $state("");
  let url = $state("");
  let description = $state("");

  function openForm(prefilled = "") {
    name = description = "";
    url = prefilled;
    adding = true;
  }

  /** The skill whose row is highlighted a moment. */
  let highlighted = $state("");
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;

  /** No filter on, with the archived skills shown or not. */
  const cleared = (archived: boolean): Filters => ({ rings: [], quadrants: [], query: "", archived });

  /** Highlights the row of a skill a moment, and scrolls to it; filters that hide it are cleared, and archived skills shown when it is one. */
  async function show(skill: Skill) {
    if (!shown.some((item) => item.id === skill.id)) setFilters(cleared(skill.archived || settings.filters.archived));
    highlighted = skill.id;
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => (highlighted = ""), 2000);
    await tick();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(`[data-skill-id="${skill.id}"]`)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
  }

  /** The skill whose edit panel is open. */
  let editing = $state("");

  /** What a skill just added gets: its row is shown, and its edit panel opens. */
  function select(skill: Skill) {
    editing = skill.id;
    return show(skill);
  }

  /** A click on a point or a line of the radar opens the skill in the Library. */
  function openFromRadar(skill: Skill) {
    setTab("library");
    return select(skill);
  }

  /** A click on a row opens its panel, unless it is on a link or a button. */
  function onRowClick(event: MouseEvent, skill: Skill) {
    if ((event.target as HTMLElement).closest("a, button")) return;
    editing = skill.id;
  }

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  // The names of the quadrants being typed, which can differ from the saved ones while one is blank.
  let renaming = $state(false);
  let quadrantNames = $state<string[]>([]);
  let quadrantErrors = $state<boolean[]>([false, false, false, false]);

  function openRename() {
    quadrantNames = [...settings.quadrants];
    quadrantErrors = [false, false, false, false];
    renaming = true;
  }

  function typeQuadrant(index: number) {
    quadrantErrors[index] = !renameQuadrant(index, quadrantNames[index]);
  }

  // The field to paste a GitHub URL in, and what it answers.
  let pasted = $state("");
  let notice = $state<{ text: string; manualUrl?: string }>({ text: "" });
  /** The latest entry, so that a slow answer to an older one is dropped. */
  let entry = 0;

  function alreadyThere(skill: Skill) {
    notice = { text: t("already_there") };
    void show(skill);
  }

  /** Reads the skill at the URL and adds it, unless it is there already; an error leaves the User to add it by hand. */
  async function addFromUrl(text: string) {
    if (!text.trim()) return;
    const mine = ++entry;
    const parsed = parseSkillUrl(text);
    if (!parsed) {
      notice = { text: t("not_a_skill_url"), manualUrl: text.trim() };
      return;
    }
    const existing = findDuplicate(skills.list, parsed.sourceUrl);
    if (existing) {
      alreadyThere(existing);
      return;
    }
    notice = { text: t("reading") };
    const result = await fetchSkill(parsed);
    if (mine !== entry) return;
    if (!result.ok) {
      notice = { text: t(result.reason === "not_found" ? "skill_not_found" : "skill_unreadable"), manualUrl: parsed.sourceUrl };
      return;
    }
    const outcome = add({ name: result.name, url: parsed.sourceUrl, description: result.description });
    if (!outcome) {
      notice = { text: "" };
    } else if ("duplicate" in outcome) {
      alreadyThere(outcome.duplicate);
    } else {
      notice = { text: "" };
      pasted = "";
      void select(outcome.added);
    }
  }

  function submitPasted(event: SubmitEvent) {
    event.preventDefault();
    void addFromUrl(pasted);
  }

  /** A paste in the field adds at once. */
  function pasteInField(event: ClipboardEvent) {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!text.trim()) return;
    event.preventDefault();
    pasted = text.trim();
    void addFromUrl(text);
  }

  /** What was answered goes at the next input. */
  function typeInField() {
    entry++;
    notice = { text: "" };
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const outcome = add({ name, url, description });
    if (!outcome) return;
    adding = false;
    if ("duplicate" in outcome) alreadyThere(outcome.duplicate);
    else void select(outcome.added);
  }

  /** Arrow keys move between the tabs, as a tablist does. */
  function onTabKey(event: KeyboardEvent, tab: Tab) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  /** The score as stars: ★★★☆☆. */
  const stars = (score: number) => "★".repeat(score) + "☆".repeat(5 - score);
</script>

<div class="sl-root" class:sl-root--panel={editing !== ""}>
  {#if status.loadError}
    <div class="sl-blocked" role="alert">
      <p>{status.loadError}</p>
      <button type="button" class="sl-btn" onclick={load}>{t("load_retry")}</button>
    </div>
  {:else if !status.loaded}
    <p class="sl-message">{t("loading")}</p>
  {:else}
    <header class="sl-bar">
      <div class="sl-tabs" role="tablist" aria-label={t("tabs")}>
        {#each TABS as tab (tab)}
          <button
            type="button"
            role="tab"
            id="tab-{tab}"
            class="sl-tab"
            aria-selected={settings.tab === tab}
            aria-controls="panel-{tab}"
            tabindex={settings.tab === tab ? 0 : -1}
            onclick={() => setTab(tab)}
            onkeydown={(event) => onTabKey(event, tab)}
          >
            {t(`tab_${tab}` as MessageKey)}
          </button>
        {/each}
      </div>
      <div class="sl-actions">
        {#if settings.tab === "library"}
          <button type="button" class="sl-btn" onclick={openRename}>{t("rename_quadrants")}</button>
        {/if}
        <button type="button" class="sl-btn sl-btn--primary" onclick={() => openForm()}>{t("add_manually")}</button>
      </div>
    </header>
    {#if status.saveError}
      <p class="sl-banner" role="alert">{status.saveError}</p>
    {/if}
    <div role="tabpanel" id="panel-{settings.tab}" aria-labelledby="tab-{settings.tab}">
      {#if settings.tab === "library"}
        <form class="sl-paste" onsubmit={submitPasted}>
          <label>
            {t("paste_label")}
            <input
              type="text"
              inputmode="url"
              autocomplete="off"
              placeholder={t("paste_placeholder")}
              bind:value={pasted}
              oninput={typeInField}
              onpaste={pasteInField}
            />
          </label>
        </form>
        <div class="sl-notice" role="status">
          {#if notice.text}
            <span>{notice.text}</span>
            {#if notice.manualUrl}
              <button type="button" class="sl-btn" onclick={() => openForm(notice.manualUrl)}>{t("add_manually")}</button>
            {/if}
          {/if}
        </div>
        {#if skills.list.length}
          <div class="sl-filters">
            <label class="sl-search">
              {t("search")}
              <input
                type="search"
                autocomplete="off"
                value={settings.filters.query}
                oninput={(event) => setFilters({ ...settings.filters, query: event.currentTarget.value })}
              />
            </label>
            <div class="sl-chips" role="group" aria-label={t("filter_rings")}>
              {#each RINGS as ring (ring)}
                <button
                  type="button"
                  class="sl-chip"
                  aria-pressed={settings.filters.rings.includes(ring)}
                  onclick={() => setFilters({ ...settings.filters, rings: RINGS.filter((item) => toggle<Ring>(settings.filters.rings, ring).includes(item)) })}
                >
                  {t(`ring_${ring}` as MessageKey)}
                </button>
              {/each}
            </div>
            <div class="sl-chips" role="group" aria-label={t("filter_quadrants")}>
              {#each settings.quadrants as quadrant, index (index)}
                <button
                  type="button"
                  class="sl-chip"
                  aria-pressed={settings.filters.quadrants.includes(index)}
                  onclick={() => setFilters({ ...settings.filters, quadrants: toggle(settings.filters.quadrants, index).sort((a, b) => a - b) })}
                >
                  {quadrant}
                </button>
              {/each}
            </div>
            <label class="sl-switch">
              <input type="checkbox" checked={settings.filters.archived} onchange={(event) => setFilters({ ...settings.filters, archived: event.currentTarget.checked })} />
              {t("show_archived")}
            </label>
            {#if filtered}
              <div>
                <button type="button" class="sl-btn" onclick={() => setFilters(cleared(settings.filters.archived))}>{t("clear_filters")}</button>
              </div>
            {/if}
          </div>
        {/if}
        {#if shown.length}
          <ul class="sl-list">
            {#each shown as skill (skill.id)}
              {@const link = linkOf(skill)}
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
              <li class="sl-skill" class:sl-highlighted={highlighted === skill.id} class:sl-archived={skill.archived} data-skill-id={skill.id} onclick={(event) => onRowClick(event, skill)}>
                <span class="sl-name">
                  {#if link}
                    <a href={link} target="_blank" rel="noopener">{skill.name}</a>
                  {:else}
                    {skill.name}
                  {/if}
                </span>
                <button type="button" class="sl-btn" aria-label={t("edit_skill", { name: skill.name })} onclick={() => (editing = skill.id)}>✎</button>
                <span class="sl-ring sl-ring--{skill.ring}">{t(`ring_${skill.ring}` as MessageKey)}</span>
                <span class="sl-stars" role="img" aria-label={t("stars", { score: skill.score })}>{stars(skill.score)}</span>
                <span class="sl-quadrant">{settings.quadrants[skill.quadrant]}</span>
                {#if skill.archived}<span class="sl-tag">{t("archived_tag")}</span>{/if}
              </li>
            {/each}
          </ul>
        {:else if skills.list.length}
          <p class="sl-message">{t("no_match")}</p>
        {:else}
          <p class="sl-message">{t("empty")}</p>
        {/if}
      {:else if settings.tab === "radar"}
        <RadarTab onOpen={openFromRadar} />
      {:else}
        <p class="sl-message">{t("coming_soon")}</p>
      {/if}
    </div>
  {/if}

  {#if editing}
    {#key editing}
      <EditPanel id={editing} onClose={() => (editing = "")} />
    {/key}
  {/if}

  <Modal open={renaming} title={t("rename_quadrants")} onClose={() => (renaming = false)}>
    <div class="sl-form">
      {#each quadrantNames as _, index (index)}
        <div class="sl-field">
          <label for="sl-quadrant-{index}">{t("quadrant_n", { n: index + 1 })}</label>
          <input
            id="sl-quadrant-{index}"
            type="text"
            required
            maxlength={QUADRANT_NAME_MAX}
            autocomplete="off"
            aria-invalid={quadrantErrors[index] ? "true" : undefined}
            bind:value={quadrantNames[index]}
            oninput={() => typeQuadrant(index)}
          />
          {#if quadrantErrors[index]}<span class="sl-error" role="alert">{t("quadrant_required")}</span>{/if}
        </div>
      {/each}
    </div>
    {#snippet actions()}
      <button type="button" class="sl-btn sl-btn--primary" onclick={() => (renaming = false)}>{t("close")}</button>
    {/snippet}
  </Modal>

  <Modal open={adding} title={t("add_title")} onClose={() => (adding = false)}>
    <form id="sl-add-form" class="sl-form" onsubmit={submit}>
      <label>
        {t("name")}
        <input type="text" required maxlength={NAME_MAX} autocomplete="off" bind:value={name} />
      </label>
      <label>
        {t("url")}
        <input type="text" inputmode="url" autocomplete="off" bind:value={url} />
      </label>
      <label>
        {t("description")}
        <textarea rows="3" maxlength={DESCRIPTION_MAX} bind:value={description}></textarea>
      </label>
    </form>
    {#snippet actions()}
      <button type="button" class="sl-btn" onclick={() => (adding = false)}>{t("cancel")}</button>
      <button type="submit" form="sl-add-form" class="sl-btn sl-btn--primary" disabled={!name.trim()}>{t("add")}</button>
    {/snippet}
  </Modal>
</div>

<style>
  .sl-root {
    max-width: 960px;
    margin: 0 auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  /* On a wide page the edit panel sits beside the list instead of over it, so that the bar stays within reach. */
  @media (min-width: 900px) {
    .sl-root--panel {
      margin: 0;
      max-width: min(960px, calc(100% - 400px));
    }
  }
  .sl-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .sl-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .sl-filters {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sl-search {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .sl-search input {
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    font: inherit;
  }
  .sl-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .sl-chip {
    font: inherit;
    font-size: 12px;
    padding: 4px 11px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: none;
    color: var(--ink);
    cursor: pointer;
  }
  .sl-chip[aria-pressed="true"] {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .sl-switch {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .sl-skill {
    cursor: pointer;
  }
  /* An archived skill is shown, when asked, but set apart. */
  .sl-archived {
    opacity: 0.55;
  }
  .sl-tag {
    font-size: 11px;
    padding: 1px 8px;
    border-radius: 999px;
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .sl-error {
    color: var(--red);
    font-size: 12px;
  }
  .sl-tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--line);
  }
  .sl-tab {
    padding: 6px 14px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--muted);
    font: inherit;
    cursor: pointer;
  }
  .sl-tab[aria-selected="true"] {
    color: var(--ink);
    border-bottom-color: var(--accent);
    font-weight: 600;
  }
  .sl-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sl-skill {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 14px;
    padding: 10px 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel);
  }
  /* The row of a skill added again, or just added, shown a moment. */
  .sl-highlighted {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .sl-paste label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .sl-paste input {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    font: inherit;
  }
  .sl-paste input:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  .sl-notice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--muted);
  }
  .sl-notice:empty {
    display: none;
  }
  .sl-name {
    flex: 1 1 200px;
    min-width: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .sl-name a {
    color: var(--accent-strong);
  }
  .sl-ring,
  .sl-quadrant {
    font-size: 12px;
    color: var(--muted);
  }
  .sl-stars {
    letter-spacing: 1px;
    color: var(--accent-strong);
    white-space: nowrap;
  }
  .sl-message {
    margin: 40px auto;
    color: var(--muted);
    text-align: center;
  }
  .sl-banner,
  .sl-blocked {
    margin: 0;
    padding: 10px 14px;
    border: 1px solid var(--red);
    background: var(--red-soft);
    border-radius: 10px;
    font-size: 13px;
  }
  .sl-blocked {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  .sl-blocked p {
    margin: 0;
  }
  .sl-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .sl-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .sl-form label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .sl-form input,
  .sl-form textarea {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    font: inherit;
  }
  .sl-form input:focus,
  .sl-form textarea:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
</style>
