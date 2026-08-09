# Summit Challenge — Codex Implementation Specification

## Instructions to Codex

Build the first working version of the web game described below. Before editing anything, inspect the existing repository and preserve unrelated files and user changes. If the repository is empty, initialise the project using the structure described here.

Implement the smallest complete version first. Do not add features that are not requested. Do not invent credentials, commit secrets, or weaken authentication to simplify development. When finished, run the relevant checks and report what was implemented, what was tested, and any setup steps that still require the owner.

## 1. Product objective

Create a simple, attractive and responsive browser game called **Summit Challenge**. The player attempts to reach a mountain summit and return safely before daylight, energy or water runs out.

The game must:

- work on current desktop and mobile versions of Chrome, Firefox, Edge and Safari;
- be usable on Windows, Linux, Android and iOS;
- have a static front end deployable to GitHub Pages;
- use a secure external service for authentication and saved data;
- allow public self-registration for a maximum of eight accounts in total;
- require every player to sign in with an active account before playing;
- avoid storing passwords or privileged secrets in GitHub or browser code.

## 2. Technical architecture

Use:

- **Vite**, semantic HTML, modern CSS and vanilla JavaScript modules for the front end;
- **Supabase Auth**, Postgres and Row Level Security for authentication and persistent data;
- a **Supabase Edge Function** only where server-side handling is required;
- **Vitest** for unit tests;
- **GitHub Pages** for the production front end;
- a GitHub Actions workflow for build, test and Pages deployment.

Keep dependencies few and justified. Do not introduce a large front-end framework for this version.

The repository should contain at least:

```text
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
.env.example
README.md
```

The exact division into modules may be adjusted if the result remains clear and maintainable.

## 3. Authentication and authorisation

### Required behaviour

- Provide public self-registration using **username**, **password** and **confirm password** fields.
- Permit no more than **eight accounts in total**, including owner and test accounts created for this application.
- The eight-account limit must be enforced atomically on the server. Client-side counting or hiding the registration form is not sufficient. Simultaneous registration attempts must never create a ninth account.
- When eight accounts already exist, disable new registration and display a clear **“Registration is closed: the eight-account limit has been reached”** message.
- Disabled accounts continue to count towards the limit until the owner deletes them. Deleting an account makes one registration place available again.
- A successfully registered account is active and authorised to play immediately. The owner may later disable it.
- The visible sign-in form asks for **username** and **password**.
- Usernames are unique and are compared case-insensitively.
- Passwords are handled by Supabase Auth and are never stored in application tables, source files, logs or browser storage.
- Registration must validate username and password length and format on both client and server. Document the password requirements and use Supabase Auth's supported password protection and rate limits.
- Each account has an `authorised` flag that is set to true after successful registration. A correctly authenticated user whose account has subsequently been disabled sees a clear **“Account disabled”** message and cannot start, resume or save a game.
- A signed-in active user can sign out.
- Sessions may persist securely using the authentication provider's normal browser session handling.
- Do not place a Supabase service-role key in the front end, GitHub repository or GitHub Pages configuration.

### Username login implementation

Supabase Auth natively authenticates an identity such as an email rather than a public username. Preserve the username-and-password user experience by using server-side Edge Functions for registration and sign-in. The registration function must create the private Auth identity and username mapping without exposing an email address or privileged key to the browser. The functions must:

- accept only the fields needed for registration or sign-in over HTTPS;
- validate length and format before processing;
- return the same generic error for an unknown username and an incorrect password;
- never log or retain the password;
- enforce the eight-account limit with a database transaction, lock or fixed-slot reservation mechanism that is safe under concurrent requests;
- handle failed or interrupted registrations without permanently consuming a slot or leaving an unusable orphan account;
- rely on Supabase Auth rate limits and add function-level throttling to public registration and sign-in where needed;
- return only the session information required by the official Supabase client;
- keep the username-to-Auth-identity mapping inaccessible to ordinary clients.

If this flow cannot be implemented safely with the available Supabase version, do not create custom client-side password verification or an unenforced account limit. Document the blocker before substituting another authentication design.

### Owner setup

Document in the README how the owner:

1. verifies the current account count and the eight-account limit;
2. changes a user's `authorised` value;
3. disables or deletes an account;
4. understands when deleting an account releases a registration place;
5. changes or resets a password through Supabase's supported administrative process.

## 4. Screens and navigation

Build a single-page application with these views:

