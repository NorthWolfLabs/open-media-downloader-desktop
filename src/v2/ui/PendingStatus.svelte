<script lang="ts">
  import { onDestroy, type Snippet } from "svelte";
  import { PendingPresentation } from "./pendingPresentation";
  let {
    active,
    label,
    floating = false,
    children,
  }: {
    active: boolean;
    label: string;
    floating?: boolean;
    children?: Snippet;
  } = $props();
  let shown = $state("");
  const presentation = new PendingPresentation((value) => (shown = value));
  $effect(() => presentation.update(active ? label : ""));
  onDestroy(() => presentation.dispose());
</script>

{#if children && !active}
  {@render children()}
{:else if children}
  <div class="pending-space" aria-busy={active}>
    {#if shown}<p role="status">{shown}</p>{/if}
  </div>
{:else if shown}
  <div class:v2-busy={floating} role="status">{shown}</div>
{/if}

<style>
  .pending-space {
    min-height: var(--theme-pendingstatus-min-height-1, 120px);
    display: grid;
    align-content: start;
    padding-top: var(--theme-pendingstatus-padding-top-2, 24px);
  }
</style>
