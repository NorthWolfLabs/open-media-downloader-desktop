<script lang="ts">
  import { formatTime } from "./dates";
  import EmptyState from "./ui/EmptyState.svelte";
  import Button from "./ui/Button.svelte";
  import ScrollRegion from "./ScrollRegion.svelte";
  import { untrack } from "svelte";
  import type { EngineClient, components } from "./client";
  import Dialog from "./Dialog.svelte";
  import { pageWindow } from "./pageWindow";
  type Check = components["schemas"]["DestinationCheck"];
  type File = components["schemas"]["DestinationCheckFile"];
  let { client, revision }: { client: EngineClient; revision: number } =
    $props();
  let checks: Check[] = $state([]),
    current: Check | null = $state(null),
    files: File[] = $state([]);
  let listCursor: string | null = $state(null),
    fileCursor: string | null = $state(null);
  let query = $state(""),
    appliedQuery = $state(""),
    fileQuery = $state(""),
    appliedFileQuery = $state("");
  let error = $state(""),
    busy = $state(false),
    listTarget = 50,
    fileTarget = 100;
  let listVersion = 0,
    fileVersion = 0,
    detailVersion = 0;
  const label = (check: Check) =>
    check.state === "working" &&
    check.blocked_jobs === check.jobs &&
    check.blocked_jobs > 0
      ? "Needs attention"
      : ({
          working: "Checking files",
          paused: "Paused",
          complete: "Complete",
          canceled: "Canceled",
        }[check.state] ?? check.state);
  async function run(action: () => Promise<void>) {
    busy = true;
    error = "";
    try {
      await action();
    } catch (e) {
      error =
        e instanceof Error ? e.message : "The file check could not be updated.";
    } finally {
      busy = false;
    }
  }
  async function list() {
    const version = ++listVersion,
      q = appliedQuery;
    const page = await pageWindow<Check>(async (cursor) => {
      const { data } = await client.api.GET("/v2/destination-checks", {
        params: { query: { q, limit: 50, ...(cursor ? { cursor } : {}) } },
      });
      if (!data) throw new Error("No file-check list was returned.");
      return { items: data.items, next_cursor: data.next_cursor ?? null };
    }, listTarget);
    if (version === listVersion) {
      checks = page.items;
      listCursor = page.next_cursor;
    }
  }
  async function loadFiles() {
    if (!current) return;
    const id = current.id,
      version = ++fileVersion,
      q = appliedFileQuery;
    const page = await pageWindow<File>(async (cursor) => {
      const { data } = await client.api.GET(
        "/v2/destination-checks/{id}/files",
        {
          params: {
            path: { id },
            query: { q, limit: 100, ...(cursor ? { cursor } : {}) },
          },
        },
      );
      if (!data) throw new Error("No file-check inventory was returned.");
      return { items: data.items, next_cursor: data.next_cursor ?? null };
    }, fileTarget);
    if (version === fileVersion && current?.id === id) {
      files = page.items;
      fileCursor = page.next_cursor;
    }
  }
  async function details() {
    if (!current) return;
    const id = current.id,
      version = ++detailVersion;
    const { data } = await client.api.GET("/v2/destination-checks/{id}", {
      params: { path: { id } },
    });
    if (data && version === detailVersion && current?.id === id) {
      current = data;
      await loadFiles();
    }
  }
  $effect(() => {
    void revision;
    untrack(() => {
      void Promise.all([list(), details()]).catch(
        (e) =>
          (error =
            e instanceof Error
              ? `Showing saved check results. ${e.message}`
              : "Showing saved check results."),
      );
    });
  });
  export async function create(destination: string) {
    await run(async () => {
      const { data } = await client.api.POST("/v2/destinations/{id}/check", {
        params: { path: { id: destination } },
      });
      if (!data) throw new Error("No file check was returned.");
      current = data;
      fileQuery = "";
      appliedFileQuery = "";
      fileTarget = 100;
      await Promise.all([list(), loadFiles()]);
    });
  }
  async function inspect(check: Check) {
    current = check;
    fileQuery = "";
    appliedFileQuery = "";
    fileTarget = 100;
    files = [];
    await run(details);
  }
  async function action(action: "pause" | "resume" | "retry" | "cancel") {
    if (!current) return;
    const id = current.id;
    await run(async () => {
      const { data } = await client.api.POST(
        "/v2/destination-checks/{id}/{action}",
        { params: { path: { id, action } } },
      );
      if (data && current?.id === id) current = data;
      await Promise.all([list(), loadFiles()]);
    });
  }
