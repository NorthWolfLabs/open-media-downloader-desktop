<script lang="ts">
  import { appLocale } from "./locale";
  import EmptyState from "./ui/EmptyState.svelte";
  import { removalLabels } from "./history";
  import Button from "./ui/Button.svelte";
  import InfiniteMore from "./InfiniteMore.svelte";
  import { untrack } from "svelte";
  import Dialog from "./Dialog.svelte";
  import type { EngineClient, Page, Problem } from "./client";
  type Mode =
    | "reconcile"
    | "remove_files"
    | "forget_history"
    | "remove_files_and_history";
  type Operation = {
    id: string;
    job_id: string;
    title: string;
    mode: Mode;
    state: string;
    issue: Problem | null;
    total: number;
    processed: number;
    retained: number;
  };
  type Entry = {
    artifact_id: string;
    path: string;
    size: number;
    state: string;
  };
  let {
    client,
    revision,
    showList,
  }: { client: EngineClient; revision: number; showList: boolean } = $props();
  let operations: Operation[] = $state([]),
    cursor: string | null = $state(null),
    current: Operation | null = $state(null),
    query = $state(""),
    fileQuery = $state(""),
    fileCursor: string | null = $state(null),
    files: Entry[] = $state([]),
    busy = $state(false),
    error = $state("");
  let generation = 0,
    fileGeneration = 0;
  const titles: Record<Mode, string> = {
    reconcile: "Check file integrity",
    ...removalLabels,
  };
  async function run(action: () => Promise<void>) {
    busy = true;
    error = "";
    try {
      await action();
    } catch (e) {
      error = e instanceof Error ? e.message : "That didn’t work. Try again.";
    } finally {
      busy = false;
    }
  }
  async function loadFiles(more = false) {
    if (!current) return;
    const selected = current.id,
      request = ++fileGeneration;
    const params = new URLSearchParams({ q: fileQuery, limit: "100" });
    if (more && fileCursor) params.set("cursor", fileCursor);
    const page = await client.request<Page<Entry>>(
      `/v2/file-operations/${selected}/files?${params}`,
    );
    if (request !== fileGeneration || current?.id !== selected) return;
    files = more ? [...files, ...page.items] : page.items;
    fileCursor = page.next_cursor;
  }
  async function refresh(more = false) {
    const request = ++generation;
    const params = new URLSearchParams({ q: query, limit: "50" });
    if (more && cursor) params.set("cursor", cursor);
    const page = await client.request<Page<Operation>>(
      `/v2/file-operations?${params}`,
    );
    if (request !== generation) return;
    operations = more ? [...operations, ...page.items] : page.items;
    cursor = page.next_cursor;
    const selected = current?.id;
    if (selected) {
      const updated = await client.request<Operation>(
        `/v2/file-operations/${selected}`,
      );
      if (current?.id === selected) {
        const changed =
          current.processed !== updated.processed ||
          current.state !== updated.state;
        current = updated;
        if (changed) await loadFiles();
      }
    }
  }
  $effect(() => {
    void client;
    void revision;
    untrack(() => {
      void refresh().catch(
        (e) =>
          (error =
            e instanceof Error ? e.message : "Showing saved file operations."),
      );
    });
  });
  export async function create(job: string, mode: Mode) {
    await run(async () => {
      current = await client.request<Operation>(
        `/v2/jobs/${job}/file-operations`,
        { method: "POST", body: { mode } },
      );
      files = [];
      fileCursor = null;
      fileQuery = "";
      await loadFiles();
      await refresh();
    });
  }
  async function inspect(id: string) {
    await run(async () => {
      current = await client.request<Operation>(`/v2/file-operations/${id}`);
      fileQuery = "";
      await loadFiles();
    });
  }
  async function action(name: string) {
    await run(async () => {
      if (!current) return;
      current = await client.request<Operation>(
        `/v2/file-operations/${current.id}/${name}`,
        { method: "POST" },
      );
      await refresh();
    });
  }
</script>

