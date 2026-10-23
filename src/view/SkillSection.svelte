<script lang="ts">
  // One skill of the set being edited, as a section that unfolds: its fields, its score and its notes. Each change is
  // saved at once; what is refused is said under its field, and the field keeps what was typed.
  import { t, type MessageKey } from "../lib/i18n.ts";
  import { DESCRIPTION_MAX, NAME_MAX, type Skill } from "../lib/skills.ts";
  import { editSkill } from "../lib/store.svelte.ts";

  let { setId, skill, open = false, onRemove }: { setId: string; skill: Skill; open?: boolean; onRemove: (skill: Skill) => void } = $props();

  // What is typed, which can differ from what is saved while a field is refused. The section is recreated per skill.
  // svelte-ignore state_referenced_locally
  let name = $state(skill.name);
  // svelte-ignore state_referenced_locally
  let url = $state(skill.sourceUrl ?? "");
  // svelte-ignore state_referenced_locally
  let description = $state(skill.description);
  // svelte-ignore state_referenced_locally
  let notes = $state(skill.notes);
  let errors = $state({ name: "", url: "", notes: "" });

  /** Saves a change; the message of the field it was refused for, if any. */
  function save(change: Parameters<typeof editSkill>[2]): string {
    const result = editSkill(setId, skill.id, change);
    if (!result) return "";
    if ("error" in result) return t((result.error === "url_taken" ? "skill_url_taken" : result.error) as MessageKey);
    return "";
  }

  function commitUrl() {
    if (url.trim() === (skill.sourceUrl ?? "") && !errors.url) return;
    errors.url = save({ sourceUrl: url });
  }

  const SCORES = [1, 2, 3, 4, 5];
</script>

<details class="sl-skill-section" {open} data-skill-section={skill.id}>
  <summary>
    <span class="sl-skill-title">{skill.name}</span>
    {#if skill.goneUpstream}<span class="sl-skill-gone">{t("gone_upstream")}</span>{/if}
    {#if skill.score !== undefined}
      <span class="sl-skill-score" role="img" aria-label={t("stars", { score: skill.score })}>{"★".repeat(skill.score)}{"☆".repeat(5 - skill.score)}</span>
    {:else}
      <span class="sl-skill-score sl-skill-score--none">{t("not_evaluated")}</span>
    {/if}
  </summary>
  <div class="sl-skill-body">
    <label>
      {t("name")}
      <input
        type="text"
        autocomplete="off"
        maxlength={NAME_MAX}
        aria-invalid={errors.name ? "true" : undefined}
        bind:value={name}
        oninput={() => (errors.name = save({ name }))}
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
    <fieldset class="sl-choice">
      <legend>{t("score")}</legend>
      <div class="sl-scores">
        {#each SCORES as score (score)}
          <label class="sl-star" class:sl-star--on={skill.score !== undefined && score <= skill.score}>
            <input type="radio" name="score-{skill.id}" aria-label={t("stars", { score })} checked={skill.score === score} onchange={() => save({ score })} />
            <span aria-hidden="true">{skill.score !== undefined && score <= skill.score ? "★" : "☆"}</span>
          </label>
        {/each}
        {#if skill.score !== undefined}
          <button type="button" class="sl-btn" onclick={() => save({ score: null })}>{t("clear_score")}</button>
        {:else}
          <span class="sl-skill-score--none">{t("not_evaluated")}</span>
        {/if}
      </div>
    </fieldset>
    <label>
      {t("notes")}
      <textarea
        class="sl-notes"
        rows="10"
        aria-invalid={errors.notes ? "true" : undefined}
        bind:value={notes}
        oninput={() => (errors.notes = save({ notes }))}
      ></textarea>
      {#if errors.notes}<span class="sl-error" role="alert">{errors.notes}</span>{/if}
    </label>
    <div>
      <button type="button" class="sl-btn sl-btn--danger" onclick={() => onRemove(skill)}>{t("remove_from_set")}</button>
    </div>
  </div>
</details>

<style>
  .sl-skill-section {
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .sl-skill-section > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
  }
  .sl-skill-title {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .sl-skill-gone {
    margin-left: auto;
    font-weight: 400;
    font-size: 12px;
    color: var(--red);
    white-space: nowrap;
  }
  .sl-skill-score {
    font-weight: 400;
    letter-spacing: 1px;
    color: var(--accent-strong);
    white-space: nowrap;
  }
  .sl-skill-score--none {
    letter-spacing: 0;
    color: var(--muted);
    font-size: 12px;
  }
  .sl-skill-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 10px 10px;
  }
  .sl-skill-body label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .sl-skill-body input[type="text"],
  .sl-skill-body textarea {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    font: inherit;
  }
  .sl-skill-body input:focus,
  .sl-skill-body textarea:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  .sl-skill-body [aria-invalid="true"] {
    border-color: var(--red);
  }
  .sl-notes {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12.5px;
    min-height: 160px;
    resize: vertical;
  }
  .sl-error {
    color: var(--red);
    font-size: 12px;
  }
  .sl-choice {
    border: 0;
    margin: 0;
    padding: 0;
    font-size: 13px;
  }
  .sl-choice legend {
    padding: 0;
    margin-bottom: 4px;
  }
  .sl-scores {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .sl-skill-body .sl-star {
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
  .sl-scores .sl-btn {
    margin-left: 8px;
  }
  .sl-scores .sl-skill-score--none {
    margin-left: 8px;
  }
</style>
