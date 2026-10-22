<script lang="ts">
  import { tick } from "svelte";
  import { fetchSkill, findDuplicate, parseSkillUrl } from "../lib/github.ts";
  import { t, type MessageKey } from "../lib/i18n.ts";
  import { linkOf, newestFirst, type Skill, type Tab, TABS, DESCRIPTION_MAX, NAME_MAX } from "../lib/skills.ts";
  import { add, load, setTab, settings, skills, status } from "../lib/store.svelte.ts";
  import Modal from "./Modal.svelte";

  const shown = $derived(newestFirst(skills.list));

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

  /** Highlights the row of a skill a moment, and scrolls to it. */
  async function show(skill: Skill) {
    highlighted = skill.id;
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => (highlighted = ""), 2000);
    await tick();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(`[data-skill-id="${skill.id}"]`)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
  }

  /** What a skill just added gets. The edit panel will open here (ticket 03). */
  const select = show;

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

<div class="sl-root">
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
      <button type="button" class="sl-btn sl-btn--primary" onclick={() => openForm()}>{t("add_manually")}</button>
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
        {#if shown.length}
          <ul class="sl-list">
            {#each shown as skill (skill.id)}
              {@const link = linkOf(skill)}
              <li class="sl-skill" class:sl-highlighted={highlighted === skill.id} data-skill-id={skill.id}>
                <span class="sl-name">
                  {#if link}
                    <a href={link} target="_blank" rel="noopener">{skill.name}</a>
                  {:else}
                    {skill.name}
                  {/if}
                </span>
                <span class="sl-ring sl-ring--{skill.ring}">{t(`ring_${skill.ring}` as MessageKey)}</span>
                <span class="sl-stars" role="img" aria-label={t("stars", { score: skill.score })}>{stars(skill.score)}</span>
                <span class="sl-quadrant">{settings.quadrants[skill.quadrant]}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="sl-message">{t("empty")}</p>
        {/if}
      {:else}
        <p class="sl-message">{t("coming_soon")}</p>
      {/if}
    </div>
  {/if}

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
  .sl-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
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
