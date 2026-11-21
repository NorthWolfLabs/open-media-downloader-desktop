<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import Button from "./ui/Button.svelte";
  import OutputOptions from "./OutputOptions.svelte";
  import { formatRecipe } from "./downloadReview";
  import type { FormatChoice } from "./jobIssue";
  let {
    choice = $bindable(),
    busy = false,
    error = "",
    onclose,
    onreview,
  }: {
    choice: FormatChoice;
    busy?: boolean;
    error?: string;
    onclose: () => void;
    onreview: () => Promise<void>;
  } = $props();
</script>

<Dialog title="Choose another format" {error} {onclose}>
  <h3>{choice.title}</h3>
  <p>
    Trying the {formatRecipe(choice.previous)} download again would give the same
    result. Choose a format, then review the download before adding it.
  </p>
  <div class="ui-form-grid">
    <OutputOptions
      media={choice.media}
      audio={choice.audio}
      bind:recipe={choice.recipe}
      bind:maxHeight={choice.maxHeight}
      bind:subtitles={choice.subtitles}
      bind:automaticSubtitles={choice.automaticSubtitles}
    />
  </div>
  {#snippet footer()}<Button variant="primary" disabled={busy} onclick={onreview}
      >Review download</Button
    >{/snippet}
</Dialog>
