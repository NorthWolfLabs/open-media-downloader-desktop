// Plain-language summary of what a plugin asks for, for the install review.
// Nothing is dropped: every host, sign-in host and request type stays in the
// summary or its details, so wording never hides what is being approved.
import type { components } from "./client";
type Manifest = components["schemas"]["ProviderManifest"];
type Grant = components["schemas"]["HostGrant"];

export type GrantDetail = { hosts: string[]; methods: string[]; account: boolean };
export type PluginReview = {
  /** Every network host the plugin can reach, in manifest order, without duplicates. */
  hosts: string[];
  /** The plugin may receive an account the user adds (any grant with credentials). */
  usesAccount: boolean;
  mediaTools: boolean;
  browser: boolean;
  /** Where the sign-in window opens. Its extra hosts are in `signInGrants`. */
  signIn: { host: string } | null;
  /** Per-permission detail for the Details disclosure. */
  grants: GrantDetail[];
  /** Extra hosts the sign-in window can reach, one entry per sign-in permission. */
  signInGrants: GrantDetail[];
};

/**
 * What the sign-in window may send to a sign-in permission's hosts. Mirrors the
 * engine: a sign-in request keeps cookie, Authorization, X-API-Key and
 * X-Auth-Token headers only when its permission has `credential: true`, and the
 * window can only open pages on such hosts. This is separate from using an
 * account the person saved for the source.
 */
export function signInAuthority(credential: boolean): string {
  return credential
    ? "May send sign-in cookies and authentication headers to these hosts."
    : "Sign-in cookies and authentication headers are not sent to these hosts.";
}

/** "*.cdn.example" reads as "any subdomain of cdn.example"; plain hosts are unchanged. */
export function hostLabel(host: string): string {
  return host.startsWith("*.") ? `any subdomain of ${host.slice(2)}` : host;
}

const unique = (values: string[]) => [...new Set(values)];
const detail = (grant: Grant): GrantDetail => ({
  hosts: grant.hosts,
  methods: grant.methods,
  account: grant.credential,
});

export function pluginReview(manifest: Manifest): PluginReview {
  const signIn = manifest.sign_in ?? null;
  let signInHost = "";
  if (signIn) {
    try {
      signInHost = new URL(signIn.url).host;
    } catch {
      signInHost = signIn.url;
    }
  }
  const hosts = unique(manifest.grants.flatMap((grant) => grant.hosts));
  return {
    hosts,
    usesAccount: manifest.grants.some((grant) => grant.credential),
    mediaTools: !!manifest.media_tools,
    browser: !!manifest.browser,
    signIn: signIn ? { host: signInHost } : null,
    grants: manifest.grants.map(detail),
    signInGrants: signIn ? signIn.grants.map(detail) : [],
  };
}
