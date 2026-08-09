# Summit Challenge — Codex Implementation Specification, Version 3

## Summary of changes from Version 2

This version deliberately changes the project from an authenticated online application into a local-only casual game:

- Remove Supabase, authentication, passwords, Edge Functions, database migrations, Row Level Security and all other backend requirements.
- Replace accounts with pseudonymous **local player profiles** stored in the browser.
- Limit profiles to eight per browser storage origin. This is not a global eight-player limit.
- Store active games, completed results and the leaderboard locally in IndexedDB.
- Add validated JSON export and import so a player can back up or manually transfer a profile between devices.
- Replace the shared online leaderboard with a leaderboard containing the best score for each local profile.
- Remove server-authoritative completion and anti-cheat claims. Local data and scores can be inspected or changed by a player with browser tools; this is accepted for a test/fun project.
- Do not collect IP addresses, use cookies, request personal information, call external APIs or place privileged credentials in the application.
- Focus security on protecting visitors and the GitHub repository through minimal dependencies, safe rendering and import handling, a restrictive Content Security Policy, and least-privilege GitHub Actions permissions.
- Greatly reduce owner setup: deployment requires only the GitHub repository and GitHub Pages.

These changes intentionally trade shared identity, automatic cross-device synchronisation, globally unique usernames, a global profile limit and trustworthy scores for simplicity, privacy and a much smaller security/maintenance burden.

## Instructions to Codex

Build the first working version of the web game described below. Before editing anything, inspect the existing repository and preserve unrelated files and user changes. If the repository contains only specifications, initialise a Git repository and create the project using the structure described here.

Implement the smallest complete version first. Do not add features that are not requested. Do not add a backend, authentication provider, external database, analytics or network API. Do not invent credentials or add repository secrets. When finished, run the relevant checks and report what was implemented, what was tested and any setup or manual verification still required from the owner.

## 1. Product objective

Create a simple, attractive and responsive browser game called **Summit Challenge**. The player attempts to reach a fictional mountain summit and return safely before daylight, energy, hydration or torch time runs out.

The game must:

- support the latest two stable major versions available at release time of desktop Chrome, Firefox and Edge;
- support the current and previous major versions of Safari on macOS and iOS, and current mobile Chrome on Android;
- be usable on Windows, Linux, macOS, Android and iOS through a supported browser;
- be a fully static application deployable to GitHub Pages;
- work without registration, passwords, cookies or a backend;
- support up to eight local player profiles per browser storage origin;
- save profiles, games and results only in the current browser unless the user explicitly exports them;
- make the local-only nature and risk of browser-data loss clear to players;
- avoid collecting or transmitting personal information.

## 2. Technical architecture

Use:

- **Vite**, semantic HTML, modern CSS and vanilla JavaScript modules;
- **IndexedDB** for local profiles, active games and completed results;
- `crypto.randomUUID()` for opaque local profile identifiers;
- a pure deterministic game engine and scoring module;
- **Vitest** for unit tests;
- a small IndexedDB test adapter or justified development-only library when necessary;
- **GitHub Pages** for production hosting;
- a GitHub Actions workflow for locked installation, audit, testing, building and Pages deployment.

Keep production dependencies to the minimum. Do not introduce a front-end framework, authentication library, serverless function, database client, tracking library, CDN script or external font.

The repository should contain at least:

    index.html
    src/
      main.js
      game.js
      scoring.js
      storage.js
      profiles.js
      transfer.js
      styles.css
      data/
        route.js
        events.js
        difficulty.js
    tests/
    .github/
      workflows/
        deploy-pages.yml
    .gitignore
    README.md

The exact module division may be adjusted if the result stays clear and maintainable. Keep one canonical implementation of game and scoring rules.

## 3. Local profiles instead of authentication

### Meaning and limitations

A local profile is a convenience for separating players on one browser installation. It is not authentication and must never be described as a secure account.

- A profile exists only in the IndexedDB storage associated with the site's browser origin.
- The same person using another browser, device, browser profile or private-browsing session is a different local player unless they manually export and import their profile.
- Clearing site data, resetting the browser, uninstalling it or losing the device can delete all profiles and progress.
- Anyone with access to the same browser profile can select any local player profile. There are no passwords or access controls.
- Browser developer tools can inspect or alter local profiles, saves and scores.
- The application must not use IP addresses, browser fingerprinting, cookies or hidden device characteristics to identify players.

Display a concise version of these limitations on first use and in the profile-management/help view.

### Profile creation and selection

