<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import type { Snippet } from "svelte";
  let {
    children,
    variant = "secondary",
    icon = false,
    class: className = "",
    type = "button",
    ...attributes
  }: HTMLButtonAttributes & {
    children?: Snippet;
    variant?: "primary" | "secondary" | "ghost" | "danger";
    icon?: boolean;
  } = $props();
</script>

<button
  {...attributes}
  {type}
  class={`ui-button ${variant} ${icon ? "icon" : ""} ${className}`}
  >{@render children?.()}</button
>
