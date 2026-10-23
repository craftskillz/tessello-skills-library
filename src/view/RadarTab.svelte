<script lang="ts">
  // The Radar tab: the radar of the next edition (the sets not archived), its numbered legend and the changes waiting.
  import { changesSince, isPending, pendingCount } from "../lib/changes.ts";
  import { missingReasons, nextNumber as numberAfter } from "../lib/editions.ts";
  import { type MessageKey, t } from "../lib/i18n.ts";
  import { numberEntries, type RadarEntry, renderRadar } from "../lib/radar.ts";
  import { RINGS, type Ring, type SkillSet } from "../lib/skills.ts";
  import { editions, publish, sets, settings } from "../lib/store.svelte.ts";
  import { changeTag, ringName } from "./change-tag.ts";
  import Modal from "./Modal.svelte";
  import RadarDrawing from "./RadarDrawing.svelte";

  let { onOpen }: { onOpen: (set: SkillSet) => void } = $props();

  const changes = $derived(changesSince(sets.list, editions.published));

  const entries = $derived(
    sets.list
      .filter((set) => !set.archived)
      .map((set): RadarEntry => {
        const change = changes.get(set.id) ?? { kind: "unchanged" };
        const kind = change.kind === "retired" ? "unchanged" : change.kind;
        return { id: set.id, name: set.name, quadrant: set.quadrant, ring: set.ring, change: kind, previousRing: "previousRing" in change ? change.previousRing : undefined, skills: set.skills };
      }),
  );
  const numbered = $derived(numberEntries(entries));

  const svg = $derived(
    renderRadar(entries, settings.topics, {
      labels: {
        title: t("radar_title"),
        rings: Object.fromEntries(RINGS.map((ring) => [ring, ringName(ring)])) as Record<Ring, string>,
        unchanged: t("radar_unchanged"),
        new: t("radar_new"),
        up: t("radar_up"),
        down: t("radar_down"),
        notEvaluated: t("radar_not_evaluated"),
      },
    }),
  );

  const pending = $derived(sets.list.filter((set) => {
      const change = changes.get(set.id);
      return change !== undefined && isPending(change);
    }));
  const count = $derived(pendingCount(changes));
  const heading = $derived(count === 0 ? t("radar_changes_none") : count === 1 ? t("radar_changes_one") : t("radar_changes", { count }));

  // The dialog that publishes the next edition: the introduction, then the confirmation.
  const nextNumber = $derived(numberAfter(editions.published));
  /** The sets that moved without an explanation, which stop the publication. */
  const missing = $derived(missingReasons(sets.list, editions.published));
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

  /** A set that needs its explanation: the dialog closes and the set opens. */
  function explain(set: SkillSet) {
    publishing = false;
    onOpen(set);
  }

</script>

<div class="sl-radar-tab">
  <div class="sl-radar-bar">
    <button type="button" class="sl-btn sl-btn--primary" onclick={openPublish}>{t("publish_edition", { n: nextNumber })}</button>
  </div>
  {#if numbered.length}
    <div class="sl-radar-main">
      <RadarDrawing {svg} {onOpen} />
      <nav class="sl-legend" aria-label={t("radar_legend")}>
        {#each settings.topics as topic, index (index)}
          {@const group = numbered.filter((entry) => entry.quadrant === index)}
          {#if group.length}
            <h3 class="sl-legend-heading">{topic}</h3>
            <ul class="sl-legend-list">
              {#each group as entry (entry.id)}
                <li>
                  <button type="button" class="sl-legend-line" onclick={() => onOpen(sets.list.find((item) => item.id === entry.id)!)}>
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
        {#each pending as set (set.id)}
          <li>
            <button type="button" class="sl-legend-line" onclick={() => onOpen(set)}>
              {set.name}
              <span class="sl-tag">{changeTag(set, changes.get(set.id))}</span>
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
      {#each missing as set (set.id)}
        <li><button type="button" class="sl-legend-line" onclick={() => explain(set)}>{set.name}</button></li>
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
