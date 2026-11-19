<script lang="ts">
  import Button from "./ui/Button.svelte";
  import { ArrowLeft, ArrowRight } from "lucide-svelte";
  let {
    index,
    total,
    hasMore = false,
    onstep,
  }: {
    index: number;
    total: number;
    hasMore?: boolean;
    onstep: (direction: number) => void;
  } = $props();
</script>

<nav aria-label="Gallery navigation" class="gallery-navigation">
  <Button
    variant="ghost"
    icon
    aria-label="Previous item"
    disabled={!index}
    onclick={() => onstep(-1)}><ArrowLeft size={17} /></Button
  ><span
    >{total ? `${index + 1} of ${total}${hasMore ? "+" : ""}` : "0 items"}</span
  ><Button
    variant="ghost"
    icon
    aria-label="Next item"
    disabled={index >= total - 1 && !hasMore}
    onclick={() => onstep(1)}><ArrowRight size={17} /></Button
  >
</nav>

<style>
  .gallery-navigation {
    display: flex;
    align-items: center;
    gap: var(--theme-gallerynavigation-gap-1, 8px);
    height: var(--theme-gallerynavigation-height-2, 36px);
  }
  .gallery-navigation span {
    font-size: var(--theme-gallerynavigation-font-size-3, 13px);
    color: var(--muted);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
</style>
