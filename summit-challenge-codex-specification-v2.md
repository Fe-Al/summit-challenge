# Summit Challenge — Codex Implementation Specification, Version 2

## Instructions to Codex

Build the first working version of the web game described below. Before editing anything, inspect the existing repository and preserve unrelated files and user changes. If the repository contains only this specification, initialise a Git repository and create the project using the structure described here.

Implement the smallest complete version first. Do not add features that are not requested. Do not invent credentials, commit secrets, or weaken authentication to simplify development. When finished, run the relevant checks and report what was implemented, what was tested, and any setup steps that still require the owner.

## 1. Product objective

Create a simple, attractive and responsive browser game called **Summit Challenge**. The player attempts to reach a mountain summit and return safely before daylight, energy, hydration or torch time runs out.

The game must:

- support the latest two stable major versions available at release time of desktop Chrome, Firefox and Edge;
- support the current and previous major versions of Safari on macOS and iOS, and current mobile Chrome on Android;
- be usable on Windows, Linux, macOS, Android and iOS through one of those supported browsers;
- have a static front end deployable to GitHub Pages;
- use a dedicated Supabase project for authentication and saved data;
- allow public self-registration for a maximum of eight accounts in total;
- require every player to sign in with an active account before accessing persisted game functions;
- avoid storing passwords or privileged secrets in GitHub or browser code.

## 2. Technical architecture

Use:

- **Vite**, semantic HTML, modern CSS and vanilla JavaScript modules for the front end;
- **Supabase Auth**, Postgres and Row Level Security for authentication and persistent data;
- **Supabase Edge Functions** only for username-based authentication, registration status, throttling, authoritative game creation/saving/completion, and other operations that require privileged server-side handling;
- a shared, pure game engine and scoring module that can be executed by both browser tests and the authoritative completion function;
- **Vitest** for unit tests;
- the Supabase CLI and an isolated local Supabase instance for server integration tests;
- **GitHub Pages** for the production front end;
- a GitHub Actions workflow for build, test and Pages deployment.

Keep dependencies few and justified. Do not introduce a large front-end framework for this version.

The repository should contain at least:

    index.html
    src/
      main.js
      game.js
      scoring.js
      storage.js
      auth.js
      styles.css
      data/route.js
    tests/
    supabase/
      migrations/
      functions/
        _shared/
    .env.example
    README.md

The exact division into modules may be adjusted if the result remains clear and maintainable. There must be one canonical implementation of the deterministic rules and score calculation used by authoritative completion; do not maintain independent browser and server formulas that can drift apart.

## 3. Authentication and authorisation

### Required behaviour

- Use a dedicated Supabase project whose Auth users all belong to this application.
- Provide public self-registration using **username**, **password** and **confirm password** fields.
- Permit no more than **eight Auth accounts in total**, including owner and test accounts.
- Enforce the limit inside the database transaction that inserts the Auth user. Client-side counting, an Edge Function count followed by user creation, or merely hiding the registration form is not sufficient.
- Simultaneous registration attempts and accounts created through any supported administrative path must never create a ninth account.
- When eight accounts already exist, disable new registration in the interface and display **“Registration is closed: the eight-account limit has been reached”**. This availability check is advisory; the transactional database rule remains authoritative if availability changes during registration.
- Disabled accounts continue to occupy their slots until the owner deletes them. Deleting an Auth account releases its slot in the same database transaction.
- A successfully registered account is active and authorised to play immediately. The owner may later disable it.
- The visible sign-in form asks only for **username** and **password**.
- Usernames are unique and compared case-insensitively.
- Passwords are handled by Supabase Auth and are never stored in application tables, source files, logs or browser storage.
- A signed-in active user can sign out. Sessions may persist using the official Supabase browser client's normal secure session handling.
- Do not place a Supabase secret/service-role key in the front end, GitHub repository, built files or GitHub Pages configuration.

### Username and password rules

Apply the same validation on the client and server:

- trim leading and trailing whitespace from a username before validation;
- accept usernames containing 3–20 ASCII letters, digits or underscores, using the pattern `^[A-Za-z0-9_]{3,20}$`;
- preserve the registered spelling for display, but create and compare a lowercase canonical username;
- require a password of 8–15 characters;
- count password length by Unicode code points, reject control characters, and do not silently trim or otherwise alter a password;
- require confirmation to match on the client; send only the username and password to the registration function;
- configure the Supabase Auth minimum password length to eight and enable supported password-strength or leaked-password protection when it is available on the owner's Supabase plan.

