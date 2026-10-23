<script lang="ts">
  // The side panel where the User gives a verdict on a set and works on its skills. Each change is saved at once; what is refused is said
  // under its field, and the field keeps what was typed.
  import { t, type MessageKey } from "../lib/i18n.ts";
  import { parseSkillUrl } from "../lib/github.ts";
  import { publishedRing, REASON_MAX } from "../lib/editions.ts";
  import { canDelete, DESCRIPTION_MAX, NAME_MAX, RINGS, type Skill, type SetEdit } from "../lib/skills.ts";
  import { addSkill, editions, editSet, refreshSet, remove, removeSkill, sets, settings } from "../lib/store.svelte.ts";
  import Modal from "./Modal.svelte";
  import SkillSection from "./SkillSection.svelte";

  let { id, onClose }: { id: string; onClose: () => void } = $props();

  // The set is read from the store, so that the panel follows what the rest of the View does to it.
  const set = $derived(sets.list.find((item) => item.id === id));

  // What is typed, which can differ from what is saved while a field is refused. The panel is recreated per set.
  // svelte-ignore state_referenced_locally
  let name = $state(set?.name ?? "");
  // svelte-ignore state_referenced_locally
  let url = $state(set?.sourceUrl ?? "");
  // svelte-ignore state_referenced_locally
  let description = $state(set?.description ?? "");
  // svelte-ignore state_referenced_locally
  let notes = $state(set?.notes ?? "");
  // svelte-ignore state_referenced_locally
  let reason = $state(set?.moveReason ?? "");
  let errors = $state({ name: "", url: "", notes: "", reason: "" });

  /** Whether the ring differs from the one the last edition published, which asks for an explanation; an archived set is retired instead. */
  const moved = $derived.by(() => {
    const published = publishedRing(id, editions.published);
    return published !== undefined && set !== undefined && !set.archived && published !== set.ring;
  });

  // While the field is hidden it follows the saved explanation: none after a move back to the published ring, so that
  // moving away again starts from an empty field, and the one kept while the set was archived when it comes back.
  $effect(() => {
    if (!moved) {
      reason = set?.moveReason ?? "";
      errors.reason = "";
    }
  });

  const titleId = `panel-${Math.random().toString(36).slice(2)}`;
  let panel = $state<HTMLElement>();

  $effect(() => {
    panel?.querySelector<HTMLElement>("input, select, textarea")?.focus();
  });

  /** Saves a change; the message of the field it was refused for, if any. */
  function save(change: SetEdit): "name_required" | "notes_too_long" | "reason_too_long" | "url_taken" | "" {
    const result = editSet(id, change);
    if (!result) return "";
    if ("duplicate" in result) return "url_taken";
    return "error" in result ? result.error : "";
  }

  const refuse = (key: "name" | "url" | "notes" | "reason", message: string) => (errors[key] = message ? t(message as MessageKey) : "");

  let savedUrl = $derived(set?.sourceUrl ?? "");
  function commitUrl() {
    if (url.trim() === savedUrl && !errors.url) return;
    refuse("url", save({ sourceUrl: url }));
  }

  // The dialog that adds a skill to the set, and the one that confirms the removal of a skill.
  let adding = $state(false);
  let skillName = $state("");
  let skillUrl = $state("");
  let skillDescription = $state("");
  let skillError = $state("");
  /** The skill whose removal is to be confirmed. */
  let removing = $state<Skill | null>(null);
  /** The skill just added, whose section opens. */
  let justAdded = $state("");

  function openAdd() {
    skillName = skillUrl = skillDescription = skillError = "";
    adding = true;
  }

  function submitSkill(event: SubmitEvent) {
    event.preventDefault();
    const result = addSkill(id, { name: skillName, url: skillUrl, description: skillDescription });
    if (!result) return;
    if ("error" in result) {
      skillError = t("skill_url_taken");
      return;
    }
    adding = false;
    justAdded = result.added.id;
  }

  function confirmRemove() {
    if (removing) removeSkill(id, removing.id);
    removing = null;
  }

  // The refresh from GitHub: whether it is under way, and what it said.
  let refreshing = $state(false);
  let refreshed = $state({ text: "", failed: false });
  const failures = { not_a_skill_url: "not_a_skill_url", not_found: "url_not_found", rate_limited: "rate_limited", network: "url_unreadable", empty: "refresh_empty" } as const;
  /** The refresh button needs the url the set has saved, not the one being typed. */
  const refreshable = $derived(parseSkillUrl(set?.sourceUrl ?? "") !== null);

  async function refresh() {
    refreshing = true;
    refreshed = { text: "", failed: false };
    const result = await refreshSet(id);
    refreshing = false;
    if (!result) return;
    if ("error" in result) {
      refreshed = { text: t(failures[result.error]), failed: true };
      return;
    }
    const parts = [
      result.added === 1 ? t("refresh_added_one") : result.added > 1 ? t("refresh_added", { count: result.added }) : "",
      result.gone === 1 ? t("refresh_gone_one") : result.gone > 1 ? t("refresh_gone", { count: result.gone }) : "",
    ].filter(Boolean);
    refreshed = { text: parts.length > 0 ? parts.join(", ") : t("refresh_up_to_date"), failed: false };
  }

  /** Whether the dialog that asks to confirm a deletion is open. */
  let confirming = $state(false);

  function confirmDelete() {
    confirming = false;
    if (remove(id)) onClose();
  }

  function close() {
    commitUrl();
    onClose();
  }

  /** Escape closes the panel, unless a dialog opened over it. */
  function onKey(event: KeyboardEvent) {
    if (event.key !== "Escape" || !panel) return;
    const dialogs = document.querySelectorAll("[role=dialog]");
    if (dialogs[dialogs.length - 1] === panel) close();
  }

