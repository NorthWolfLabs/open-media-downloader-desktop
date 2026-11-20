<script lang="ts">
  import type { ProviderManifest } from "./client";
  import Button from "./ui/Button.svelte";
  import RecordList from "./ui/RecordList.svelte";
  import RecordRow from "./ui/RecordRow.svelte";
  import type { Snippet } from "svelte";
  import { Blocks, ChevronRight, Compass, Search, UserRound } from "lucide-svelte";
  let {
    sources,
    busy = false,
    onbrowse,
    onaccounts,
    onremove,
    onfocus,
    empty,
  }: {
    onfocus: (title: string | null, back: () => void) => void;
    sources: { manifest: ProviderManifest }[];
    busy?: boolean;
    /** Opens Explore on this source's catalog (or its search, without a catalog). */
    onbrowse?: (s: ProviderManifest) => void;
    onaccounts: (s: ProviderManifest) => void;
    onremove: (id: string) => void;
    /** The shared "add a source plugin" state, shown while none is installed. */
    empty?: Snippet;
  } = $props();
  let focused = $state<string | null>(null);
  const active = $derived(
    sources.find((s) => s.manifest.id === focused)?.manifest,
  );
  $effect(() => {
    if (focused && !active) focused = null;
  });
  $effect(() => onfocus(active?.name ?? null, () => (focused = null)));
  const browsable = $derived(!!active?.capabilities.includes("browse"));
  const searchable = $derived(!!active?.capabilities.includes("search"));
</script>

{#if active}
  <section class="source-settings">
    {#if active.description}<p class="source-description">{active.description}</p>{/if}
    {#if onbrowse && (browsable || searchable)}<div class="source-explore">
        <Button variant="primary" onclick={() => onbrowse(active)}
          >{#if browsable}<Compass size={16} />Browse in Explore{:else}<Search
              size={16}
            />Search in Explore{/if}</Button
        >
        <p>Sources manages installed plugins. Their catalogs and search are in Explore.</p>
      </div>{/if}
    <section class="form-section" aria-labelledby="source-details-heading">
      <h2 id="source-details-heading">Details</h2>
      <div class="form-box">
        <div class="form-row">
          <span class="form-row-label">Version</span>
          <span class="form-row-control">{active.version}</span>
        </div>
        {#if active.grants.some((g) => g.credential)}<RecordRow
            onclick={() => onaccounts(active)}
            ><UserRound size={18} /><span class="grow">Accounts</span
            ><ChevronRight size={16} /></RecordRow
          >{:else}<div class="form-note public-source">
            This source uses public access. No account is needed.
          </div>{/if}
        <details class="network-access">
          <summary>Network access</summary>
          <ul>
            {#each active.grants as grant}<li>{grant.hosts.join(", ")}</li>{/each}
          </ul>
        </details>
      </div>
    </section>
    <div>
      <Button
        variant="danger"
        disabled={busy}
        onclick={() => onremove(active.id)}>Remove source</Button
      >
    </div>
  </section>
{:else if sources.length}
  <RecordList label="Installed sources"
    >{#each sources as source}<RecordRow
        onclick={() => (focused = source.manifest.id)}
        ><span class="source-symbol" aria-hidden="true"><Blocks size={18} /></span>
        <div class="grow">
          <strong>{source.manifest.name}</strong>
          {#if source.manifest.description}<p>{source.manifest.description}</p>{/if}
          <small>Version {source.manifest.version}</small>
        </div>
        <ChevronRight size={16} /></RecordRow
      >{/each}</RecordList
  >
{:else}
  {@render empty?.()}
{/if}

<style>
  .grow {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .grow p {
    font-size: var(--theme-sourcespage-font-size-1, 13px);
    margin-top: var(--theme-sourcespage-margin-top-2, 0);
  }
  .source-symbol {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: var(--control-radius);
    background: var(--accent-soft);
    color: var(--accent-text);
    flex-shrink: 0;
  }
  .source-settings {
    display: grid;
    gap: var(--theme-sourcespage-gap-3, 16px);
  }
  .source-description {
    max-width: 64ch;
  }
  .source-explore {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
  }
  .source-explore p {
    color: var(--muted);
    font-size: var(--theme-sourcespage-font-size-1, 13px);
    min-width: 0;
  }
  .source-settings .form-section {
    margin: 0;
  }
  .source-settings :global(.record-row) {
    border-top: 1px solid var(--line);
    padding: var(--space-3) var(--space-4);
  }
  .public-source {
    color: var(--muted);
    font-size: var(--theme-sourcespage-font-size-1, 13px);
    border-top: 1px solid var(--line);
  }
  .network-access {
    border-top: 1px solid var(--line);
    padding: var(--space-3) var(--space-4);
  }
  ul {
    color: var(--muted);
    font-size: var(--theme-sourcespage-font-size-1, 13px);
    padding-left: var(--theme-sourcespage-padding-left-6, 20px);
    margin: 0;
  }
</style>
