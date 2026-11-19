<script lang="ts">
  import { Check, X, AlertCircle, Info } from "lucide-svelte";
  import Button from "./Button.svelte";
  let {
    message,
    progress,
    onclose,
    kind = "success",
    action,
    actionLabel = "Retry",
    actionId,
    dismissLabel = "Dismiss download notification",
  }: {
    message: string;
    progress?: { value: number; total?: number; label: string };
    onclose: () => void;
    kind?: "success" | "error" | "info";
    action?: () => void;
    actionLabel?: string;
    actionId?: string;
    dismissLabel?: string;
  } = $props();
  let paused = $state(false);
  $effect(() => {
    void message;
    if (paused || action) return;
    const timer = setTimeout(onclose, 5000);
    return () => clearTimeout(timer);
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions (pause notification while reading or focusing its dismiss control) -->
<aside
  class="toast"
  role={kind === "error" ? "alert" : "status"}
  onmouseenter={() => (paused = true)}
  onmouseleave={() => (paused = false)}
  onfocusin={() => (paused = true)}
  onfocusout={() => (paused = false)}
>
  {#if kind === "error"}<AlertCircle size={18} />{:else if kind === "info"}<Info
      size={18}
    />{:else}<Check size={18} />{/if}
  <div class="toast-content">
    <span>{message}</span>
    {#if progress}<small>{progress.label}</small><progress
        aria-label={progress.label}
        max={progress.total || undefined}
        value={progress.total ? progress.value : undefined}
      ></progress>{/if}
  </div>
  {#if action}<Button id={actionId} variant="ghost" onclick={action}>{actionLabel}</Button
    >{/if}<Button
    variant="ghost"
    icon
    aria-label={dismissLabel}
    onclick={onclose}><X /></Button
  >
</aside>

<style>
  .toast-content {
    display: grid;
    gap: var(--theme-toast-gap-1, 6px);
    min-width: 0;
  }
  .toast-content small {
    color: var(--muted);
  }
  progress {
    width: 100%;
    height: var(--theme-toast-height-2, 4px);
    accent-color: var(--accent);
  }

  .toast {
    position: fixed;
    bottom: var(--theme-toast-bottom-3, 24px);
    right: var(--theme-toast-right-4, 24px);
    z-index: 90;
    display: flex;
    align-items: center;
    gap: var(--theme-toast-gap-5, 12px);
    max-width: calc(100vw - var(--theme-toast-max-width-6, 48px));
    padding: var(--theme-toast-padding-7, 12px) var(--theme-toast-padding-7, 12px) var(--theme-toast-padding-7, 12px) var(--theme-toast-padding-8, 16px);
    background: var(--surface);
    border: var(--theme-toast-border-9, 1px) solid var(--line-strong);
    border-radius: var(--panel-radius);
    box-shadow: var(--shadow);
    font-size: var(--theme-toast-font-size-10, 13px);
    
    animation: ui-enter var(--motion-duration) ease-out;
  }
</style>
