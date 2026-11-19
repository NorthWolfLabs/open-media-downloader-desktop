<script lang="ts">
  import { tick } from "svelte";
  import { MoreHorizontal, ChevronDown } from "lucide-svelte";
  import Button from "./Button.svelte";
  import type { Snippet } from "svelte";
  let {
    label = "More actions",
    text = false,
    disabled = false,
    children,
  }: {
    label?: string;
    text?: boolean;
    disabled?: boolean;
    children: Snippet<[(action: () => void) => void]>;
  } = $props();
  let panel: HTMLDivElement, trigger: HTMLSpanElement;
  let open = $state(false),
    top = $state(0),
    left = $state(0);
  function close() {
    open = false;
    panel?.hidePopover();
  }
  async function toggle() {
    if (open) {
      close();
      return;
    }
    const rect = trigger.getBoundingClientRect();
    left = Math.max(8, Math.min(rect.left, window.innerWidth - 272));
    top = rect.bottom + 6;
    panel.showPopover();
    open = true;
    await tick();
    const menu = panel.getBoundingClientRect();
    left = Math.max(8, Math.min(rect.left, window.innerWidth - menu.width - 8));
    top = Math.max(
      8,
      Math.min(rect.bottom + 6, window.innerHeight - menu.height - 8),
    );
    panel.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }
  function choose(action: () => void) {
    close();
    action();
  }
  function keys(e: KeyboardEvent) {
    const buttons = Array.from(
      panel.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      buttons[
        (index + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) %
          buttons.length
      ]?.focus();
    }
    if (e.key === "Escape") {
      close();
      trigger.querySelector("button")?.focus();
    }
  }
</script>

<span bind:this={trigger} class="menu-trigger"
  ><Button
    variant={text ? "secondary" : "ghost"}
    icon={!text}
    {disabled}
    aria-label={label}
    aria-expanded={open}
    aria-haspopup="true"
    onclick={toggle}
    >{#if text}{label}<ChevronDown size={15} />{:else}<MoreHorizontal
        size={18}
      />{/if}</Button
  ></span
>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  role="group"
  aria-label={label}
  bind:this={panel}
  popover="auto"
  class="action-menu"
  style={`top:${top}px;left:${left}px`}
  onkeydown={keys}
  ontoggle={(event) => (open = (event as ToggleEvent).newState === "open")}
>
  {@render children(choose)}
</div>

<style>
  .menu-trigger {
    display: inline-flex;
    flex-shrink: 0;
  }
  .action-menu {
    position: fixed;
    inset: auto;
    margin: 0;
    width: min(var(--theme-actionmenu-width-1, 256px), calc(100vw - var(--theme-actionmenu-width-2, 16px)));
    max-height: min(var(--theme-actionmenu-max-height-3, 420px), 60vh);
    overflow: auto;
    padding: var(--theme-actionmenu-padding-4, 6px);
    background: var(--surface);
    color: var(--text);
    border: var(--theme-actionmenu-border-5, 1px) solid var(--line-strong);
    border-radius: var(--theme-actionmenu-border-radius-6, 10px);
    box-shadow: var(--shadow);
    z-index: 100;
  }
  .action-menu :global(button) {
    display: flex;
    justify-content: flex-start;
    width: 100%;
    border: 0;
    border-radius: var(--theme-actionmenu-border-radius-7, 6px);
    background: transparent;
    padding: var(--theme-actionmenu-padding-8, 9px) var(--theme-actionmenu-padding-9, 12px);
    height: auto;
    white-space: normal;
    text-align: left;
  }
  .action-menu :global(.ui-button:hover) {
    background: var(--surface-soft);
  }
  .action-menu :global(hr) {
    border: 0;
    border-top: var(--theme-actionmenu-border-top-10, 1px) solid var(--line);
    margin: var(--theme-actionmenu-margin-11, 6px) 0;
  }
</style>
