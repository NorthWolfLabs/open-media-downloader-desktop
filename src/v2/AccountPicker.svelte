<script lang="ts">
  import SelectPicker from "./SelectPicker.svelte";
  import type { EngineClient, components } from "./client";
  type Account = components["schemas"]["SourceAccount"];
  let {
    client,
    provider,
    value = $bindable<string | null>(),
    revision = 0,
    disabled = false,
    onchange = () => {},
  }: {
    client: EngineClient;
    provider: string;
    value?: string | null;
    revision?: number;
    disabled?: boolean;
    onchange?: () => void;
  } = $props();
  let accounts: Account[] = $state([]);
  let loading = $state(false);
  let issue = $state("");
  let loadedProvider = "";
  $effect(() => {
    const id = provider;
    void revision;
    let current = true;
    loading = true;
    issue = "";
    if (loadedProvider !== id) {
      accounts = [];
      loadedProvider = id;
    }
    void client
      .listAll<Account>(`/v2/sources/${encodeURIComponent(id)}/credentials`)
      .then((items) => {
        if (current) accounts = items;
      })
      .catch(() => {
        if (current)
          issue =
            "Account status could not be loaded. Your selection is retained.";
      })
      .finally(() => {
        if (current) loading = false;
      });
    return () => {
      current = false;
    };
  });
  const selected = $derived(
    accounts.find((account) => account.profile === value),
  );
  // With only public access to choose, there is nothing to pick.
  const choice = $derived(accounts.length > 0 || !!value || !!issue);
</script>

{#if choice}<div class="account-picker">
  <SelectPicker
    label="Source account"
    bind:value={() => value ?? null, (v) => (value = v)}
    disabled={disabled || (loading && !accounts.length && !value)}
    {onchange}
    options={[
      { id: null, label: "Public access" },
      ...accounts.map((account) => ({
        id: account.profile,
        label: account.label + (account.issue ? " · needs attention" : ""),
      })),
      ...(value && !selected
        ? [
            {
              id: value,
              label: value + (loading ? " · checking" : " · unavailable"),
            },
          ]
        : []),
    ]}
  />

  {#if loading}<small role="status">Checking accounts…</small>
  {:else if issue}<small role="status">{issue}</small>
  {:else if value && !selected}<small role="status"
      >This account is unavailable. Restore it in Sources or choose public
      access.</small
    >
  {:else if selected?.issue}<small role="status"
      >{selected.issue.message} Manage this account in Sources.</small
    >{/if}
</div>{/if}

<style>
  .account-picker {
    min-width: var(--theme-accountpicker-min-width-1, 11rem);
  }
  .account-picker small {
    display: block;
    max-width: var(--theme-accountpicker-max-width-2, 28rem);
    margin-top: var(--theme-accountpicker-margin-top-3, 0.35rem);
  }
</style>