Document these rules beside the registration form and in the README.

### Atomic eight-account design

Implement the account cap with a private fixed-slot table containing exactly eight rows and a trigger on `auth.users`:

1. The registration Edge Function validates and canonicalises the username, creates a cryptographically random opaque synthetic Auth email, and requests user creation through the supported Supabase Admin API.
2. The request places the validated display and canonical usernames in server-controlled Auth application metadata. User-editable metadata must not be trusted for this purpose.
3. An `auth.users` insertion trigger validates the server-controlled metadata, locks and claims one free account slot, inserts the private username mapping and public profile, and rejects the insertion when no slot exists.
4. A unique database constraint on the canonical username provides case-insensitive uniqueness. Do not rely only on an application-level uniqueness check.
5. Slot assignment, username mapping, profile creation and Auth user insertion must succeed or roll back together. A failed trigger or interrupted user creation must not consume a slot or leave an orphan profile.
6. Deleting the Auth user must cascade the associated private data as intended and release the slot transactionally. Disabling or banning the account must not release it.
7. The trigger must reject direct or administrative Auth-user creation that omits the required application metadata, so no creation path can bypass the cap.

Test the trigger thoroughly because a failing Auth trigger can block all account creation. Do not implement the cap as a non-transactional “count then create” sequence.

### Username login implementation

Supabase Auth natively authenticates an identity such as an email rather than a public username. Preserve the username-and-password experience through server-side registration and sign-in functions:

- accept only the required fields over HTTPS;
- validate them before processing;
- look up the private username-to-Auth mapping only with privileged server credentials;
- return the same generic error and a materially similar response path for an unknown username and an incorrect password;
- never log or retain the password;
- return only the access and refresh token data required to establish a session through the official Supabase client;
- keep the private username mapping inaccessible to `anon` and `authenticated` database roles;
- validate an enabled CAPTCHA provider's token in the public registration function and, where practical, the sign-in function;
- add database-backed throttling to registration and sign-in in addition to Supabase Auth rate limits; use a privacy-conscious key and bounded retention, and return HTTP 429 when the limit is exceeded;
- configure CORS with an explicit allow-list for documented local and production origins.

Do not ask for or expose a user's real email address. The synthetic email must be random, non-personal and unrelated to the username. It may be observable by that signed-in user in their own Supabase session or token; this is an accepted limitation of using standard Supabase email/password sessions. Do not provide an endpoint that reveals another user's synthetic identity or the username mapping.

If this flow cannot be implemented safely with the deployed Supabase version, do not substitute custom password verification or an unenforced account limit. Document the blocker first.

### Current authorisation checks

- Store `authorised` in the protected profile row.
- RLS policies and privileged game functions must query the current profile row for each protected operation. Do not rely solely on an authorisation value copied into a JWT, because it may remain stale until refresh.
- An authenticated but disabled user must be denied all reads and writes of active games, completion operations, private history and leaderboard data.
- The interface must re-check authorisation on initial load, resume, save, completion, tab/window focus, and periodically while a game is open. At the next failed check it must discard sensitive rendered state, show **“Account disabled”**, and offer Sign Out.
- A static browser application cannot prevent someone from manipulating already-downloaded JavaScript or continuing an unsaved local simulation. The security guarantee is that disabling an account immediately blocks protected server data and that the supported interface stops at its next authorisation check.

### Owner setup

Document how the owner:

1. creates a dedicated Supabase project and ensures all Auth accounts use this application's controlled creation process;
2. verifies the occupied slots and the eight-account limit;
3. changes a user's `authorised` value;
4. bans/disables or deletes an account;
5. understands that only deletion releases a registration slot;
6. changes or resets a password through a supported Supabase administrative API or owner-only procedure without committing a privileged key.

## 4. Screens and navigation

Build a single-page application with these views:

