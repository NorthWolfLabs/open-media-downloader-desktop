<script lang="ts">
  import { formatTime } from "./dates";
  import { invoke } from "@tauri-apps/api/core";
  import type { Snippet } from "svelte";
  import type { Artifact, Job } from "./client";
  import Button from "./ui/Button.svelte";
  import InfiniteMore from "./InfiniteMore.svelte";
  import {
    ExternalLink,
    Folder,
    Copy,
    FileText,
    FileArchive,
    ChevronDown,
  } from "lucide-svelte";
  import { fileStatusLabels } from "./copy";
  import { fileSize } from "./history";
  import { displayPath } from "./paths";
  let {
    job,
    source,
    sourceRevision,
    files,
    native = false,
    busy = false,
    cursor,
    path,
    onopen,
    oncopy,
    onmore,
    management,
    oncollection,
  }: {
    job: Job;
    source: string;
    sourceRevision?: string | null;
    files: Artifact[];
    native?: boolean;
    busy?: boolean;
    cursor: string | null;
    path: (file: Artifact) => string;
    onopen: (file: Artifact, reveal: boolean) => void;
    oncopy: (file: Artifact) => void;
    onmore: () => Promise<void>;
    management: Snippet;
    oncollection?: (c: Job["plan"]["collection"]) => void;
  } = $props();
  let sourceError = $state("");
  async function openSource(event: MouseEvent) {
    if (!native) return;
    event.preventDefault();
    try {
      await invoke("v2_open_source", { url: sourceUrl });
      sourceError = "";
    } catch (e) {
      sourceError = String(e);
    }
  }
  const supporting = (file: Artifact) =>
    ["ComicInfo.xml", "provenance.json"].includes(
      file.relative_path.split("/").pop() ?? "",
    );
  const downloads = $derived(files.filter((f) => !supporting(f)));
  const metadata = $derived(files.filter(supporting));
  const sourceUrl = $derived(
    /^https?:\/\//.test(job.plan.release.canonical_url)
      ? job.plan.release.canonical_url
      : undefined,
  );
</script>

