<script lang="ts">
  let {
    label,
    class: className,
    children,
  }: {
    label: string;
    class: string;
    children: import("svelte").Snippet;
  } = $props();
</script>

<!-- Safari needs an explicit tab stop for keyboard scrolling. The named region
     gives assistive technology context without pretending this is a button.
     https://developer.mozilla.org/en-US/docs/Web/CSS/overflow#accessibility -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard access to scrolling content) -->
<div class={className} tabindex="0" role="region" aria-label={label}>
  {@render children()}
</div>
