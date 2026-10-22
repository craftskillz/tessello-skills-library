<script lang="ts">
  import type { ConnectedModule } from "@tessello/sdk";
  import { onMount } from "svelte";
  import { t } from "../lib/i18n.ts";
  import { RINGS } from "../lib/skills.ts";
  import { skillStorage } from "../lib/storage.ts";
  import { widgetSummary, type WidgetSummary } from "../lib/widget.ts";

  let { host }: { host: ConnectedModule } = $props();

  const storage = $derived(skillStorage(host.storage));
  const lang = document.documentElement.lang || undefined;

  let summary = $state<WidgetSummary | null>(null);
  let error = $state("");

  async function refresh() {
    try {
      const [sets, editions] = await Promise.all([storage.read(), storage.readEditions()]);
      summary = widgetSummary(sets, editions);
      error = "";
    } catch {
      error = t("widget_error");
    }
  }

  onMount(() => {
    void refresh();
    // The View may have changed the sets while the Widget was hidden behind it.
    return host.onVisibilityChange((visible) => visible && void refresh());
  });
</script>

<div class="widget">
  <header>
    <h1>{t("module_name")}</h1>
    <button type="button" class="pill" onclick={() => host.openView()}>{t("widget_open")} ↗</button>
  </header>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  {#if summary}
    <ul class="rings">
      {#each RINGS as ring (ring)}
        <li><span class="ring">{t(`ring_${ring}`)}</span><strong>{summary.counts[ring]}</strong></li>
      {/each}
    </ul>
    <p class="line">
      {summary.lastPublishedAt
        ? t("widget_last_edition", { date: new Intl.DateTimeFormat(lang, { dateStyle: "long" }).format(new Date(summary.lastPublishedAt)) })
        : t("widget_no_edition")}
    </p>
    {#if summary.pending > 0}
      <p class="line pending">{summary.pending === 1 ? t("widget_changes_one") : t("widget_changes", { count: summary.pending })}</p>
    {/if}
  {/if}
</div>

<style>
  /* The Widget fills its cell and never scrolls (CONVENTION.md §7.1): what does not fit is cut off. */
  .widget {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100vh;
    padding: 10px 12px;
    overflow: hidden;
    font-size: 12px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  h1 {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pill {
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 2px 10px;
    background: var(--panel-soft);
    color: var(--accent-strong);
    font: inherit;
    font-size: 11px;
    white-space: nowrap;
    cursor: pointer;
  }
  .pill:hover {
    border-color: var(--accent);
  }
  .error {
    margin: 0;
    color: var(--red);
  }
  .rings {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .rings li {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    min-width: 0;
  }
  .ring {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .line {
    margin: 0;
    color: var(--muted);
  }
  .pending {
    color: var(--accent-strong);
    font-weight: 700;
  }
</style>