1. **Register or sign in** — separate registration and sign-in forms, validation messages and a clear notice when registration is closed.
2. **Account disabled** — explanation and sign-out button.
3. **Main menu** — New Game, Resume Game when one exists, Personal Scores, Leaderboard and Sign Out.
4. **Game setup** — difficulty choice and concise instructions.
5. **Game** — route status, resources, current situation, available actions and event messages.
6. **Result** — outcome, score, statistics and New Game/Main Menu actions.
7. **Scores** — the player's previous results and an authorised-player leaderboard.

The browser Back button must not expose another user's data or produce a broken state.

## 5. Game model

Use one fictional mountain route for the first version. Represent it as data rather than hard-coding it into the interface.

The route begins at a car park, passes through intermediate stages, reaches the summit, and returns to the car park. Include at least two junctions. At each junction the player chooses between:

- a shorter, steeper and riskier segment; and
- a longer, gentler and safer segment.

Each segment must define:

- name;
- distance in kilometres;
- ascent or descent in metres;
- expected minutes;
- energy cost;
- water cost;
- terrain risk;
- weather exposure.

Use a route-state model that makes returning and turning back logically consistent. Do not allow impossible jumps between stages.

## 6. Difficulty levels

Provide **Easy**, **Normal** and **Hard**. Difficulty may alter:

- initial energy and water;
- available daylight;
- event probability and severity;
- resource consumption.

Put all difficulty values in one configuration object so they can be tuned without changing the game logic.

## 7. Player actions

During a game, offer only actions that are valid in the current state:

- **Choose a path** at a junction.
- **Continue walking** along the selected segment.
- **Rest** to regain some energy while consuming daylight and a small amount of water.
- **Drink** to restore hydration by consuming one water portion.
- **Eat** to restore energy by consuming one food ration.
- **Use equipment** when relevant to the current event.
- **Check route information**, including current position, distance travelled, estimated distance remaining, elevation and daylight remaining.
- **Turn back**, creating a return journey from the current reachable position.
- **Pause and save** the current game.
- **Abandon the route**, ending the game without a score eligible for the leaderboard.

Prevent nonsensical actions, including eating with no food, drinking with no water, resting after the game has ended, or continuing on a route with no selected next segment.

## 8. Resources and equipment

Display these resources at all times during play:

- energy from 0 to 100;
- hydration from 0 to 100;
- remaining daylight in hours and minutes;
- food rations;
- water portions;
- current weather;
- distance travelled and distance remaining.

The initial equipment is fixed for the first version:

- rain jacket;
- torch;
- basic first-aid kit.

Equipment is only effective in a relevant situation. The torch allows movement after sunset but applies an additional risk and scoring penalty; it does not create unlimited daylight.

## 9. Random events

Include a small, data-driven event system with at least:

- fog;
- rain;
- strong wind;
- minor ankle pain;
- a temporarily confusing path junction;
- favourable weather.

Each event must define its triggering conditions, probability, effects and any useful equipment. Events must be generated from a seed stored with the saved game so that reloading a saved state cannot be used to obtain a different result for the same pending turn.

Keep events understandable. After every action, show a concise explanation of resource changes and event effects.

## 10. Outcomes

A game ends with exactly one of these outcomes:

- **Summit reached and safe return**;
- **Safe return without reaching the summit**;
- **Rescue required** because a critical resource or safety condition failed;
- **Route abandoned** by the player.

Reaching the summit alone is not a successful completion: the player must also return safely.

## 11. Scoring

Create one pure, tested scoring function. The score should reward:

- reaching the summit;
- returning safely;
- distance and elevation achieved;
- remaining energy, hydration and daylight;
- higher difficulty.

It should penalise:

- requiring rescue;
- moving after dark;
- abandoning the route.

Show a score breakdown on the result screen. Store the formula and constants in `scoring.js`; do not scatter score calculations through interface code.

Only completed, non-abandoned games may appear on the leaderboard. A rescue result may be saved in personal history but must not receive a positive leaderboard score.

## 12. Saving and data rules

An authorised user can have one active saved game and multiple completed results.

Persist:

- user profile and authorisation state;
- active game state;
- completed results;
- score breakdown;
- difficulty;
- start and completion timestamps;
- random seed;
- outcome and summary statistics.

Do not trust client-supplied ownership identifiers. Derive ownership from the authenticated session. Apply Row Level Security so that:

