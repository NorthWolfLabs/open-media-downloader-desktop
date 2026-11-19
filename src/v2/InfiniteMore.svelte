<script lang="ts">
  import PendingStatus from "./ui/PendingStatus.svelte";
  import Button from "./ui/Button.svelte";
  import { tick } from "svelte";
  let {
    cursor,
    load,
    label = "items",
    disabled = false,
  }: {
    cursor: string | null;
    load: () => Promise<unknown>;
    label?: string;
    disabled?: boolean;
  } = $props();
  let element: HTMLDivElement,
    working = $state(false),
    failure = $state(""),
    started = $state(false);
  let attempted: string | null = null;
  async function next(manual = false) {
    if (!cursor || working || disabled || (!manual && attempted === cursor))
      return;
    const before = cursor;
    attempted = before;
    started = true;
    working = true;
    failure = "";
    try {
      await load();
      await tick();
      if (cursor === before)
        failure = `Could not load more ${label}. Try again.`;
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    } finally {
      working = false;
    }
  }
  $effect(() => {
    const current = cursor;
    void disabled;
    void working;
    if (!current) attempted = null;
    if (
      !element ||
      !current ||
      disabled ||
      working ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void next();
      },
      {
        root: element.closest(".v2-preview,.v2-dialog-content,.v2-main"),
        rootMargin: "1800px 0px",
      },
    );
    observer.observe(element);
    return () => observer.disconnect();
  });
</script>

<div
  class="continuation"
  class:active={!!cursor || !!failure || started}
  bind:this={element}
  aria-live="polite"
  aria-busy={working}
>
  {#if failure}<span role="alert">{failure}</span><Button
      type="submit"
      onclick={() => next(true)}>Retry loading {label}</Button
    >
  {:else}<PendingStatus active={working} label={`Loading ${label}…`} />
  {/if}
</div>

<style>
  .continuation {
    height: 0;
    overflow-anchor: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--theme-infinitemore-gap-1, 12px);
    margin: 0;
    color: var(--muted);
    font-size: var(--theme-infinitemore-font-size-2, 13px);
  }
  .continuation:not(.active) {
    display: none;
  }
  .continuation.active {
    height: var(--theme-infinitemore-height-3, 64px);
  }
</style>
