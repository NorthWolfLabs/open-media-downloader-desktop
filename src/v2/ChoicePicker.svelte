<script lang="ts">
  import { tick } from "svelte";
  import { ChevronDown, Check, Search } from "lucide-svelte";
  import { labelStyle } from "./labelAppearance";
  let {
    label,
    options,
    value = $bindable<string[]>([]),
    empty = "Any",
    multiple = true,
    compact = false,
    onchange,
    disabled = false,
    preferred = [],
  }: {
    label: string;
    options: {
      id: string;
      label: string;
      appearance?: { color: string } | null;
    }[];
    value?: string[];
    empty?: string;
    multiple?: boolean;
    compact?: boolean;
    onchange?: (value: string[]) => void;
    disabled?: boolean;
    preferred?: string[];
  } = $props();
  const uid = $props.id();
  let popup: HTMLDivElement,
    trigger: HTMLButtonElement,
    query = $state(""),
    opened = $state(false),
    position = $state("");
  const selected = $derived(options.filter((o) => value.includes(o.id)));
  const summary = $derived(
    selected.length === 1
      ? selected[0].label
      : selected.length
        ? `${selected.length} selected`
        : empty,
  );
  const visible = $derived(
    [...options]
      .sort((a, b) => {
        const rank = (id: string) =>
          preferred.includes(id) ? preferred.indexOf(id) : preferred.length;
        return rank(a.id) - rank(b.id);
      })
      .filter((o) =>
        o.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ),
  );
  function close(restore = true) {
    popup.hidePopover();
    opened = false;
    if (restore) trigger.focus({ preventScroll: true });
  }
  $effect(() => {
    if (!opened) return;
    const key = (event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        const buttons = [
          ...popup.querySelectorAll<HTMLButtonElement>(".choice-option"),
        ];
        const current = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if ((event.key === "Home" || event.key === "End") && current < 0)
          return;
        if (buttons.length) {
          event.preventDefault();
          event.stopPropagation();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : event.key === "ArrowDown"
                  ? (current + 1) % buttons.length
                  : (current - 1 + buttons.length) % buttons.length;
          buttons[next].focus();
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      }
    };
    const resize = () => close();
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", resize);
    };
  });
  async function open() {
    if (opened) {
      close();
      return;
    }
    const scroll = trigger.closest(".v2-main,.v2-dialog-content");
    const top = scroll?.scrollTop;
    query = "";
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(
      Math.max(Math.min(rect.width, 400), 280),
      window.innerWidth - 24,
    );
    const left = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - width - 12),
    );
    const below = window.innerHeight - rect.bottom - 16;
    position = `left:${left}px;width:${width}px;${below >= 220 ? `top:${rect.bottom + 6}px;max-height:${Math.min(380, below)}px` : `bottom:${window.innerHeight - rect.top + 6}px;max-height:${Math.min(380, rect.top - 16)}px`}`;
    opened = true;
    await tick();
    if (!opened) return;
    popup.showPopover();
    await tick();
    if (!opened) return;
    popup
      .querySelector<HTMLElement>(
        options.length > 8 ? "input" : ".choice-option",
      )
      ?.focus({ preventScroll: true });
    if (scroll && top !== undefined) scroll.scrollTop = top;
  }
  function choose(id: string) {
    value = multiple
      ? value.includes(id)
        ? value.filter((v) => v !== id)
        : [...value, id]
      : [id];
    onchange?.(value);
    if (!multiple) {
      close();
    }
  }
  function only(id: string) {
    value = [id];
    onchange?.(value);
  }
</script>