- users can read and update only their own profile fields that are safe to edit;
- users can read, create and update only their own active game;
- users can read only their own full game history;
- authorised users can read the limited fields required for the leaderboard;
- ordinary users cannot change `authorised`, roles or another user's data.

The owner may manage authorisation through the Supabase dashboard for this first version. Do not build an administrator screen.

## 13. Leaderboard

Show the best score per authorised user, ordered from highest to lowest. Display only:

- username;
- score;
- difficulty;
- outcome;
- completion date.

Do not expose email addresses, authentication identifiers or complete saved-game data.

## 14. Visual and accessibility requirements

Use a restrained mountain-inspired design with good contrast and no unnecessary animation.

- Mobile-first responsive layout.
- Touch targets at least 44 by 44 CSS pixels.
- Keyboard-accessible controls and visible focus styles.
- Semantic headings, labels and buttons.
- Status changes announced through an appropriate ARIA live region.
- Do not rely on colour alone to communicate resource danger.
- Respect `prefers-reduced-motion`.
- Prevent horizontal scrolling at a viewport width of 320 CSS pixels.

Use simple CSS graphics or icons that are safe to redistribute. Do not add copyrighted photographs or third-party assets unless their licence and attribution are documented.

## 15. Security requirements

- Treat all browser code and the Supabase publishable/anonymous key as public. Security must come from authentication, server-side validation and Row Level Security.
- Never expose the Supabase service-role key or other privileged credentials.
- Provide `.env.example` with placeholders only, and ignore real `.env` files.
- Validate and constrain all data on both client and server boundaries.
- Render user-provided names as text, never as HTML.
- Use parameterised database operations through the official client.
- Do not use `innerHTML` for untrusted content.
- Do not store passwords, session tokens or secrets in application logs.
- Add an appropriate Content Security Policy where compatible with GitHub Pages and the selected Supabase integration.
- Keep dependencies to a minimum and run an available dependency audit.

## 16. Tests

Add automated unit tests for at least:

- resource consumption;
- resting, eating and drinking;
- path selection and valid route transitions;
- turning back;
- deterministic random events from a saved seed;
- every terminal outcome;
- scoring and score breakdown;
- rejection of invalid actions;
- serialisation and restoration of a saved game.

Add server-side integration tests that verify:

- registration succeeds while fewer than eight accounts exist;
- a ninth account is rejected;
- concurrent registration attempts cannot exceed eight accounts;
- a failed registration does not permanently consume an account place;
- usernames remain unique when letter case differs;
- disabled accounts cannot access protected game data;
- one account cannot read or modify another account's private data.

Also perform a production build and verify the principal user flow at mobile and desktop widths. If browser automation is not available, provide a precise manual test checklist.

## 17. GitHub Pages deployment

- Configure Vite's base path correctly for a GitHub project site.
- Add a GitHub Actions workflow that installs locked dependencies, runs tests, builds the site and deploys the generated static files to GitHub Pages.
- Do not deploy when tests or the production build fail.
- Explain the required GitHub Pages settings in the README.
- Document the permitted production and local origins that must be configured in Supabase.

## 18. Required documentation

The README must explain:

- prerequisites;
- local installation and development commands;
- test and production-build commands;
- Supabase project setup;
- database migrations and Edge Function deployment;
- public registration, the eight-account limit and account administration;
- environment variables;
- GitHub Pages deployment;
- security assumptions and known limitations.

Include concise game instructions for players in the application itself.

## 19. Non-goals for the first version

Do not add:

- real maps, GPS or GPX files;
- chat or comments;
- multiplayer gameplay;
- payments, advertisements or analytics;
- social-network login;
- password handling implemented by application code;
- an administrator interface;
- multiple mountain routes;
- external weather APIs.

## 20. Definition of done

The first version is complete only when:

1. the first eight users can register publicly with unique usernames and passwords, and each can sign in, play, save and resume a game;
2. a ninth account cannot be created, including when multiple registration requests are made concurrently;
3. a disabled authenticated user cannot play or modify game data;
4. one user cannot read or alter another user's private data;
5. the four outcomes and score breakdown work correctly;
6. saved random events remain deterministic after reload;
7. the leaderboard reveals only the approved public fields;
8. unit and authentication integration tests pass;
9. the production build succeeds;
10. no password, service-role key or other privileged secret exists in the repository or built files;
11. the interface is usable at 320-pixel mobile width and on a desktop screen;
12. the README contains enough information for the owner to configure and deploy the project.

At handoff, list any owner-only setup actions separately from completed code work.
