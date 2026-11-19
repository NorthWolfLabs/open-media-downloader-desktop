<script lang="ts">
  import { namingExample } from "./copy";
  import Button from "./ui/Button.svelte";
  import { actionFocus } from "./actionFocus";
  import { untrack } from "svelte";
  import Dialog from "./Dialog.svelte";
  import type {
    EngineClient,
    SourceRef,
    MetadataOverride,
    NamingTemplates,
  } from "./client";
  type Kind = "collection" | "release";
  type Field = "title" | "description" | "chapter" | "volume";
  let { client, visible }: { client: EngineClient; visible: boolean } =
    $props();
  let naming: NamingTemplates = $state({
      collection: "{title}",
      release: "{title}",
    }),
    namingError = $state(""),
    namingSaved = $state(false),
    busy = $state(false);
  let namingExpanded = $state(false);
  $effect(() => {
    if (namingError) namingExpanded = true;
  });
  let current: {
      kind: Kind;
      reference: SourceRef;
      source: MetadataOverride;
    } | null = $state(null),
    draft: MetadataOverride = $state({}),
    error = $state(""),
    saved = $state(false);
  const formId = `metadata-${crypto.randomUUID()}`;
  const fields: { key: Field; label: string }[] = [
    { key: "title", label: "Title" },
    { key: "description", label: "Description" },
    { key: "chapter", label: "Chapter identifier" },
    { key: "volume", label: "Volume identifier" },
  ];
  $effect(() => {
    void client;
    untrack(() => {
      void client
        .request<NamingTemplates>("/v2/naming")
        .then((value) => (naming = value))
        .catch(
          (e) =>
            (namingError =
              e instanceof Error
                ? e.message
                : "Could not load naming templates."),
        );
    });
  });
  export async function edit(
    kind: Kind,
    reference: SourceRef,
    source: MetadataOverride,
  ) {
    busy = true;
    error = "";
    saved = false;
    try {
      const value = await client.request<MetadataOverride>(
        `/v2/metadata/${kind}/${encodeURIComponent(reference.provider)}?${new URLSearchParams({ source_id: reference.id })}`,
      );
      draft = value;
      current = { kind, reference, source };
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not load saved metadata.";
    } finally {
      busy = false;
    }
  }
  async function save() {
    if (!current) return;
    busy = true;
    error = "";
    try {
      draft = await client.request<MetadataOverride>(
        `/v2/metadata/${current.kind}`,
        {
          method: "PUT",
          body: { reference: current.reference, overrides: draft },
        },
      );
      saved = true;
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not save metadata.";
    } finally {
      busy = false;
    }
  }
  async function saveNaming() {
    const restoreFocus = actionFocus();
    busy = true;
    namingSaved = false;
    namingError = "";
    try {
      naming = await client.request<NamingTemplates>("/v2/naming", {
        method: "PUT",
        body: naming,
      });
      namingSaved = true;
    } catch (e) {
      namingError =
        e instanceof Error ? e.message : "Could not save naming templates.";
    } finally {
      busy = false;
      await restoreFocus();
    }
  }
</script>

