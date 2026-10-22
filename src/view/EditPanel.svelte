<script lang="ts">
  // The side panel where the User gives a verdict on a skill. Each change is saved at once; what is refused is said
  // under its field, and the field keeps what was typed.
  import { t, type MessageKey } from "../lib/i18n.ts";
  import { publishedRing, REASON_MAX } from "../lib/editions.ts";
  import { canDelete, DESCRIPTION_MAX, NAME_MAX, RINGS, type SkillEdit } from "../lib/skills.ts";
  import { edit, editions, remove, settings, skills } from "../lib/store.svelte.ts";
  import Modal from "./Modal.svelte";

  let { id, onClose }: { id: string; onClose: () => void } = $props();

  // The skill is read from the store, so that the panel follows what the rest of the View does to it.
  const skill = $derived(skills.list.find((item) => item.id === id));

  // What is typed, which can differ from what is saved while a field is refused. The panel is recreated per skill.
  // svelte-ignore state_referenced_locally
  let name = $state(skill?.name ?? "");
  // svelte-ignore state_referenced_locally
  let url = $state(skill?.sourceUrl ?? "");
  // svelte-ignore state_referenced_locally
  let description = $state(skill?.description ?? "");
  // svelte-ignore state_referenced_locally
  let notes = $state(skill?.notes ?? "");
  // svelte-ignore state_referenced_locally
  let reason = $state(skill?.moveReason ?? "");
  let errors = $state({ name: "", url: "", notes: "", reason: "" });

  /** Whether the ring differs from the one the last edition published, which asks for an explanation; an archived skill is retired instead. */
  const moved = $derived.by(() => {
    const published = publishedRing(id, editions.published);
    return published !== undefined && skill !== undefined && !skill.archived && published !== skill.ring;
  });

  // While the field is hidden it follows the saved explanation: none after a move back to the published ring, so that
  // moving away again starts from an empty field, and the one kept while the skill was archived when it comes back.
  $effect(() => {
    if (!moved) {
      reason = skill?.moveReason ?? "";
      errors.reason = "";
    }
  });

  const titleId = `panel-${Math.random().toString(36).slice(2)}`;
  let panel = $state<HTMLElement>();

  $effect(() => {
    panel?.querySelector<HTMLElement>("input, select, textarea")?.focus();
  });

  /** Saves a change; the message of the field it was refused for, if any. */
  function save(change: SkillEdit): "name_required" | "notes_too_long" | "reason_too_long" | "url_taken" | "" {
    const result = edit(id, change);
    if (!result) return "";
    if ("duplicate" in result) return "url_taken";
    return "error" in result ? result.error : "";
  }

  const refuse = (key: "name" | "url" | "notes" | "reason", message: string) => (errors[key] = message ? t(message as MessageKey) : "");

  let savedUrl = $derived(skill?.sourceUrl ?? "");
  function commitUrl() {
    if (url.trim() === savedUrl && !errors.url) return;
    refuse("url", save({ sourceUrl: url }));
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

  /** The scores a skill can have. */
  const SCORES = [1, 2, 3, 4, 5];
</script>

<svelte:window onkeydown={onKey} />

{#if skill}
  <div class="sl-panel" role="dialog" aria-labelledby={titleId} bind:this={panel}>
    <header class="sl-panel-head">
      <h3 id={titleId}>{skill.name}</h3>
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
      <label>
        {t("description")}
        <textarea rows="3" maxlength={DESCRIPTION_MAX} bind:value={description} oninput={() => save({ description })}></textarea>
      </label>
      <label>
        {t("quadrant")}
        <select value={String(skill.quadrant)} onchange={(event) => save({ quadrant: Number(event.currentTarget.value) })}>
          {#each settings.quadrants as quadrant, index (index)}
            <option value={String(index)}>{quadrant}</option>
          {/each}
        </select>
      </label>
      <fieldset class="sl-choice">
        <legend>{t("ring")}</legend>
        {#each RINGS as ring (ring)}
          <label class="sl-radio">
            <input type="radio" name="ring-{id}" checked={skill.ring === ring} onchange={() => save({ ring })} />
            {t(`ring_${ring}` as MessageKey)}
          </label>
        {/each}
      </fieldset>
      <fieldset class="sl-choice">
        <legend>{t("score")}</legend>
        <div class="sl-scores">
          {#each SCORES as score (score)}
            <label class="sl-star" class:sl-star--on={score <= skill.score}>
              <input
                type="radio"
                name="score-{id}"
                aria-label={t("stars", { score })}
                checked={skill.score === score}
                onchange={() => save({ score })}
              />
              <span aria-hidden="true">{score <= skill.score ? "★" : "☆"}</span>
            </label>
          {/each}
        </div>
      </fieldset>
      <label>
        {t("notes")}
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
      <div class="sl-panel-actions">
        <button type="button" class="sl-btn" onclick={() => save({ archived: !skill.archived })}>
          {skill.archived ? t("unarchive") : t("archive")}
        </button>
        {#if canDelete(id, editions.published)}
          <button type="button" class="sl-btn sl-btn--danger" onclick={() => (confirming = true)}>{t("delete")}</button>
        {/if}
      </div>
    </div>
  </div>

  <Modal open={confirming} title={t("delete_title", { name: skill.name })} onClose={() => (confirming = false)}>
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
  .sl-scores {
    display: flex;
    gap: 2px;
  }
  .sl-panel-body .sl-star {
    position: relative;
    flex-direction: row;
    font-size: 26px;
    line-height: 1;
    color: var(--muted);
    cursor: pointer;
  }
  .sl-star--on {
    color: var(--accent-strong);
  }
  .sl-star input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .sl-star:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    border-radius: 4px;
  }
</style>