- Allow at most eight profiles in the current application's local database.
- Ask only for a display username. Do not ask for a real name, email address, password, date of birth, location or other personal information.
- Trim leading and trailing whitespace before validating the username.
- Accept 3–20 ASCII letters, digits or underscores using `^[A-Za-z0-9_]{3,20}$`.
- Preserve the entered spelling for display and compare a lowercase canonical username for local uniqueness.
- Generate the profile ID with `crypto.randomUUID()`; never derive it from the username or device information.
- Store the creation timestamp locally in ISO 8601 format.
- When eight profiles exist, disable creation and display **“This browser already has the maximum of eight local profiles.”**
- Explain that another browser/device has its own separate limit.
- Allow profile selection without a password.
- Allow switching profiles from the main menu after safely saving the current profile's active game state.

### Profile deletion

- Require an explicit confirmation naming the selected profile before deletion.
- Explain that deletion removes that profile's active save and complete local history and cannot be undone unless an export exists.
- Delete the profile and all owned local records in one IndexedDB transaction.
- Deletion releases one local profile place.
- Never delete or overwrite a different profile's records.

## 4. Screens and navigation

Build a single-page application with these views:

1. **Local profiles** — first-use explanation, profile creation, selection, deletion, import and export.
2. **Main menu** — current profile name, New Game, Resume Game when one exists, Personal Scores, Local Leaderboard, Manage Profiles and About Local Data.
3. **Game setup** — difficulty choice and concise instructions.
4. **Game** — route status, resources, current situation, available actions and event messages.
5. **Result** — outcome, score, statistics and New Game/Main Menu actions.
6. **Scores** — the selected profile's previous results and the local best score for each profile.
7. **Import/export** — backup explanation, Export Profile and Import Profile controls.

Use hash-based navigation or another GitHub Pages-compatible approach that requires no server rewrites. When switching or deleting profiles, clear the old profile's rendered data and replace sensitive history entries so the Back button cannot accidentally display the wrong local profile's game or history.

## 5. Game model

Use one fictional mountain route represented as data rather than hard-coded interface behaviour. Model it as a validated graph of named position nodes and directed segments.

The route begins at a car park, passes through intermediate nodes, reaches the summit and returns to the car park. Include at least two outbound junctions. At each junction the player chooses between:

- a shorter, steeper and riskier segment; and
- a longer, gentler and safer segment.

Each segment must define:

- stable identifier and name;
- origin and destination node identifiers;
- distance in kilometres;
- ascent or descent in metres;
- expected minutes;
- energy cost;
- hydration cost;
- terrain risk;
- weather exposure.

One **Continue walking** action traverses one complete selected segment. The current position is therefore always a route node between actions. Push every traversed segment onto a journey stack. Turning back reverses the actually traversed stack, so the player returns through reachable nodes without impossible jumps. Reaching the summit sets `summitReached` and begins the return over the reverse of the actual outbound path; it does not end the game.

At an unresolved outbound junction, estimated distance remaining is the shortest valid route from that junction to the summit plus the reverse journey to the car park. After a path is selected, use the selected route. After turning back or reaching the summit, use the reversed traversed segments still required to reach the car park. Label this value **Estimated distance remaining**.

## 6. Difficulty levels

Provide **Easy**, **Normal** and **Hard**. Difficulty may alter:

- initial energy, hydration, food and water;
- available daylight;
- event probability and severity;
- resource consumption;
- scoring multiplier.

Put every difficulty value in one immutable configuration object so it can be tuned without changing game logic. Difficulty cannot change after a game starts.

## 7. Player actions and turn rules

During a game, offer only actions valid in the current state:

- **Choose a path** at an unresolved outbound junction. This selects but does not traverse a segment.
- **Continue walking** across the selected next segment. This consumes expected time, energy and hydration, adjusted by difficulty and events.
- **Rest** for a fixed 20 minutes to regain configured energy while consuming daylight and a small configured amount of hydration.
- **Drink** to restore configured hydration by consuming one water portion.
- **Eat** to restore configured energy by consuming one food ration.
- **Use equipment** only when relevant to the pending event or darkness state.
- **Check route information**, including current position, distance travelled, estimated distance remaining, elevation and daylight remaining.
- **Turn back** at any non-car-park route node before reaching the summit, provided no event response is pending. This reverses the traversed journey stack.
- **Pause and save** the current game locally.
- **Abandon the route**, ending the game without local-leaderboard eligibility.

Walking and resting are time-advancing actions and may cause one deterministic event check after ordinary costs are applied. Choosing a path, eating, drinking, using equipment, checking information, saving and viewing screens do not roll an event or advance the random generator. Every action adds a concise message explaining what changed or why nothing changed.

