<script lang="ts">
  import CollectionInfo from "./CollectionInfo.svelte";
  import type { ComponentProps } from "svelte";
  let props: Omit<ComponentProps<typeof CollectionInfo>, "children"> = $props();
</script>

<CollectionInfo {...props}
  ><div data-testid="releases">Release table fixture</div></CollectionInfo
>
