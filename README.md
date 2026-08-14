# Summit Challenge

Summit Challenge is a planned browser-based hiking strategy game. The player must reach a fictional mountain summit and return safely while managing energy, hydration, daylight, food, water, equipment, route choices and changing weather.

## Project status

The project is currently in the specification stage. Development has not started yet. Version 3 is the current implementation specification.

## Game overview

The route starts and ends at a car park and includes intermediate stages, junctions and a summit. At junctions, players choose between shorter, steeper and riskier paths or longer, gentler and safer alternatives.

During a game, players can:

- choose paths and continue walking;
- rest, eat and drink;
- use a rain jacket, torch or first-aid kit when relevant;
- inspect route and resource information;
- turn back, pause and save, or abandon the route.

Deterministic random events include fog, rain, strong wind, minor ankle pain, confusing junctions and favourable weather. Reaching the summit is not enough: a successful attempt requires a safe return to the car park.

## Planned architecture

The current specification intentionally keeps the project local and lightweight:

- Vite, semantic HTML, modern CSS and vanilla JavaScript modules;
- IndexedDB for local profiles, saved games and score history;
- up to eight pseudonymous profiles per browser storage origin;
- local personal scores and a casual local leaderboard;
- validated JSON profile export and import for manual backup or transfer;
- Vitest for automated tests;
- a static production build deployed through GitHub Pages.

There is no backend, account authentication, password handling, cookie-based identity, IP collection, analytics or external runtime API. Local profiles and scores can be inspected or edited through browser tools, so they are intended for testing and casual fun rather than trusted competition.

## Specifications

- [Version 3 — current local-only specification](docs/specifications/summit-challenge-specification-v3.md)
- [Version 2 — archived Supabase specification](docs/specifications/summit-challenge-specification-v2.md)
- [Version 1 — original specification](docs/specifications/summit-challenge-specification-v1.md)

Version 3 contains the complete planned requirements, security assumptions, accessibility goals, test expectations and definition of done.

## Design documentation

- [Project design overview, Version 3 — current](docs/design-overview-v3.md) — separates development capability, system architecture and processes, and production deliverables and use.
- [Project design overview, Version 2 — archived](docs/design-overview-v2.md) — separates product runtime architecture from development, verification and delivery responsibilities.
- [Project design overview, Version 1 — archived](docs/design-overview-v1.md) — original combined product and delivery overview.