Prevent nonsensical actions, including eating with no food, drinking with no water, resting after the game ends or after sunset, continuing without a selected segment, making a return-path jump, rerolling by opening a screen, or acting before a pending event response is resolved.

## 8. Resources and equipment

Display during play:

- energy from 0 to 100;
- hydration from 0 to 100;
- remaining daylight in hours and minutes, followed by time after dark when applicable;
- food rations;
- water portions;
- current weather;
- distance travelled and estimated distance remaining.

Clamp energy and hydration to 0–100. Segment hydration cost reduces hydration; it does not consume a water portion. Only **Drink** consumes one water portion.

Initial equipment is fixed:

- **Rain jacket** — reusable and effective only for rain; it reduces that event's configured effects.
- **Torch** — available for at most 120 cumulative minutes of movement after sunset. After-dark walking consumes torch time and adds configured risk and a scoring penalty. It does not restore daylight.
- **Basic first-aid kit** — single-use and effective only for minor ankle pain; it reduces that event's effect and is then marked used.

If walking would cross sunset, clearly show that the torch will be used for the after-dark portion and require confirmation. Do not allow walking whose after-dark portion exceeds remaining torch capacity. Resting after sunset is invalid. If the player is away from the car park with no legal movement because torch capacity is exhausted, the outcome is **Rescue required**.

## 9. Deterministic random events

Include a data-driven event system with at least:

- fog;
- rain;
- strong wind;
- minor ankle pain;
- a temporarily confusing path junction;
- favourable weather.

Each event must define a stable identifier, triggering conditions, probability, effects and useful equipment. Use a documented deterministic pseudo-random generator. Generate an initial seed with browser cryptographic randomness and persist the seed, current generator state and any pending event.

Advance the generator exactly once for each event check in a defined order. Reloading, refreshing, navigating or reopening a saved game must never change an already determined event. Keep events understandable and show a concise explanation of base changes, difficulty adjustments, event effects and equipment mitigation.

## 10. Terminal outcomes

A game ends with exactly one outcome:

- **Summit reached and safe return** — the player reached the summit and later returned to the car park without triggering rescue.
- **Safe return without reaching the summit** — the player turned back and returned safely.
- **Rescue required** — energy or hydration reached zero after an action, an event caused an unrecoverable safety failure, or the player was stranded without legal movement after torch capacity was exhausted.
- **Route abandoned** — the player explicitly abandoned the route.

Reaching the summit alone is not a successful completion. Evaluate at most one outcome after each action using this precedence: explicit abandonment, rescue conditions, then safe arrival at the car park.

## 11. Scoring and local leaderboard

Create one pure, tested scoring function with named constants and a detailed breakdown. Reward:

- reaching the summit;
- returning safely;
- distance travelled and cumulative ascent achieved;
- remaining energy, hydration and daylight;
- higher difficulty.

Penalise:

- rescue;
- minutes moved after dark;
- abandonment.

Only **Summit reached and safe return** and **Safe return without reaching the summit** are local-leaderboard eligible. Rescue and abandoned results appear in personal history only and have a leaderboard score of zero, while their breakdown may show penalties that reduced the pre-clamp score.

Show the best eligible result for each profile stored in the current local database, ordered by score descending and then completion date ascending. Display only username, score, difficulty, outcome and completion date.

Calculate scores locally using the canonical game state. Clearly document that a player can alter local storage or application code and therefore the leaderboard is for casual use only and is not cheat-resistant.

## 12. Local persistence

### Data model

Persist locally:

- profile ID, display username, canonical username and creation timestamp;
- at most one active game per profile;
- multiple immutable completed results per profile;
- difficulty, timestamps, deterministic seed/state, pending event, outcome, score breakdown and summary statistics;
- storage and saved-game schema versions.

Use separate IndexedDB object stores or an equivalently clear schema for profiles, active games and results. Index records by opaque profile ID and enforce one active record per profile in application/storage logic. Never use the display username as ownership identity.

### Storage rules

- Namespace the database and all keys specifically for Summit Challenge.
- Treat every record loaded from IndexedDB as untrusted and validate it against an explicit schema before use.
- Reject unknown enum values, impossible resource ranges, invalid route nodes and unsupported schema versions.
- Do not merge unvalidated objects into application state or object prototypes.
- Save the active game after every state-changing action and when the player explicitly pauses.
- Use one IndexedDB transaction for logically related writes, such as completing a game and removing its active save.
- Generate timestamps in the application only for display/order; do not present them as tamper-proof.
- Handle blocked database upgrades, unavailable storage, quota errors and failed transactions with a clear recoverable message.
- Never silently replace or discard an existing active game.