{#if sourceError}<p role="alert">{sourceError}</p>{/if}
<div class="saved-context">
  <h3>{job.title}</h3>
  <p>
    {#if oncollection}<button
        class="collection-link"
        onclick={() => oncollection?.(job.plan.collection)}
        >{job.plan.collection.title}</button
      >{:else}{job.plan.collection.title}{/if}
  </p>
</div>
<dl class="download-facts">
  <div>
    <dt>Downloaded</dt>
    <dd>{formatTime(job.updated_at)}</dd>
  </div>
  <div>
    <dt>Source</dt>
    <dd>
      {#if sourceUrl}<a
          onclick={openSource}
          href={sourceUrl}
          target="_blank"
          rel="noreferrer">{source}<ExternalLink size={13} /></a
        >{:else}{source}{/if}
    </dd>
  </div>
  {#if sourceRevision && job.plan.release.revision}<div>
      <dt>Release version</dt>
      <dd>
        {sourceRevision === job.plan.release.revision
          ? "Matches downloaded version"
          : "Updated since this download"}
      </dd>
    </div>{/if}
</dl>
<section class="saved-section" aria-label="Downloaded files">
  <h3>Downloaded files</h3>
  {#each downloads as file}<article class="saved-file">
      <div class="file-heading">
        <FileArchive size={20} />
        <div>
          <strong>{file.relative_path.split("/").pop()}</strong><small
            >{fileSize(file.size)} · {fileStatusLabels[file.status] ??
              file.status}</small
          >
        </div>
      </div>
      <p class="file-path" title={displayPath(path(file))}>{displayPath(path(file))}</p>
      <div class="ui-actions">
        {#if native}<Button
            disabled={busy || !["present", "modified"].includes(file.status)}
            onclick={() => onopen(file, false)}><ExternalLink />Open</Button
          ><Button disabled={busy} onclick={() => onopen(file, true)}
            ><Folder />Reveal folder</Button
          >{/if}<Button variant="ghost" onclick={() => oncopy(file)}
          ><Copy />Copy path</Button
        >
      </div>
    </article>{/each}
</section>
{#if metadata.length}<details class="metadata-files">
    <summary
      ><FileText size={16} />Metadata files
      <span>{metadata.length}</span><ChevronDown size={14} /></summary
    >
    <div>
      {#each metadata as file}<article>
          <div>
            <strong>{file.relative_path.split("/").pop()}</strong><small
              >{fileSize(file.size)} · {fileStatusLabels[file.status] ??
                file.status}</small
            >
          </div>
          <Button
            variant="ghost"
            icon
            aria-label={`Copy path for ${file.relative_path.split("/").pop()}`}
            onclick={() => oncopy(file)}><Copy /></Button
          >{#if native}<Button
              variant="ghost"
              icon
              aria-label={`Open ${file.relative_path.split("/").pop()}`}
              disabled={busy || !["present", "modified"].includes(file.status)}
              onclick={() => onopen(file, false)}><ExternalLink /></Button
            >{/if}
        </article>{/each}
    </div>
  </details>{/if}
<InfiniteMore {cursor} disabled={busy} load={onmore} label="files" />
<section class="saved-section">
  <h3>Manage</h3>
  <div class="saved-management">{@render management()}</div>
</section>

<style>
  .collection-link {
    border: 0;
    background: none;
    color: var(--accent-text);
    padding: 0;
    text-align: left;
    font: inherit;
  }
  .saved-context {
    display: grid;
    gap: var(--theme-savedfiles-gap-1, 4px);
  }
  .saved-context p {
    font-size: var(--theme-savedfiles-font-size-2, 13px);
  }
  .download-facts {
    display: grid;
    
    grid-template-columns: 1fr 1fr;
    gap: var(--theme-savedfiles-gap-3, 12px) var(--theme-savedfiles-gap-4, 24px);
    margin: 0;
    padding: var(--theme-savedfiles-padding-5, 16px);
    background: var(--surface-soft);
    border-radius: var(--theme-savedfiles-border-radius-6, 8px);
    font-size: var(--theme-savedfiles-font-size-2, 13px);
  }
  dt {
    color: var(--muted);
    font-size: var(--theme-savedfiles-font-size-7, 12px);
    margin-bottom: var(--theme-savedfiles-margin-bottom-8, 4px);
  }
  dd {
    margin: 0;
  }
  dd a {
    display: inline-flex;
    gap: var(--theme-savedfiles-gap-9, 6px);
    align-items: center;
  }
  .saved-section {
    display: grid;
    gap: var(--theme-savedfiles-gap-3, 12px);
  }
  .saved-file {
    display: grid;
    gap: var(--theme-savedfiles-gap-10, 10px);
    padding: var(--theme-savedfiles-padding-5, 16px);
    border: var(--theme-savedfiles-border-11, 1px) solid var(--line);
    border-radius: var(--theme-savedfiles-border-radius-6, 8px);
  }
  .file-heading {
    display: flex;
    gap: var(--theme-savedfiles-gap-3, 12px);
    align-items: center;
  }
  .file-heading > div {
    display: grid;
    gap: var(--theme-savedfiles-gap-1, 4px);
  }
  .file-heading > :global(svg) {
    color: var(--muted);
  }
  .file-path {
    font-size: var(--theme-savedfiles-font-size-7, 12px);
    overflow-wrap: anywhere;
    line-height: var(--theme-savedfiles-line-height-12, 1.5);
  }
  .metadata-files {
    background: var(--surface-raised);
    border-radius: var(--theme-savedfiles-border-radius-6, 8px);
  }
  .metadata-files > summary {
    display: flex;
    gap: var(--theme-savedfiles-gap-13, 8px);
    align-items: center;
    padding: var(--theme-savedfiles-padding-14, 12px) var(--theme-savedfiles-padding-5, 16px);
    cursor: pointer;
    color: var(--muted);
    font-size: var(--theme-savedfiles-font-size-2, 13px);
  }
  .metadata-files > summary span {
    margin-left: auto;
  }
  .metadata-files[open] > summary :global(svg:last-child) {
    
    transform: rotate(180deg);
  }
  .metadata-files > div {
    padding: 0 var(--theme-savedfiles-padding-5, 16px) var(--theme-savedfiles-padding-14, 12px);
  }
  .metadata-files article {
    display: flex;
    gap: var(--theme-savedfiles-gap-13, 8px);
    align-items: center;
    padding: var(--theme-savedfiles-padding-15, 8px) 0;
  }
  .metadata-files article > div {
    flex: 1;
    display: grid;
    gap: var(--theme-savedfiles-gap-1, 4px);
  }
  .metadata-files strong {
    font-size: var(--theme-savedfiles-font-size-2, 13px);
  }
  .saved-management {
    display: grid;
    gap: var(--theme-savedfiles-gap-13, 8px);
  }
</style>
