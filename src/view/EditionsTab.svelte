<script lang="ts">
  // The Editions tab: the history of the published editions, the newest first. An edition is never changed.
  import { t, type MessageKey } from "../lib/i18n.ts";
  import { type Edition, summaryOf } from "../lib/editions.ts";
  import { RINGS } from "../lib/skills.ts";
  import { editions } from "../lib/store.svelte.ts";
  import { reasonOf } from "../lib/storage.ts";
  import { downloadPost } from "./export-post.ts";

  const lang = document.documentElement.lang || undefined;
  const dateOf = (iso: string) => new Intl.DateTimeFormat(lang, { dateStyle: "long" }).format(new Date(iso));

  /** The number of the edition whose .zip is being made, and why the last one failed. */
  let working = $state<number | null>(null);
  let failure = $state("");

  async function download(edition: Edition) {
    working = edition.number;
    failure = "";
    try {
      await downloadPost(edition);
    } catch (error) {
      failure = t("edition_download_error", { n: edition.number, reason: reasonOf(error) });
    } finally {
      working = null;
    }
  }

  const rows = $derived(
    editions.published.map((edition) => {
      const { counts } = summaryOf(edition);
      const parts = RINGS.filter((ring) => counts[ring] > 0).map((ring) => `${counts[ring]} ${t(`ring_${ring}` as MessageKey)}`);
      return { edition, counts: parts.join(" · ") };
    }),
  );
</script>

{#if failure}<div class="sl-failure" role="alert">{failure}</div>{/if}
{#if rows.length}
  <ul class="sl-editions" aria-label={t("editions_list")}>
    {#each rows as { edition, counts } (edition.number)}
      <li class="sl-edition">
        <h3>{t("edition_n", { n: edition.number })}</h3>
        <time datetime={edition.publishedAt}>{dateOf(edition.publishedAt)}</time>
        <span class="sl-edition-counts">{counts}</span>
        <button type="button" class="sl-btn" disabled={working !== null} aria-label={t("edition_download_label", { n: edition.number })} onclick={() => download(edition)}>
          {t("edition_download")}
        </button>
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
  .sl-edition .sl-btn {
    margin-left: auto;
  }
  .sl-failure {
    margin-bottom: 8px;
    font-size: 13px;
    color: var(--red);
  }
  .sl-message {
    margin: 40px auto;
    color: var(--muted);
    text-align: center;
  }
</style>
