# About plugins

OMD doesn't know about any website on its own. To search and download, it uses
**source plugins**: small add-ons you choose and add yourself.

## What a plugin is

A plugin is a single file that ends in `.omdp`. Each plugin teaches OMD how to
work with one site or catalog: how to search it, list what it offers and fetch
what you choose to download.

OMD is free, open-source software and **comes with no plugins**. The OMD project
doesn't run a plugin store, doesn't recommend plugins and doesn't check
plugins made by other people. Plugins are written and shared by third parties.

## Only install plugins from people you trust

A plugin is software. Before you add one, make sure you know who made it and
that you trust them. Get the file directly from its author. If you aren't sure
where a plugin came from, don't install it.

You are responsible for using plugins and downloaded media in line with the
law and with each site's terms.

## Adding a plugin

1. In OMD, choose **Add a plugin file…** (on the Sources page, or during setup).
2. Pick the `.omdp` file.
3. Read the permission review (below), then choose **Approve and install**, or
   **Don't install** to stop.

## What the permission review means

Before anything is installed, OMD shows what the plugin is asking for:

- **This plugin can connect to:** the websites the plugin may contact. It can't
  reach any other site. "Any subdomain of example.com" means addresses such as
  `images.example.com`.
- **It may use an account you add:** if you add an account for this source
  (in Sources › Accounts), OMD can sign the plugin's requests to these sites
  with it. OMD keeps your account details separate from the plugin.
- **It can download and convert video and audio:** the plugin can use OMD's
  built-in download and conversion tools, only for the sites listed.
- **It can load pages from these sites in a hidden browser window:** some
  sites only work in a browser; OMD runs one for the plugin, limited to the
  sites listed.
- **It can open a sign-in window:** when you add an account, OMD can open that
  site's sign-in page so you can sign in yourself. The review then lists the
  other sites that window can connect to, in groups. Each group says either
  "May send sign-in cookies and authentication headers to these hosts" or
  "Sign-in cookies and authentication headers are not sent to these hosts".
  Sites marked "not sent" never get your sign-in cookies or authentication
  headers from that window. This is separate from "It may use an account you
  add", which is about an account you save for this source.

**Details** lists the exact request types for each site and the package
fingerprint. The fingerprint identifies the package contents you reviewed. It
is not the downloaded `.omdp` file's checksum, so it won't match a SHA-256 you
calculate for that file yourself. You approve exactly that package. If it
changes, for example when you add an update, OMD shows the review again.

## Removing a plugin

Open **Sources**, choose the plugin, then choose **Remove source**. OMD shows
what will change before anything is removed:

- Accounts you saved for that source are deleted.
- Unfinished downloads from it pause, and its subscriptions turn off.
- Files you already downloaded, and your download history, stay.

If you add the same plugin again later, you review it again and can then
resume your downloads and subscriptions.

## For plugin developers

Plugins are built with the provider SDK of the Open Media Downloader engine
project. See its README (the "Plugin authors" section) for the SDK and the
plugin authoring guide. Keep each plugin in its own project. A small, complete
worked example is published separately as
[omd-source-nasa-podcast](https://github.com/NorthWolfLabs/omd-source-nasa-podcast)
(unofficial, not affiliated with or endorsed by NASA; it is not part of OMD).