1. **Register or sign in** — separate registration and sign-in forms, validation messages and a clear notice when registration is closed.
2. **Account disabled** — explanation and sign-out button.
3. **Main menu** — New Game, Resume Game when one exists, Personal Scores, Leaderboard and Sign Out.
4. **Game setup** — difficulty choice and concise instructions.
5. **Game** — route status, resources, current situation, available actions and event messages.
6. **Result** — outcome, authoritative score, statistics and New Game/Main Menu actions.
7. **Scores** — the player's previous results and an authorised-player leaderboard.

Use hash-based navigation or another GitHub Pages-compatible approach that does not require server rewrites. On sign-out, clear in-memory user/game data and replace sensitive history entries so that the Back button cannot reveal another user's data or produce a broken state.

## 5. Game model

Use one fictional mountain route represented as data rather than hard-coded interface behaviour. Model the route as a validated graph of named position nodes and directed segments.

The route begins at a car park, passes through intermediate nodes, reaches the summit, and returns to the car park. Include at least two outbound junctions. At each junction the player chooses between:

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

At an unresolved outbound junction, distance remaining is the shortest available valid route from that junction to the summit plus the reverse journey to the car park. After a path is selected, use that selected route. After turning back or reaching the summit, distance remaining is the sum of the reversed traversed segments still required to reach the car park. Label this value **Estimated distance remaining**.

## 6. Difficulty levels

Provide **Easy**, **Normal** and **Hard**. Difficulty may alter:

- initial energy, hydration, food and water;
- available daylight;
- event probability and severity;
- resource consumption;
- scoring multiplier.

Put every difficulty value in one immutable configuration object so it can be tuned without changing game logic. Store the chosen difficulty with the server-created active game and do not allow it to change later.

## 7. Player actions and turn rules

During a game, offer only actions valid in the current state:

- **Choose a path** at an unresolved outbound junction. This selects but does not traverse a segment.
- **Continue walking** across the selected next segment. This consumes the segment's expected time, energy and hydration, adjusted by difficulty and events.
- **Rest** for a fixed 20 minutes to regain a configured amount of energy while consuming daylight and a small configured amount of hydration.
- **Drink** to restore configured hydration by consuming one water portion.
- **Eat** to restore configured energy by consuming one food ration.
- **Use equipment** only when it is relevant to the pending event or darkness state.
- **Check route information**, including current position, distance travelled, estimated distance remaining, elevation and daylight remaining.
- **Turn back** at any non-car-park route node before reaching the summit, provided no event response is pending. This changes the journey to the reverse of the traversed stack.
- **Pause and save** the current action log and validated state.
- **Abandon the route**, ending the game without leaderboard eligibility.

Walking and resting are time-advancing actions and may cause one deterministic event check after their ordinary costs are applied. Choosing a path, eating, drinking, using equipment, checking route information, saving and viewing screens do not roll an event or advance the random generator. Every action still adds a concise message explaining what changed or why nothing changed.

Prevent nonsensical actions, including eating with no food, drinking with no water, resting after the game has ended or after sunset, continuing without a selected next segment, selecting a return-path jump, rerolling by opening a screen, or acting before a pending event response is resolved.

## 8. Resources and equipment

Display these resources at all times during play:

- energy from 0 to 100;
- hydration from 0 to 100;
- remaining daylight in hours and minutes, followed by time after dark when applicable;
- food rations;
- water portions;
- current weather;
- distance travelled and estimated distance remaining.

Clamp energy and hydration to 0–100. Segment hydration cost reduces hydration; it does not consume a water portion. Only **Drink** consumes a water portion.

Initial equipment is fixed:

- **Rain jacket** — reusable and effective only for rain; the player may apply it to reduce that event's hydration/energy effects.
- **Torch** — available for at most 120 cumulative minutes of movement after sunset. The after-dark portion of a walking action consumes torch time and adds configured risk and a scoring penalty. It does not restore daylight.
- **Basic first-aid kit** — single-use and effective only for minor ankle pain; it reduces that event's effect and is then marked used.

If a walking action would cross sunset, clearly show that the torch will be used for the after-dark portion and require confirmation. Do not allow a walking action whose after-dark portion would exceed the remaining torch capacity. Resting after sunset is invalid. If the player is away from the car park with no legal movement because torch capacity is exhausted, the game ends as **Rescue required**.

