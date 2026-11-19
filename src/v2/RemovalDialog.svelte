<script lang="ts">
  import { untrack } from "svelte";
  import Dialog from "./Dialog.svelte";
  import Button from "./ui/Button.svelte";
  import { removalLabels, type RemovalMode } from "./history";
  import type { EngineClient, Job } from "./client";
  let {
    client,
    jobs,
    mode,
    onclose,
    onchanged,
  }: {
    client: EngineClient;
    jobs: Job[];
    mode: RemovalMode;
    onclose: () => void;
    onchanged: () => void;
  } = $props();
  type Operation = {
    id: string;
    state: string;
    issue?: { message: string } | null;
    retained: number;
  };
  type Entry = { job: Job; operation?: Operation; error?: string };
  let entries: Entry[] = $state(untrack(() => jobs.map((job) => ({ job })))),
    busy = $state(false),
    started = $state(false),
    pollError = $state("");
  const completed = $derived(
    entries.filter((e) => e.operation?.state === "complete").length,
  );
  const failed = $derived(
    entries.filter((e) => e.error || e.operation?.issue).length,
  );
  const pending = $derived(
    entries.filter(
      (e) =>
        e.operation && e.operation.state !== "complete" && !e.operation.issue,
    ).length,
  );
  const retained = $derived(
    entries.reduce((n, e) => n + (e.operation?.retained ?? 0), 0),
  );
  async function start() {
    busy = true;
    started = true;
    for (const entry of entries) {
      if (entry.operation && !entry.error && !entry.operation.issue) continue;
      try {
        entry.error = "";
        if (!entry.operation)
          entry.operation = await client.request<Operation>(
            `/v2/jobs/${entry.job.id}/file-operations`,
            { method: "POST", body: { mode } },
          );
        entry.operation = await client.request<Operation>(
          `/v2/file-operations/${entry.operation.id}/${entry.operation.issue ? "retry" : "start"}`,
          { method: "POST" },
        );
      } catch (e) {
        entry.error = e instanceof Error ? e.message : String(e);
      }
    }
    busy = false;
    onchanged();
  }
  let pollTick = $state(0);
  $effect(() => {
    void pollTick;
    if (!started || busy || !pending) return;
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        for (const entry of entries) {
          if (
            entry.operation &&
            entry.operation.state !== "complete" &&
            !entry.operation.issue
          ) {
            const op = await client.request<Operation>(
              `/v2/file-operations/${entry.operation.id}`,
            );
            if (alive) entry.operation = op;
          }
        }
        if (alive) {
          pollError = "";
          onchanged();
          pollTick++;
        }
      } catch (e) {
        if (alive) {
          pollError = String(e);
          pollTick++;
        }
      }
    }, 600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  });
</script>

<Dialog cancelLabel={null}
  title={removalLabels[mode]}
  onclose={() => {
    if (!busy) onclose();
  }}
  error={pollError}
>
  {#if !started}<p>
      {mode === "forget_history"
        ? `Remove ${jobs.length} ${jobs.length === 1 ? "download" : "downloads"} from history? Files will stay where they are.`
        : mode === "remove_files"
          ? `Remove the recorded files for ${jobs.length} ${jobs.length === 1 ? "download" : "downloads"}? Download history will remain.`
          : `Remove the recorded files and history for ${jobs.length} ${jobs.length === 1 ? "download" : "downloads"}?`}
    </p>
    {#if mode !== "forget_history"}<p class="removal-note">
        Files are permanently deleted. Changed files and files you added are
        kept.
      </p>{/if}
  {:else}<p role="status">
      {busy
        ? `Starting removal…`
        : `${completed} of ${jobs.length} complete`}{failed
        ? ` · ${failed} need attention`
        : ""}
    </p>
    {#if pending}<progress
        max={jobs.length}
        value={completed}
        aria-label="Removal progress"
      ></progress>{/if}{#if retained && mode !== "forget_history"}<p>
        {retained} changed or unrecognized files were kept.
      </p>{/if}{/if}
  <details class="removal-items">
    <summary
      >{jobs.length} {jobs.length === 1 ? "download" : "downloads"}</summary
    >
    <div>
      {#each entries as entry}<article>
          <strong>{entry.job.title}</strong><small
            >{entry.job.plan.collection.title}</small
          >{#if entry.error || entry.operation?.issue}<p class="v2-error-text">
              {entry.error || entry.operation?.issue?.message}
            </p>{:else if started}<small
              >{entry.operation?.state === "complete"
                ? "Complete"
                : entry.operation
                  ? "Removing…"
                  : "Waiting"}</small
            >{/if}
        </article>{/each}
    </div>
  </details>
  {#snippet footer()}<Button variant="ghost" disabled={busy} onclick={onclose}
      >{started ? "Close" : "Cancel"}</Button
    >{#if !started || failed}<Button
        variant="danger"
        disabled={busy}
        onclick={start}
        >{started ? "Retry failed items" : removalLabels[mode]}</Button
      >{/if}{/snippet}
</Dialog>

<style>
  .removal-note {
    font-size: var(--theme-removaldialog-font-size-1, 13px);
  }
  .removal-items {
    border: var(--theme-removaldialog-border-2, 1px) solid var(--line);
    border-radius: var(--theme-removaldialog-border-radius-3, 8px);
  }
  .removal-items > summary {
    padding: var(--theme-removaldialog-padding-4, 12px);
    cursor: pointer;
    font-size: var(--theme-removaldialog-font-size-1, 13px);
  }
  .removal-items > div {
    padding: 0 var(--theme-removaldialog-padding-4, 12px) var(--theme-removaldialog-padding-4, 12px);
  }
  .removal-items article {
    display: grid;
    gap: var(--theme-removaldialog-gap-5, 4px);
    padding: var(--theme-removaldialog-padding-4, 12px) 0;
  }
  .removal-items article + article {
    border-top: var(--theme-removaldialog-border-top-6, 1px) solid var(--line);
  }
  .removal-items article:last-child {
    padding-bottom: 0;
  }
</style>
