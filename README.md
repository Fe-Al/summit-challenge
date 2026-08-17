# Summit Challenge

Summit Challenge is a responsive, local-only hiking strategy game. Reach the fictional Mount Aurora summit and return to the car park while managing energy, hydration, daylight, supplies, route choices, equipment and deterministic weather events.

The current implementation follows [Specification Version 3](docs/specifications/summit-challenge-specification-v3.md). It has no backend, account system, cookies, analytics or runtime third-party API.

## Run locally

Prerequisites:

- Node.js 24 LTS and npm;
- a supported modern browser.

```bash
npm ci
npm run dev
```

Vite prints the local URL. Local development and production use different browser origins and therefore different IndexedDB data.

Available checks:

```bash
npm test
npm run audit
npm run build
npm run preview
```

The audit policy fails on high or critical vulnerabilities in the complete locked dependency graph. `fake-indexeddb` is a development-only adapter used to exercise persistence transactions; the production bundle has no package runtime dependencies.

## How to play

Create or select a local profile, choose Easy, Normal or Hard, and walk one route segment per turn. At two outbound junctions, choose a short, exposed route or a longer, gentler one. Eating and drinking restore resources without advancing time. Resting takes 20 minutes. Walking and resting each make exactly one deterministic event check.

Reaching the summit starts the return over the actual route taken. You may also turn back before the summit. Movement after sunset uses the 120-minute torch capacity and requires confirmation. A result is successful only after a safe return to the car park.

## Local profiles and data

A profile is a convenience, not an authenticated account:

- only a pseudonymous display username is requested;
- up to eight case-insensitively unique profiles may exist per browser storage origin;
- another browser, device, browser profile, private window or site origin has separate storage and its own limit;
- anyone with access to the same browser profile can select any Summit Challenge profile;
- profiles, one active game per profile and completed results are stored in namespaced IndexedDB object stores;
- clearing site data, resetting or uninstalling a browser, losing a device or changing the production origin can erase access to local data;
- developer tools can inspect or edit profiles and scores, so the leaderboard is casual and not cheat-resistant.

Deleting a profile requires typing its displayed username. The deletion transaction removes that profile, active save and complete result history without touching other profile IDs. It cannot be undone unless a suitable export exists.

### Backup and transfer

The Import / export view downloads one selected profile, its active game and results as a UTF-8 JSON file. That file includes the displayed username and game history and is not encrypted; store it accordingly.

Imports are limited to 1 MiB, parsed as JSON, checked for dangerous keys and unsupported fields, validated against supported schemas, and written in a single transaction. Imported result scores are recomputed from validated canonical summaries. Matching opaque profile IDs require explicit replacement confirmation. A new profile with a conflicting username must be renamed. Export/import is manual backup, not authentication or proof that data is genuine.

Export every profile before clearing browser data or moving to a custom domain or other production origin, then import it after the move.

## Browser and platform support

The release policy covers the latest two stable major releases available at release time for desktop Chrome, Firefox and Edge; the current and previous major Safari on macOS and iOS; and current mobile Chrome on Android. This supports Windows, Linux, macOS, Android and iOS where those browsers are available.

The code targets ES2020 and relies on JavaScript modules, IndexedDB, Web Crypto (`crypto.randomUUID()` and `getRandomValues()`), History/hash navigation, `structuredClone`, Blob/File and standard DOM APIs. Private-browsing or managed-device policies may make persistent storage unavailable; the app reports this without intentionally discarding an existing save.

Manual release checklist:

- complete the create → play → save → refresh → resume → result flow at 320 CSS pixels and a representative desktop width;
- verify keyboard-only operation, visible focus, screen-reader status announcements and 44×44 CSS-pixel touch controls;
- exercise Back/Forward, profile switching, deletion confirmation, cleared site data and simulated unavailable/quota-limited storage;
- reject malformed, oversized, unsupported, conflicting and hostile imports without changing existing data;
- verify the sunset confirmation, equipment responses, four outcomes and local leaderboard ordering;
- test the supported Chrome, Firefox, Edge and Safari release ranges plus a real iOS and Android touch device;
- in browser developer tools, confirm normal production play makes no requests to external origins.

## GitHub Pages deployment

The workflow at `.github/workflows/deploy-pages.yml` runs on `main`, on pull requests for verification, and manually. It performs a locked install, high-severity audit, unit tests and a production build before creating a Pages artifact. Pull requests never deploy.

Owner setup:

1. In repository **Settings → Pages**, choose **GitHub Actions** as the source.
2. Permit Actions to run and keep the default read-only workflow token setting.
3. If the `github-pages` environment uses protection rules, authorize the intended release branch/reviewers.
4. Confirm the repository’s default production branch is `main`, or update the workflow trigger deliberately.

The verification job has only `contents: read`. Only the dependent deployment job receives `pages: write` and `id-token: write`. The application needs no secrets. Vite receives `/<repository-name>/` explicitly as the project-site base path.

## Security and privacy model

- No password, email, real name, IP address, fingerprint, cookie, analytics identifier or precise device information is requested or collected.
- Browser code makes no runtime network request except same-origin static asset loading and never calls a GitHub API.
- User and imported text is inserted with text-node APIs, not HTML. No string evaluation or dynamic imported code is used.
- Stored and imported records are schema-validated and copied into allow-listed structures before use.
- The production page has a restrictive meta Content Security Policy: same-origin scripts/styles/assets, no objects, no external connections and no inline script/style.
- Dependencies are development-only, locked, audited and absent from the production runtime.

Known limitations:

- A meta CSP cannot enforce response-header-only directives such as `frame-ancestors`; GitHub Pages does not provide arbitrary response headers. No proxy was added solely to change this.
- GitHub project sites belonging to one owner normally share an origin. The database name prevents accidental collisions, but another compromised script on that origin is not isolated from IndexedDB. A dedicated custom domain would offer a separate origin, but requires exporting/importing profiles during migration.
- Local timestamps and scores are editable and are not evidence of identity, chronology or fair play.
- Browser storage can be cleared, denied, evicted or made temporary by browser/device policy.

Never commit tokens, passwords or personal data. Review dependency and workflow changes carefully, keep branch protections and required checks enabled, and do not expose elevated credentials to untrusted pull-request code.

## Project structure

```text
index.html                      CSP and application shell
src/main.js                     SPA views and browser integration
src/game.js                     Pure deterministic game engine
src/scoring.js                  Pure scoring and result validation
src/storage.js                  IndexedDB transactions
src/profiles.js                 Profile rules
src/transfer.js                 Import/export validation
src/data/                       Immutable route, event and difficulty data
tests/                          Vitest unit and persistence tests
.github/workflows/              Least-privilege Pages pipeline
docs/                           Authoritative and archived specifications/designs
```

## Documentation

- [Specification Version 3](docs/specifications/summit-challenge-specification-v3.md)
  is the authoritative product specification.
- [Design Overview Version 3.1](docs/design-overview-v3.1.md) describes the
  current as-deployed architecture and operations.
- [Initial production deployment](docs/releases/2026-08-17-initial-deployment.md)
  records release identity, evidence, limitations and outstanding verification.
- [Design Overview Version 3](docs/design-overview-v3.md) is retained as the
  archived planned baseline.
