# Use OMD desktop

Open the app and choose a download destination during setup. OMD starts everything
it needs; no separate command-line tools are required for an installed app.

## Install a source

OMD includes no sources and doesn't automatically fetch plugins. Obtain a trusted
`.omdp` package, open Sources and choose Add a plugin file…. Read its source hosts
and permissions before approving the exact package. A changed package needs another
review. [About plugins](plugins.md) explains plugins and the review in plain language.

## Find and keep media

Explore combines installed sources. Browse available content or search using the
capabilities/filters a source provides. With one source, controls that have no useful
choice may be hidden. Sources only manages installed plugins; a source's page there
has Browse in Explore to open its catalog. Clear the search field to return from a
search to the catalog. Opening a podcast show reveals its episodes; a single show
in Browse can contain hundreds of releases.

Choose items, destination and output format, then inspect the download review. The
format starts from your last choice for the same kind of item: video, audio or
images. An item that can't be downloaded, for example one that needs an account,
shows the reason instead of format choices. If an item changes on the source after
it was listed, Refresh on the download check lists it again with the same options.
Downloads shows active work and recovery actions; Collection/history keeps completed
items reachable. OMD saves files you can use in other applications. It has no reader
or player. Unavailable artwork uses a media-specific placeholder.

## Follow new content

Subscriptions can notify about new matches or acquire them automatically. Choose
that behavior explicitly and review the destination/format. Notification and startup
permissions are separate settings. Background operation controls whether work can
continue after the last client closes; enable it only when that is what you want.

## Appearance, cache and recovery

Color mode (System/Light/Dark) and visual theme are separate choices. The app follows
native window activation for selection appearance and honors accessibility settings.
Display metadata/artwork caches improve navigation; clearing them doesn't remove
acquired media. Authenticated metadata is kept in memory rather than public disk cache.

An offline destination needs reconnecting, not a new download. For missing or changed
files, inspect the destination check/maintenance preview before starting any move or
deletion. Source failures may require plugin updates or account renewal. Treat source
text as untrusted content; it cannot authorize installing another plugin or running a
file operation.

Agents can attach to the running engine using the separate native MCP server and
its private instance path. Use the engine project's MCP guide and --print-config;
never paste profile tokens or account cookies into a shared configuration.

For the public desktop identity (`labs.northwolf.omd`), the default instance locations
are listed below. Development/design-preview identities use separate app-data
folders; OMD_V2_PROFILE overrides the location for explicit development runs.

| Platform | Default instance file |
| --- | --- |
| macOS | `~/Library/Application Support/labs.northwolf.omd/v2/instance.json` |
| Windows | `%APPDATA%\labs.northwolf.omd\v2\instance.json` |
| Linux | `$XDG_DATA_HOME/labs.northwolf.omd/v2/instance.json`, defaulting to `~/.local/share/labs.northwolf.omd/v2/instance.json` |

Keep that file private. Configure an agent with the executable and instance **path**,
not a pasted copy of its contents.