## 9. Deterministic random events

Include a data-driven event system with at least:

- fog;
- rain;
- strong wind;
- minor ankle pain;
- a temporarily confusing path junction;
- favourable weather.

Each event must define stable identifiers, triggering conditions, probability, effects and useful equipment. Use a documented deterministic pseudo-random generator whose server-generated initial seed and current state are persisted. Advance it exactly once for each event check in a defined order.

Persist both the resulting generator state and any pending event before acknowledging a save. Reloading, refreshing, navigating or reopening a saved game must never change the result of an already determined turn. The server's replay of the action log must reproduce the same events and state exactly.

Keep events understandable. After every action, show a concise explanation of base resource changes, difficulty adjustments, event effects and equipment mitigation.

## 10. Terminal outcomes

A game ends with exactly one outcome:

- **Summit reached and safe return** — the player reached the summit and later returned to the car park without triggering rescue.
- **Safe return without reaching the summit** — the player turned back and returned to the car park safely.
- **Rescue required** — energy or hydration reached zero after resolving an action, a defined event caused an unrecoverable safety failure, or the player was stranded away from the car park without legal movement after torch capacity was exhausted.
- **Route abandoned** — the player explicitly abandoned the route.

Reaching the summit alone is not successful completion. The player must return safely. Evaluate at most one outcome after each action using a documented precedence order: explicit abandonment, rescue conditions, then safe arrival at the car park.

## 11. Scoring and leaderboard eligibility

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

Only **Summit reached and safe return** and **Safe return without reaching the summit** are leaderboard-eligible. Rescue and abandoned results appear in personal history only and have a leaderboard score of zero, while their score breakdown may show the penalties that reduced the pre-clamp score.

The result screen must show the authoritative score and its breakdown. Store the formula and constants in the canonical shared scoring module, with `src/scoring.js` acting as that module or a thin browser-facing export. Do not scatter score calculations through interface code.

## 12. Server-authoritative game creation, saving and completion

Do not trust a client-supplied score, outcome, random seed, ownership identifier, start time, completion time, resource total or summary statistic.

### New game

A protected server operation must:

1. derive the owner from the verified session;
2. verify the current profile is authorised;
3. validate the requested difficulty;
4. generate the random seed and start timestamp on the server;
5. create the initial game from canonical configuration;
6. replace any existing active game only after the user explicitly confirms starting over.

The client cannot update immutable start fields.

### Saving

The client submits the ordered action log and a schema version. The protected save operation loads the server-owned initial fields, replays the complete action log through the canonical game engine, rejects invalid or post-terminal actions, and stores the replayed state. A client state snapshot may be sent as a diagnostic consistency check but must not be authoritative.

An authorised user may have exactly one active game, enforced by a primary key or unique constraint on `user_id`.

### Completion

A protected completion operation receives the client's final ordered action log. The log is an input to validate and replay, not evidence that its derived state is trustworthy. The operation must:

1. derive ownership from the verified session and verify current authorisation;
2. load the active game's immutable server-generated seed, difficulty, configuration/schema version and start timestamp;
3. replay the submitted complete action log from that server-owned initial state using canonical deterministic rules;
4. reject an invalid log or a replay that has not reached exactly one terminal outcome;
5. ignore every client-supplied score, outcome, resource total and statistic;
6. calculate the outcome, score, breakdown and summary statistics on the server;
7. write the validated final action log and one immutable completed result with a database-generated completion timestamp;
8. delete the active save and update the private leaderboard source in the same database transaction, or use an idempotent transaction identifier so retries cannot create duplicate results.

This design prevents arbitrary submitted scores and impossible action sequences. It does not attempt to prevent a user from automating valid action choices or inspecting the public client code; document that limitation.

## 13. Persistent data and RLS

Persist:

- immutable user identifier, display username, canonical username and current authorisation state;
- account-slot assignment;
- active game initial data, action log, replayed state, schema version and random state;
- immutable completed results and score breakdowns;
- difficulty, server-generated start/completion timestamps, outcome and summary statistics.

Use database constraints and JSON/schema validation appropriate to every persisted field. Version saved-game and action-log schemas so incompatible future states can be detected and migrated or rejected clearly.

