<script lang="ts">
  let {
    children,
    label,
  }: { children: import("svelte").Snippet; label?: string } = $props();
</script>

<div class="record-list" aria-label={label}>{@render children()}</div>

<style>
  .record-list {
    border: var(--theme-recordlist-border-1, 1px) solid var(--line);
    border-radius: var(--panel-radius);
    background: var(--surface);
    overflow: hidden;
    padding: 0;
    min-width: 0;
  }
</style>
