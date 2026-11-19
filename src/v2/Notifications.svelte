<script lang="ts">
  import { formatTime } from "./dates";
  import Button from "./ui/Button.svelte";
  import InfiniteMore from "./InfiniteMore.svelte";
  import { untrack } from "svelte";
  import type { EngineClient, components } from "./client";
  import { pageWindow } from "./pageWindow";
  type Status = components["schemas"]["NotificationStatus"];
  type Batch = components["schemas"]["NotificationBatch"];
  let { client, revision }: { client: EngineClient; revision: number } =
    $props();
  let status: Status | null = $state(null),
    history: Batch[] = $state([]),
    enabled = $state(false),
    dirty = $state(false),
    busy = $state(false),
    error = $state(""),
    notice = $state("");
  let query = $state(""),
    applied = $state(""),
    cursor: string | null = $state(null),
    target = 50,
    version = 0;
  const label = (batch: Batch) =>
    ({
      sending: "Sending",
      delivered: "Accepted by the operating system",
      failed: "Not delivered",
      uncertain: "Delivery uncertain",
      dismissed: "Dismissed",
    })[batch.state] ?? batch.state;
  async function refresh() {
    const request = ++version,
      q = applied;
    const [response, page] = await Promise.all([
      client.api.GET("/v2/notifications"),
      pageWindow<Batch>(async (cursor) => {
        const { data } = await client.api.GET("/v2/notifications/history", {
          params: { query: { q, limit: 50, ...(cursor ? { cursor } : {}) } },
        });
        if (!data) throw new Error("Notification history is unavailable.");
        return { items: data.items, next_cursor: data.next_cursor ?? null };
      }, target),
    ]);
    if (request === version && response.data) {
      status = response.data;
      if (!dirty) enabled = status.enabled;
      history = page.items;
      cursor = page.next_cursor;
    }
  }
  $effect(() => {
    void revision;
    untrack(() => {
      void refresh().catch(
        (e) =>
          (error =
            e instanceof Error
              ? `Showing saved notification status. ${e.message}`
              : "Notification status is unavailable."),
      );
    });
  });
  async function run(action: () => Promise<void>) {
    busy = true;
    error = "";
    notice = "";
    try {
      await action();
    } catch (e) {
      error =
        e instanceof Error ? e.message : "The notification operation failed.";
    } finally {
      busy = false;
    }
  }
  async function save() {
    await run(async () => {
      const { data } = await client.api.PUT("/v2/notifications", {
        body: { enabled },
      });
      if (!data) throw new Error("The notification preference could not be saved. Retry the change.");
      if (data) {
        status = data;
        enabled = data.enabled;
        dirty = false;
      }
      await refresh();
      notice = enabled
        ? "Desktop notifications enabled."
        : "Desktop notifications off. Matches still appear in Overview.";
    });
  }
  async function control(batch: Batch, action: "retry" | "dismiss") {
    await run(async () => {
      await client.api.POST("/v2/notifications/history/{id}/{action}", {
        params: { path: { id: batch.id, action } },
      });
      await refresh();
    });
  }
</script>

<section class="form-section" aria-labelledby="notifications-heading">
  <h2 id="notifications-heading">Notifications</h2>
  <div class="form-box">
    <div class="form-row">
      <div class="form-row-label">
        <label class="v2-check"
          ><input
            type="checkbox"
            bind:checked={enabled}
            onchange={() => {dirty = true; void save();}}
            disabled={!status || busy}
          /> Show desktop notifications</label
        >
        <p>Alerts for new subscription matches. Every match also appears in Overview.</p>
      </div>
    </div>
    {#if status && (status.pending || status.failed || status.uncertain)}<p class="form-note">
        {status.pending} releases waiting for an alert · {status.failed} failed deliveries
        · {status.uncertain} uncertain deliveries.
      </p>{/if}
    {#if error}<p class="form-note" role="alert">{error}</p>{/if}{#if notice}<p
        class="form-note"
        role="status"
      >
        {notice}
      </p>{/if}
    {#if dirty && error}<div class="form-actions">
        <Button
          type="submit"
          variant="primary"
          disabled={!status || busy}
          onclick={save}>Retry notification preference</Button
        >
      </div>{/if}
  </div>

  {#if history.length || query}<div class="form-box delivery-history" aria-label="Notification deliveries">
    <form
      class="form-row v2-toolbar"
      onsubmit={(event) => {
        event.preventDefault();
        applied = query;
        target = 50;
        void run(refresh);
      }}
    >
      <label class="v2-grow"
        >Find a notification delivery<input
          type="search"
          bind:value={query}
          placeholder="failed, uncertain, delivered…"
        /></label
      ><Button type="submit" disabled={busy}>Search</Button>
    </form>
    {#each history as batch}<article class="form-row v2-download">
        <div class="v2-grow">
          <strong
            >{batch.count}
            {batch.count === 1 ? "release" : "releases"} · {label(
              batch,
            )}</strong
          ><small>{formatTime(batch.created_at)}</small
          >{#if batch.issue}<p>{batch.issue.message}</p>{/if}
        </div>
        {#if ["failed", "uncertain"].includes(batch.state)}<Button
            type="submit"
            disabled={busy}
            onclick={() => control(batch, "dismiss")}
            >Dismiss delivery issue</Button
          ><Button
            type="submit"
            disabled={busy}
            onclick={() => control(batch, "retry")}
            >{batch.state === "uncertain"
              ? "Send another alert"
              : "Retry alert"}</Button
          >{/if}
      </article>{/each}
    <InfiniteMore
      {cursor}
      disabled={busy}
      load={() => {
        target += 50;
        return run(refresh);
      }}
      label="deliveries"
    />
  </div>{/if}
</section>

<style>
  .form-row-label > p { padding-left:22px; margin:0; line-height:1.5; }
  .delivery-history .v2-toolbar {
    margin: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
  }
  .delivery-history .v2-download {
    display: flex;
    flex-wrap: wrap;
    padding: var(--space-3) var(--space-4);
    border-bottom: 0;
  }
</style>
