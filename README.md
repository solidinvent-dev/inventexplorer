# InventExplorer

Icons, colours and styling for the [Obsidian](https://obsidian.md) file
explorer — per-file and per-folder icons, regex path masks, and thousands of
icons from Lucide, Tabler, Boxicons and Phosphor, plus every emoji.

**Website and documentation: https://inventexplorer.solidinvent.pl**

This repository exists to distribute the plugin. **InventExplorer is not open
source** — the source lives in a private repository, and only the built plugin
is published here, under the [EULA](LICENSE). The same files are also available
directly from the website.

## Install

### Manual

1. Download `inventexplorer.zip` from the [latest release](https://github.com/solidinvent-dev/inventexplorer/releases/latest).
2. Unzip it into `<vault>/.obsidian/plugins/` — the archive contains the
   `inventexplorer/` folder.
3. Restart Obsidian, then enable **InventExplorer** under
   Settings → Community plugins.

Installing on mobile? `INSTALL.md` inside the zip covers it.

### With BRAT

[BRAT](https://github.com/TfTHacker/obsidian42-brat) installs the plugin from
this repository and keeps it updated automatically:

1. Install BRAT from Obsidian's community plugins.
2. *Add beta plugin* → `solidinvent-dev/inventexplorer`.

Each release also carries `main.js`, `manifest.json` and `styles.css` as loose
files, which is what BRAT reads.

**About the icon sets.** BRAT only ever fetches those three files, and the icon
sets are 10 MB, so they are not part of a BRAT install. The plugin downloads
whichever set you pick from this release the first time you use it and keeps it
next to `main.js` — the same place the zip would have put it. Lucide and emoji
never depend on that and work regardless.

This makes a BRAT install *smaller* than the zip rather than poorer: it starts
at 255 KB and only fetches the one set you actually chose, where the zip carries
all three whether you want them or not.

## Versions

Every release is tagged and stays available, so you can roll back. The
[latest release](https://github.com/solidinvent-dev/inventexplorer/releases/latest)
is always the current version.

## Free and paid

The plugin is fully functional for free with capacity limits — see the website
for what those are and what a license lifts. A license is a one-time purchase,
not a subscription.

## Third-party icons

The bundled icon sets are MIT and Apache-2.0 licensed; attribution ships in
`THIRD-PARTY-LICENSES.md` inside the zip and is published on the website.

## Support

Open an issue here, or write to contact@solidinvent.pl.