{#if error && !current && !showList}<p class="v2-alert" role="alert">
    {error}
  </p>{/if}
{#if showList && (operations.length || query || error)}<section
    class="v2-panel"
  >
    <h2>File changes</h2>
    <form
      class="v2-toolbar"
      onsubmit={(event) => {
        event.preventDefault();
        void run(() => refresh());
      }}
    >
      <input
        aria-label="Search file changes"
        bind:value={query}
        placeholder="Search by download title"
      /><Button type="submit" disabled={busy}>Search</Button>
    </form>
    {#if error && !current}<p role="alert">{error}</p>{/if}
    {#each operations as operation}<div class="v2-list-row">
        <div class="v2-grow">
          <strong>{operation.title}</strong><small
            >{titles[operation.mode]} · {operation.state} · {operation.processed}
            of {operation.total} files</small
          >{#if operation.issue}<p role="alert">
              {operation.issue.message}
            </p>{/if}
        </div>
        <Button
          type="submit"
          disabled={busy}
          onclick={() => inspect(operation.id)}>View details</Button
        >
      </div>{:else}{#if !busy && !error}<EmptyState
          compact
          level={3}
          title="No matching file changes"
          description="Try a different search."
        />{/if}{/each}
    <InfiniteMore
      {cursor}
      disabled={busy}
      load={() => run(() => refresh(true))}
      label="file changes"
    />
  </section>{/if}
{#if current}<Dialog cancelLabel="Close"
    title={titles[current.mode]}
    {error}
    onclose={() => (current = null)}
  >
    <p><strong>{current.title}</strong></p>
    <p role="status">
      {current.state === "ready" ? "Ready for review" : current.state} · {current.processed}
      of {current.total} files
    </p>
    {#if current.mode === "reconcile"}<p>
        OMD checks recorded sizes and hashes. A disconnected destination pauses
        this inspection. Download history remains even when files are missing.
      </p>
    {:else if current.mode === "forget_history"}<p>
        This removes this download from your download history. Its files stay
        where they are.
      </p>
    {:else}<p>
        OMD permanently removes only the recorded files whose contents still
        match their saved hashes. Modified files and files you added are
        preserved. This cannot be undone.
      </p>
      {#if current.mode === "remove_files_and_history"}<p>
          This download will also be removed from your download history.
        </p>{:else}<p>
          Your download history remains, with the removed files marked missing.
        </p>{/if}
    {/if}
    {#if current.retained && current.mode !== "reconcile" && current.mode !== "forget_history"}<p
      >
        {current.retained} changed or unrecognized {current.retained === 1
          ? "file was"
          : "files were"} kept. If an original path was occupied, its recoverable
        copy remains under
        <span class="v2-path">.omd-remove-{current.id}</span> in the destination.
      </p>{/if}
    {#if current.issue}<p role="alert">{current.issue.message}</p>{/if}
    <form
      class="v2-toolbar"
      onsubmit={(event) => {
        event.preventDefault();
        void run(() => loadFiles());
      }}
    >
      <input
        aria-label="Search operation files"
        bind:value={fileQuery}
        placeholder="Search recorded paths"
      /><Button type="submit" disabled={busy}>Search</Button>
    </form>
    {#each files as file}<div class="v2-file-row">
        <strong class="v2-path">{file.path}</strong><small
          >{file.size.toLocaleString(appLocale())} bytes · {file.state}</small
        >
      </div>{:else}{#if !busy && !error}<EmptyState
          compact
          level={3}
          title={fileQuery ? "No matching files" : "No recorded files"}
          description={fileQuery
            ? "Try a different file name or path."
            : "No files were recorded for this change."}
        />{/if}{/each}
    <InfiniteMore
      cursor={fileCursor}
      disabled={busy}
      load={() => run(() => loadFiles(true))}
      label="recorded files"
    />
    {#snippet footer()}{#if current}
        {#if current.state === "ready"}<Button
            type="submit"
            disabled={busy}
            onclick={() => action("cancel")}>Stop</Button
          ><Button
            type="submit"
            variant="primary"
            disabled={busy}
            onclick={() => action("start")}
            >{current.mode === "forget_history"
              ? "Remove from history"
              : "Remove matching files"}</Button
          >{/if}
        {#if current.issue}<Button
            type="submit"
            disabled={busy}
            onclick={() => action("retry")}>Retry</Button
          >{/if}
      {/if}{/snippet}
  </Dialog>{/if}