</script>

<svelte:window onkeydown={onKey} />

{#if set}
  <div class="sl-panel" role="dialog" aria-labelledby={titleId} bind:this={panel}>
    <header class="sl-panel-head">
      <h3 id={titleId}>{set.name}</h3>
      <button type="button" class="sl-btn" onclick={close}>{t("close")}</button>
    </header>
    <div class="sl-panel-body">
      <label>
        {t("name")}
        <input
          type="text"
          autocomplete="off"
          maxlength={NAME_MAX}
          aria-invalid={errors.name ? "true" : undefined}
          bind:value={name}
          oninput={() => refuse("name", save({ name }))}
        />
        {#if errors.name}<span class="sl-error" role="alert">{errors.name}</span>{/if}
      </label>
      <label>
        {t("url")}
        <input
          type="text"
          inputmode="url"
          autocomplete="off"
          aria-invalid={errors.url ? "true" : undefined}
          bind:value={url}
          oninput={() => (errors.url = "")}
          onchange={commitUrl}
        />
        {#if errors.url}<span class="sl-error" role="alert">{errors.url}</span>{/if}
      </label>
      {#if refreshable}
        <div class="sl-refresh">
          <button type="button" class="sl-btn" disabled={refreshing} aria-busy={refreshing} onclick={refresh}>
            {refreshing ? t("refreshing") : t("refresh")}
          </button>
          <span class={refreshed.failed ? "sl-error" : "sl-refresh-done"} role="status">{refreshed.text}</span>
        </div>
      {/if}
      <label>
        {t("description")}
        <textarea rows="3" maxlength={DESCRIPTION_MAX} bind:value={description} oninput={() => save({ description })}></textarea>
      </label>
      <label>
        {t("quadrant")}
        <select value={String(set.quadrant)} onchange={(event) => save({ quadrant: Number(event.currentTarget.value) })}>
          {#each settings.quadrants as quadrant, index (index)}
            <option value={String(index)}>{quadrant}</option>
          {/each}
        </select>
      </label>
      <fieldset class="sl-choice">
        <legend>{t("ring")}</legend>
        {#each RINGS as ring (ring)}
          <label class="sl-radio">
            <input type="radio" name="ring-{id}" checked={set.ring === ring} onchange={() => save({ ring })} />
            {t(`ring_${ring}` as MessageKey)}
          </label>
        {/each}
      </fieldset>
      <label>
        {t("set_notes")}
        <textarea
          class="sl-notes"
          rows="14"
          aria-invalid={errors.notes ? "true" : undefined}
          bind:value={notes}
          oninput={() => refuse("notes", save({ notes }))}
        ></textarea>
        {#if errors.notes}<span class="sl-error" role="alert">{errors.notes}</span>{/if}
      </label>
      {#if moved}
        <label>
          {t("why_moved")}
          <textarea
            rows="3"
            maxlength={REASON_MAX}
            aria-invalid={errors.reason ? "true" : undefined}
            bind:value={reason}
            oninput={() => refuse("reason", save({ moveReason: reason }))}
          ></textarea>
          {#if errors.reason}<span class="sl-error" role="alert">{errors.reason}</span>{/if}
        </label>
      {/if}
      <section class="sl-skills" aria-label={t("skills_heading")}>
        <div class="sl-skills-head">
          <h4>{t("skills_heading")}</h4>
          <button type="button" class="sl-btn" onclick={openAdd}>{t("add_skill")}</button>
        </div>
        {#each set.skills as skill (skill.id)}
          <SkillSection setId={id} {skill} open={skill.id === justAdded} onRemove={(item) => (removing = item)} />
        {:else}
          <p class="sl-skills-none">{t("skills_none")}</p>
        {/each}
      </section>
      <div class="sl-panel-actions">
        <button type="button" class="sl-btn" onclick={() => save({ archived: !set.archived })}>
          {set.archived ? t("unarchive") : t("archive")}
        </button>
        {#if canDelete(id, editions.published)}
          <button type="button" class="sl-btn sl-btn--danger" onclick={() => (confirming = true)}>{t("delete")}</button>
        {/if}
      </div>
    </div>
  </div>

  <Modal open={adding} title={t("add_skill_title")} onClose={() => (adding = false)}>
    <form id="sl-add-skill-form" class="sl-form" onsubmit={submitSkill}>
      <label>
        {t("name")}
        <input type="text" required maxlength={NAME_MAX} autocomplete="off" bind:value={skillName} />
      </label>
      <label>
        {t("url")}
        <input type="text" inputmode="url" autocomplete="off" aria-invalid={skillError ? "true" : undefined} bind:value={skillUrl} oninput={() => (skillError = "")} />
        {#if skillError}<span class="sl-error" role="alert">{skillError}</span>{/if}
      </label>
      <label>
        {t("description")}
        <textarea rows="3" maxlength={DESCRIPTION_MAX} bind:value={skillDescription}></textarea>
      </label>
    </form>
    {#snippet actions()}
      <button type="button" class="sl-btn" onclick={() => (adding = false)}>{t("cancel")}</button>
      <button type="submit" form="sl-add-skill-form" class="sl-btn sl-btn--primary" disabled={!skillName.trim()}>{t("add")}</button>
    {/snippet}
  </Modal>

  <Modal open={removing !== null} title={t("remove_title", { name: removing?.name ?? "" })} onClose={() => (removing = null)}>
    <p>{t("remove_body")}</p>
    {#snippet actions()}
      <button type="button" class="sl-btn" onclick={() => (removing = null)}>{t("cancel")}</button>
      <button type="button" class="sl-btn sl-btn--danger" onclick={confirmRemove}>{t("remove_from_set")}</button>
    {/snippet}
  </Modal>

  <Modal open={confirming} title={t("delete_title", { name: set.name })} onClose={() => (confirming = false)}>
    <p>{t("delete_body")}</p>
    {#snippet actions()}
      <button type="button" class="sl-btn" onclick={() => (confirming = false)}>{t("cancel")}</button>
      <button type="button" class="sl-btn sl-btn--danger" onclick={confirmDelete}>{t("delete")}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .sl-panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(400px, 100%);
    z-index: 900;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border-left: 1px solid var(--line);
    box-shadow: -8px 0 30px rgb(15 23 42 / 18%);
  }
  @media (max-width: 599px) {
    .sl-panel {
      width: 100%;
      border-left: 0;
    }
  }
  .sl-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
  }
  .sl-panel-head h3 {
    margin: 0;
    font-size: 15px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .sl-panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .sl-panel-body label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .sl-panel-body input[type="text"],
  .sl-panel-body textarea,
  .sl-panel-body select {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    font: inherit;
  }
  .sl-panel-body input:focus,
  .sl-panel-body textarea:focus,
  .sl-panel-body select:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  .sl-panel-body [aria-invalid="true"] {
    border-color: var(--red);
  }
  .sl-notes {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12.5px;
    min-height: 260px;
    resize: vertical;
  }
  .sl-panel-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .sl-refresh {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .sl-refresh-done {
    font-size: 12px;
    color: var(--muted);
  }
  .sl-error {
    color: var(--red);
    font-size: 12px;
  }
  .sl-choice {
    border: 0;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-size: 13px;
  }
  .sl-choice legend {
    padding: 0;
    margin-bottom: 4px;
  }
  .sl-panel-body .sl-radio {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .sl-skills {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sl-skills-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .sl-skills-head h4 {
    margin: 0;
    font-size: 14px;
  }
  .sl-skills-none {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
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
</style>