{#if error && !current}<p class="v2-alert" role="alert">{error}</p>{/if}
{#if visible}<section class="form-section naming-settings" aria-labelledby="naming-heading">
    <h2 id="naming-heading">Folder naming</h2>
    <details class="form-box naming-disclosure" bind:open={namingExpanded}>
      <summary>
        <span class="form-row-label"
          ><span>Folder names for future downloads</span><small
            >For example: {namingExample(naming)}. Existing files keep their names.</small
          ></span
        >
      </summary>
      {#if namingError}<p class="form-note" role="alert">{namingError}</p>{/if}
      <form
        onsubmit={(event) => {
          event.preventDefault();
          void saveNaming();
        }}
      >
        <div class="form-row">
          <label class="form-row-label" for="naming-collection">Collection folder template</label>
          <div class="form-row-control">
            <input
              id="naming-collection"
              bind:value={naming.collection}
              required
              maxlength="500"
              oninput={() => (namingSaved = false)}
            />
          </div>
        </div>
        <div class="form-row">
          <label class="form-row-label" for="naming-release">Release folder template</label>
          <div class="form-row-control">
            <input
              id="naming-release"
              bind:value={naming.release}
              required
              maxlength="500"
              oninput={() => (namingSaved = false)}
            />
          </div>
        </div>
        <div class="form-note naming-help">
          <p>Both folders: <code>{"{title}"}</code>, <code>{"{provider}"}</code>, <code>{"{source_id}"}</code>, <code>{"{kind}"}</code>.</p>
          <p>Release folders also support <code>{"{chapter}"}</code>, <code>{"{volume}"}</code>, <code>{"{language}"}</code>, and <code>{"{group}"}</code>.</p>
          <p>Use one folder name per template. OMD adds identifiers to keep names unique.</p>
        </div>
        <div class="form-actions">
          {#if namingSaved}<p role="status">Naming templates saved.</p>{/if}
          <Button disabled={busy} onclick={()=>{naming={collection:"{title}",release:"{title}"};namingSaved=false;}}>Reset to defaults</Button>
          <Button type="submit" variant="primary" disabled={busy}>Save naming</Button>
        </div>
      </form>
    </details>
  </section>{/if}
{#if current}<Dialog
    title={current.kind === "collection"
      ? "Collection metadata"
      : "Release metadata"}
    {error}
    onclose={() => (current = null)}
  >
    <p>{current.source.title}</p>
    <p class="metadata-help">
      Edit the information saved with future downloads.
    </p>
    <form
      id={formId}
      onsubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {#each fields.filter((field) => current!.kind === "release" || !["chapter", "volume"].includes(field.key)) as field}
        <div class="metadata-field">
          <div class="metadata-field-heading">
            <label for={`${formId}-${field.key}`}>{field.label}</label>
            {#if draft[field.key] != null}<Button
                type="button"
                class="metadata-reset"
                onclick={() => {
                  draft[field.key] = null;
                  saved = false;
                }}>Use source value</Button
              >{/if}
          </div>
          {#if field.key === "description"}<textarea
              id={`${formId}-${field.key}`}
              aria-label={`Custom ${field.label.toLowerCase()}`}
              value={draft[field.key] ?? current.source[field.key] ?? ""}
              placeholder="Add a description"
              rows="4"
              maxlength="32000"
              oninput={(event) => {
                const value = event.currentTarget.value;
                draft[field.key] =
                  value === (current!.source[field.key] ?? "") ? null : value;
                saved = false;
              }}
            ></textarea>
          {:else}<input
              id={`${formId}-${field.key}`}
              aria-label={`Custom ${field.label.toLowerCase()}`}
              value={draft[field.key] ?? current.source[field.key] ?? ""}
              placeholder={field.label}
              maxlength={field.key === "title" ? 1000 : 100}
              oninput={(event) => {
                const value = event.currentTarget.value;
                draft[field.key] =
                  value === (current!.source[field.key] ?? "") ? null : value;
                saved = false;
              }}
            />{/if}
        </div>
      {/each}
      {#if saved}<p role="status">Metadata saved for future downloads.</p>{/if}
    </form>
    {#snippet footer()}<Button
        type="submit"
        disabled={busy}
        onclick={() => {
          draft = {};
          saved = false;
        }}>Reset to source values</Button
      ><Button type="submit" variant="primary" form={formId} disabled={busy}
        >Save metadata</Button
      >{/snippet}
  </Dialog>{/if}

<style>
  .naming-disclosure > summary {
    display: block;
    position: relative;
    list-style: none;
    cursor: pointer;
    padding: var(--space-3) calc(var(--space-4) + 20px) var(--space-3) var(--space-4);
    margin: 0;
  }
  .naming-disclosure > summary::-webkit-details-marker {
    display: none;
  }
  .naming-disclosure > summary::after {
    content: "›";
    position: absolute;
    right: var(--space-4);
    top: calc(50% - 12px);
    line-height: 24px;
    color: var(--muted);
    font-size: 18px;
    transition: transform var(--motion-duration);
  }
  .naming-disclosure[open] > summary::after {
    transform: rotate(90deg);
  }
  .naming-disclosure form {
    display: grid;
    border-top: 1px solid var(--line);
  }
  .naming-disclosure form .form-row-control input {
    width: min(280px, 100%);
  }
  .naming-help {
    display: grid;
    gap: var(--theme-presentationsettings-gap-3, 4px);
  }
  .naming-help p {
    margin: 0;
  }

  .metadata-help {
    font-size: var(--theme-presentationsettings-font-size-6, 13px);
    margin-bottom: 0;
  }
  .metadata-field input,
  .metadata-field textarea {
    width: 100%;
    box-sizing: border-box;
  }
  .metadata-field input:focus-visible,
  .metadata-field textarea:focus-visible {
    outline: var(--theme-presentationsettings-outline-7, 2px) solid var(--accent);
    outline-offset: var(--theme-presentationsettings-outline-offset-8, -2px);
  }
  .metadata-field {
    margin: 0;
  }
  .metadata-field-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--control-height);
    gap: var(--theme-presentationsettings-gap-3, 12px);
    margin-bottom: var(--theme-presentationsettings-margin-bottom-9, 4px);
  }
  .metadata-field-heading label {
    margin: 0;
    font-size: var(--theme-presentationsettings-font-size-6, 13px);
    color: var(--text);
  }
</style>
