<script lang="ts">
  let {
    onclick,
    children,
    class: className = "",
  }: {
    onclick?: () => void;
    children: import("svelte").Snippet;
    class?: string;
  } = $props();
</script>

{#if onclick}<button type="button" class={`record-row ${className}`} {onclick}
    >{@render children()}</button
  >{:else}<article class={`record-row ${className}`}>
    {@render children()}
  </article>{/if}

<style>
  .record-row {
    display: flex;
    align-items: center;
    gap: var(--theme-recordrow-gap-1, 16px);
    width: 100%;
    height: auto;
    min-height: 0;
    padding: var(--theme-recordrow-padding-2, 16px);
    border: 0;
    border-radius: 0;
    background: transparent;
    text-align: left;
    white-space: normal;
    justify-content: flex-start;
  }
  :global(.record-row) + .record-row {
    border-top: var(--theme-recordrow-border-top-3, 1px) solid var(--line);
  }
  button.record-row:hover {
    background: var(--surface-soft);
  }
  .record-row > :global(svg) {
    color: var(--muted);
  }
</style>
