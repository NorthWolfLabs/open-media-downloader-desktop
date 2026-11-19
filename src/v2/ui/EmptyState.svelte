<script lang="ts">
  import type { Snippet } from "svelte";
  import { Inbox } from "lucide-svelte";
  let {
    title,
    description = "",
    icon: Icon = Inbox,
    level = 2,
    compact = false,
    headingId,
    children,
  }: {
    title: string;
    description?: string;
    icon?: typeof Inbox;
    level?: 2 | 3;
    compact?: boolean;
    /** Lets a surrounding region be labelled by this heading. */
    headingId?: string;
    children?: Snippet;
  } = $props();
</script>

<div class="ui-empty" class:compact>
  <div class="empty-icon" aria-hidden="true">
    <Icon size={28} strokeWidth={1.5} />
  </div>
  <div class="empty-copy">
    <svelte:element this={level === 3 ? "h3" : "h2"} id={headingId}>{title}</svelte:element>
    {#if description}<p>{description}</p>{/if}
  </div>
  {#if children}<div class="empty-actions">{@render children()}</div>{/if}
</div>

<style>
  .ui-empty {
    min-height: var(--theme-emptystate-min-height-1, 200px);
    justify-content: center;
    padding: var(--theme-emptystate-padding-2, 32px) var(--theme-emptystate-padding-3, 24px);
    gap: var(--theme-emptystate-gap-4, 16px);
  }
  .ui-empty.compact {
    min-height: var(--theme-emptystate-min-height-5, 136px);
    padding: var(--theme-emptystate-padding-6, 16px);
    gap: var(--theme-emptystate-gap-7, 12px);
  }
  .empty-icon {
    display: grid;
    place-items: center;
    width: var(--theme-emptystate-width-8, 48px);
    height: var(--theme-emptystate-height-9, 48px);
    flex-shrink: 0;
    border-radius: var(--theme-emptystate-border-radius-10, 12px);
    color: var(--muted);
    background: var(--surface-soft);
  }
  .compact .empty-icon {
    width: var(--theme-emptystate-width-11, 40px);
    height: var(--theme-emptystate-height-12, 40px);
    border-radius: var(--theme-emptystate-border-radius-13, 10px);
  }
  .empty-copy {
    display: grid;
    gap: var(--theme-emptystate-gap-14, 6px);
    justify-items: center;
  }
  .empty-copy :global(h2),
  .empty-copy :global(h3) {
    margin: 0;
    font-size: var(--theme-emptystate-font-size-15, 15px);
    line-height: var(--theme-emptystate-line-height-16, 1.4);
    font-weight: var(--theme-emptystate-font-weight-17, 600);
  }
  .empty-copy p {
    margin: 0;
    font-size: var(--theme-emptystate-font-size-18, 13px);
    line-height: var(--theme-emptystate-line-height-19, 1.6);
    max-width: 44ch;
    text-wrap: pretty;
  }
  .empty-actions {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--theme-emptystate-gap-20, 8px) var(--space-4);
    flex-wrap: wrap;
  }
</style>
