<script lang="ts">
  // The radar of the Radar tab, and the panel that tells what the set of a point holds: on hover, on a tap, or from the
  // keyboard. A click on a point, or on the name in the panel, opens the set.
  import { untrack } from "svelte";
  import { t } from "../lib/i18n.ts";
  import { placePanel } from "../lib/panel-position.ts";
  import { stars } from "../lib/radar.ts";
  import { type SkillSet, setTopics } from "../lib/skills.ts";
  import { sets, settings } from "../lib/store.svelte.ts";
  import { ringName } from "./change-tag.ts";

  let { svg, onOpen }: { svg: string; onOpen: (set: SkillSet) => void } = $props();

  // The panel of a point: what its set holds. The drawing is the one of the blog post, so the View makes its points
  // interactive once it is in the page, and finds them again by their `data-set-id`.
  let radarBox = $state<HTMLDivElement>();
  let panelBox = $state<HTMLDivElement>();
  let openId = $state<string | null>(null);
  /** Where the panel sits in the radar's box; none until it has been measured. */
  let position = $state<{ left: number; top: number } | null>(null);
  const panelSet = $derived(openId === null ? undefined : sets.list.find((item) => item.id === openId));
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
  {#if panelSet}
    {@const set = panelSet}
    <div class="sl-radar-panel" bind:this={panelBox} role="group" aria-label={set.name} style:left="{position?.left ?? 0}px" style:top="{position?.top ?? 0}px" style:visibility={position ? "visible" : "hidden"}>
      <button type="button" class="sl-radar-panel-name" onclick={() => onOpen(set)}>{set.name}</button>
      <dl class="sl-radar-panel-facts">
        <dt>{t("ring")}</dt>
        <dd>{ringName(set.ring)}</dd>
        <dt>{t("topic")}</dt>
        <dd>{setTopics(set).map((index) => settings.topics[index]).join(", ")}</dd>
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

<style>
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
</style>
