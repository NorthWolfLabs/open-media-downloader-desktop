<script lang="ts">
  import EmptyState from "./ui/EmptyState.svelte";
  import Button from "./ui/Button.svelte";
  import { displayJoinedPath } from "./paths";
  import InfiniteMore from "./InfiniteMore.svelte";
  import ScrollRegion from "./ScrollRegion.svelte";
  import type { EngineClient, Destination, Page, Problem } from "./client";
  import Dialog from "./Dialog.svelte";
  import DestinationChecks from "./DestinationChecks.svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { Folder, Plus } from "lucide-svelte";
  type Relocation = {
    id: string;
    destination_id: string;
    source_root: string;
    target_root: string;
    state: string;
    issue: Problem | null;
    files: number;
    bytes: number;
    copied: number;
    retained: number;
  };
  type Entry = {
    root_path: string;
    path: string;
    kind: string;
    size: number;
    state: string;
  };
  let {
    client,
    destinations,
    revision,
    native,
    onadd,
    onreconnect,
    onchange,
  }: {
    client: EngineClient | null;
    destinations: Destination[];
    revision: number;
    native: boolean;
    onadd: () => void;
    onreconnect: (destination: Destination) => void;
    onchange: () => Promise<void>;
  } = $props();
  let operations: Relocation[] = $state([]),
    cursor: string | null = $state(null),
    operation: Relocation | null = $state(null);
  let choosing: Destination | null = $state(null),
    targetRoot = $state(""),
    error = $state(""),
    busy = $state(false),
    query = $state("");
  let entries: Entry[] = $state([]),
    fileCursor: string | null = $state(null),
    fileQuery = $state("");
  let checker: { create: (destination: string) => Promise<void> } | undefined =
    $state();
  const phases: Record<string, string> = {
    scanning: "Finding files",
    ready: "Ready for review",
    copying: "Copying and verifying",
    publishing: "Publishing verified folders",
    cleanup: "Cleaning original location",
    complete: "Complete",
    canceled: "Canceled",
  };
  const size = (n: number) =>
    n >= 1024 ** 3
      ? `${(n / 1024 ** 3).toFixed(2)} GB`
      : n >= 1024 ** 2
        ? `${(n / 1024 ** 2).toFixed(1)} MB`
        : `${(n / 1024).toFixed(1)} KB`;
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
  async function files(more = false) {
    if (!client || !operation) return;
    const params = new URLSearchParams({ q: fileQuery, limit: "100" });
    if (more && fileCursor) params.set("cursor", fileCursor);
    const page = await client.request<Page<Entry>>(
      `/v2/relocations/${operation.id}/files?${params}`,
    );
    entries = more ? [...entries, ...page.items] : page.items;
    fileCursor = page.next_cursor;
  }
  async function refresh() {
    if (!client) return;
    const page = await client.request<Page<Relocation>>(
      `/v2/relocations?${new URLSearchParams({ q: query, limit: "50" })}`,
    );
    operations = page.items;
    cursor = page.next_cursor;
    if (operation) {
      const previous = operation.state;
      operation = await client.request<Relocation>(
        `/v2/relocations/${operation.id}`,
      );
      if (previous !== operation.state) await files();
    }
  }
  $effect(() => {
    void revision;
    const active = client;
    if (active)
      void refresh().catch(
        (e) =>
          (error =
            e instanceof Error ? e.message : "Showing saved storage state."),
      );
  });
  async function inspect(id: string) {
    await run(async () => {
      operation = await client!.request<Relocation>(`/v2/relocations/${id}`);
      fileQuery = "";
      await files();
    });
  }
  async function create() {
    await run(async () => {
      if (!client || !choosing) return;
      operation = await client.request<Relocation>(
        `/v2/destinations/${choosing.id}/relocate`,
        { method: "POST", body: { target_root: targetRoot } },
      );
      choosing = null;
      entries = [];
      fileCursor = null;
      await onchange();
      await refresh();
    });
  }
  async function action(name: string) {
    await run(async () => {
      if (!client || !operation) return;
      operation = await client.request<Relocation>(
        `/v2/relocations/${operation.id}/${name}`,
        { method: "POST" },
      );
      await onchange();
      await refresh();
    });
  }
