<script lang="ts">
  import SelectionToolbar from "./ui/SelectionToolbar.svelte";
  import ActionMenu from "./ui/ActionMenu.svelte";
  import RecordRow from "./ui/RecordRow.svelte";
  import Button from "./ui/Button.svelte";
  import RecordList from "./ui/RecordList.svelte";
  import SearchBar from "./ui/SearchBar.svelte";
  import EmptyState from "./ui/EmptyState.svelte";
  import SelectPicker from "./SelectPicker.svelte";
  import InfiniteMore from "./InfiniteMore.svelte";
  import GroupActions from "./GroupActions.svelte";
  import {
    Folder,
    CheckSquare,
    Square,
    Download,
    ChevronRight,
    AlertCircle,
  } from "lucide-svelte";
  import type { Snippet } from "svelte";
  import { formatTime } from "./dates";
  import { formatRecipe } from "./downloadReview";
  import { needsAnotherFormat } from "./jobIssue";
  import type { Job, Destination } from "./client";
  type Group = {
    id: string;
    title: string;
    created_at: string;
    total: number;
    completed: number;
    active: number;
    paused: number;
    failed: number;
    canceled: number;
  };
  let {
    jobs,
    groups,
    activeGroup,
    grouped = $bindable(true),
    query = $bindable(""),
    collection = false,
    destinations,
    busy = false,
    jobCursor,
    groupCursor,
    onsearch,
    ongroup,
    onjobaction,
    onformat,
    ongroupaction,
    onfiles,
    onbrowse,
    browseLabel = "Find a title",
    empty,
    attention = $bindable(false),
    onmorejobs,
    onmoregroups,
    onbatch,
  }: {
    onbatch: (
      ids: string[],
      action: "pause" | "resume" | "cancel",
      grouped: boolean,
    ) => Promise<void>;
    jobs: Job[];
    groups: Group[];
    activeGroup: Group | null;
    grouped?: boolean;
    query?: string;
    collection?: boolean;
    destinations: Destination[];
    busy?: boolean;
    jobCursor: string | null;
    groupCursor: string | null;
    onsearch: () => void;
    ongroup: (group: Group) => void;
    onjobaction: (job: Job, action: string) => void;
    /** Prepares a failed item again so another format can be chosen (non-retryable issues). */
    onformat: (job: Job) => void;
    ongroupaction: (action: "pause" | "resume" | "cancel") => Promise<unknown>;
    onfiles: (job: Job) => void;
    onbrowse: () => void;
    browseLabel?: string;
    /** Replaces the empty list (no search): the shared "add a source plugin" state. */
    empty?: Snippet;
    /** Show only downloads that need attention (arriving from "Review downloads"). */
    attention?: boolean;
    onmorejobs: () => Promise<void>;
    onmoregroups: () => Promise<void>;
  } = $props();
  let selecting = $state(false),
    selected = $state<Set<string>>(new Set());
  const failedJob = (job: Job) => job.state === "failed" || !!job.issue;
  // Retrying would fail the same way, so the row offers another format instead.
  const anotherFormat = (job: Job) =>
    job.state === "failed" && needsAnotherFormat(job.issue);
  const unfinishedGroups = $derived(
    groups.filter((g) => g.active || g.paused || g.failed),
  );
  const unfinishedJobs = $derived(
    jobs.filter((j) => !["completed", "canceled"].includes(j.state)),
  );
  // The attention filter applies only while something matches it.
  const attentionShown = $derived(
    attention &&
      (grouped && !activeGroup
        ? unfinishedGroups.some((g) => g.failed)
        : unfinishedJobs.some(failedJob)),
  );
  const activeGroups = $derived(
    attentionShown ? unfinishedGroups.filter((g) => g.failed) : unfinishedGroups,
  );
  const activeJobs = $derived(
    attentionShown ? unfinishedJobs.filter(failedJob) : unfinishedJobs,
  );
  const shown = $derived(grouped && !activeGroup ? activeGroups : activeJobs);
  // One destination needs no name on every row.
  const showDestination = $derived(destinations.length > 1);
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }
  $effect(() => {
    void grouped;
    void activeGroup?.id;
    void query;
    selected = new Set();
    selecting = false;
  });
  function status(group: Group) {
    return [
      `${group.completed} of ${group.total} complete`,
      group.active ? `${group.active} active` : "",
      group.paused ? `${group.paused} paused` : "",
      group.canceled ? `${group.canceled} canceled` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  function bytes(value: number) {
    return value < 1024 * 1024
      ? `${Math.round(value / 1024)} KB`
      : `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
</script>

{#if attentionShown}<div class="v2-notice attention-filter" role="status">
    <AlertCircle size={18} /><span>Showing downloads that need attention.</span><Button
      onclick={() => (attention = false)}>Show all downloads</Button
    >
  </div>{/if}
{#if !activeGroup && (activeGroups.length || activeJobs.length || query)}<div
    class="download-filters"
  >
    <SearchBar
      bind:value={query}
      label={collection ? "Search collection" : "Search downloads"}
      {busy}
      onsubmit={onsearch}
    />
    {#if !collection}<div class="download-view-toolbar">
        <SelectPicker
          label="Show"
          bind:value={grouped}
          options={[
            { id: true, label: "Grouped downloads" },
            { id: false, label: "Individual downloads" },
          ]}
        />
      </div>{/if}
  </div>{/if}
{#if activeGroup && !collection}<div class="download-group-heading">
    <GroupActions
      group={activeGroup}
      disabled={busy}
      onaction={ongroupaction}
    />
  </div>{/if}
{#if !collection && (shown.length || selecting)}<SelectionToolbar
    bind:selecting
    count={shown.length}
    selected={selected.size}
    totalSelected={shown.length > 0 && shown.every((j) => selected.has(j.id))}
    onall={() =>
      (selected =
        selected.size === shown.length
          ? new Set()
          : new Set(shown.map((j) => j.id)))}
    onclear={() => (selected = new Set())}
  >
    {#snippet actions()}<ActionMenu
        text
        label="Manage selected items"
        disabled={!selected.size || busy}
      >
        {#snippet children(
          choose,
        )}{#each ["pause", "resume", "cancel"] as action}<Button
              variant={action === "cancel" ? "danger" : "ghost"}
              onclick={() =>
                choose(() => {
                  void onbatch(
                    [...selected],
                    action as "pause" | "resume" | "cancel",
                    grouped && !activeGroup,
                  ).then(() => {
                    selected = new Set();
                    selecting = false;
                  });
                })}
              >{action === "pause"
                ? "Pause"
                : action === "resume"
                  ? "Resume / retry"
                  : "Cancel"} selected</Button
            >{/each}{/snippet}
      </ActionMenu>{/snippet}
  </SelectionToolbar>{/if}
{#if empty && !query && !collection && !activeGroup && !shown.length}
  {@render empty()}
{:else if !collection && grouped && !activeGroup}
  <RecordList
    ><div class="download-list">
      {#each activeGroups as group}<RecordRow
          class="download-entry group-entry"
          onclick={selecting ? () => toggle(group.id) : () => ongroup(group)}
        >
          {#if selecting}<span
              aria-label={selected.has(group.id) ? "Selected" : "Not selected"}
              >{#if selected.has(group.id)}<CheckSquare
                  size={20}
                />{:else}<Square size={20} />{/if}</span
            >{:else if group.failed}<AlertCircle size={20} class="failed-icon" aria-hidden="true" />{:else}<Folder size={20} />{/if}
          <div class="download-copy">
            <strong>{group.title}</strong>
            <p>{status(group)}{#if group.failed}{" · "}<span class="v2-error-text">{group.failed} failed</span>{/if}</p>
            <small>{formatTime(group.created_at)}</small
            >{#if group.active || group.paused}<progress
                max={group.total}
                value={group.completed}
                aria-label={`Completed items for ${group.title}`}
              ></progress>{/if}
          </div>
          <ChevronRight size={18} />
        </RecordRow>{:else}<EmptyState
          icon={Download}
          title={query ? "No matching downloads" : "No active downloads"}
          description={query
            ? "Try a different title."
            : "Completed downloads are in History."}
          >{#if !query}<Button onclick={onbrowse}>{browseLabel}</Button
            >{/if}</EmptyState
        >{/each}
    </div>
    <InfiniteMore
      cursor={groupCursor}
      load={onmoregroups}
      label="download groups"
    /></RecordList
  >
{:else}
  <RecordList
    ><div class="download-list">
      {#each collection ? jobs : activeJobs as job}<RecordRow
          class="download-entry"
        >
          {#if selecting}<input
              type="checkbox"
              aria-label={`Select ${job.title}`}
              checked={selected.has(job.id)}
              onchange={() => toggle(job.id)}
            />{:else if failedJob(job)}<AlertCircle size={20} class="failed-icon" aria-hidden="true" />{:else}<Download size={20} />{/if}
          <div class="download-copy">
            <h3>{job.title}</h3>
            <p>
              {#if !activeGroup || collection}{job.plan.collection.title}{" · "}{/if}{formatRecipe(job.plan.recipe)}
            </p>
            <small
              >{#if showDestination || !destinations.some((d) => d.id === job.destination_id)}{destinations.find((d) => d.id === job.destination_id)?.label ??
                "Unavailable destination"}{" · "}{/if}<span class="job-state" class:v2-error-text={job.state === "failed"}>{job.state}</span>{job.state !==
                "completed" && job.bytes_done
                ? ` · ${bytes(job.bytes_done)} transferred`
                : ""}</small
            >{#if job.bytes_total && job.state !== "completed"}<progress
                max={job.bytes_total}
                value={job.bytes_done}
                aria-label={`Download progress for ${job.title}`}
              ></progress>{/if}{#if job.issue}<p class="v2-error-text">
                {job.issue.message}
              </p>{/if}
          </div>
          {#if !selecting && anotherFormat(job)}<Button
              disabled={busy}
              onclick={() => onformat(job)}>Choose another format</Button
            >{:else if !selecting && job.state === "failed"}<Button
              disabled={busy}
              onclick={() => onjobaction(job, "retry")}>Retry</Button
            >{/if}
          {#if !selecting}<ActionMenu label={`Actions for ${job.title}`}>
              {#snippet children(choose)}
                {#if ["queued", "transferring", "verifying"].includes(job.state)}<Button
                    variant="ghost"
                    onclick={() => choose(() => onjobaction(job, "pause"))}
                    >Pause download</Button
                  ><Button
                    variant="danger"
                    onclick={() => choose(() => onjobaction(job, "cancel"))}
                    >Cancel download</Button
                  >
                {:else if ["paused", "failed", "canceled"].includes(job.state)}{#if anotherFormat(job)}<Button
                      variant="ghost"
                      onclick={() => choose(() => onformat(job))}
                      >Choose another format</Button
                    >{:else}<Button
                      variant="ghost"
                      onclick={() =>
                        choose(() =>
                          onjobaction(
                            job,
                            job.state === "paused" ? "resume" : "retry",
                          ),
                        )}>{job.state === "paused" ? "Resume" : "Retry"}</Button
                    >{/if}{#if job.state !== "canceled"}<Button
                      variant="danger"
                      onclick={() => choose(() => onjobaction(job, "cancel"))}
                      >Cancel download</Button
                    >{/if}
                {:else if job.state === "completed"}<Button
                    variant="ghost"
                    onclick={() => choose(() => onfiles(job))}
                    >Download details</Button
                  >{/if}
              {/snippet}
            </ActionMenu>{/if}
        </RecordRow>{:else}<EmptyState
          icon={Download}
          title={query
            ? "No matching downloads"
            : collection
              ? "Nothing saved yet"
              : "No active downloads"}
          description={query
            ? "Try a different title."
            : "Completed downloads are in History."}
          >{#if !query}<Button onclick={onbrowse}>{browseLabel}</Button
            >{/if}</EmptyState
        >{/each}
    </div>
    <InfiniteMore
      cursor={jobCursor}
      load={onmorejobs}
      label="downloads"
    /></RecordList
  >
{/if}

<style>
  .download-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    margin-bottom: var(--theme-downloadlist-margin-bottom-1, 16px);
  }
  .download-filters :global(.search-bar) {
    flex: 1 1 320px;
    max-width: 560px;
    margin: 0;
  }
  .download-view-toolbar :global(.choice-picker) {
    grid-template-columns: auto minmax(0, var(--theme-downloadlist-width-2, 200px));
    align-items: center;
    column-gap: var(--space-2);
  }
  .download-group-heading {
    margin-bottom: var(--theme-downloadlist-margin-bottom-1, 16px);
  }
  .download-list {
    display: grid;
  }
  .download-copy {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: var(--theme-downloadlist-gap-3, 4px);
  }
  .download-copy p {
    font-size: var(--theme-downloadlist-font-size-4, 13px);
  }
  .download-copy progress {
    margin-top: var(--theme-downloadlist-margin-top-5, 8px);
    max-width: var(--theme-downloadlist-max-width-6, 360px);
  }
  .job-state {
    text-transform: capitalize;
  }
  .download-list :global(.failed-icon) {
    color: var(--red);
  }
  .attention-filter {
    margin-bottom: var(--theme-downloadlist-margin-bottom-1, 16px);
  }
  .attention-filter > :global(svg) {
    color: var(--red);
  }
  @media (max-width: 900px) {
    :global(.download-entry) {
      flex-wrap: wrap;
    }
  }
</style>
