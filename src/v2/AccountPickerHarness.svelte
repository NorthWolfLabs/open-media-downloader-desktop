<script lang="ts">
  import AccountPicker from "./AccountPicker.svelte";
  import { untrack } from "svelte";
  import type { EngineClient } from "./client";
  let {
    client,
    revision = 0,
    initial,
  }: {
    client: EngineClient;
    revision?: number;
    initial?: string | null;
  } = $props();
  let value: string | null | undefined = $state(untrack(() => initial));
</script>

<AccountPicker {client} provider="fixture" bind:value {revision} />
<output aria-label="Selected profile">{value ?? "public"}</output>
