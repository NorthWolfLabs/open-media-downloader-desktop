<script lang="ts">
  import Button from "./Button.svelte";
  import type { Snippet } from "svelte";
  let {
    selecting = $bindable(false),
    count,
    selected,
    totalSelected,
    onall,
    onclear,
    children,
    actions,
  }: {
    selecting?: boolean;
    count: number;
    selected: number;
    totalSelected: boolean;
    onall: () => void;
    onclear: () => void;
    children?: Snippet;
    actions?: Snippet;
  } = $props();
</script>

<div class="selection-toolbar">
  <div class="selection-start">
    {#if selecting}<label
        ><input
          type="checkbox"
          checked={totalSelected}
          indeterminate={selected > 0 && !totalSelected}
          onchange={onall}
        />Select all</label
      ><span>{selected} selected</span>{:else}<span
        >{count} {count === 1 ? "item" : "items"}</span
      >{@render children?.()}{/if}
  </div>
  <div class="ui-actions">
    {#if selecting}{@render actions?.()}<Button
        variant="ghost"
        onclick={() => {
          selecting = false;
          onclear();
        }}>Done</Button
      >{:else if count}<Button
        variant="ghost"
        onclick={() => (selecting = true)}>Select items</Button
      >{/if}
  </div>
</div>

<style>
  .selection-toolbar,
  .selection-start {
    display: flex;
    align-items: center;
    gap: var(--theme-selectiontoolbar-gap-1, 16px);
    flex-wrap: wrap;
  }
  .selection-toolbar {
    justify-content: space-between;
    margin-bottom: var(--theme-selectiontoolbar-margin-bottom-2, 16px);
    min-height: var(--theme-selectiontoolbar-min-height-3, 36px);
  }
  .selection-start {
    font-size: var(--theme-selectiontoolbar-font-size-4, 13px);
  }
  .ui-actions {
    margin: 0;
  }
  label {
    display: flex;
    align-items: center;
    gap: var(--theme-selectiontoolbar-gap-5, 8px);
  }
</style>