Do not trust client-supplied ownership identifiers. RLS and functions must derive ownership from the authenticated session:

- users may read their own public profile but cannot update the username, owner, authorisation or role; no user-editable profile fields are required in version 1;
- authorised users may read their own active game;
- active-game creation, mutation and deletion occur only through the protected authoritative operations;
- authorised users may read only their own full completed history;
- completed results are immutable and ordinary clients receive no insert, update or delete permission;
- the private username mapping and account-slot tables are inaccessible to ordinary clients;
- ordinary users cannot change authorisation, roles, immutable game fields or another user's data.

The owner may manage authorisation through the Supabase dashboard in this version. Do not build an administrator screen.

## 14. Leaderboard

Show the best eligible score per currently authorised user, ordered from highest to lowest. Display only:

- username;
- score;
- difficulty;
- outcome;
- completion date.

Keep the underlying leaderboard source private. Expose it through a narrowly scoped, carefully secured database function or equivalent server endpoint that:

- verifies the caller is currently authorised;
- uses a fixed safe search path if it is a security-definer function;
- returns only the five approved fields;
- never returns email addresses, synthetic Auth identities, UUIDs, full saved states or private history;
- derives entries only from server-completed, leaderboard-eligible results.

Do not expose a broad view that bypasses the private-history RLS rules.

## 15. Visual and accessibility requirements

Use a restrained mountain-inspired design with good contrast and no unnecessary animation.

- Mobile-first responsive layout.
- Touch targets at least 44 by 44 CSS pixels.
- Keyboard-accessible controls and visible focus styles.
- Semantic headings, labels and buttons.
- Status changes announced through an appropriate ARIA live region without repeatedly announcing the entire interface.
- Do not rely on colour alone to communicate resource danger.
- Respect `prefers-reduced-motion`.
- Prevent horizontal scrolling at a viewport width of 320 CSS pixels.

Use simple CSS graphics or icons safe to redistribute. Do not add copyrighted photographs or third-party assets unless their licence and attribution are documented.

## 16. Security requirements

- Treat all browser code and the Supabase publishable/anonymous key as public. Security must come from verified authentication, server-side replay/validation, database constraints and RLS.
- Never expose the Supabase secret/service-role key or other privileged credentials.
- Provide `.env.example` with placeholders only and ignore all real `.env` variants.
- Validate and constrain data at client, function and database boundaries.
- Render user-provided names as text, never as HTML.
- Use parameterised database operations through supported clients.
- Do not use `innerHTML` for untrusted content.
- Do not store passwords, CAPTCHA tokens, session tokens, secret keys or full authentication request bodies in logs.
- Limit Edge Function request sizes and reject unexpected fields/content types.
- Configure explicit production and development CORS origins.
- Keep dependencies to a minimum, commit the lockfile and run an available dependency audit.

GitHub Pages cannot set arbitrary HTTP response headers. Use a restrictive Content Security Policy delivered through an HTML `<meta http-equiv="Content-Security-Policy">` element, allowing only the application resources, configured Supabase origin and required CAPTCHA origin. Avoid inline scripts and styles. Document that directives unsupported in a meta policy, including `frame-ancestors`, cannot be enforced on GitHub Pages. Accept this limitation for the first version; do not add a proxy or change hosting solely to obtain response headers.

## 17. Tests

Add automated unit tests for at least:

- resource consumption and clamping;
- resting, eating and drinking;
- path selection and valid graph transitions;
- journey-stack reversal and turning back;
- distance-remaining calculations;
- deterministic random events and generator restoration from a saved seed/state;
- event timing, ensuring non-time-advancing actions never reroll;
- equipment relevance, first-aid consumption and torch limits;
- every terminal outcome and precedence;
- scoring, eligibility and score breakdown;
- rejection of invalid and post-terminal actions;
- action-log serialisation, replay and schema-version handling.

Run server-side integration tests against a reset, isolated local Supabase instance. Verify:

