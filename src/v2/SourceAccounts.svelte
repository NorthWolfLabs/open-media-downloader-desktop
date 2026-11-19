<script lang="ts">
  import PendingStatus from "./ui/PendingStatus.svelte";
  import SearchBar from "./ui/SearchBar.svelte";
  import RecordList from "./ui/RecordList.svelte";
  import RecordRow from "./ui/RecordRow.svelte";
  import { UserRound } from "lucide-svelte";
  import EmptyState from "./ui/EmptyState.svelte";
  import Button from "./ui/Button.svelte";
  import SelectPicker from "./SelectPicker.svelte";
  import InfiniteMore from "./InfiniteMore.svelte";
  import { onMount } from "svelte";
  import {
    EngineError,
    type EngineClient,
    type ProviderManifest,
    type components,
  } from "./client";
  import Dialog from "./Dialog.svelte";
  import SignInPage from "./SignInPage.svelte";
  import { importCookies } from "./credentialImport";
  import CookieImportGuide from "./CookieImportGuide.svelte";
  import CookieFilePicker from "./CookieFilePicker.svelte";
  import { credentialStoreName } from "./platform";
  type Account = components["schemas"]["SourceAccount"];
  let {
    client,
    source,
    lease,
    onclose,
    onchange,
  }: {
    client: EngineClient;
    source: ProviderManifest;
    lease: string;
    onclose: () => void;
    onchange: (connectedProfile?: string) => void;
  } = $props();
  let signInReady = $state(false);
  let closingSignIn = $state<string | null>(null);
  let closeRequest: Promise<void> | null = null;
  let signing: components["schemas"]["SignInSession"] | null = $state(null),
    signInPage: { save: () => Promise<void> } | undefined = $state();
  let accounts: Account[] = $state([]),
    cursor: string | null = $state(null),
    query = $state("");
  let loaded = $state(false);
  let busy = $state(true),
    error = $state(""),
    notice = $state("");
  let editing: string | null = $state(null),
    label = $state(""),
    mode = $state("header");
  let origin = $state(""),
    header = $state("authorization"),
    secret = $state("");
  // Whether Advanced is expanded. Set when the form starts (open when no origin
  // could be prefilled); afterwards only the person toggling it changes it, so
  // typing into the origin field never collapses it.
  let advancedOpen = $state(false);
  let cookieFile: File | null = $state(null),
    expires = $state("");
  let removing: Account | null = $state(null);
  const preferredMode = $derived(source.account_mode ?? (source.sign_in ? "browser" : "header"));
  let exporting = $state(false);
  let createdFile = $state(false);
  let generation = 0;
  const formId = `account-${crypto.randomUUID()}`;
  const hosts = $derived([
    ...new Set(
      source.grants
        .filter((grant) => grant.credential)
        .flatMap((grant) => grant.hosts),
    ),
  ]);
  function clear() {
    generation++;
    error = "";
    secret = "";
    cookieFile = null;
    expires = "";
    editing = null;
    label = "";
    removing = null;
    createdFile = false;
  }
  function cancelSignIn(): Promise<void> {
    if (closeRequest) return closeRequest;
    const id = signing?.id ?? closingSignIn;
    if (!id) return Promise.resolve();
    // Invalidate completion synchronously, before awaiting engine cleanup.
    generation++;
    signing = null;
    signInReady = false;
    closingSignIn = id;
    closeRequest = (async () => {
      try {
        await client.api.POST("/v2/sign-ins/{id}/close", {
          params: { path: { id } },
          body: { client: lease },
        });
      } catch (e) {
        if (!(e instanceof EngineError && e.status === 404)) throw e;
      }
      closingSignIn = null;
      clear();
    })().finally(() => { closeRequest = null; });
    return closeRequest;
  }
  function close() {
    void run(async () => {
      await cancelSignIn();
      clear();
      onclose();
    });
  }
  function safeError(e: unknown) {
    return e instanceof EngineError
      ? e.problem.message
      : e instanceof Error
        ? e.message
        : "The account operation failed.";
  }
  async function run(action: () => Promise<void>) {
    busy = true;
    error = "";
    notice = "";
    try {
      await action();
    } catch (e) {
      error = safeError(e);
    } finally {
      busy = false;
    }
  }
  async function load(more = false) {
    const { data } = await client.api.GET("/v2/sources/{id}/credentials", {
      params: {
        path: { id: source.id },
        query: { q: query, limit: 50, ...(more && cursor ? { cursor } : {}) },
      },
    });
    if (!data) throw new Error("OMD couldn’t load accounts for this source. Try again.");
    loaded = true;
    accounts = more ? [...accounts, ...data.items] : data.items;
    cursor = data.next_cursor ?? null;
  }
  onMount(() => {
    void run(() => load());
    return () => {
      void cancelSignIn().catch(() => {});
      clear();
    };
  });
  function edit(account?: Account) {
    clear();
    notice = "";
    error = "";
    mode = preferredMode;
    editing =
      account?.profile ?? `account_${crypto.randomUUID().replaceAll("-", "")}`;
    label = account?.label ?? `${source.name} account ${accounts.length + 1}`;
    const exactHost = hosts.find((host) => !host.startsWith("*."));
    origin = exactHost ? `https://${exactHost}` : "";
    advancedOpen = !origin;
  }
  function connectAccount(account?: Account) {
    edit(account);
    if (mode === "browser") void save();
  }
  function changeConnectionMethod() {
    const profile = editing, accountLabel = label;
    void run(async () => {
      await cancelSignIn();
      edit();
      if (profile) editing = profile;
      label = accountLabel;
      mode = "header";
    });
  }
  async function save() {
    if (busy || exporting) return;
    await run(async () => {
      if (!editing) return;
      const started = generation;
      const profile = editing;
      if (mode === "browser") {
        const started = generation;
        const { data } = await client.api.POST("/v2/sources/{id}/sign-ins", {
          params: { path: { id: source.id } },
          // A native window uses the system web view, which sites that
          // reject automated browsers accept.
          body: { client: lease, profile: editing, label, window: "native" },
        });
        if (!data) throw new Error("OMD couldn’t start sign-in. Try again.");
        if (started !== generation || !editing) {
          await client.api.POST("/v2/sign-ins/{id}/close", {
            params: { path: { id: data.id } },
            body: { client: lease },
          });
          return;
        }
        signing = data;
        return;
      }
      let session: components["schemas"]["Session"];
      if (mode === "cookies") {
        if (!cookieFile)
          throw new Error("Choose a cookies.txt file.");
        if (cookieFile.size > 1024 * 1024)
          throw new Error("The cookie file is larger than 1 MB.");
        session = importCookies(await cookieFile.text(), hosts);
      } else
        session = {
          cookies: [],
          headers: [{ origin, name: header, value: secret }],
          expires_at: null,
        };
      if (expires) {
        const expiry = new Date(expires).getTime();
        if (!Number.isFinite(expiry) || expiry <= Date.now())
          throw new Error("Choose an expiration in the future.");
        session.expires_at = Math.floor(expiry / 1000);
      }
      try {
        if (started !== generation) return;
        await client.api.PUT("/v2/sources/{id}/credentials/{profile}", {
          params: { path: { id: source.id, profile } },
          body: { label, session },
        });
      } finally {
        secret = "";
        session.headers.forEach((item) => (item.value = ""));
        session.cookies.forEach((item) => (item.value = ""));
      }
      if (started !== generation) return;
      cookieFile = null;
      clear();
      onchange();
      await load();
      notice = "Account saved. OMD will check it the next time it’s used.";
    });
  }
  async function revoke() {
    await run(async () => {
      if (!removing) return;
      await client.api.DELETE("/v2/sources/{id}/credentials/{profile}", {
        params: { path: { id: source.id, profile: removing.profile } },
      });
      clear();
      onchange();
      await load();
      notice =
        "Credentials removed. Downloads and subscriptions retain the account reference and will request new credentials when needed.";
    });
  }
