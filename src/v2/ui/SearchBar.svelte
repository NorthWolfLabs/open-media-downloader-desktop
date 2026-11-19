<script lang="ts">
  import Button from "./Button.svelte";
  import { Search, RefreshCw } from "lucide-svelte";
  let {
    value = $bindable(""),
    label,
    busy = false,
    onsubmit,
    onrefresh,
    children,
  }: {
    value?: string;
    label: string;
    busy?: boolean;
    onsubmit?: () => void;
    onrefresh?: () => void;
    children?: import("svelte").Snippet;
  } = $props();
</script>

<form
  class="search-bar"
  onsubmit={(e) => {
    e.preventDefault();
    onsubmit?.();
  }}
>
  <input type="search" aria-label={label} placeholder={label} bind:value />
  {#if onsubmit}<Button type="submit" disabled={busy}><Search />Search</Button
    >{/if}
  {@render children?.()}
  {#if onrefresh}<Button
      variant="ghost"
      icon
      title="Refresh"
      aria-label="Refresh"
      disabled={busy}
      onclick={onrefresh}><RefreshCw /></Button
    >{/if}
</form>

<style>
  .search-bar {
    display: flex;
    align-items: center;
    gap: var(--theme-searchbar-gap-1, 8px);
    min-width: 0;
    margin-bottom: var(--theme-searchbar-margin-bottom-2, 16px);
  }
  .search-bar input {
    min-width: 0;
    flex: 1;
  }
</style>
