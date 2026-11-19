<script lang="ts">
  import Button from "./ui/Button.svelte";
  import { X } from "lucide-svelte";
  import ScrollRegion from "./ScrollRegion.svelte";
  import { onMount, tick } from "svelte";
  import { dialogReturnTarget } from "./dialogFocus";
  import { disableDialogBackground } from "./dialogBackground";
  let {
    title,
    wide = false,
    onclose,
    children,
    footer,
    error = "",
    status = "",
    cancelLabel = "Cancel",
  }: {
    title: string;
    wide?: boolean;
    onclose: () => void;
    children: import("svelte").Snippet;
    footer?: import("svelte").Snippet;
    error?: string;
    status?: string;
    /** Visible secondary dismiss beside the footer actions; null when the footer has its own. */
    cancelLabel?: string | null;
  } = $props();
  let element: HTMLDialogElement;
  // A fade and divider show that the body scrolls and more is below.
  let more = $state(false);
  function measure() {
    const region = element?.querySelector<HTMLElement>(".v2-dialog-content");
    more = !!region && region.scrollHeight - region.scrollTop - region.clientHeight > 1;
  }
  const id = `dialog-${crypto.randomUUID()}`;
  onMount(() => {
    const previous = dialogReturnTarget();
    element.showModal();
    const restoreBackground = disableDialogBackground(element);
    const region = element.querySelector<HTMLElement>(".v2-dialog-content");
    region?.addEventListener("scroll", measure, { passive: true });
    const resized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (region) resized?.observe(region);
    measure();
    (
      element.querySelector<HTMLElement>(
        'input:not([type="hidden"]),select,textarea',
      ) ?? element.querySelector<HTMLElement>("h2")
    )?.focus();
    const observer = new MutationObserver(() => {
      measure();
      if (
        element.open &&
        (!element.contains(document.activeElement) ||
          document.activeElement?.matches(":disabled"))
      )
        element
          .querySelector<HTMLElement>(
            "button:not([disabled]),input:not([disabled]),select:not([disabled])",
          )
          ?.focus();
    });
    observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "hidden"],
    });
    return () => {
      observer.disconnect();
      resized?.disconnect();
      region?.removeEventListener("scroll", measure);
      restoreBackground();
      element.close();
      void tick().then(() => {
        if (document.querySelector("dialog[open]")) return;
        if (previous?.isConnected) previous.focus();
        else {
          const heading = document.querySelector<HTMLElement>(
            "main h1,.window-heading h1",
          );
          if (heading) {
            heading.tabIndex = -1;
            heading.focus();
          }
        }
      });
    };
  });
  $effect(() => {
    // Async steps may replace every focused form control without remounting the
    // dialog. Keep focus inside the current step after that DOM update.
    void title;
    void tick().then(() => {
      if (element?.open)
        (
          element.querySelector<HTMLElement>(
            'input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled])',
          ) ?? element.querySelector<HTMLElement>("h2")
        )?.focus();
    });
  });
  function trap(event: KeyboardEvent) {
    if (event.key !== "Tab") return;
    const items = [
      ...element.querySelectorAll<HTMLElement>(
        'button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]',
      ),
    ].filter((item) => item.getClientRects().length > 0);
    const first = items[0];
    const last = items.at(-1);
    if (!element.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
</script>

<dialog
  class:wide
  class:scroll-more={more}
  bind:this={element!}
  aria-labelledby={id}
  onkeydown={trap}
  oncancel={(event) => {
    // Native file inputs emit a bubbling cancel event when their picker closes.
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    onclose();
  }}
>
  <header class="v2-dialog-header">
    <h2 {id} tabindex="-1">{title}</h2>
    <Button variant="ghost" icon aria-label="Close dialog" onclick={onclose}
      ><X size={18} /></Button
    >
  </header>
  <ScrollRegion class="v2-dialog-content" label={`${title} content`}>
    {#if error}<p class="v2-error-text" role="alert">{error}</p>{/if}
    <div class="dialog-status" role="status" aria-live="polite">{status}</div>
    {@render children()}
  </ScrollRegion>
  {#if footer}<footer class="v2-dialog-footer">
      {#if cancelLabel}<Button onclick={onclose}>{cancelLabel}</Button>{/if}{@render footer()}
    </footer>{/if}
</dialog>

<style>dialog.wide { width: min(1080px, calc(100vw - 40px)); max-width: calc(100vw - 40px); }</style>
