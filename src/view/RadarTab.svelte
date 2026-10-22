<script lang="ts">
  // The Radar tab: the radar of the next edition (the skills not archived), its numbered legend and the changes waiting.
  import { type Change, changesSince, isPending, pendingCount } from "../lib/changes.ts";
  import { missingReasons, nextNumber as numberAfter } from "../lib/editions.ts";
  import { type MessageKey, t } from "../lib/i18n.ts";
  import { numberEntries, type RadarEntry, renderRadar } from "../lib/radar.ts";
  import { RINGS, type Ring, type Skill } from "../lib/skills.ts";
  import { editions, publish, settings, skills } from "../lib/store.svelte.ts";
  import Modal from "./Modal.svelte";

  let { onOpen }: { onOpen: (skill: Skill) => void } = $props();

  const changes = $derived(changesSince(skills.list, editions.published));
  const ringName = (ring: Ring) => t(`ring_${ring}` as MessageKey);

  const entries = $derived(
    skills.list
      .filter((skill) => !skill.archived)
      .map((skill): RadarEntry => {
        const change = changes.get(skill.id) ?? { kind: "unchanged" };
        const kind = change.kind === "retired" ? "unchanged" : change.kind;
        return { id: skill.id, name: skill.name, quadrant: skill.quadrant, ring: skill.ring, change: kind, previousRing: "previousRing" in change ? change.previousRing : undefined };
      }),
  );
  const numbered = $derived(numberEntries(entries));

  const svg = $derived(
    renderRadar(entries, settings.quadrants, {
      labels: {
        rings: Object.fromEntries(RINGS.map((ring) => [ring, ringName(ring)])) as Record<Ring, string>,
        unchanged: t("radar_unchanged"),
        new: t("radar_new"),
        up: t("radar_up"),
        down: t("radar_down"),
      },
    }),
  );

  const pending = $derived(skills.list.filter((skill) => {
      const change = changes.get(skill.id);
      return change !== undefined && isPending(change);
    }));
  const count = $derived(pendingCount(changes));
  const heading = $derived(count === 0 ? t("radar_changes_none") : count === 1 ? t("radar_changes_one") : t("radar_changes", { count }));

  /** What a pending change says of its skill: New, Back, Moved: Try → Recommended, Retired (was Watch). */
  function tag(skill: Skill, change: Change): string {
    if (change.kind === "moved") return t("change_moved", { from: ringName(change.previousRing), to: ringName(skill.ring) });
    if (change.kind === "retired") return t("change_retired", { ring: ringName(change.previousRing) });
    return t(change.kind === "back" ? "change_back" : "change_new");
  }

  // The dialog that publishes the next edition: the introduction, then the confirmation.
  const nextNumber = $derived(numberAfter(editions.published));
  /** The skills that moved without an explanation, which stop the publication. */
  const missing = $derived(missingReasons(skills.list, editions.published));
  let publishing = $state(false);
  let step = $state<"intro" | "confirm">("intro");
  let intro = $state("");
  let failure = $state("");
  let busy = $state(false);

  function openPublish() {
    intro = failure = "";
    step = "intro";
    publishing = true;
  }

  async function confirmPublish() {
    if (busy) return;
    busy = true;
    const result = await publish(intro);
    busy = false;
    if (!result) return;
    if ("published" in result) publishing = false;
    else if ("failed" in result) failure = result.failed;
    else step = "intro";
  }

  /** A skill that needs its explanation: the dialog closes and the skill opens. */
  function explain(skill: Skill) {
    publishing = false;
    onOpen(skill);
  }

  /** A click on a point of the radar opens its skill. */
  function onRadarClick(event: MouseEvent) {
    const id = (event.target as Element).closest("[data-skill-id]")?.getAttribute("data-skill-id");
    const skill = skills.list.find((item) => item.id === id);
    if (skill) onOpen(skill);
  }
</script>

