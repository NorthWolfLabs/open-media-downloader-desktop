<script lang="ts">
  import { untrack } from "svelte";
  import Dialog from "./Dialog.svelte";
  import Button from "./ui/Button.svelte";
  import SelectPicker from "./SelectPicker.svelte";
  import AccountPicker from "./AccountPicker.svelte";
  import { subscriptionLabel } from "./mediaPresentation";
  import type { Collection, Destination, EngineClient, SubscribeRequest } from "./client";

  let { collection, destinations, client, account = null, hasAccounts = false, accountRevision = 0, destination = "", busy = false, error = "", onclose, onsubmit }: {
    collection: Collection; destinations: Destination[]; client: EngineClient;
    account?: string | null; hasAccounts?: boolean; accountRevision?: number;
    destination?: string; busy?: boolean; error?: string;
    onclose: () => void; onsubmit: (request: SubscribeRequest) => void | Promise<void>;
  } = $props();
  let action = $state<"notify" | "download">("notify");
  let interval = $state(60), includeExisting = $state(false);
  let selectedDestination = $state(untrack(() => destination || destinations[0]?.id || ""));
  let selectedAccount = $state(untrack(() => account));
  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy || (action === "download" && !selectedDestination)) return;
    void onsubmit({
      target: collection.reference, policy: { languages: [], groups: [] },
      action, destination_id: action === "download" ? selectedDestination : "",
      recipe: "original_images", include_existing: includeExisting,
      interval_minutes: interval, credential_profile: selectedAccount,
    });
  }
</script>

<Dialog title={subscriptionLabel(collection)} {error} onclose={() => { if (!busy) onclose(); }}>
  <form id="profile-subscription" onsubmit={submit}>
    <p>Follow <strong>{collection.title}</strong> in OMD for new posts.</p>
    {#if hasAccounts}<AccountPicker {client} provider={collection.reference.provider} bind:value={selectedAccount} revision={accountRevision}/>{/if}
    <SelectPicker label="New posts" bind:value={action} disabled={busy} options={[{id:"notify",label:"Notify only"},{id:"download",label:"Download automatically"}]}/>
    {#if action === "download"}
      <SelectPicker label="Save to" bind:value={selectedDestination} disabled={busy} options={destinations.map(d=>({id:d.id,label:d.label}))}/>
      <p class="hint">Every image in each post is saved at original quality, together in one folder.</p>
      {#if !destinations.length}<p role="status">Add a download destination in Settings to use automatic downloads.</p>{/if}
    {:else}<p class="hint">New posts appear in Overview so you can choose what to download.</p>{/if}
    <SelectPicker label="Check for new posts" bind:value={interval} disabled={busy} options={[{id:15,label:"Every 15 minutes"},{id:60,label:"Every hour"},{id:360,label:"Every 6 hours"},{id:1440,label:"Every day"}]}/>
    <label class="v2-check"><input type="checkbox" bind:checked={includeExisting} disabled={busy}/>Include existing posts</label>
    <p class="hint">{includeExisting ? action === "download" ? "The first check also downloads existing posts that haven’t been saved yet." : "The first check also adds existing posts to Overview." : "The first check sets the starting point. Only posts found after that are included."}</p>
  </form>
  {#snippet footer()}<Button type="submit" form="profile-subscription" variant="primary" disabled={busy || (action === "download" && !selectedDestination)}>{busy ? "Following…" : subscriptionLabel(collection)}</Button>{/snippet}
</Dialog>

<style>
  form { display: grid; gap: var(--theme-profile-subscription-gap, 16px); }
  form p { margin: 0; }
  .hint { font-size: var(--theme-profile-subscription-hint-size, 13px); color: var(--muted); line-height: 1.5; }
</style>
