<script lang="ts">
  import type { ConnectedModule } from "@tessello/sdk";
  import { onMount } from "svelte";
  import { t } from "../lib/i18n.ts";
  import { skillStorage } from "../lib/storage.ts";

  let { host }: { host: ConnectedModule } = $props();

  const storage = $derived(skillStorage(host.storage));

  let count = $state(0);
  let loaded = $state(false);
  let error = $state("");

  async function refresh() {
    try {
      count = (await storage.read()).filter((skill) => !skill.archived).length;
      loaded = true;
      error = "";
    } catch {
      error = t("widget_error");
    }
  }

  onMount(() => {
    void refresh();
    // The View may have changed the skills while the Widget was hidden behind it.
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

  {#if loaded}
    <p class="count">{count === 1 ? t("widget_count_one") : t("widget_count", { count })}</p>
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
  .count {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
  }
</style>
