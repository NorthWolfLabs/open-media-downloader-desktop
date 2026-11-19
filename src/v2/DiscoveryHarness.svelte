<script lang="ts">
  import Discovery from "./Discovery.svelte";
  import type { ComponentProps } from "svelte";
  import { untrack } from "svelte";
  let props: ComponentProps<typeof Discovery> = $props();
  let state = $state(untrack(() => props.state));
</script>

<button onclick={() => (state.editing = true)}>Edit search fixture</button>
<Discovery {...props} {state} />
