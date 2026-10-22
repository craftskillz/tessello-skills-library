<script lang="ts">
  // The Radar tab: the radar of the next edition (the skills not archived), its numbered legend and the changes waiting.
  import { type Change, changesSince, isPending, pendingCount } from "../lib/changes.ts";
  import { type MessageKey, t } from "../lib/i18n.ts";
  import { numberEntries, type RadarEntry, renderRadar } from "../lib/radar.ts";
  import { RINGS, type Ring, type Skill } from "../lib/skills.ts";
  import { editions, settings, skills } from "../lib/store.svelte.ts";

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

  /** A click on a point of the radar opens its skill. */
  function onRadarClick(event: MouseEvent) {
    const id = (event.target as Element).closest("[data-skill-id]")?.getAttribute("data-skill-id");
    const skill = skills.list.find((item) => item.id === id);
    if (skill) onOpen(skill);
  }
</script>

<div class="sl-radar-tab">
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

<style>
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
