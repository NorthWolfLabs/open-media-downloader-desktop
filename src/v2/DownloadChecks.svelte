<script lang="ts">
  import RecordList from "./ui/RecordList.svelte";
  import RecordRow from "./ui/RecordRow.svelte";
  import { X } from "lucide-svelte";
  import Button from "./ui/Button.svelte";
  import { formatRecipe, type DownloadContext, type SelectionTask } from "./downloadReview";
  import type { Destination } from "./client";
  import { languageName } from "./languages";
  let { tasks, contexts, destinations, onchoose, onaction, ondismiss, isMedia = () => false }: {
    tasks: SelectionTask[];
    contexts: Record<string, DownloadContext>;
    destinations: Destination[];
    onchoose: (task: SelectionTask) => Promise<void>;
    onaction: (task: SelectionTask, action: "cancel" | "retry") => Promise<void>;
    ondismiss: (task: SelectionTask) => void;
    isMedia?: (provider: string) => boolean;
  } = $props();
  let pending = $state<string[]>([]);
  async function perform(task: SelectionTask, action: () => Promise<void>) {
    if (pending.includes(task.id)) return;
    pending = [...pending, task.id];
    try { await action(); } finally { pending = pending.filter(id => id !== task.id); }
  }
</script>

<RecordList label="Download checks">
  {#each tasks as task (task.id)}
    {@const context = contexts[task.id]}
    {@const title = context?.title ?? "Download check"}
    {@const languages = (context?.policy.languages ?? task.request.policy?.languages ?? []) as string[]}
    {@const media = isMedia(context?.reference.provider ?? task.request.reference?.provider ?? "")}
    {@const working = task.state === "working"}
    {@const adding = task.state === "ready" && !!context?.selectedReleases && !!context.autoDownload}
    {@const retryable = task.state === "failed" && task.issue?.retryable !== false}
    <RecordRow class="check-row">
      <div class="check-copy">
        <h3>{title}</h3>
        <p>{task.state === "failed"
          ? task.issue?.message ?? "The check could not finish."
          : working ? context?.selectedReleases ? "Preparing downloads" : "Checking available items"
          : adding ? "Adding downloads"
          : "Ready to choose downloads"}</p>
        <small>{#if context?.recipe !== "original_images"}{languages.length ? languages.map(languageName).join(", ") : "All languages"}{" · "}{/if}{formatRecipe(context?.recipe ?? task.request.recipe ?? "cbz")} · {destinations.find(d => d.id === (context?.destination_id ?? task.request.destination_id))?.label ?? "Choose a destination"}</small>
        {#if working || adding}
          <div class="check-progress" role="status">
            <small>{adding ? "Adding selected items to Activity…" : task.kind === "batch" ? `${task.processed} of ${task.total} ${context?.selectedReleases ? "prepared" : "checked"}` : `${task.processed} items found`}</small>
            <progress value={working && task.kind === "batch" ? task.processed : undefined} max={task.kind === "batch" ? task.total : undefined} aria-label={`Progress for ${title}`}></progress>
          </div>
        {/if}
      </div>
      <div class="check-actions" id={`check-actions-${task.id}`}>
        {#if working}<Button variant="ghost" disabled={pending.includes(task.id)} onclick={() => perform(task, () => onaction(task, "cancel"))}>Cancel</Button>
        {:else if !adding}
          <Button disabled={pending.includes(task.id)} onclick={() => perform(task, () => retryable ? onaction(task, "retry") : onchoose(task))}>{retryable ? "Retry" : task.state === "failed" ? "Open title" : context?.recipe === "original_images" ? "Review downloads" : media ? "Choose items" : "Choose chapters"}</Button>
          <Button variant="ghost" icon disabled={pending.includes(task.id)} title="Dismiss review" aria-label={`Dismiss review for ${title}`} onclick={() => ondismiss(task)}><X size={16} /></Button>
        {/if}
      </div>
    </RecordRow>
  {/each}
</RecordList>

<style>
  .check-copy { display: grid; gap: var(--theme-downloadchecks-gap-1, 4px); flex: 1; min-width: 0; }
  .check-copy h3, .check-copy p { overflow-wrap: anywhere; }
  .check-copy p { font-size: var(--theme-downloadchecks-font-size-2, 13px); }
  .check-progress { display: grid; gap: var(--theme-downloadchecks-gap-3, 6px); margin-top: var(--theme-downloadchecks-margin-top-4, 8px); max-width: var(--theme-downloadchecks-max-width-5, 360px); }
  .check-progress progress { width: 100%; height: var(--theme-downloadchecks-height-6, 4px); }
  .check-actions { display: flex; gap: var(--theme-downloadchecks-gap-7, 8px); align-items: center; flex-shrink: 0; }
  @media (max-width: 700px) {
    :global(.record-row.check-row) { flex-wrap: wrap; }
    .check-copy { flex-basis: 100%; }
    .check-actions { margin-left: auto; }
  }
</style>