A GitHub project site normally shares its browser origin with other project sites belonging to the same GitHub Pages owner. Database naming prevents accidental collisions but is not a security boundary against another script on that origin. This is acceptable because the application stores no passwords or sensitive personal data. Document the limitation; a dedicated custom domain may be used later if stronger origin isolation is desired, but it is not required.

## 13. Profile export and import

### Export

- Export one selected profile, its active game and its results as a UTF-8 JSON file downloaded by the browser.
- Include a file-format identifier, export-format version and export timestamp.
- Include no browser fingerprint, IP address, cookie, path, credential or hidden identifier other than the profile's random local ID.
- Use a predictable safe filename such as `summit-challenge-profile-username.json` after sanitising the filename component.
- Explain that the exported file contains the displayed username and game history and should be handled accordingly.

### Import

Treat imported files as hostile input:

- accept only a user-selected local JSON file no larger than 1 MiB;
- parse JSON without evaluating code;
- require the expected format identifier and a supported version;
- allow-list every accepted field and validate types, lengths, arrays, identifiers, route state, resource ranges, dates, outcomes and score components;
- recompute every imported completed score from its validated summary/state when sufficient canonical data exists; otherwise reject the result rather than trusting an arbitrary score;
- reject malformed, oversized, unsupported or internally inconsistent files without modifying existing data;
- construct clean application records instead of merging imported objects;
- escape/render imported usernames and messages as text only.

If the imported profile ID already exists, show a comparison and require explicit confirmation before replacing that profile in one transaction. If the ID is new but the canonical username conflicts, require the user to choose a new valid display username. If eight profiles already exist and the import does not replace one, reject it with a clear explanation. Never partially import a file.

Export/import provides manual backup and transfer, not authentication or proof that data is genuine.

## 14. Visual and accessibility requirements

Use a restrained mountain-inspired design with good contrast and no unnecessary animation.

- Mobile-first responsive layout.
- Touch targets at least 44 by 44 CSS pixels.
- Keyboard-accessible controls and visible focus styles.
- Semantic headings, labels, buttons and file-input instructions.
- Status changes announced through an appropriate ARIA live region without repeatedly announcing the entire interface.
- Import errors and destructive confirmation text must be accessible to screen readers.
- Do not rely on colour alone to communicate resource danger.
- Respect `prefers-reduced-motion`.
- Prevent horizontal scrolling at a viewport width of 320 CSS pixels.

Use simple CSS graphics or redistributable icons. Do not add copyrighted photographs, third-party assets or external fonts unless their licence and attribution are documented.

## 15. Security and privacy requirements

### Browser application

- Make no runtime network requests except same-origin requests needed to load the static application files.
- Do not call GitHub APIs from browser code.
- Do not include a GitHub token, API key, password, analytics identifier or privileged secret in source, configuration, Actions output or built files.
- Do not collect, derive or store IP addresses, browser fingerprints, precise device details or other tracking identifiers.
- Do not set or read cookies.
- Validate and constrain all profile, storage, route and imported data.
- Render all user/import-provided content with safe text APIs, never as HTML.
- Do not use `innerHTML` for untrusted or imported content.
- Do not dynamically execute strings, use `eval`, or import code from user-selected files.
- Avoid external scripts, styles, fonts, images and CDNs.
- Commit the dependency lockfile, keep dependencies minimal and run the available dependency audit.

Use a restrictive production Content Security Policy delivered through `<meta http-equiv="Content-Security-Policy">`. It should default to same-origin resources, disallow objects and framing where supported, prohibit external connections, and avoid inline scripts/styles. Document that GitHub Pages cannot provide arbitrary response headers and that directives unsupported in a meta policy, including `frame-ancestors`, cannot be enforced this way. Accept this limitation; do not add a proxy or different host solely for headers.

### GitHub repository and workflow

- Use maintained official GitHub Pages actions and pin them to reviewed versions or commit SHAs according to the repository's update policy.
- Give the build/test job `contents: read` only.
- Give Pages deployment only `pages: write` and `id-token: write`, scoped to the deployment job.
- Do not use `pull_request_target`, expose secrets to pull-request builds or run untrusted contributed scripts with elevated permissions.
- Do not grant `contents: write` unless a documented future requirement genuinely needs it.
- Do not deploy if installation, audit policy, tests or production build fails.

The application cannot compromise GitHub hosting infrastructure merely by running ordinary static JavaScript. The relevant project risks are accidentally publishing credentials, granting excessive workflow permissions, executing compromised dependencies during CI, or serving harmful/injected browser code; the controls above address those risks proportionately.

