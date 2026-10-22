<script lang="ts">
  // The Editions tab: the history of the published editions, the newest first. An edition is never changed.
  import { t, type MessageKey } from "../lib/i18n.ts";
  import { summaryOf } from "../lib/editions.ts";
  import { RINGS } from "../lib/skills.ts";
  import { editions } from "../lib/store.svelte.ts";

  const lang = document.documentElement.lang || undefined;
  const dateOf = (iso: string) => new Intl.DateTimeFormat(lang, { dateStyle: "long" }).format(new Date(iso));

  const rows = $derived(
    editions.published.map((edition) => {
      const { counts } = summaryOf(edition);
      const parts = RINGS.filter((ring) => counts[ring] > 0).map((ring) => `${counts[ring]} ${t(`ring_${ring}` as MessageKey)}`);
      return { edition, counts: parts.join(" · ") };
    }),
  );
</script>

{#if rows.length}
  <ul class="sl-editions" aria-label={t("editions_list")}>
    {#each rows as { edition, counts } (edition.number)}
      <li class="sl-edition">
        <h3>{t("edition_n", { n: edition.number })}</h3>
        <time datetime={edition.publishedAt}>{dateOf(edition.publishedAt)}</time>
        <span class="sl-edition-counts">{counts}</span>
      </li>
    {/each}
  </ul>
{:else}
  <p class="sl-message">{t("editions_empty")}</p>
{/if}

<style>
  .sl-editions {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sl-edition {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 16px;
    padding: 10px 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel);
  }
  .sl-edition h3 {
    margin: 0;
    font-size: 14px;
  }
  .sl-edition time,
  .sl-edition-counts {
    font-size: 13px;
    color: var(--muted);
  }
  .sl-message {
    margin: 40px auto;
    color: var(--muted);
    text-align: center;
  }
</style>
