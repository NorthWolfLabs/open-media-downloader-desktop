<script lang="ts">
  import EmptyState from "./ui/EmptyState.svelte";
  import Button from "./ui/Button.svelte";
  import InfiniteMore from "./InfiniteMore.svelte";
  import ScrollRegion from "./ScrollRegion.svelte";
  import { untrack } from "svelte";
  import type { EngineClient, components } from "./client";
  import Dialog from "./Dialog.svelte";
  import { pageWindow } from "./pageWindow";
  import { sourceRemovalCopy } from "./copy";
  import { formatTime } from "./dates";
  import { credentialStoreName } from "./platform";
  type Removal = components["schemas"]["SourceRemoval"];
  type Review = components["schemas"]["SourceRemovalReview"];
  type Entry = components["schemas"]["SourceRemovalEntry"];
  let {
    client,
    revision,
    onchange,
  }: { client: EngineClient; revision: number; onchange: () => Promise<void> } =
    $props();
  let review: Review | null = $state(null),
    current: Removal | null = $state(null),
    items: Removal[] = $state([]),
    entries: Entry[] = $state([]);
  let cursor: string | null = $state(null),
    entryCursor: string | null = $state(null),
    query = $state(""),
    applied = $state(""),
    entryQuery = $state(""),
    entryApplied = $state("");
  let busy = $state(false),
    error = $state(""),
    target = 50,
    entryTarget = 100,
    listVersion = 0,
    detailVersion = 0,
    entryVersion = 0;
  const status = (item: Removal) =>
    item.issue
      ? "Needs attention"
      : item.state === "complete"
        ? "Complete"
        : "Removing source";
  async function run(action: () => Promise<void>) {
    busy = true;
    error = "";
    try {
      await action();
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : "The source removal could not be updated.";
    } finally {
      busy = false;
    }
  }
  async function list() {
    const version = ++listVersion,
      q = applied;
    const page = await pageWindow<Removal>(async (cursor) => {
      const { data } = await client.api.GET("/v2/source-removals", {
        params: { query: { q, limit: 50, ...(cursor ? { cursor } : {}) } },
      });
      if (!data) throw new Error("No source removal history was returned.");
      return { items: data.items, next_cursor: data.next_cursor ?? null };
    }, target);
    if (version === listVersion) {
      items = page.items;
      cursor = page.next_cursor;
    }
  }
  async function loadEntries() {
    if (!current) return;
    const id = current.id,
      version = ++entryVersion,
      q = entryApplied;
    const page = await pageWindow<Entry>(async (cursor) => {
      const { data } = await client.api.GET(
        "/v2/source-removals/{id}/entries",
        {
          params: {
            path: { id },
            query: { q, limit: 100, ...(cursor ? { cursor } : {}) },
          },
        },
      );
      if (!data) throw new Error("No cleanup inventory was returned.");
      return { items: data.items, next_cursor: data.next_cursor ?? null };
    }, entryTarget);
    if (version === entryVersion && current?.id === id) {
      entries = page.items;
      entryCursor = page.next_cursor;
    }
  }
  async function details() {
    if (!current) return;
    const id = current.id,
      version = ++detailVersion;
    const { data } = await client.api.GET("/v2/source-removals/{id}", {
      params: { path: { id } },
    });
    if (data && current?.id === id && version === detailVersion) {
      current = data;
      await loadEntries();
    }
  }
  $effect(() => {
    void revision;
    untrack(() => {
      void Promise.all([list(), details()]).catch(
        (e) =>
          (error =
            e instanceof Error
              ? `Showing saved removal history. ${e.message}`
              : "Showing saved removal history."),
      );
    });
  });
  function close() {
    review = null;
    current = null;
  }
  function resetEntries() {
    entries = [];
    entryQuery = "";
    entryApplied = "";
    entryTarget = 100;
    entryCursor = null;
  }
  export async function inspect(provider: string) {
    await run(async () => {
      const { data } = await client
        .administrativeApi()
        .POST("/v2/sources/{id}/remove", {
          params: { path: { id: provider } },
          body: { approve_digest: null },
        });
      if (!data) throw new Error("No removal review was returned.");
      review = data.review ?? null;
      current = data.operation ?? null;
      resetEntries();
      if (current) await loadEntries();
    });
  }
  async function approve() {
    if (!review) return;
    const requested = review;
    await run(async () => {
      const { data } = await client
        .administrativeApi()
        .POST("/v2/sources/{id}/remove", {
          params: { path: { id: requested.provider } },
          body: { approve_digest: requested.approval_digest },
        });
      if (!data) throw new Error("No removal result was returned.");
      review = data.review ?? null;
      current = data.operation ?? null;
      if (data.review_required) {
        error =
          "The installed package changed. Review the updated removal before approving it.";
        return;
      }
      resetEntries();
      await Promise.all([list(), loadEntries(), onchange()]);
    });
  }
  async function retry() {
    if (!current) return;
    const id = current.id;
    await run(async () => {
      const { data } = await client
        .administrativeApi()
        .POST("/v2/source-removals/{id}/retry", { params: { path: { id } } });
      if (data && current?.id === id) current = data;
      await list();
    });
  }
