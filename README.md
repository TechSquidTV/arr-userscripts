# Arr\* Userscripts

Small browser add-ons that let you send a title you are viewing to your own Sonarr or
Radarr library. They run in a userscript manager such as
[Violentmonkey](https://violentmonkey.github.io/) or
[Tampermonkey](https://www.tampermonkey.net/); you do not need to build anything or
share your server credentials with this project.

## Choose a script

Install the script that matches where and what you browse:

| Script        | Use it when you are viewing | Install                                                                                                              |
| ------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| IMDb → Sonarr | a TV series on IMDb         | [Install IMDb → Sonarr](https://github.com/techsquidtv/arr-userscripts/releases/latest/download/imdb-sonarr.user.js) |
| IMDb → Radarr | a movie on IMDb             | [Install IMDb → Radarr](https://github.com/techsquidtv/arr-userscripts/releases/latest/download/imdb-radarr.user.js) |
| Plex → Sonarr | a TV show in Plex Web       | [Install Plex → Sonarr](https://github.com/techsquidtv/arr-userscripts/releases/latest/download/plex.user.js)        |

The IMDb scripts identify the title before showing a button: Sonarr appears for TV
series and Radarr appears for movies. They stay out of the way on episodes and pages
where IMDb does not give a reliable answer. The Plex script is similarly conservative:
it appears for TV shows, not music or movies.

## Install in three steps

1. Install Violentmonkey or Tampermonkey in your browser.
2. Choose an install link above and approve the userscript-manager installation
   screen.
3. Visit a matching IMDb or Plex page, open your userscript manager’s menu, and
   choose **Configure Arr\* Userscripts**.

In Violentmonkey, the configuration command appears underneath each matched script.
Choose the command for the service you want to set up:

![Violentmonkey menu showing the configuration command for the matched IMDb Sonarr and IMDb Radarr scripts](.github/img/violentmonkey-configuration-menu.png)

The first field is your Sonarr or Radarr API key. Enter it along with the server
address, then press **Save settings**. The script saves that connection in your
userscript manager and immediately loads your root folders and quality profiles. Pick
the options you want, set the monitoring/search choices, then press **Save settings**
again to finish. You can still type a folder path and profile ID yourself; the
**Reload folders and profiles** button refreshes the dropdowns whenever you need it.

The Plex script can also use your Plex server address to identify items more
accurately. It does not need a root folder or quality profile because it only opens
shows that already exist in Sonarr.

### What happens next

The scripts do not ask for an API key simply because you installed them. Enter it once
in that script’s configuration screen. A server URL alone is not enough: Sonarr and
Radarr also need a root folder and quality profile; choose them from the loaded
dropdowns or enter those values manually. Then open the right kind of detail page:

- **IMDb → Sonarr** adds an **Add to Sonarr** button on a main TV-series page. It
  intentionally does not appear on movie, episode, list, search, or unclear pages.
- **IMDb → Radarr** adds an **Add to Radarr** button on a main movie page. It does
  not appear on TV-series or episode pages.
- **Plex → Sonarr** adds its Sonarr button on a TV-show detail page, not on movie or
  music pages.

Clicking an Add button—or **Sonarr** in Plex—uses the saved connection without another
credentials prompt. The Plex screen also accepts an optional Plex server URL and token
as a pair; saving them lets the script verify the media type and prefer exact external
identifiers. If setup is incomplete, the visible **Configure Arr\*** button opens this
guide; it does not silently hide the control.

## Your API keys stay with you

Your Sonarr/Radarr API key—and the optional Plex token—are saved in the userscript
manager’s own value storage, not in the website’s local storage, cookies, downloads,
or this repository. This is per script and browser profile, so configure IMDb → Sonarr
and Plex → Sonarr separately.

That storage isolates values from the target website under normal browser extension
permissions, but it is not a dedicated password vault and its encryption behavior is
managed by Violentmonkey or Tampermonkey. Use a scoped Arr API key, protect your browser
profile, and do not store a high-value master password here. **Reset saved settings**
removes the saved connection, including its API key/token, for that one script.

## Updates

The install links always point to the latest published release. Userscript managers
can check them for updates automatically. Saved settings survive an update.

Every script also has a small, readable defaults block directly below its metadata
header. You may edit that block before installing, but use the configuration menu for
settings you want to keep: an update replaces edited defaults while preserving saved
settings.

The public Plex script is the exception when you add a self-hosted Plex Web address:
an edited `@match` rule is source code, so an official update would replace that
customization. Use one of the options below.

## Using a self-hosted Plex Web address

The public Plex download runs on `https://app.plex.tv/*`. A userscript manager decides
where a script can run before its settings page opens, so adding a Plex server URL in
the dialog cannot enable another web address.

### Quick one-time setup

You do not need to build the project or edit minified application code. Install the
public [Plex → Sonarr script](https://github.com/techsquidtv/arr-userscripts/releases/latest/download/plex.user.js),
then open that script’s code editor in Violentmonkey or Tampermonkey. At the very top
of the file, inside the readable `UserScript` header, add one exact line:

```javascript
// @match https://plex.example.com/*
```

Save the script, then turn off automatic updates for that customized Plex copy. This
is the simplest option for one host. A separate unminified release would not improve
this workflow: the header is already readable, and an update would still replace a
hand-edited rule.

### Personal Plex release with automatic updates

For a self-hosted Plex Web address that should continue receiving updates, create a
fork of this repository and use its included **Publish personal Plex userscript**
workflow:

1. Open the **Actions** tab in your fork and enable workflows if GitHub asks.
2. Select **Publish personal Plex userscript**, choose **Run workflow**, and enter
   one or more comma-separated Plex Web origins, such as
   `https://plex.example.com`.
3. When it completes, install this script from your fork, replacing the placeholders:

   ```text
   https://github.com/<fork-owner>/<fork-repository>/releases/download/personal-plex/plex.user.js
   ```

The workflow creates a secret-free script with your exact `@match` rules. It updates
the same `personal-plex` release asset on each run, so your userscript manager can
update it automatically without losing those rules. To take upstream improvements,
sync your fork with this repository and run the workflow again. Plex hostnames are
not credentials; do not put API keys or Plex tokens in the workflow input.

## Troubleshooting

- **No button appears on IMDb:** Open a main movie or TV-series page, rather than an
  episode, list, or search page. The script deliberately waits until it can identify
  the title type.
- **No button appears in Plex:** Open a TV-show detail page. The script does not run
  for music or movies.
- **The request fails:** Check the server URL, API key, root folder, and quality
  profile in **Configure Arr\* Userscripts**. The server must be reachable from your
  browser.
- **I need to start again:** Choose **Reset saved settings** in the configuration
  dialog. This clears that script’s local settings, including its saved API key or
  Plex token.

## For contributors

This repository is a pnpm workspace built with [Vite+](https://viteplus.dev/). The
scripts share their user-interface, settings, ARR API, and metadata tooling so fixes
can benefit every script. Releases are created by GitHub Actions from version tags;
release downloads always contain blank defaults and no credentials.

```bash
vp install
vp check
vp test
vp run build
```

The bundled Sonarr, Radarr, and Plex icons are sourced from
[selfhst/icons](https://github.com/selfhst/icons).