<div class="choice-picker" class:compact>
  {#if !compact}<span class="choice-label" id={`${uid}-label`}>{label}</span
    >{/if}
  <button
    type="button"
    class="choice-trigger ui-button"
    bind:this={trigger}
    aria-label={`${label}: ${summary}`}
    aria-expanded={opened}
    aria-controls={uid}
    {disabled}
    onclick={open}
  >
    <span
      >{#if compact}<span class="scope-label">{label}</span>
      {/if}{summary}</span
    ><ChevronDown size={14} />
  </button>
</div>
<div
  id={uid}
  popover="auto"
  class="choice-popover"
  hidden={!opened}
  bind:this={popup}
  style={position}
  ontoggle={(e) => {
    opened = e.newState === "open";
  }}
>
  {#if options.length > 8}<div class="choice-search">
      <Search size={15} /><input
        autocomplete="off"
        aria-label={`Find ${label.toLowerCase()}`}
        placeholder={`Find ${label.toLowerCase()}…`}
        type="search"
        bind:value={query}
      />
    </div>
  {/if}
  <div class="choice-list" role="group" aria-label={label}>
    {#each visible as option}<div class="choice-option-row">
        <button
          type="button"
          class="choice-option"
          aria-pressed={value.includes(option.id)}
          onclick={() => choose(option.id)}
          oncontextmenu={(event) => {
            event.preventDefault();
            if (multiple) only(option.id);
          }}
          ><span
            >{#if option.appearance}<i
                class="option-color"
                style={labelStyle(option.appearance)}
                aria-hidden="true"
              ></i>{/if}{option.label}</span
          ><Check
            size={15}
            style={`visibility:${value.includes(option.id) ? "visible" : "hidden"}`}
          /></button
        >
        {#if multiple && options.length > 1}<button
            type="button"
            class="choice-only"
            aria-label={`Select only ${option.label}`}
            onclick={() => only(option.id)}>Only</button
          >{/if}
      </div>{/each}
    {#if !visible.length}<p class="choice-empty">No matches</p>{/if}
  </div>
  {#if multiple}<div class="choice-footer">
      <span>{value.length ? `${value.length} selected` : empty}</span><button
        type="button"
        disabled={!value.length}
        onclick={() => {
          value = [];
          onchange?.(value);
        }}>Clear</button
      ><button
        type="button"
        onclick={() => {
          close();
        }}>Done</button
      >
    </div>{/if}
</div>

<style>
  .choice-picker {
    min-width: 0;
    display: grid;
    grid-template-columns:minmax(0,1fr);
    gap: var(--theme-choicepicker-gap-1, 6px);
  }
  .choice-label {
    font-size: var(--theme-choicepicker-font-size-2, 12px);
    color: var(--muted);
  }
  .choice-picker .choice-trigger {
    width: 100%;
    justify-content: space-between;
    min-height: var(--control-height);
    text-align: left;
    font-weight: var(--theme-choicepicker-font-weight-3, 400);
    gap: var(--theme-choicepicker-gap-4, 12px);
  }
  .choice-trigger > span {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .choice-trigger :global(svg) {
    flex-shrink: 0;
  }
  .scope-label {
    color: var(--muted);
    margin-right: var(--theme-choicepicker-margin-right-5, 5px);
  }
  .compact {
    display: inline-grid;
    min-width: 0;
    max-width: var(--theme-choicepicker-max-width-6, 260px);
  }
  .compact .choice-trigger {
    background: transparent;
    border-color: var(--line);
  }
  .choice-popover[hidden] {
    display: none !important;
  }
  /* WebKitGTK 2.52 sizes a column flex container with the popover UA height
     (fit-content) from its items' 0% flex bases, collapsing the panel to its
     border and the list padding (G1). An auto height and an auto list basis keep
     the content-sized panel, capped by the inline max-height, in every engine. */
  .choice-popover {
    position: fixed;
    inset: auto;
    height: auto;
    margin: 0;
    padding: 0;
    border: var(--theme-choicepicker-border-7, 1px) solid var(--line-strong);
    border-radius: var(--theme-choicepicker-border-radius-8, 12px);
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: 0 var(--theme-choicepicker-box-shadow-9, 12px) var(--theme-choicepicker-box-shadow-10, 40px) var(--theme-choicepicker-box-shadow-11, #0005);
    overflow: hidden;
    font-size: var(--theme-choicepicker-font-size-12, 13px);
  }
  .choice-popover:popover-open {
    display: flex;
    flex-direction: column;
  }
  .choice-search {
    display: flex;
    align-items: center;
    gap: var(--theme-choicepicker-gap-13, 8px);
    margin: var(--theme-choicepicker-margin-14, 6px);
    flex-shrink: 0;
    border: var(--theme-choicepicker-border-7, 1px) solid transparent;
    padding: 0 var(--theme-choicepicker-padding-15, 10px);
    background: var(--surface-soft);
    border-radius: var(--theme-choicepicker-border-radius-16, 7px);
    color: var(--muted);
  }
  .choice-search:focus-within {
    border-color: var(--accent);
  }
  .choice-search input {
    background: transparent;
    border: 0;
    color: var(--text);
    padding: var(--theme-choicepicker-padding-17, 6px) 0;
    min-height: var(--control-height);
    font-size: var(--theme-choicepicker-font-size-12, 13px);
    outline: none !important;
    box-shadow: none !important;
    min-width: 0;
    width: 100%;
    font: inherit;
    outline-offset: var(--theme-choicepicker-outline-offset-18, 2px);
  }
  .choice-list {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: var(--theme-choicepicker-padding-17, 6px);
    flex: 1 1 auto;
  }
  .choice-list .choice-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: var(--control-height);
    padding: var(--theme-choicepicker-padding-19, 7px) var(--theme-choicepicker-padding-15, 10px);
    border: 0;
    border-radius: var(--theme-choicepicker-border-radius-20, 6px);
    background: transparent;
    color: var(--text);
    text-align: left;
    font: inherit;
    cursor: pointer;
    gap: var(--theme-choicepicker-gap-21, 14px);
  }
  .choice-option-row {
    display: flex;
    align-items: center;
    border-radius: var(--theme-choicepicker-border-radius-20, 6px);
  }
  .choice-option-row:hover,
  .choice-option-row:focus-within {
    background: var(--surface-soft);
  }
  .choice-option-row .choice-option {
    flex: 1;
    min-width: 0;
  }
  .choice-option > span {
    display: flex;
    align-items: center;
    gap: var(--theme-choicepicker-gap-22, 7px);
  }
  .option-color {
    width: var(--theme-choicepicker-width-23, 7px);
    height: var(--theme-choicepicker-height-24, 7px);
    border-radius: 50%;
    background: var(--label-text);
    flex-shrink: 0;
  }
  .choice-only {
    opacity: 0;
    border: 0;
    background: transparent;
    font-size: var(--type-caption);
    color: var(--muted);
    min-height: var(--control-height);
    padding: var(--theme-choicepicker-padding-25, 4px) var(--theme-choicepicker-padding-26, 8px);
  }
  .choice-option-row:hover .choice-only,
  .choice-option-row:focus-within .choice-only {
    opacity: var(--theme-choicepicker-opacity-27, 1);
  }
  .choice-only:hover {
    color: var(--accent-text);
  }
  .choice-option:hover,
  .choice-option:focus-visible {
    background: var(--surface-soft);
  }
  .choice-option[aria-pressed="true"] {
    color: var(--accent-text);
  }
  .choice-footer {
    display: flex;
    align-items: center;
    gap: var(--theme-choicepicker-gap-13, 8px);
    padding: var(--theme-choicepicker-padding-26, 8px) var(--theme-choicepicker-padding-15, 10px);
    border-top: var(--theme-choicepicker-border-top-28, 1px) solid var(--line);
    font-size: var(--theme-choicepicker-font-size-2, 12px);
    color: var(--muted);
  }
  .choice-footer span {
    flex: 1;
  }
  .choice-footer button {
    border: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    padding: var(--theme-choicepicker-padding-17, 6px);
    cursor: pointer;
  }
  .choice-footer button:disabled {
    opacity: var(--theme-choicepicker-opacity-29, 0.4);
  }
  .choice-empty {
    padding: var(--theme-choicepicker-padding-30, 24px) var(--theme-choicepicker-padding-31, 16px);
    text-align: center;
    color: var(--muted);
  }
</style>