<div class="sl-radar-tab">
  <div class="sl-radar-bar">
    <button type="button" class="sl-btn sl-btn--primary" onclick={openPublish}>{t("publish_edition", { n: nextNumber })}</button>
  </div>
  {#if numbered.length}
    <div class="sl-radar-main">
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="sl-radar" onclick={onRadarClick}>{@html svg}</div>
      <nav class="sl-legend" aria-label={t("radar_legend")}>
        {#each settings.quadrants as quadrant, index (index)}
          {@const group = numbered.filter((entry) => entry.quadrant === index)}
          {#if group.length}
            <h3 class="sl-legend-heading">{quadrant}</h3>
            <ul class="sl-legend-list">
              {#each group as entry (entry.id)}
                <li>
                  <button type="button" class="sl-legend-line" onclick={() => onOpen(skills.list.find((item) => item.id === entry.id)!)}>
                    {entry.number}. {entry.name} — {ringName(entry.ring)}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        {/each}
      </nav>
    </div>
  {:else}
    <p class="sl-message">{t("radar_empty")}</p>
  {/if}

  <section>
    <h3 class="sl-legend-heading">{heading}</h3>
    {#if pending.length}
      <ul class="sl-legend-list" aria-label={t("radar_changes_list")}>
        {#each pending as skill (skill.id)}
          <li>
            <button type="button" class="sl-legend-line" onclick={() => onOpen(skill)}>
              {skill.name}
              <span class="sl-tag">{tag(skill, changes.get(skill.id)!)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<Modal open={publishing} title={step === "confirm" && missing.length === 0 ? t("publish_confirm_title", { n: nextNumber }) : t("publish_edition", { n: nextNumber })} onClose={() => (publishing = false)}>
  {#if missing.length > 0}
    <p>{t("publish_missing")}</p>
    <ul class="sl-legend-list">
      {#each missing as skill (skill.id)}
        <li><button type="button" class="sl-legend-line" onclick={() => explain(skill)}>{skill.name}</button></li>
      {/each}
    </ul>
  {:else if step === "intro"}
    <label class="sl-intro">
      {t("publish_intro")}
      <textarea rows="8" autocomplete="off" bind:value={intro}></textarea>
    </label>
  {:else}
    <p>{t("publish_confirm_body", { n: nextNumber })}</p>
    {#if failure}<div class="sl-failure" role="alert">{failure}</div>{/if}
  {/if}
  {#snippet actions()}
    <button type="button" class="sl-btn" onclick={() => (publishing = false)}>{t("cancel")}</button>
    {#if missing.length === 0}
      {#if step === "intro"}
        <button type="button" class="sl-btn sl-btn--primary" disabled={!intro.trim()} onclick={() => (step = "confirm")}>{t("publish_next")}</button>
      {:else}
        <button type="button" class="sl-btn sl-btn--primary" disabled={busy} onclick={confirmPublish}>{t("publish")}</button>
      {/if}
    {/if}
  {/snippet}
</Modal>

<style>
  .sl-radar-bar {
    display: flex;
    justify-content: flex-end;
  }
  .sl-intro {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .sl-intro textarea {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--ink);
    font: inherit;
    resize: vertical;
  }
  .sl-intro textarea:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  .sl-failure {
    margin-top: 8px;
    font-size: 13px;
    color: var(--red);
  }
  .sl-radar-tab {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  /* The legend sits under the radar on a narrow screen and beside it on a wide one. */
  .sl-radar-main {
    display: flex;
    flex-wrap: wrap;
    gap: 16px 24px;
    align-items: flex-start;
  }
  .sl-radar {
    flex: 1 1 320px;
    max-width: 640px;
    min-width: 0;
  }
  .sl-radar :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }
  .sl-radar :global([data-skill-id]) {
    cursor: pointer;
  }
  .sl-legend {
    flex: 1 1 220px;
    min-width: 0;
  }
  .sl-legend-heading {
    margin: 12px 0 4px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .sl-legend-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .sl-legend-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 8px;
    width: 100%;
    padding: 4px 6px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  .sl-legend-line:hover {
    background: var(--panel);
  }
  .sl-message {
    margin: 40px auto;
    color: var(--muted);
    text-align: center;
  }
  .sl-tag {
    font-size: 11px;
    padding: 1px 8px;
    border-radius: 999px;
    border: 1px solid var(--line);
    color: var(--muted);
  }
</style>
