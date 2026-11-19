<script lang="ts">
  // A link to one of OMD's own web pages, opened in the user's browser.
  import { ExternalLink } from "lucide-svelte";
  import { openProjectLink } from "../links";
  let {
    href,
    label,
    onerror = (message: string) => console.warn(message),
  }: {
    href: string;
    label: string;
    onerror?: (message: string) => void;
  } = $props();
</script>

<a
  class="project-link"
  {href}
  rel="noopener noreferrer"
  onclick={(event) => {
    event.preventDefault();
    openProjectLink(href).catch((e) =>
      onerror(`Couldn’t open the page. ${e instanceof Error ? e.message : String(e)}`),
    );
  }}>{label}<ExternalLink size={13} aria-hidden="true" /><span class="sr-only"> (opens in your browser)</span></a
>
