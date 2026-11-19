<script lang="ts">
  import { labelStyle } from "./labelAppearance";
  let {
    label,
    appearance,
    dot = false,
  }: {
    label: string;
    appearance?: { color: string } | null;
    dot?: boolean;
  } = $props();
</script>

<span
  class="source-badge"
  class:dot
  class:colored={!!labelStyle(appearance)}
  style={labelStyle(appearance)}
>
  {#if dot}<i aria-hidden="true"></i>{/if}{label}
</span>

<style>
  .source-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--theme-sourcebadge-gap-1, 5px);
    white-space: nowrap;
    font-size: var(--theme-sourcebadge-font-size-2, 11px);
    line-height: var(--theme-sourcebadge-line-height-3, 16px);
    padding: var(--theme-sourcebadge-padding-4, 2px) var(--theme-sourcebadge-padding-5, 6px);
    border-radius: var(--theme-sourcebadge-border-radius-6, 4px);
    background: var(--surface-soft);
    color: var(--muted);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .source-badge.colored {
    background: var(--label-background);
    color: var(--label-text);
    box-shadow: inset 0 0 0 var(--theme-sourcebadge-box-shadow-7, 1px) var(--label-border);
  }
  .source-badge.dot {
    box-shadow: none;
    background: transparent;
    color: var(--muted);
    padding: 0;
    font-size: var(--theme-sourcebadge-font-size-2, 11px);
    text-transform: capitalize;
  }
  .dot i {
    width: var(--theme-sourcebadge-width-8, 7px);
    height: var(--theme-sourcebadge-height-9, 7px);
    border-radius: 50%;
    background: var(--label-text, var(--muted));
    flex-shrink: 0;
  }
</style>
