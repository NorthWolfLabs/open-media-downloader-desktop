<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import Button from "./ui/Button.svelte";
  import {
    checkIssue,
    formatRecipe,
    reviewStatus,
    type SelectionTask,
    type DownloadContext,
  } from "./downloadReview";
  import { languageName } from "./languages";
  import type { Destination } from "./client";
  let {
    task,
    context,
    destinations = [],
    busy = false,
    error = "",
    onclose,
    onaction,
    onreview,
    onoptions,
    ondismiss,
    onrefresh,
  }: {
    task: SelectionTask;
    context?: DownloadContext;
    destinations?: Destination[];
    busy?: boolean;
    error?: string;
    onclose: () => void;
    onaction: (action: "cancel" | "retry") => Promise<void>;
    onreview: () => Promise<void>;
    onoptions: () => void;
    ondismiss: () => void;
    /** Rebuilds the list from the source, for a check whose items changed there. */
    onrefresh?: () => Promise<void>;
  } = $props();
  const issue = $derived(checkIssue(task.issue));
  const refreshable = $derived(task.state === "failed" && !!issue?.refresh && !!onrefresh);
  const languages = $derived(
    (context?.policy.languages ??
      task.request.policy?.languages ??
      []) as string[],
  );
  const groups = $derived(
    (context?.policy.groups ?? task.request.policy?.groups ?? []) as string[],
  );
  const destination = $derived(
    destinations.find(
      (d) => d.id === (context?.destination_id ?? task.request.destination_id),
    ),
  );
  const addingDownloads = $derived(
    task.kind === "batch" &&
      task.state === "ready" &&
      context?.autoDownload &&
      (!task.outcomes ||
        (task.outcomes.download ?? 0) + (task.outcomes.new_version ?? 0) > 0),
  );
  const expired = $derived(
    !!task.expires_at && new Date(task.expires_at).getTime() < Date.now(),
  );
</script>

<Dialog cancelLabel={null}
  title={context?.selectedReleases && task.state === "working"
    ? "Preparing downloads"
    : addingDownloads
      ? "Adding downloads"
      : context?.empty
        ? "No matching downloads"
        : reviewStatus(task)}
  {error}
  {onclose}
>
  <div class="check-context">
    <h3>{context?.title ?? "Collection download check"}</h3>
    {#if context || task.request.recipe}<p>
        {formatRecipe(
          context?.recipe ?? task.request.recipe ?? "cbz",
        )}{destination ? ` · ${destination.label}` : ""}
      </p>
      {#if context?.recipe !== "original_images"}<p>
        {languages.length
          ? languages.map(languageName).join(", ")
          : "All languages"} · {groups.length
          ? groups.join(", ")
          : "All release groups"}
      </p>{/if}{/if}
  </div>
  <div class="check-progress" role="status">
    <strong
      >{task.kind === "snapshot"
        ? `${task.processed} items found`
        : `${task.processed} of ${task.total} items checked`}</strong
    >{#if task.state === "working"}<progress
        max={task.kind === "batch" ? task.total : undefined}
        value={task.kind === "batch" ? task.processed : undefined}
        aria-label="Download check progress"
      ></progress>{/if}
  </div>
  {#if issue}<p role="alert">{issue.message}</p>{/if}
  {#if expired}<p>
      This review has expired. Check again to use current file availability.
    </p>
  {:else if task.state === "working"}<p>
      {context?.autoDownload
        ? "Your selected items will download when preparation finishes."
        : "We’ll notify you when this check is ready."}
    </p>
  {:else if task.state === "canceled"}<p>
      The check stopped. No downloads were started. Continue checking from where
      it stopped, or dismiss this review.
    </p>
  {:else if refreshable}<p>
      No downloads were started. Refresh lists the same items from the source
      again with the same options.
    </p>
  {:else if task.state === "failed"}<p>
      No downloads were started. Try continuing the check after addressing the
      issue above.
    </p>
  {:else if context?.empty}<p role="status">
      No available items match this language and release group. Choose different
      download options.
    </p>
  {:else if addingDownloads}<p>Missing items are being added to Downloads.</p>
  {:else if task.state === "ready" && task.kind === "snapshot"}<p>
      Choose a language, release group, and destination to check which items
      need downloading.
    </p>
  {:else if task.state === "ready"}<p>
      The check is complete. Review the download list before starting.
    </p>
  {:else}<p>The reviewed items have been added to Downloads.</p>{/if}
  {#snippet footer()}
    {#if !addingDownloads && (task.state === "ready" || task.state === "failed")}<Button
        variant="ghost"
        onclick={onclose}>Continue browsing</Button
      >{/if}
    {#if addingDownloads}<Button variant="primary" onclick={onclose}
        >Continue browsing</Button
      >
    {:else if task.state === "working"}<Button
        variant="ghost"
        disabled={busy}
        onclick={() => onaction("cancel")}>Cancel check</Button
      ><Button variant="primary" onclick={onclose}>Continue browsing</Button>
    {:else if refreshable}<Button
        variant="primary"
        disabled={busy}
        onclick={() => onrefresh?.()}>Refresh</Button
      >
    {:else if task.state === "failed" || task.state === "canceled"}<Button
        variant="primary"
        disabled={busy}
        onclick={task.issue?.retryable === false
          ? onoptions
          : () => onaction("retry")}
        >{task.issue?.retryable === false
          ? "Check again"
          : "Continue checking"}</Button
      >
    {:else if task.state === "ready"}<Button
        variant="primary"
        disabled={busy}
        onclick={expired || task.kind === "snapshot" ? onoptions : onreview}
        >{expired || task.kind === "snapshot"
          ? context?.empty
            ? "Change options"
            : "Choose downloads"
          : "Review downloads"}</Button
      >
    {:else}<Button onclick={ondismiss}>Done</Button>{/if}
  {/snippet}
</Dialog>

<style>
  .check-context {
    display: grid;
    gap: var(--theme-downloadcheck-gap-1, 4px);
  }
  .check-context p {
    font-size: var(--theme-downloadcheck-font-size-2, 13px);
  }
  .check-progress {
    display: grid;
    gap: var(--theme-downloadcheck-gap-3, 12px);
    padding: var(--theme-downloadcheck-padding-4, 16px);
    border: var(--theme-downloadcheck-border-5, 1px) solid var(--line);
    border-radius: var(--theme-downloadcheck-border-radius-6, 8px);
    background: var(--surface-soft);
    font-size: var(--theme-downloadcheck-font-size-2, 13px);
  }
</style>
