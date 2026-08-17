# Summit Challenge — Initial Production Deployment

## Release identity

| Item | Value |
| --- | --- |
| Release date | 17 August 2026 |
| Application package version | `1.0.0` |
| Product specification | [Version 3](../specifications/summit-challenge-specification-v3.md) |
| As-deployed design | [Version 3.1](../design-overview-v3.1.md) |
| Initial implementation commit | `40763e4` |
| GitHub Pages action maintenance commit | `00d7e16` |
| Deployed revision | `8c95565` |
| Workflow run | [GitHub Actions run 32048932935](https://github.com/Fe-Al/summit-challenge/actions/runs/32048932935) |
| Public repository | [Fe-Al/summit-challenge](https://github.com/Fe-Al/summit-challenge) |
| Production site | [Summit Challenge](https://fe-al.github.io/summit-challenge/) |

This record describes the first verified public GitHub Pages deployment. It is
release evidence, not a replacement for the specification or design.

## Delivered scope

The release provides the complete local-only Version 3 game: pseudonymous local
profiles, three difficulty levels, deterministic outbound and return traversal,
route choices, supplies, equipment, events, sunset and torch handling, save and
resume, four result outcomes, local leaderboard, profile deletion, and validated
JSON export/import.

The application has no backend, remote account, analytics, cookie, advertising
integration or runtime third-party API. Its production artifact consists of
static HTML, CSS and JavaScript.

## Automated release gates

| Gate | Release result |
| --- | --- |
| Locked dependency installation (`npm ci`) | Passed |
| High/critical dependency audit | Passed; no finding at the configured threshold |
| Vitest suite | Passed; 36 tests |
| Production Vite build | Passed |
| Secret and unexpected external-URL artifact inspection | Passed |
| GitHub Pages verification/deployment workflow | Passed |
| Production HTTPS response and static resource loading | Passed |
| Production CSP and same-origin request inspection | Passed |

The deployment workflow uses the artifact produced by the successful verification
job. Pull-request workflows do not receive Pages deployment permissions.

## Manual evidence

- A Chrome production smoke test created a profile, began a Normal game and
  completed the first route segment.
- Firefox 152 rendered the production profile screen successfully.
- Normal production loading was observed to use same-origin static resources.

The following release-policy coverage is not yet claimed: complete flows in
Edge, Safari, iOS Safari and Android Chrome; all supported viewport sizes;
keyboard-only and screen-reader operation; every outcome and route; and the full
set of unavailable-storage, quota, deletion and hostile-import cases. These are
verification gaps rather than known failed behaviors.

## Owner-controlled setup completed

- Node.js 24 and npm were installed for local development.
- The GitHub repository was made public with owner approval.
- GitHub Pages was configured to deploy with GitHub Actions over HTTPS.
- Repository access was authorized for the release workflow and verification.

These are owner-controlled actions. Future visibility, branch-protection,
environment-protection, custom-domain or credential changes must continue to be
confirmed by the repository owner before execution.

## Security and privacy review

- The workflow needs no application secret and applies read-only permission until
  the dedicated Pages deployment job.
- The browser application stores data only in its origin-local IndexedDB database.
- Imported structures and stored records are schema-validated and copied through
  allow lists; imported scores are recomputed.
- User-controlled values are inserted as text, not executable HTML.
- The production CSP restricts scripts, styles, images and connections to the
  intended static application behavior.
- The public repository exposes all committed source and history. No credential
  or personal information belongs in commits, issues, logs or exported samples.

## Known limitations and follow-up concerns

- Local data may be cleared, evicted, unavailable or separated by a browser,
  browser profile, device or origin change. Players should export profiles before
  clearing data or migrating origins.
- Profiles are not authenticated, exports are not encrypted, and local scores can
  be edited. The leaderboard is not cheat-resistant.
- Other project sites owned by `Fe-Al` share the production origin. The database
  name prevents accidental collisions but cannot isolate storage from compromised
  same-origin code.
- A meta CSP cannot enforce the response-header-only `frame-ancestors` directive.
- The successful `actions/deploy-pages@v5` step emits an upstream Node `punycode`
  deprecation warning. The warning does not come from the application artifact;
  official action updates should be monitored.
- The cross-browser, mobile and assistive-technology matrix listed above remains
  incomplete and should be finished before claiming full release-policy coverage.

## Recovery and rollback

The static application can be rolled back by redeploying a previously reviewed
source revision through the same workflow. Rollback does not roll back IndexedDB
records. Any code change that makes stored records incompatible must therefore
include a forward-compatible migration or an explicit export/import and recovery
plan before deployment.

Because production data exists only in each player's browser, the repository
owner cannot centrally restore it. A valid profile export is the only supported
user-controlled transfer and recovery mechanism.

## Release assessment

Revision `8c95565` satisfied the automated release gates and the recorded Chrome
and Firefox smoke coverage. The release is accepted as the initial production
deployment with the manual coverage gaps and hosting limitations above explicitly
open; no broader certification is implied.

