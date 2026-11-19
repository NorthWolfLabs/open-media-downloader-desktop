<script lang="ts">
  import type { Snippet } from "svelte";
  let {
    label,
    hint = "",
    children,
  }: { label: string; hint?: string; children: Snippet } = $props();
</script>

<label class="ui-field"
  ><span>{label}</span>{@render children()}{#if hint}<small>{hint}</small
    >{/if}</label
>
