<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import ActionMenu from "./ui/ActionMenu.svelte";
  import { Rss, Settings2 } from "lucide-svelte";
  import type { EngineClient, Subscription, Collection } from "./client";
  import Button from "./ui/Button.svelte";
  import EmptyState from "./ui/EmptyState.svelte";
  import SearchBar from "./ui/SearchBar.svelte";
  import RecordList from "./ui/RecordList.svelte";
  import RecordRow from "./ui/RecordRow.svelte";
  import SelectPicker from "./SelectPicker.svelte";
  import { formatTime } from "./dates";
  let {
    client,
    items,
    sources,
    onopen,
    onsettings,
    onsearch,
    onchange,
    onfocus,
    empty,
  }: {
    onfocus: (title: string | null, back: () => void) => void;
    client: EngineClient;
    items: Subscription[];
    sources: Record<string, string>;
    onopen: (c: Collection) => void;
    onsettings: (s: Subscription) => void;
    onsearch?: (s: Subscription) => void;
    onchange: () => Promise<void>;
    /** The shared "add a source plugin" state, shown while no source and no subscription exist. */
    empty?: import("svelte").Snippet;
  } = $props();
  let query = $state(""),
    status = $state("all"),
    source = $state("all"),
    limit = $state(50),
    focused = $state<string | null>(null),
    loading = $state(false),
    error = $state("");
  let confirm = $state(false);
  $effect(() =>
    onfocus(
      active?.title ?? (active ? active.request.target.id : null),
      () => (focused = null),
    ),
  );
  const active = $derived(items.find((s) => s.id === focused));
  const matches = $derived(
    items
      .filter(
        (s) =>
          (status === "all" ||
            (status === "active" ? s.enabled : !s.enabled)) &&
          (source === "all" || s.request.target.provider === source) &&
          `${s.title ?? s.request.target.id} ${sources[s.request.target.provider] ?? ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .sort((a, b) =>
        (a.title ?? a.request.target.id).localeCompare(
          b.title ?? b.request.target.id,
        ),
      ),
  );
  $effect(() => {
    void query;
    void status;
    void source;
    limit = 50;
  });
  const date = (v: string | null | undefined) =>
    v ? formatTime(v) : "Not checked yet";
  function open(s: Subscription) {
    if (s.request.search) { onsearch?.(s); return; }
    onopen({
      reference: s.request.target,
      title: s.title ?? s.request.target.id,
      kind: "manga",
      canonical_url: "",
    });
  }
  async function action(s: Subscription, action: string) {
    loading = true;
    try {
      await client.request(`/v2/subscriptions/${s.id}/${action}`, {
        method: "POST",
      });
      if (action === "unsubscribe") focused = null;
      await onchange();
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }
</script>

{#if error}<p role="alert" class="v2-error-text">{error}</p>{/if}
{#if active}
  <section class="subscription-detail">
    <p>
      {sources[active.request.target.provider]} · {active.enabled
        ? "Active"
        : "Paused"}
    </p>
    <div class="ui-actions">
      <Button variant="primary" onclick={() => open(active)}>{active.request.search ? "View search results" : "View item"}</Button>
      <ActionMenu label="Subscription settings" text>
        {#snippet children(choose)}<Button
            variant="ghost"
            onclick={() => choose(() => onsettings(active))}
            >Edit subscription</Button
          >
          <Button
            variant="ghost"
            disabled={loading || !!active.current_check}
            onclick={() =>
              choose(() => {
                void action(active, "check");
              })}>{active.current_check ? "Checking…" : "Check now"}</Button
          >
          <Button
            variant="ghost"
            disabled={loading}
            onclick={() =>
              choose(() => {
                void action(active, active.enabled ? "pause" : "resume");
              })}>{active.enabled ? "Pause updates" : "Resume updates"}</Button
          >
          <hr />
          <Button
            variant="danger"
            onclick={() => choose(() => (confirm = true))}>Unsubscribe…</Button
          >
        {/snippet}
      </ActionMenu>
    </div>
    <dl>
      <div>
        <dt>{active.request.search ? "New matches" : "New releases"}</dt>
        <dd>
          {active.request.action === "download"
            ? "Download automatically"
            : "Notify only"}
        </dd>
      </div>
      <div>
        <dt>Check interval</dt>
        <dd>{active.request.interval_minutes} minutes</dd>
      </div>
      <div>
        <dt>Last successful check</dt>
        <dd>{date(active.last_success)}</dd>
      </div>
      <div>
        <dt>Next check</dt>
        <dd>{active.enabled ? date(active.next_check) : "Paused"}</dd>
      </div>
    </dl>
    {#if active.issue}<p role="alert">{active.issue.message}</p>{/if}
  </section>
{:else if empty && !items.length}
  {@render empty()}
{:else}
  {#if items.length > 10 || query || status !== "all" || source !== "all"}<SearchBar
      bind:value={query}
      label="Search subscriptions"
      busy={loading}
    />
    <div class="subscription-filters">
      <SelectPicker
        label="Status"
        bind:value={status}
        options={[
          { id: "all", label: "All statuses" },
          { id: "active", label: "Active" },
          { id: "paused", label: "Paused" },
        ]}
      /><SelectPicker
        label="Source"
        bind:value={source}
        options={[
          { id: "all", label: "All sources" },
          ...Object.entries(sources).map(([id, label]) => ({ id, label })),
        ]}
      /><small
        >{matches.length}
        {matches.length === 1 ? "subscription" : "subscriptions"}</small
      >
    </div>{/if}
  <RecordList label="Subscriptions">
    {#each matches.slice(0, limit) as sub}<RecordRow
        ><Rss size={20} /><button
          class="subscription-title"
          onclick={() => open(sub)}
          ><strong>{sub.title ?? sub.request.target.id}</strong><small
            >{sources[sub.request.target.provider] ??
              sub.request.target.provider} · {sub.request.search ? "Saved search · " : ""}{sub.request.action === "download"
              ? "Automatic downloads"
              : "Notify only"} ·
            <span class:v2-error-text={!!sub.issue}>{sub.issue ? "Needs attention" : sub.enabled ? "Active" : "Paused"}</span></small
          ><small
            >{sub.current_check
              ? sub.request.search ? "Checking for new matches…" : "Checking new releases…"
              : `Last checked ${date(sub.last_success)}`}</small
          >{#if sub.issue}<small class="v2-error-text subscription-issue">{sub.issue.message}</small>{/if}</button
        >{#if sub.issue && !sub.enabled}<Button
            disabled={loading}
            onclick={() => void action(sub, "resume")}>Resume</Button
          >{/if}<Button
          variant="ghost"
          icon
          title="Manage subscription"
          aria-label={`Manage ${sub.title ?? sub.request.target.id}`}
          onclick={() => (focused = sub.id)}><Settings2 /></Button
        ></RecordRow
      >
    {:else}<EmptyState
        icon={Rss}
        title={query || status !== "all" || source !== "all"
          ? "No matching subscriptions"
          : "No subscriptions yet"}
        description="Subscribe to an item or search to follow new matches."
      />{/each}
  </RecordList>
  {#if matches.length > limit}<Button onclick={() => (limit += 50)}
      >Show more subscriptions</Button
    >{/if}
{/if}

{#if confirm && active}<Dialog
    title="Unsubscribe?"
    onclose={() => (confirm = false)}
  >
    <p>
      Stop checking {active.title ?? "this item"} for new releases? Your downloads
      and history will remain.
    </p>
    {#snippet footer()}<Button
        variant="danger"
        disabled={loading}
        onclick={() => {
          void action(active, "unsubscribe").then(() => (confirm = false));
        }}>Unsubscribe</Button
      >{/snippet}
  </Dialog>{/if}

<style>
  .subscription-title {
    background: none;
    border: 0;
    padding: 0;
    display: grid;
    gap: var(--theme-subscriptionspage-gap-1, 4px);
    justify-content: stretch;
    text-align: left;
    flex: 1;
    min-width: 0;
    white-space: normal;
  }
  .subscription-title:hover strong {
    color: var(--accent-text);
  }
  .subscription-title small {
    display: block;
  }
  .subscription-filters {
    display: flex;
    align-items: end;
    gap: var(--theme-subscriptionspage-gap-2, 12px);
    margin-bottom: var(--theme-subscriptionspage-margin-bottom-3, 16px);
    flex-wrap: wrap;
  }
  .subscription-filters small {
    margin-bottom: var(--theme-subscriptionspage-margin-bottom-4, 8px);
  }
  .subscription-detail {
    display: grid;
    gap: var(--theme-subscriptionspage-gap-5, 16px);
    margin-top: var(--theme-subscriptionspage-margin-top-6, 24px);
  }
  dl {
    display: grid;
    
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--theme-subscriptionspage-gap-7, 20px);
    padding: var(--theme-subscriptionspage-padding-8, 20px);
    background: var(--surface);
    border: var(--theme-subscriptionspage-border-9, 1px) solid var(--line);
    border-radius: var(--theme-subscriptionspage-border-radius-10, 12px);
  }
  dt {
    font-size: var(--theme-subscriptionspage-font-size-11, 12px);
    color: var(--muted);
  }
  dd {
    margin: var(--theme-subscriptionspage-margin-12, 4px) 0 0;
  }
</style>
