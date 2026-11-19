<script lang="ts">
  import { ChevronRight } from "lucide-svelte";
  let {
    label,
    value,
    onclick,
  }: {
    label: string;
    value: number;
    onclick: () => void;
  } = $props();
</script>

<button type="button" class="stat-card" {onclick}>
  <span>{label}</span>
  <strong>{value}</strong>
  <ChevronRight size={16} aria-hidden="true" />
</button>

<style>
  /* Cells of the Overview summary strip (.v2-stats draws the box). */
  .stat-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--theme-statcard-gap-1, 2px) var(--theme-statcard-gap-2, 12px);
    width: 100%;
    height: auto;
    padding: var(--theme-statcard-padding-3, 14px) var(--space-4);
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    text-align: left;
    transition: background-color var(--motion-duration);
  }
  :global(.stat-card) + .stat-card {
    border-left: var(--theme-statcard-border-4, 1px) solid var(--line);
  }
  .stat-card:hover {
    background: var(--surface-soft);
  }
  /* The summary strip clips its rounded corners, so the ring is drawn inside. */
  .stat-card:focus-visible {
    outline-offset: calc(-1 * var(--focus-width, 2px) - 1px);
  }
  span {
    color: var(--muted);
    font-size: var(--theme-statcard-font-size-6, var(--type-caption));
  }
  strong {
    grid-column: 1;
    font-size: var(--theme-statcard-font-size-7, var(--type-title));
    font-weight: 600;
    line-height: var(--theme-statcard-line-height-8, 1.2);
    font-variant-numeric: tabular-nums;
  }
  .stat-card > :global(svg) {
    grid-column: 2;
    grid-row: 1 / 3;
    align-self: center;
    color: var(--muted);
  }
  @container (max-width: 620px) {
    .stat-card {
      padding: var(--theme-statcard-padding-9, 10px) var(--space-4);
      gap: var(--theme-statcard-gap-10, 2px) var(--theme-statcard-gap-2, 12px);
    }
    :global(.stat-card) + .stat-card {
      border-left: 0;
      border-top: var(--theme-statcard-border-4, 1px) solid var(--line);
    }
  }
</style>