- registration succeeds while fewer than eight slots are occupied;
- a ninth account is rejected;
- concurrent registration attempts cannot occupy more than eight slots;
- a failed trigger or registration does not consume a slot or leave an orphan;
- deleting an Auth user releases a slot while disabling one does not;
- direct/admin user creation cannot bypass required metadata or the cap;
- usernames remain unique when letter case differs;
- unknown-username and wrong-password responses are equivalent;
- throttling returns HTTP 429 and expires as configured;
- disabled accounts immediately lose protected database/function access even with an existing JWT;
- one account cannot read or modify another account's private data;
- ordinary clients cannot mutate completed results or private leaderboard data;
- authoritative saving rejects an invalid action log;
- authoritative completion rejects client-provided scores, invalid sequences, non-terminal logs and duplicate retries;
- authoritative completion reproduces events and writes the expected outcome, breakdown and score;
- rescue and abandoned results never enter the leaderboard response;
- the leaderboard returns only approved fields to authorised users.

Also run the dependency audit, unit/integration tests and production build. Verify the principal flow at 320-pixel mobile width and a representative desktop width in supported browsers. If full cross-browser automation is unavailable, automate the available browser and provide a precise checklist covering the remaining browser/version matrix and real touch devices.

Never run destructive integration tests against production. Test setup must assert that it is connected to the expected local/test project before resetting data.

## 18. GitHub Pages deployment

- Configure Vite's base path from an explicit repository/project-site value rather than assuming root hosting.
- Use GitHub Pages-compatible hash navigation.
- Add a GitHub Actions workflow that installs locked dependencies, runs tests, builds the site and deploys generated static files.
- Do not deploy when tests or the production build fail.
- Explain the required GitHub Pages source and workflow permissions in the README.
- Document the exact permitted production and local origins configured in Edge Function CORS, Supabase Auth and CAPTCHA settings.
- Put only the Supabase URL and publishable/anonymous key in front-end build configuration. Keep all privileged keys in Supabase-managed function secrets or owner-controlled administrative environments.

## 19. Required documentation

The README must explain:

- supported browsers and platforms;
- prerequisites, including Node, the Supabase CLI and a container runtime for local integration tests;
- local installation and development commands;
- unit, integration, audit and production-build commands;
- dedicated Supabase project setup;
- database migrations and Edge Function deployment;
- synthetic Auth identities and their accepted visibility limitation;
- public registration, CAPTCHA, throttling, fixed slots and account administration;
- password rules and plan-dependent password protections;
- environment variables and secret placement;
- authoritative action replay, scoring assumptions and the automation limitation;
- GitHub Pages deployment, allowed origins and meta-CSP limitations;
- security assumptions and known limitations;
- the cross-browser manual test checklist when required.

Include concise game instructions for players in the application itself.

## 20. Non-goals for the first version

Do not add:

- real maps, GPS or GPX files;
- chat or comments;
- multiplayer gameplay;
- payments, advertisements or analytics;
- social-network login;
- password verification implemented by application code;
- an administrator interface;
- multiple mountain routes;
- external weather APIs;
- a reverse proxy or alternative production host solely for security headers;
- anti-automation or anti-cheat guarantees beyond server validation and replay of the submitted action log.

## 21. Definition of done

The first version is complete only when:

1. the first eight users can register publicly with case-insensitively unique usernames and valid passwords, then sign in, play, save and resume;
2. a ninth Auth account cannot be created through concurrent, public or administrative creation paths;
3. failed creation does not consume a slot, deletion releases one, and disabling does not;
4. a disabled authenticated user immediately loses protected server access and the supported interface shows the disabled state at its next check;
5. one user cannot read or alter another user's private data;
6. the four outcomes, deterministic events and score breakdown work correctly;
7. saved action logs replay deterministically after reload;
8. the server ignores supplied scores and writes only replay-validated, immutable results;
9. only safe-return outcomes are eligible for the leaderboard, which reveals exactly the approved public fields;
10. unit and isolated server integration tests pass;
11. the dependency audit has no unresolved high-severity production issue and the production build succeeds;
12. no password, personal email, secret/service-role key or other privileged secret exists in repository or built files;
13. the interface is usable at 320 CSS pixels and on representative supported desktop and mobile browsers;
14. the README contains enough information for the owner to configure, test, deploy and administer the application.

At handoff, list separately:

- completed code and automated verification;
- manual browser/device checks performed or still required;
- owner-only Supabase, CAPTCHA, origin and GitHub Pages setup actions;
- any plan-dependent Supabase protection that remains unavailable.
