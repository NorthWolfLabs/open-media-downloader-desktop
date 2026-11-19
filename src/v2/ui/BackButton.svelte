<script lang="ts">
  import { truncatedTitle } from "../truncatedTitle";
  import Button from "./Button.svelte";
  import { ArrowLeft } from "lucide-svelte";
  let {
    onclick,
    children,
    label,
  }: {
    onclick: () => void;
    children?: import("svelte").Snippet;
    label?: string;
  } = $props();
</script>

<Button variant="ghost" class="back-button" {onclick}
  ><ArrowLeft />{#if label}<span class="back-label" use:truncatedTitle={label}
      >{label}</span
    >{:else}{@render children?.()}{/if}</Button
>

<style>
  :global(.back-button) {
    min-width: 0;
    max-width: 100%;
  }
  .back-label {
    min-width: 0;
    max-width: min(60vw, var(--theme-backbutton-max-width-1, 640px));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
