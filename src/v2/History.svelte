<script lang="ts">
  import { formatTime } from "./dates";
  import PendingStatus from "./ui/PendingStatus.svelte";
  import { historySnapshot, saveHistorySnapshot } from "./historySnapshot";
  import SelectionToolbar from "./ui/SelectionToolbar.svelte";
  import ActionMenu from "./ui/ActionMenu.svelte";
  import RecordList from "./ui/RecordList.svelte";
  import SearchBar from "./ui/SearchBar.svelte";
  import RecordRow from "./ui/RecordRow.svelte";
  import { untrack, onDestroy } from "svelte";
  import {
    ChevronRight,
    History as HistoryIcon,
  } from "lucide-svelte";
  import Button from "./ui/Button.svelte";
  import EmptyState from "./ui/EmptyState.svelte";
  import { historyGroups, removalLabels, type RemovalMode } from "./history";
  import type { EngineClient, Job } from "./client";
  let {
    client,
    revision,
    sources,
    onfiles,
    onremove,
    onfocus,
    oncollection,
  }: {
    client: EngineClient;
    revision: number;
    sources: Record<string, string>;
    onfiles: (job: Job) => void;
    onremove: (jobs: Job[], mode: RemovalMode) => void;
    oncollection?: (c: Job["plan"]["collection"]) => void;
    onfocus: (title: string | null, back: () => void) => void;
  } = $props();
  const cached = untrack(() => historySnapshot(client));
  let loaded = $state(!!cached);
  let jobs: Job[] = $state(cached?.jobs ?? []),
    query = $state(""),
    focused = $state<string | null>(null),
    selected = $state<Set<string>>(new Set()),
    loading = $state(!cached),
    error = $state("");
  let selecting = $state(false);
  let generation = 0;
  const groups = $derived(historyGroups(jobs));
  const active = $derived(groups.find((g) => g.id === focused));
  const shown = $derived(active ? active.jobs : []);
  const matches = $derived(
    groups.filter((g) =>
      `${g.title} ${sources[g.provider] ?? g.provider}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
  );
  async function refresh() {
    const version = ++generation;
    const requestedRevision = revision;
    loading = true;
    try {
      const all = await client.listAll<Job>("/v2/jobs?state=completed");
      if (version === generation) {
        jobs = all;
        loaded = true;
        saveHistorySnapshot(client, requestedRevision, all);
        error = "";
        selected = new Set(
          [...selected].filter((id) => all.some((j) => j.id === id)),
        );
      }
    } catch (e) {
      if (version === generation) error = String(e);
    } finally {
      if (version === generation) loading = false;
    }
  }
  $effect(() => {
    void revision;
    untrack(() => {
      if (historySnapshot(client)?.revision !== revision) void refresh();
    });
  });
  $effect(() => {
    onfocus(active?.title ?? null, () => open(null));
  });
  onDestroy(() => generation++);
  function open(id: string | null) {
    focused = id;
    selecting = false;
    selected = new Set();
  }
</script>

{#if error}<p role="alert" class="v2-error-text">{error}</p>{/if}
<PendingStatus active={!loaded && loading} label="Loading history…">
  {#if !focused}<SearchBar
      bind:value={query}
      label="Search history"
      busy={loading}
    />
    <RecordList>
      {#each matches as group}<RecordRow
          class="history-group"
          onclick={() => open(group.id)}
          ><HistoryIcon size={20} /><span
            ><strong>{group.title}</strong><small
              >{group.jobs.length}
              {group.jobs.length === 1 ? "download" : "downloads"} · {sources[
                group.provider
              ] ?? group.provider}</small
            ><small
              >Last downloaded {formatTime(group.date)}</small
            ></span
          ><ChevronRight size={18} /></RecordRow
        >{:else}{#if loaded}<EmptyState
            icon={HistoryIcon}
            title={query ? "No matching history" : "No download history"}
            description="Completed downloads appear here, even after you move their files."
          />{/if}{/each}
    </RecordList>
  {:else if active}<section class="history-focused ui-enter">
      <SelectionToolbar
        bind:selecting
        count={shown.length}
        selected={selected.size}
        totalSelected={shown.length > 0 &&
          shown.every((j) => selected.has(j.id))}
        onall={() =>
          (selected =
            selected.size === shown.length
              ? new Set()
              : new Set(shown.map((j) => j.id)))}
        onclear={() => (selected = new Set())}
      >
        {#snippet children()}{#if oncollection && shown[0]}<Button
              variant="ghost"
              onclick={() => oncollection?.(shown[0].plan.collection)}
              >View item</Button
            >{/if}{/snippet}
        {#snippet actions()}<ActionMenu
            label="Manage selected items"
            text
            disabled={!selected.size}
          >
            {#snippet children(
              choose,
            )}{#each Object.entries(removalLabels) as [mode, label]}<Button
                  variant="danger"
                  onclick={() =>
                    choose(() =>
                      onremove(
                        shown.filter((j) => selected.has(j.id)),
                        mode as RemovalMode,
                      ),
                    )}>{label}</Button
                >{/each}{/snippet}
          </ActionMenu>{/snippet}
      </SelectionToolbar>
      <RecordList label="Downloads">
        {#each shown as job}<RecordRow
            class="history-entry"
            onclick={selecting ? undefined : () => onfiles(job)}
          >
            {#if selecting}<input
                type="checkbox"
                aria-label={`Select ${job.title}`}
                checked={selected.has(job.id)}
                onchange={(e) => {
                  const next = new Set(selected);
                  if (e.currentTarget.checked) next.add(job.id);
                  else next.delete(job.id);
                  selected = next;
                }}
              />{/if}
            <span class="record-copy"
              ><strong>{job.title}</strong><small
                >{formatTime(job.updated_at)} · {sources[
                  job.plan.collection.reference.provider
                ] ?? job.plan.collection.reference.provider}</small
              ></span
            >
            {#if !selecting}<ChevronRight size={18} />{/if}
          </RecordRow>{/each}
      </RecordList>
    </section>
  {:else}<EmptyState
      icon={HistoryIcon}
      title="No downloads remain in this collection"
    />{/if}
</PendingStatus>

<style>
  :global(.history-group > span),
  .record-copy {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: var(--theme-history-gap-1, 4px);
  }
  strong {
    font-size: var(--theme-history-font-size-2, 14px);
  }
  small {
    display: block;
  }
</style>