## 16. Tests

Add automated unit tests for at least:

- resource consumption and clamping;
- resting, eating and drinking;
- path selection and valid graph transitions;
- journey-stack reversal and turning back;
- distance-remaining calculations;
- deterministic random events and generator restoration;
- event timing, ensuring non-time-advancing actions never reroll;
- equipment relevance, first-aid consumption and torch limits;
- every terminal outcome and precedence;
- scoring, eligibility and score breakdown;
- rejection of invalid and post-terminal actions;
- active-game serialisation/restoration and schema versions;
- profile creation, case-insensitive uniqueness and the eight-profile local limit;
- transactional profile deletion and isolation between profiles;
- local leaderboard selection and ordering;
- export round trips;
- valid import, replacement confirmation and username-conflict handling;
- rejection of oversized, malformed, unsupported, inconsistent and prototype-polluting imports;
- storage and transaction error handling where practical.

Also:

- run the dependency audit under a documented policy;
- run the production build;
- inspect the built output for secrets and unexpected external URLs;
- verify the principal flow at 320-pixel mobile width and a representative desktop width;
- test refresh, Back navigation, profile switching, browser-storage clearing, failed imports and storage failure messaging;
- verify that normal play produces no runtime requests to external origins.

If full cross-browser automation is unavailable, automate the available browser and provide a precise checklist covering the remaining supported browsers and real touch devices.

## 17. GitHub Pages deployment

- Configure Vite's base path from an explicit GitHub project-site value rather than assuming root hosting.
- Use GitHub Pages-compatible hash navigation.
- Add a least-privilege GitHub Actions workflow that installs locked dependencies, applies the audit policy, runs tests, builds and deploys static files.
- Do not deploy when any required check or build fails.
- Explain the required GitHub Pages source, environment and workflow permissions in the README.
- Do not configure application secrets because the production application requires none.
- Explain that changing the production origin or custom domain creates a separate browser-storage area; existing profiles must be exported before and imported after such a move.

## 18. Required documentation

The README must explain:

- supported browsers and platforms;
- prerequisites and local development commands;
- test, audit and production-build commands;
- GitHub Pages deployment and least-privilege workflow permissions;
- local profiles and the absence of authentication;
- the eight-profiles-per-browser-origin meaning;
- IndexedDB storage, profile isolation and possible browser-data loss;
- the local-only, editable and non-competitive nature of scores;
- export/import backup and transfer instructions;
- profile deletion and recovery limitations;
- CSP and shared GitHub Pages origin limitations;
- security/privacy assumptions and known limitations;
- the manual browser/device checklist when required.

Include concise game instructions and local-data explanations in the application itself.

## 19. Non-goals

Do not add:

- Supabase or another backend/database service;
- registration, passwords, authentication or account recovery;
- IP-based identity, browser fingerprinting or cookies;
- automatic cross-device synchronisation;
- a global eight-player limit or globally unique usernames;
- a shared online or cheat-resistant leaderboard;
- GitHub API access from the browser;
- real maps, GPS or GPX files;
- chat, comments or multiplayer gameplay;
- payments, advertisements or analytics;
- multiple mountain routes;
- external weather or other runtime APIs;
- a service worker, offline installation or push notifications;
- an administrator interface;
- a reverse proxy or alternate production host solely for security headers.

## 20. Definition of done

The first version is complete only when:

1. up to eight case-insensitively unique local profiles can be created, selected and safely deleted in one browser origin;
2. the interface accurately explains that profiles are local, unauthenticated and recoverable only from an export;
3. each profile has isolated access to its own active game and personal history through the supported interface;
4. the four outcomes, deterministic events and score breakdown work correctly;
5. one active game per profile saves after state changes and restores deterministically after reload;
6. the local leaderboard shows only the best eligible score per local profile and is clearly labelled casual/editable;
7. profile export/import works transactionally and hostile or invalid files are rejected without data loss;
8. clearing browser data behaves as documented and produces a clean first-use state;
9. unit tests and the documented audit policy pass and the production build succeeds;
10. built browser code makes no external runtime request and contains no credential, token, personal information or privileged secret;
11. the deployment workflow uses least-privilege permissions and deploys only after successful checks;
12. the interface is usable at 320 CSS pixels and on representative supported desktop and mobile browsers;
13. the README contains enough information to run, test, deploy, use, back up and understand the limitations of the project.

At handoff, list separately:

- completed code and automated verification;
- manual browser/device checks performed or still required;
- GitHub Pages owner setup actions;
- known local-storage, CSP, browser-support and casual-score limitations.