</script>

{#if checks.length || query || error}<section class="v2-panel">
    <h2>File checks</h2>
    <p>
      Checks verify recorded files and update their status. They preserve your
      files and download history.
    </p>
    <form
      class="v2-toolbar"
      onsubmit={(event) => {
        event.preventDefault();
        appliedQuery = query;
        listTarget = 50;
        void run(list);
      }}
    >
      <label class="v2-grow"
        >Find a destination check<input
          type="search"
          bind:value={query}
        /></label
      ><Button type="submit" disabled={busy}>Search</Button>
    </form>
    {#if error && !current}<p role="alert">{error}</p>{/if}
    {#each checks as check}<article class="v2-download">
        <div class="v2-grow">
          <strong>{check.label}</strong><small
            >{label(check)} · {check.checked} of {check.files} files checked · {formatTime(check.created_at)}</small
          >
        </div>
        <Button type="submit" disabled={busy} onclick={() => inspect(check)}
          >View check</Button
        >
      </article>{:else}{#if !busy && !error}<EmptyState
          compact
          level={3}
          title="No matching file checks"
          description="Try a different search."
        />{/if}{/each}
    {#if listCursor}<Button
        type="submit"
        disabled={busy}
        onclick={() => {
          listTarget += 50;
          void run(list);
        }}>Load more checks</Button
      >{/if}
  </section>{/if}
{#if current}<Dialog cancelLabel="Close"
    title={`Check ${current.label} files`}
    {error}
    onclose={() => (current = null)}
  >
    <p role="status">
      {label(current)} · {current.checked} of {current.files} files checked across
      {current.jobs} downloads.
    </p>
    {#if current.state === "working"}<progress
        max={Math.max(1, current.files)}
        value={current.checked}
        aria-label="Checked files"
      ></progress>{/if}
    <p>
      {current.present} unchanged · {current.modified} modified · {current.missing}
      missing · {current.detached} paths needing attention.
    </p>
    {#if current.issue}<p role="alert">{current.issue.message}</p>{/if}
    {#if current.blocked_jobs && current.state !== "paused"}<p>
        {current.blocked_jobs} downloads need attention. Reconnect unavailable storage
        before retrying. A disconnected disk is never treated as evidence of deleted
        files.
      </p>{/if}
    <p>
      This check covers downloads recorded when it started. Run another check to
      include files downloaded afterward.
    </p>
    <form
      class="v2-toolbar"
      onsubmit={(event) => {
        event.preventDefault();
        appliedFileQuery = fileQuery;
        fileTarget = 100;
        void run(loadFiles);
      }}
    >
      <label class="v2-grow"
        >Find a checked file<input
          type="search"
          bind:value={fileQuery}
        /></label
      ><Button type="submit" disabled={busy}>Search</Button>
    </form>
    <ScrollRegion class="v2-preview" label="Destination file checks"
      >{#each files as file}<div class="v2-file-row">
          <strong class="v2-path">{file.path}</strong><small
            >{file.state === "pending" ? "Waiting to check" : file.state}</small
          >
        </div>{:else}{#if !busy && !error}<EmptyState
            compact
            level={3}
            title={appliedFileQuery ? "No matching files" : "No recorded files"}
            description={appliedFileQuery
              ? "Try a different file name or path."
              : "This check contains no recorded files."}
          />{/if}{/each}</ScrollRegion
    >
    {#if fileCursor}<Button
        type="submit"
        disabled={busy}
        onclick={() => {
          fileTarget += 100;
          void run(loadFiles);
        }}>Load more checked files</Button
      >{/if}
    {#snippet footer()}{#if current}
        {#if current.state === "working"}<Button
            type="submit"
            disabled={busy}
            onclick={() => action("pause")}>Pause check</Button
          >{/if}
        {#if current.state === "paused"}<Button
            type="submit"
            disabled={busy}
            onclick={() => action("resume")}>Resume check</Button
          >{/if}
        {#if current.blocked_jobs && current.state !== "canceled"}<Button
            type="submit"
            disabled={busy}
            onclick={() => action("retry")}>Retry unavailable files</Button
          >{/if}
        {#if ["working", "paused"].includes(current.state)}<Button
            type="submit"
            disabled={busy}
            onclick={() => action("cancel")}>Cancel check</Button
          >{/if}
      {/if}{/snippet}
  </Dialog>{/if}
