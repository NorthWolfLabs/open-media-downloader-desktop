<script lang="ts">
  import { appLocale } from "./locale";
  import Button from "./ui/Button.svelte";
  import { onMount } from "svelte";
  import type { EngineClient, components } from "./client";
  let {
    client,
    lease,
    session,
    startUrl,
    busy = $bindable(false),
    error = $bindable(""),
    onsaved,
    ready = $bindable(false),
  }: {
    ready?: boolean;
    client: EngineClient;
    lease: string;
    session: components["schemas"]["SignInSession"];
    startUrl?: string;
    busy?: boolean;
    error?: string;
    onsaved: () => void;
  } = $props();
  let retry = $state<() => void>(() => {});
  let alive = true;
  onMount(() => {
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const status = await client.request<{ ready: boolean }>(
          `/v2/sign-ins/${session.id}/status`,
          { method: "POST", body: { client: lease } },
        );
        if (!alive) return;
        ready = status.ready;
        if (ready) {
          await save();
          return;
        }
      } catch (e) {
        if (alive) error = e instanceof Error ? e.message : String(e);
        return;
      }
      if (alive) timer = setTimeout(poll, 1500);
    }
    retry = () => {
      error = "";
      void poll();
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  });
  export async function save() {
    if (!ready || busy) return;
    busy = true;
    error = "";
    try {
      const { data } = await client.api.POST("/v2/sign-ins/{id}/complete", {
        params: { path: { id: session.id } },
        body: { client: lease },
      });
      if (!data) throw new Error("The account could not be saved.");
      if (alive) onsaved();
    } catch (e) {
      if (alive) error = e instanceof Error ? e.message : String(e);
    } finally {
      if (alive) busy = false;
    }
  }
</script>

<p>
  Sign in on {startUrl ? new URL(startUrl).hostname : "the source’s website"} in
  the sign-in window that opened. This dialog will close when your account is
  connected.
</p>
<small
  >This sign-in session ends at {new Date(
    session.expires_at,
  ).toLocaleTimeString(appLocale())}.</small
>

<p role="status">
  {error
    ? "Connection needs attention."
    : ready
      ? "Connecting account…"
      : "Waiting for you to finish signing in…"}
</p>

{#if error && !ready}<Button onclick={retry}>Retry connection check</Button
  >{/if}
