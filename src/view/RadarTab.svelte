<script lang="ts">
  // The Radar tab: the radar of the next edition (the sets not archived), its numbered legend and the changes waiting.
  import { untrack } from "svelte";
  import { changesSince, isPending, pendingCount } from "../lib/changes.ts";
  import { missingReasons, nextNumber as numberAfter } from "../lib/editions.ts";
  import { type MessageKey, t } from "../lib/i18n.ts";
  import { placePanel } from "../lib/panel-position.ts";
  import { numberEntries, type RadarEntry, renderRadar, stars } from "../lib/radar.ts";
  import { RINGS, type Ring, type SkillSet } from "../lib/skills.ts";
  import { editions, publish, sets, settings } from "../lib/store.svelte.ts";
  import { changeTag, ringName } from "./change-tag.ts";
  import Modal from "./Modal.svelte";

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
    renderRadar(entries, settings.quadrants, {
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

  // The panel of a point: what its set holds. The drawing is the one of the blog post, so the View makes its points
  // interactive once it is in the page, and finds them again by their `data-set-id`.
  let radarBox = $state<HTMLDivElement>();
  let panelBox = $state<HTMLDivElement>();
  let openId = $state<string | null>(null);
  /** Where the panel sits in the radar's box; none until it has been measured. */
  let position = $state<{ left: number; top: number } | null>(null);
  const shown = $derived(openId === null ? undefined : sets.list.find((item) => item.id === openId));
  /** The kind of the last pointer that went down: a mouse click opens the set, a tap opens the panel. */
  let pointerType = "mouse";
  let closing: ReturnType<typeof setTimeout> | undefined;
  /** The native tooltips put aside while the panel says the same, with their text. */
  const putAside = new Map<Element, string>();

  const pointOf = (target: EventTarget | null) => (target as Element | null)?.closest?.("[data-set-id]") ?? null;
  const inPanel = (target: EventTarget | null) => panelBox?.contains(target as Node) ?? false;

  // The drawing has no tab stops of its own: each point becomes one, named by its tooltip. The drawing lists the points in
  // the order of their numbers, so Tab walks them in that order with no tabindex above 0.
  $effect(() => {
    svg;
    if (!radarBox) return;
    untrack(close);
    for (const point of radarBox.querySelectorAll("[data-set-id]")) {
      point.setAttribute("tabindex", "0");
      point.setAttribute("role", "graphics-symbol");
      point.setAttribute("aria-label", (point.querySelector(":scope > title")?.textContent ?? "").replaceAll("\n", ", "));
    }
  });

  // Once the panel has its content it is measured, then put near its point, inside the box of the radar.
  $effect(() => {
    if (!radarBox || !panelBox || openId === null || position) return;
    const point = [...radarBox.querySelectorAll("[data-set-id]")].find((item) => item.getAttribute("data-set-id") === openId);
    if (!point) return;
    const area = radarBox.getBoundingClientRect();
    const at = point.getBoundingClientRect();
    const size = panelBox.getBoundingClientRect();
    position = placePanel({ x: at.x - area.x, y: at.y - area.y, width: at.width, height: at.height }, size, area);
  });

  function open(point: Element) {
    clearTimeout(closing);
    const id = point.getAttribute("data-set-id");
    if (id === openId) return;
    restoreTitles();
    // The panel says what the native tooltip would, so the tooltip is emptied while the panel is open.
    const title = point.querySelector(":scope > title");
    if (title) {
      putAside.set(title, title.textContent ?? "");
      title.textContent = "";
    }
    position = null;
    openId = id;
  }

  function restoreTitles() {
    for (const [title, text] of putAside) title.textContent = text;
    putAside.clear();
  }

  function close() {
    clearTimeout(closing);
    restoreTitles();
    openId = null;
    position = null;
  }

  /** The pointer left a point or the panel: it may be on its way from one to the other, so the panel waits a moment. */
  function closeSoon() {
    clearTimeout(closing);
    closing = setTimeout(close, 200);
  }

  function onRadarOver(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    const point = pointOf(event.target);
    if (point) open(point);
    if (point || inPanel(event.target)) clearTimeout(closing);
  }

  function onRadarOut(event: PointerEvent) {
    if (event.pointerType === "mouse" && openId !== null) closeSoon();
  }

  /** A click on a point opens its set; a tap opens its panel, since a touch screen cannot hover. A click elsewhere closes the panel. */
  function onRadarClick(event: MouseEvent) {
    const point = pointOf(event.target);
    if (!point) {
      if (!inPanel(event.target)) close();
      return;
    }
    if (pointerType !== "mouse") return open(point);
    const set = sets.list.find((item) => item.id === point.getAttribute("data-set-id"));
    if (set) onOpen(set);
  }

  function onRadarKey(event: KeyboardEvent) {
    if (event.key === "Escape") close();
    else if (event.key === "Enter" || event.key === " ") {
      const point = pointOf(event.target);
      if (!point) return;
      event.preventDefault();
      open(point);
    }
  }

  function onRadarFocusOut(event: FocusEvent) {
    if (!radarBox?.contains(event.relatedTarget as Node | null)) close();
  }
</script>

<!-- A tap outside the radar closes the panel; a tap in it is handled by the radar. -->
<svelte:window onpointerdown={(event) => { if (openId !== null && !radarBox?.contains(event.target as Node)) close(); }} onresize={close} />
<svelte:document onmouseleave={() => { if (openId !== null) closeSoon(); }} />

<div class="sl-radar-tab">
  <div class="sl-radar-bar">
    <button type="button" class="sl-btn sl-btn--primary" onclick={openPublish}>{t("publish_edition", { n: nextNumber })}</button>
  </div>
  {#if numbered.length}
    <div class="sl-radar-main">
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div
        class="sl-radar"
        bind:this={radarBox}
        onpointerdown={(event) => (pointerType = event.pointerType)}
        onpointerover={onRadarOver}
        onpointerout={onRadarOut}
        onclick={onRadarClick}
        onkeydown={onRadarKey}
        onfocusin={(event) => { const point = pointOf(event.target); if (point) open(point); }}
        onfocusout={onRadarFocusOut}
      >
        {@html svg}
        {#if shown}
          {@const set = shown}
          <div class="sl-radar-panel" bind:this={panelBox} role="group" aria-label={set.name} style:left="{position?.left ?? 0}px" style:top="{position?.top ?? 0}px" style:visibility={position ? "visible" : "hidden"}>
            <button type="button" class="sl-radar-panel-name" onclick={() => onOpen(set)}>{set.name}</button>
            <dl class="sl-radar-panel-facts">
              <dt>{t("ring")}</dt>
              <dd>{ringName(set.ring)}</dd>
              <dt>{t("quadrant")}</dt>
              <dd>{settings.quadrants[set.quadrant]}</dd>
            </dl>
            <ul class="sl-radar-panel-skills">
              {#each set.skills as skill (skill.id)}
                <li>
                  <span class="sl-radar-panel-skill">{skill.name}</span>
                  {#if skill.score === undefined}
                    <span class="sl-radar-panel-none">{t("not_evaluated")}</span>
                  {:else}
                    <span role="img" aria-label={t("stars", { score: skill.score })}>{stars(skill.score)}</span>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
      <nav class="sl-legend" aria-label={t("radar_legend")}>
        {#each settings.quadrants as quadrant, index (index)}
          {@const group = numbered.filter((entry) => entry.quadrant === index)}
          {#if group.length}
            <h3 class="sl-legend-heading">{quadrant}</h3>
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
  .sl-radar {
    position: relative;
    flex: 1 1 320px;
    max-width: 640px;
    min-width: 0;
  }
  .sl-radar :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }
  .sl-radar :global([data-set-id]) {
    cursor: pointer;
  }
  .sl-radar :global([data-set-id]:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .sl-radar-panel {
    position: absolute;
    z-index: 2;
    box-sizing: border-box;
    width: min(260px, 100%);
    max-height: 100%;
    overflow-y: auto;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
    color: var(--ink);
    font-size: 13px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.2);
  }
  .sl-radar-panel-name {
    display: block;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    text-align: left;
    text-decoration: underline;
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  .sl-radar-panel-facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin: 6px 0;
    color: var(--muted);
  }
  .sl-radar-panel-facts dt {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .sl-radar-panel-facts dd {
    margin: 0;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .sl-radar-panel-skills {
    margin: 0;
    padding: 6px 0 0;
    border-top: 1px solid var(--line);
    list-style: none;
  }
  .sl-radar-panel-skills li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0 8px;
    padding: 2px 0;
  }
  .sl-radar-panel-skill {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .sl-radar-panel-none {
    color: var(--muted);
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