</script>

{#if items.length || query || error}<section class="v2-panel">
    <h2>Source removal history</h2>
    <form
      class="v2-toolbar"
      onsubmit={(event) => {
        event.preventDefault();
        applied = query;
        target = 50;
        void run(list);
      }}
    >
      <label class="v2-grow"
        >Find a source removal<input type="search" bind:value={query} /></label
      ><Button type="submit" disabled={busy}>Search</Button>
    </form>
    {#if error && !current && !review}<p role="alert">{error}</p>{/if}
    {#each items as item}<article class="v2-download">
        <div class="v2-grow">
          <strong>{item.review.name}</strong><small
            >{status(item)} · {formatTime(item.created_at)}</small
          >
        </div>
        <Button
          type="submit"
          disabled={busy}
          onclick={() => {
            current = item;
            review = null;
            resetEntries();
            void run(details);
          }}>View removal</Button
        >
      </article>{:else}{#if !busy && !error}<EmptyState
          compact
          level={3}
          title="No matching source removals"
          description="Try a different search."
        />{/if}{/each}
    <InfiniteMore
      {cursor}
      disabled={busy}
      load={() => {
        target += 50;
        return run(list);
      }}
      label="removals"
    />
  </section>{/if}
{#if review || current}<Dialog cancelLabel={null}
    title={review ? `Remove ${review.name}?` : `${current?.review.name} removal`}
    {error}
    onclose={close}
  >
    {#if review}
      {#each sourceRemovalCopy(review, credentialStoreName()) as paragraph}<p>{paragraph}</p>{/each}
    {:else if current}
      <p role="status">
        {status(current)} · {current.processed} of {current.total} cleanup entries
        processed.
      </p>
      {#if current.state === "working"}<progress
          value={current.processed}
          max={Math.max(1, current.total)}
          aria-label="Source cleanup progress"
        ></progress>{/if}
      {#if current.issue}<p role="alert">{current.issue.message}</p>{/if}
      {#if current.retained}<p>
          {current.retained} entries were retained. Review the reasons below.
        </p>{/if}
      <p>Downloaded files and recorded download history are preserved.</p>
      <form
        class="v2-toolbar"
        onsubmit={(event) => {
          event.preventDefault();
          entryApplied = entryQuery;
          entryTarget = 100;
          void run(loadEntries);
        }}
      >
        <label class="v2-grow"
          >Find a cleanup entry<input
            type="search"
            bind:value={entryQuery}
          /></label
        ><Button type="submit" disabled={busy}>Search</Button>
      </form>
      <ScrollRegion class="v2-preview" label="Source cleanup entries"
        >{#each entries as entry}<div class="v2-file-row">
            <strong
              >{entry.kind === "account" ? "Account" : "Package version"} · {entry.state}</strong
            ><small class="v2-path">{entry.item_key}</small>{#if entry.issue}<p>
                {entry.issue.message}
              </p>{/if}
          </div>{:else}{#if !busy && !error}<EmptyState
              compact
              level={3}
              title="No matching cleanup entries"
              description="Try a different search."
            />{/if}{/each}<InfiniteMore
          cursor={entryCursor}
          disabled={busy}
          load={() => {
            entryTarget += 100;
            return run(loadEntries);
          }}
          label="entries"
        /></ScrollRegion
      >
    {/if}
    {#snippet footer()}<Button type="submit" onclick={close}
        >{review ? "Keep source" : "Close"}</Button
      >{#if review}<Button
          type="submit"
          variant="danger"
          disabled={busy}
          onclick={approve}>Remove source</Button
        >{:else if current?.issue}<Button
          type="submit"
          variant="primary"
          disabled={busy}
          onclick={retry}>Retry cleanup</Button
        >{/if}{/snippet}
  </Dialog>{/if}
