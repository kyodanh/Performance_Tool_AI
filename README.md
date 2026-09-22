<p align="center">
  <a href="https://grafana.com/products/cloud/k6/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark-theme.svg">
      <source media="(prefers-color-scheme: light)" srcset="assets/logo.svg">
      <img src="assets/logo.svg" alt="k6 Studio" width="210" height="210" />
    </picture>
    <br>
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/grafana-labs-dark-theme.svg">
      <source media="(prefers-color-scheme: light)" srcset="assets/grafana-labs.svg">
      <img src="assets/grafana-labs.svg" alt="Grafana Labs" width="210" />
    </picture>
    <br>
  </a>
</p>

<p align="center">LoadPilot — a performance testing desktop app for Mac, Windows and Linux, built on Grafana k6 Studio</p>

<p align="center">
    <a href="https://github.com/kyodanh/Performance_Tool_AI/releases">Download</a> ·
    <a href="https://grafana.com/docs/k6-studio/set-up/install/">Upstream documentation</a> ·
    <a href="https://github.com/kyodanh/Performance_Tool_AI/issues">Report issues</a>
</p>

<p align="center">
  <img src="assets/k6-studio-screenshot.png" alt="LoadPilot" width="600" />
</p>

**LoadPilot** is a fork of [Grafana k6 Studio](https://github.com/grafana/k6-studio). It keeps the upstream record → generate → validate flow and adds what you need to actually run a load test and read the results: a load test controller with remote load generators, saved-run analysis with SLA checks, AI-assisted error analysis, and export to JMeter and LoadRunner.

---

## Installation

Download the latest installer (macOS `.dmg`, Windows `.exe`) from the [Releases page](https://github.com/kyodanh/Performance_Tool_AI/releases).

> [!IMPORTANT]
> [Google Chrome](https://www.google.com/chrome/browser-tools/) or [Chromium](https://www.chromium.org/Home/) need to be installed on your machine for the recording functionality to work.

## How it works

### Recorder

Records a user flow in a browser and saves it as a HAR file. Every request from the recording window is captured through a proxy powered by [mitmproxy](https://github.com/mitmproxy/mitmproxy). You can create groups during the recording to organize the script.

### Generator

Turns a HAR recording into a k6 script without writing JavaScript. Apply rules (correlation, parameterization, verification, custom code) to fine-tune the script, configure the load profile, and preview the result.

LoadPilot additions:

- **Manual API requests** — add requests by hand, paste a `curl` command, or import a Postman collection, and include them alongside recorded traffic.
- **Export to JMeter and LoadRunner** — generate `.jmx` (JMeter) and `.c` (LoadRunner/VuGen) scripts from the same request plan as the k6 script, with preview tabs next to the k6 preview.

### Validator

Runs the script with a single VU and a single iteration so you can inspect every request and response, the k6 logs and checks before running it under load. An HTTP timeout option is available for slow endpoints.

### Controller (load test runner)

Runs the script under load with the configured load profile and shows live metrics, transactions, errors and machine resources (CPU, memory) while the test runs.

- **Load generators** — enroll other machines as load generators with a short-lived join code and a ready-to-paste command (macOS/Linux and Windows), then set the weight each generator carries.
- **SLA** — define response-time and error-rate ceilings; with _Check_ enabled, the run is judged against the SLA and the SLA is stored with the result.
- **Save run** — save a finished run to Analysis.

### Analysis

Browse saved runs, see the summary, charts, transactions, endpoints, checks and errors of each run.

- **Compare runs** — KPI tiles, overlay charts, metric and transaction tables, and SLA regressions between runs. Each run is judged by its own stored SLA.
- **AI analysis** — explain errors and SLA misses with an AI provider (Grafana Assistant or your own OpenAI-compatible endpoint), including error triage and timing breakdowns.
- **Copy for AI** — copy the whole run as Markdown (every transaction, endpoint, check and error, plus per-second samples as CSV) to paste into any chat model.
- **Export PDF report** — a shareable report, including an SLA page.

## Support

Open an issue on the [LoadPilot issue tracker](https://github.com/kyodanh/Performance_Tool_AI/issues). For problems that also happen in upstream k6 Studio, you can report them to [grafana/k6-studio](https://github.com/grafana/k6-studio/issues).

## License

LoadPilot is distributed under the [AGPL-3.0 license](LICENSE), same as Grafana k6 Studio. See [NOTICE](NOTICE) for attribution.

---

## Troubleshooting

### `localhost` requests not being recorded

The proxy doesn't capture traffic when sent directly to `localhost`. To fix that, you can assign a hostname to it and make requests through that name.
To do that, modify the `hosts` file on your system, for example, `127.0.0.1 myapp`, and then you will be able to make requests in the browser at `myapp:8000/path`.

### "Proxy failed to start" error

If you're on a Mac, make sure you're not running LoadPilot from the Downloads folder. If that's the case, close the app, move the application file to the Applications folder, and start the app again.

### Application logs

Application logs are saved in the following directory:

- on Mac: `~/Library/Logs/LoadPilot/k6-studio.log`
- on Windows: `%USERPROFILE%\AppData\Roaming\k6 Studio\logs\k6-studio.log`
- on Linux: `~/.config/k6 Studio/logs/k6-studio.log`.

When opening an issue, please include a tail of your log file.

## Usage collection

LoadPilot inherits Grafana k6 Studio's anonymous usage collection. You can turn it off in **Settings → Telemetry**. See the [upstream documentation](https://grafana.com/docs/k6-studio/set-up/usage-collection/) for what is collected.

> Settings, SLAs and AI configuration are still stored under the `k6 Studio` data folder, so existing k6 Studio settings carry over.

---

## Contributing

- Read the [Contributing guide](CONTRIBUTING.md)
- Check the [issues](https://github.com/kyodanh/Performance_Tool_AI/issues)
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (sentence case, imperative verb), e.g. `feat: Add type column to WebLogView`

### Staying in sync with upstream

The `Sync upstream` workflow (`.github/workflows/sync-upstream.yml`) runs every Monday and opens a PR merging `grafana/k6-studio` `main` into this repo. It never merges on its own; on conflicts it opens an issue listing the conflicting files. It needs a `SYNC_TOKEN` secret (a PAT with the Workflows scope).

## Development environment

### Dependencies

Make sure you have the following dependencies installed before setting up your developer environment:

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/en/download/) ^v24.11.0

### Run Grafana k6 Studio locally

(Optional) If you're using nvm, switch to a compatible Node version:

```
nvm use
```

Before you can start the app, you need to install the related dependencies:

```
pnpm install
```

After the command has finished, you start the app locally with:

```
pnpm start
```

Other useful commands:

```
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
pnpm format      # prettier
```

### Compile a local binary (packaged app)

To produce a local packaged build, set `SENTRY_DSN` and `NODE_OPTIONS` in your shell first, then run Electron Forge.
The CI/release workflow defaults are:

- `SENTRY_DSN="sentry"`
- `NODE_OPTIONS="--max_old_space_size=8192"`

Example:

```bash
export SENTRY_DSN="sentry"
export NODE_OPTIONS="--max_old_space_size=8192"

pnpm install
pnpm package
```

If you want installable artifacts (`.deb`, `.rpm`, etc.) instead of only a packaged app directory:

```bash
export SENTRY_DSN="sentry"
export NODE_OPTIONS="--max_old_space_size=8192"

pnpm install
pnpm make
```

To build macOS and Windows installers in CI, run the **Build installers** workflow manually. Leave `tag` empty to only upload artifacts, or set a tag to publish a GitHub release.

Common output paths:

- `out/` for packaged app output
- `out/make/` for installer artifacts

### Override the bundled k6 binary

This repository currently loads k6 from packaged resources, not from a `PATH` lookup or env var.
If you need to test with a custom k6 build, replace the bundled binary in `resources` before packaging:

- Linux:
  - `resources/linux/x86_64/k6`
  - `resources/linux/arm64/k6`
- macOS:
  - `resources/mac/x86_64/k6`
  - `resources/mac/arm64/k6`
- Windows:
  - `resources/win/x86_64/k6.exe`

Example (Linux x86_64):

```bash
cp ./k6 resources/linux/x86_64/k6
chmod +x resources/linux/x86_64/k6
```

After replacing the binary, run `pnpm package` or `pnpm make` to include it in your local build.
