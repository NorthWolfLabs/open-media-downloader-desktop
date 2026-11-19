<script lang="ts">
  import { LayoutGrid, List, Rows3, GalleryHorizontal } from "lucide-svelte";
  export type ResultLayout = "grid" | "list" | "compact" | "gallery";
  let { value = $bindable<ResultLayout>("grid"),storageKey="omd.search-layout",onchange,inactive=false }: { value?: ResultLayout;storageKey?:string;onchange?:()=>void;inactive?:boolean } =
    $props();
  const choices = [
    { id: "compact", label: "Compact view", icon: Rows3 },
    { id: "list", label: "List view", icon: List },
    { id: "grid", label: "Grid view", icon: LayoutGrid },
    { id: "gallery", label: "Gallery view", icon: GalleryHorizontal },
  ] as const;
</script>

<div class="layouts" role="group" aria-label="Result layout">
  {#each choices as choice}<button
      type="button"
      aria-label={choice.label}
      title={choice.label}
      aria-pressed={!inactive && value === choice.id}
      onclick={() => {
        value = choice.id;
        localStorage.setItem(storageKey, value);
        onchange?.();
      }}><choice.icon size={16} /></button
    >{/each}
</div>

<style>
  .layouts {
    display: flex;
    gap: 0;
    height: var(--page-header-height, var(--theme-layoutpicker-height-1, 36px));
    padding: 0;
    background: var(--surface-soft);
    border-radius: var(--theme-layoutpicker-border-radius-2, 9px);
    flex-shrink: 0;
  }
  .layouts button {
    border: 0;
    background: transparent;
    color: var(--muted);
    display: grid;
    place-items: center;
    width: var(--page-header-height, var(--theme-layoutpicker-width-3, 36px));
    height: 100%;
    min-height: 0;
    padding: 0;
    border-radius: var(--theme-layoutpicker-border-radius-4, 6px);
  }
  .layouts button[aria-pressed="true"] {
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: 0 var(--theme-layoutpicker-box-shadow-5, 1px) var(--theme-layoutpicker-box-shadow-6, 3px) var(--theme-layoutpicker-box-shadow-7, #0002);
  }
</style>