</script>

<section class="form-section" aria-labelledby="destinations-heading">
  <header>
    <h2 id="destinations-heading">Download folders</h2>
    <Button type="submit" onclick={onadd}
      ><Plus size={16} /> Add destination</Button
    >
  </header>
  <div class="form-box">
  {#each destinations as destination}<div class="v2-list-row destination-row">
      <Folder size={18} />
      <div class="v2-grow">
        <strong>{destination.label}</strong><small class="v2-path"
          >{destination.root}</small
        >
      </div>
      {#if destination.storage_operation}<span class="v2-badge">Moving files</span>
      {:else if !destination.available}<span class="v2-badge destination-warning">Unavailable</span>{/if}
      <div class="destination-actions">
      {#if destination.storage_operation}<Button
          type="submit"
          disabled={busy}
          onclick={() => inspect(destination.storage_operation!)}
          >View move</Button
        >
      {:else if !destination.available}<Button
          type="submit"
          onclick={() => onreconnect(destination)}>Reconnect</Button
        >
      {:else}<Button
          type="submit"
          disabled={busy}
          onclick={() => checker?.create(destination.id)}>Check files</Button
        ><Button
          type="submit"
          disabled={busy}
          onclick={() => {
            choosing = destination;
            targetRoot = "";
            error = "";
          }}>Move files</Button
        >{/if}
      </div>
    </div>{:else}<EmptyState
      compact
      level={3}
      icon={Folder}
      title="No destinations yet"
      description="Add a folder to save downloads. Existing files in it will be kept."
    />{/each}
  </div>
</section>
{#if client}<DestinationChecks {client} {revision} bind:this={checker} />{/if}
{#if operations.length || query}<section class="v2-panel storage-operations">
    <h2>Moves and checks</h2>
    <form
      class="v2-toolbar"
      onsubmit={(event) => {
        event.preventDefault();
        void run(refresh);
      }}
    >
      <input
        aria-label="Search storage locations"
        bind:value={query}
        placeholder="Search storage locations"
      /><Button type="submit" disabled={busy}>Search</Button>
    </form>
    {#if error && !operation && !choosing}<p role="alert">{error}</p>{/if}
    {#each operations as item}<div class="v2-list-row">
        <div class="v2-grow">
          <strong>{phases[item.state] ?? item.state}</strong><small
            class="v2-path">{item.source_root} → {item.target_root}</small
          ><small
            >{item.files} files · {size(item.bytes)}{item.retained
              ? ` · ${item.retained} original items retained`
              : ""}</small
          >{#if item.issue}<p role="alert">{item.issue.message}</p>{/if}
        </div>
        <Button type="submit" disabled={busy} onclick={() => inspect(item.id)}
          >View details</Button
        >
      </div>{:else}{#if !busy && !error}<EmptyState
          compact
          level={3}
          title="No matching moves or checks"
          description="Try a different search."
        />{/if}{/each}
    <InfiniteMore
      {cursor}
      disabled={busy}
      load={() =>
        run(async () => {
          const page = await client!.request<Page<Relocation>>(
            `/v2/relocations?${new URLSearchParams({ q: query, cursor: cursor!, limit: "50" })}`,
          );
          operations = [...operations, ...page.items];
          cursor = page.next_cursor;
        })}
      label="storage operations"
    />
  </section>{/if}
{#if choosing}<Dialog
    title={`Move ${choosing.label}`}
    {error}
    onclose={() => (choosing = null)}
  >
    <p>
      OMD will pause work for this destination and inventory its downloaded
      folders, user additions, and resumable transfers. Review the inventory
      before copying starts.
    </p>
    <p class="v2-path">Current location: {choosing.root}</p>
    <form
      id="dialog-form-storagepanel-5347"
      onsubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <label
        >New destination folder<input
          bind:value={targetRoot}
          required
          placeholder="Absolute path to an existing folder"
        /></label
      >
      {#if native}<Button
          type="button"
          onclick={() =>
            run(async () => {
              const path = await open({
                directory: true,
                multiple: false,
                title: "Choose the new destination",
              });
              if (typeof path === "string") targetRoot = path;
            })}>Choose folder</Button
        >{/if}
    </form>
    {#snippet footer()}<Button
        type="submit"
        form="dialog-form-storagepanel-5347"
        variant="primary"
        disabled={busy || !targetRoot}>Review files to move</Button
      >{/snippet}</Dialog
  >{/if}
{#if operation}<Dialog cancelLabel="Close"
    title="Move destination files"
    {error}
    onclose={() => (operation = null)}
  >
    <p role="status">
      {phases[operation.state] ?? operation.state} · {operation.files} files · {size(
        operation.bytes,
      )}
    </p>
    <p class="v2-path">
      From: {operation.source_root}<br />To: {operation.target_root}
    </p>
    {#if operation.issue}<p role="alert">{operation.issue.message}</p>{/if}
    {#if operation.state === "ready"}<p>
        Each folder will be verified and published without replacing existing
        files. OMD switches destinations only after every folder has been
        published. Originals changed after this inventory are retained.
      </p>{/if}
    {#if operation.state === "copying"}<progress
        max={Math.max(1, operation.files)}
        value={operation.copied}
        aria-label="Copied files"
      ></progress>{/if}
    {#if operation.retained}<p>
        {operation.retained} original items were retained because they changed or
        were added during the move. Check the original location and its recovery
        folder before removing anything.
      </p>
      <p class="v2-path">
        {displayJoinedPath(
          operation.source_root,
          `.omd-relocate-${operation.id}`,
        )}
      </p>{/if}
    {#if operation.state === "canceled"}<p>
        The original destination remains active. Any copies already written
        remain at the new location or in its private .omd-relocate-{operation.id}
        folder.
      </p>{/if}
    <form
      class="v2-toolbar"
      onsubmit={(event) => {
        event.preventDefault();
        void run(() => files());
      }}
    >
      <input
        aria-label="Search relocation files"
        bind:value={fileQuery}
        placeholder="Search inventoried files"
      /><Button type="submit" disabled={busy}>Search</Button>
    </form>
    <ScrollRegion class="v2-preview" label="Relocation file inventory"
      >{#each entries as file}<div class="v2-file-row">
          <strong class="v2-path"
            >{displayJoinedPath(file.root_path, file.path)}</strong
          ><small
            >{file.kind === "directory" ? "Folder" : size(file.size)} · {file.state}</small
          >
        </div>{:else}{#if !busy && !error}<EmptyState
            compact
            level={3}
            icon={Folder}
            title={fileQuery ? "No matching files" : "No files to move"}
            description={fileQuery
              ? "Try a different file name or path."
              : "This destination contains no files to move."}
          />{/if}{/each}<InfiniteMore
        cursor={fileCursor}
        disabled={busy}
        load={() => run(() => files(true))}
        label="inventoried files"
      /></ScrollRegion
    >

    {#snippet footer()}{#if operation}
        {#if ["scanning", "ready", "copying", "publishing"].includes(operation.state)}<Button
            type="submit"
            disabled={busy}
            onclick={() => action("cancel")}
            >{["scanning", "ready"].includes(operation.state)
              ? "Cancel move"
              : "Cancel and retain copies"}</Button
          >{/if}
        {#if operation.issue}<Button
            type="submit"
            disabled={busy}
            onclick={() => action("retry")}>Retry</Button
          >{/if}
        {#if operation.state === "ready"}<Button
            type="submit"
            variant="primary"
            disabled={busy}
            onclick={() => action("start")}>Move verified files</Button
          >{/if}
      {/if}{/snippet}</Dialog
  >{/if}

<style>
  .destination-row {
    padding: var(--space-3) var(--space-4);
  }
  .destination-row:first-child {
    padding-top: var(--space-3);
  }
  .destination-row:last-child {
    padding-bottom: var(--space-3);
  }
  .destination-row > :global(svg) {
    color: var(--muted);
  }
  .destination-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  @container (max-width: 620px) {
    .destination-row { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; gap: 12px 16px; }
    .destination-actions { grid-column: 2 / -1; }
  }
</style>