</script>

<Dialog cancelLabel={null}
  title={signing
    ? `Sign in to ${source.name}`
    : removing
      ? "Remove source credentials"
      : editing
        ? mode === "browser"
          ? `Sign in to ${source.name}`
          : mode === "cookies" ? `Connect ${source.name}` : "Save source account"
        : `${source.name} accounts`}
  {error}
  onclose={signing || closingSignIn
    ? () => void run(cancelSignIn)
    : editing || removing
      ? clear
      : close}
>
  {#if notice}<p role="status">{notice}</p>{/if}
  {#if closingSignIn}
    <p role="status">{error ? "Sign-in was canceled. Close the browser session to continue." : "Closing sign-in…"}</p>
  {:else if signing}
    <SignInPage
      {client}
      {lease}
      session={signing}
      bind:ready={signInReady}
      startUrl={source.sign_in?.url}
      bind:this={signInPage}
      bind:busy
      bind:error
      onsaved={() => {
        if (!signing || closingSignIn) return;
        const connectedProfile = signing?.profile;
        signing = null;
        clear();
        onchange(connectedProfile);
        void run(async () => {
          await load();
          notice = `Account saved in ${credentialStoreName()}.`;
        });
      }}
    />
  {:else if removing}
    <p>
      Remove the saved credentials for <strong>{removing.label}</strong>?
      Existing files and download history are retained.
    </p>
    <p>
      Downloads and subscriptions using this account will need another sign-in
      or account selection.
    </p>
  {:else if editing && mode === "browser"}
    <p role="status">
      {busy
        ? "Opening sign-in in the browser…"
        : "Open the browser to sign in to your account."}
    </p>
  {:else if editing}
    {#if mode === "cookies"}
      <p>Choose a cookies.txt file from a browser signed in to {source.name}.</p>
    {/if}
    <form
      id={formId}
      onsubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      autocomplete="off"
    >
      {#if mode !== "cookies"}<label
        >Account name<input
          required
          maxlength="200"
          bind:value={label}
        /></label
      >{/if}
      <SelectPicker
        label="Connection method"
        bind:value={mode}
        options={[
          ...(source.sign_in
            ? [{ id: "browser", label: "Sign in to the source" }]
            : []),
          { id: "header", label: "API key (advanced)" },
          { id: "cookies", label: "Import a cookie export" },
        ]}
        onchange={() => {
          secret = "";
          cookieFile = null;
          // Never hide the required origin field when it is still empty.
          if (mode === "header" && !origin) advancedOpen = true;
        }}
      />
      {#if mode === "header"}
        <details class="advanced-fields" bind:open={advancedOpen}>
          <summary>Advanced</summary>
          <label
            >HTTPS origin<input
              type="url"
              required
              bind:value={origin}
              placeholder="https://api.example.com"
            /></label
          >
          <SelectPicker
            label="Header"
            bind:value={header}
            options={[
              { id: "authorization", label: "Authorization" },
              { id: "x-api-key", label: "X-API-Key" },
              { id: "x-auth-token", label: "X-Auth-Token" },
            ]}
          />
        </details>
        <label
          >API key or token<input
            type="password"
            required
            maxlength="16384"
            bind:value={secret}
            autocomplete="new-password"
            placeholder={header === "authorization" ? "Bearer …" : ""}
          /></label
        >
      {:else if mode === "cookies"}
        <CookieFilePicker bind:file={cookieFile} disabled={busy || exporting} onchange={() => { createdFile = false; error = ""; }} />
        {#if createdFile}<p role="status">File created in Downloads and selected for import. You can delete it after connecting.</p>{/if}
        <label>Account name<input required maxlength="200" bind:value={label} disabled={busy || exporting} /></label>
        <CookieImportGuide name={source.name} sourceId={source.id} url={source.sign_in?.url} bind:busy={exporting}
          onfile={(file) => {cookieFile = file; createdFile = true; error = "";}} />
      {:else if source.sign_in}<p>
          OMD opens {new URL(source.sign_in.url).origin} in a separate session.
          Your sign-in stays outside source plugins.
        </p>{/if}
      {#if mode === "header"}<label
          >Account expiration (optional)<input
            type="datetime-local"
            bind:value={expires}
          /></label
        >{/if}
      <p>{mode === "cookies" ? `Only this source’s cookies are imported and saved in ${credentialStoreName()}.` : `Account details are saved in ${credentialStoreName()}.`}</p>
    </form>
  {:else}
    {#if accounts.length > 10 || query}<SearchBar
        bind:value={query}
        label="Find an account"
        {busy}
        onsubmit={() => void run(() => load())}
      />{/if}
    <PendingStatus active={!loaded && busy} label="Loading accounts…">
      {#if accounts.length || (loaded && !error)}
      <RecordList label="Accounts"
        >{#each accounts as account}<RecordRow class="account-row">
            <div class="account-identity">
              <UserRound size={20} aria-hidden="true" />
              <div class="account-copy">
                <h3>{account.label}</h3>
                <p class:account-issue={!!account.issue}>
                  {account.issue?.message ?? "Saved. OMD will check it the next time it’s used."}
                </p>
              </div>
            </div>
            <div class="account-actions">
            <Button
              disabled={busy}
              aria-label={`${preferredMode === "cookies" ? "Replace cookie file" : preferredMode === "browser" ? "Sign in again" : "Replace credentials"} for ${account.label}`}
              onclick={() => connectAccount(account)}>{preferredMode === "cookies" ? "Replace cookie file" : preferredMode === "browser" ? "Sign in again" : "Replace credentials"}</Button
            ><Button
              variant="ghost"
              disabled={busy}
              aria-label={`Remove ${account.label}`}
              onclick={() => { notice = ""; removing = account; }}>Remove</Button
            >
            </div>
          </RecordRow>{:else}{#if loaded && !error}<EmptyState
              icon={UserRound}
              compact
              level={3}
              title={query ? "No matching accounts" : "No saved accounts"}
              description={query
                ? "Try a different account name."
                : "Save credentials for this source when needed."}
            />{/if}{/each}</RecordList
      >
      {/if}
    </PendingStatus>
    <InfiniteMore
      {cursor}
      disabled={busy}
      load={() => run(() => load(true))}
      label="accounts"
    />
  {/if}
  {#snippet footer()}
    {#if closingSignIn}
      {#if error}<Button variant="primary" disabled={busy} onclick={() => void run(cancelSignIn)}>Retry closing sign-in</Button>{/if}
    {:else if signing}
      <Button disabled={busy} onclick={changeConnectionMethod}>Change connection method</Button>
      {#if signInReady && error}<Button
          variant="primary"
          disabled={busy}
          onclick={() => signInPage?.save()}>Retry saving account</Button
        >{/if}
    {:else if removing}<Button type="submit" disabled={busy} onclick={revoke}
        >Remove credentials</Button
      >
    {:else if editing && mode === "browser"}
      <Button disabled={busy} onclick={changeConnectionMethod}>Change connection method</Button>
      <Button
        variant="primary"
        disabled={busy}
        onclick={() => void save()}
        >{busy ? "Opening browser…" : "Open sign-in"}</Button
      >
    {:else if editing}<Button
        type="submit"
        variant="primary"
        form={formId}
        disabled={busy || exporting || (mode === "cookies" && !cookieFile)}
        >{busy ? "Importing…" : mode === "cookies" ? "Import credentials" : "Save account"}</Button
      >
    {:else if loaded && !accounts.length && !query && !error}<Button
        variant="primary"
        disabled={busy}
        onclick={() => connectAccount()}>Connect account</Button
      >
    {:else}
      {#if loaded}<Button disabled={busy} onclick={() => connectAccount()}>Add account</Button>
      {:else if error}<Button disabled={busy} onclick={() => void run(() => load())}>Retry</Button>{/if}
      <Button variant="primary" onclick={close}>Done</Button>
    {/if}
  {/snippet}
</Dialog>

<style>
  .advanced-fields[open] {
    display: grid;
    gap: var(--space-3);
  }

  :global(.record-row.account-row) { flex-wrap: wrap; gap: var(--theme-sourceaccounts-gap-1, 16px) var(--theme-sourceaccounts-gap-2, 24px); }
  .account-identity { display: flex; align-items: flex-start; gap: var(--theme-sourceaccounts-gap-3, 12px); flex: 1 1 var(--theme-sourceaccounts-flex-4, 220px); min-width: 0; }
  .account-identity > :global(svg) { flex-shrink: 0; color: var(--muted); }
  .account-copy { display: grid; gap: var(--theme-sourceaccounts-gap-5, 4px); min-width: 0; }
  .account-copy h3 { margin: 0; font-size: var(--type-body); line-height: var(--theme-sourceaccounts-line-height-6, 1.4); overflow-wrap: anywhere; }
  .account-copy p { margin: 0; font-size: var(--type-control); line-height: var(--theme-sourceaccounts-line-height-7, 1.45); color: var(--muted); overflow-wrap: anywhere; }
  .account-copy p.account-issue { color: var(--red); }
  .account-actions { display: flex; align-items: center; gap: var(--theme-sourceaccounts-gap-8, 8px); flex-wrap: wrap; margin-left: auto; }
</style>
