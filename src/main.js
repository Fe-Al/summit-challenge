import './styles.css';
import { ACTIONS, applyAction, availablePathChoices, createGame, estimatedDistanceRemaining, walkingPreview } from './game.js';
import { DIFFICULTIES } from './data/difficulty.js';
import { EVENT_BY_ID } from './data/events.js';
import { NODES } from './data/route.js';
import { createProfile, MAX_PROFILES } from './profiles.js';
import { bestResultPerProfile, resultFromGame } from './scoring.js';
import { storage, StorageError } from './storage.js';
import { createExportBundle, MAX_IMPORT_BYTES, parseImportText, resolveImport, safeExportFilename, serialiseBundle } from './transfer.js';

const main = document.querySelector('#main-content');
const announcer = document.querySelector('#announcer');
const profileIndicator = document.querySelector('#profile-indicator');
const selectionKey = 'summitChallengeSelectedProfile';
let profiles = [];
let selectedProfile = null;
let pendingImport = null;

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) for (const [name, value] of Object.entries(options.attrs)) node.setAttribute(name, value);
  if (options.on) for (const [event, listener] of Object.entries(options.on)) node.addEventListener(event, listener);
  for (const child of Array.isArray(children) ? children : [children]) if (child) node.append(child);
  return node;
}

const button = (text, onClick, className = 'button') => element('button', { text, className, attrs: { type: 'button' }, on: { click: onClick } });
const linkButton = (text, hash, className = 'button button-secondary') => element('a', { text, className, attrs: { href: hash } });

function announce(message) {
  announcer.textContent = '';
  requestAnimationFrame(() => { announcer.textContent = message; });
}

function showError(error) {
  const message = error instanceof StorageError ? error.message : error?.message || 'Something went wrong.';
  main.replaceChildren(
    element('section', { className: 'panel narrow' }, [
      element('h1', { text: 'Unable to continue' }),
      element('p', { text: message, attrs: { role: 'alert' } }),
      button('Try again', () => renderRoute()),
      linkButton('Manage profiles', '#/profiles'),
    ]),
  );
  announce(message);
}

function navigate(hash, replace = false) {
  if (replace) window.location.replace(hash);
  else window.location.hash = hash;
}

async function refreshProfiles() {
  profiles = await storage.listProfiles();
  const selectedId = sessionStorage.getItem(selectionKey);
  selectedProfile = profiles.find((profile) => profile.id === selectedId) ?? null;
  if (!selectedProfile) sessionStorage.removeItem(selectionKey);
  profileIndicator.textContent = selectedProfile ? `Local player: ${selectedProfile.username}` : 'No local player selected';
}

function selectProfile(profile) {
  sessionStorage.setItem(selectionKey, profile.id);
  selectedProfile = profile;
  profileIndicator.textContent = `Local player: ${profile.username}`;
  navigate('#/menu', true);
}

function page(title, intro, children = []) {
  return element('section', { className: 'page' }, [
    element('div', { className: 'page-heading' }, [element('p', { className: 'eyebrow', text: 'Mount Aurora' }), element('h1', { text: title }), intro ? element('p', { text: intro }) : null]),
    ...children,
  ]);
}

function localDataNotice() {
  return element('aside', { className: 'notice' }, [
    element('h2', { text: 'Local profiles, not accounts' }),
    element('p', { text: 'Profiles have no passwords and exist only in this browser’s storage. Anyone using this browser profile can select them. Clearing site data can erase them; export a profile to make a manual backup.' }),
  ]);
}

async function renderProfiles() {
  await refreshProfiles();
  const form = element('form', { className: 'stack' });
  const inputId = 'new-username';
  const input = element('input', { attrs: { id: inputId, name: 'username', required: '', minlength: '3', maxlength: '20', pattern: '[A-Za-z0-9_]{3,20}', autocomplete: 'off', spellcheck: 'false' } });
  const error = element('p', { className: 'form-error', attrs: { role: 'alert' } });
  const submit = element('button', { className: 'button', text: 'Create local profile', attrs: { type: 'submit' } });
  if (profiles.length >= MAX_PROFILES) { input.disabled = true; submit.disabled = true; error.textContent = 'This browser already has the maximum of eight local profiles.'; }
  form.append(element('label', { text: 'Display username', attrs: { for: inputId } }), input, element('p', { className: 'hint', text: 'Use 3–20 ASCII letters, digits or underscores. Do not use personal information.' }), submit, error);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const profile = createProfile(input.value, profiles);
      await storage.addProfile(profile);
      announce(`${profile.username} was created.`);
      selectProfile(profile);
    } catch (caught) { error.textContent = caught.message; announce(caught.message); }
  });

  const list = element('div', { className: 'profile-list' });
  if (!profiles.length) list.append(element('p', { text: 'No local profiles exist yet.' }));
  for (const profile of profiles) {
    const actions = element('div', { className: 'button-row' }, [
      button(selectedProfile?.id === profile.id ? 'Selected' : 'Select', () => selectProfile(profile)),
      button('Delete', () => showDeleteConfirmation(profile), 'button button-danger-outline'),
    ]);
    list.append(element('article', { className: 'profile-card' }, [
      element('div', {}, [element('h3', { text: profile.username }), element('p', { className: 'hint', text: `Created ${formatDate(profile.createdAt)}` })]), actions,
    ]));
  }

  main.replaceChildren(page('Local profiles', 'Choose a pseudonymous local player or create one.', [
    localDataNotice(),
    element('div', { className: 'two-column' }, [
      element('section', { className: 'panel' }, [element('h2', { text: `Profiles (${profiles.length}/${MAX_PROFILES})` }), list]),
      element('section', { className: 'panel' }, [element('h2', { text: 'Create a profile' }), form]),
    ]),
    element('div', { className: 'button-row' }, [linkButton('Import or export', '#/transfer'), selectedProfile ? linkButton('Main menu', '#/menu') : null]),
  ]));
}

function showDeleteConfirmation(profile) {
  const input = element('input', { attrs: { id: 'confirm-delete', autocomplete: 'off', spellcheck: 'false' } });
  const error = element('p', { className: 'form-error', attrs: { role: 'alert' } });
  const dialog = element('section', { className: 'panel danger-panel', attrs: { 'aria-labelledby': 'delete-title' } }, [
    element('h2', { text: `Delete ${profile.username}?`, attrs: { id: 'delete-title' } }),
    element('p', { text: `This permanently removes ${profile.username}’s active game and complete local history. It cannot be undone unless you have an export.` }),
    element('label', { text: `Type ${profile.username} to confirm`, attrs: { for: 'confirm-delete' } }), input, error,
    element('div', { className: 'button-row' }, [
      button('Delete permanently', async () => {
        if (input.value !== profile.username) { error.textContent = 'The profile name does not match.'; return; }
        try {
          await storage.deleteProfile(profile.id);
          if (selectedProfile?.id === profile.id) sessionStorage.removeItem(selectionKey);
          announce(`${profile.username} and all owned local records were deleted.`);
          await renderProfiles();
        } catch (caught) { error.textContent = caught.message; }
      }, 'button button-danger'),
      button('Cancel', () => renderProfiles(), 'button button-secondary'),
    ]),
  ]);
  main.prepend(dialog);
  input.focus();
}

async function requireProfile() {
  await refreshProfiles();
  if (!selectedProfile) { navigate('#/profiles', true); return false; }
  return true;
}

async function renderMenu() {
  if (!await requireProfile()) return;
  const game = await storage.getGame(selectedProfile.id);
  main.replaceChildren(page('Base camp', `Welcome, ${selectedProfile.username}. Your next decision starts here.`, [
    element('section', { className: 'hero-card' }, [
      element('div', {}, [element('p', { className: 'eyebrow', text: 'The objective' }), element('h2', { text: 'Summit, then return' }), element('p', { text: 'Manage energy, hydration, daylight and equipment. Reaching the summit is only half the challenge.' })]),
      element('div', { className: 'menu-actions' }, [
        linkButton('New game', '#/setup', 'button button-large'),
        game ? linkButton('Resume saved game', '#/game', 'button button-accent button-large') : null,
      ]),
    ]),
    element('nav', { className: 'menu-grid', attrs: { 'aria-label': 'Player menu' } }, [
      linkButton('Personal scores', '#/scores?view=personal', 'menu-card'),
      linkButton('Local leaderboard', '#/scores?view=leaderboard', 'menu-card'),
      linkButton('Manage profiles', '#/profiles', 'menu-card'),
      linkButton('Import / export', '#/transfer', 'menu-card'),
      linkButton('About local data', '#/about', 'menu-card'),
    ]),
  ]));
}

async function renderSetup() {
  if (!await requireProfile()) return;
  const existing = await storage.getGame(selectedProfile.id);
  const cards = Object.entries(DIFFICULTIES).map(([id, config]) => {
    const start = async () => {
      if (existing && !window.confirm('Starting a new game will replace your existing active save. Continue?')) return;
      const game = createGame({ profileId: selectedProfile.id, difficulty: id });
      await storage.saveGame(game, null, { replaceActive: Boolean(existing) });
      announce(`${config.label} game started.`);
      navigate('#/game', true);
    };
    return element('article', { className: 'difficulty-card' }, [
      element('h2', { text: config.label }),
      element('p', { text: `${config.daylightMinutes / 60} hours daylight · ${config.food} food · ${config.water} water` }),
      element('p', { className: 'hint', text: `Resource cost ×${config.costMultiplier}; score ×${config.scoreMultiplier}` }),
      button(`Start ${config.label}`, start),
    ]);
  });
  main.replaceChildren(page('Choose difficulty', 'Difficulty is fixed once the hike starts.', [
    existing ? element('div', { className: 'warning', text: 'You already have an active game. Starting a new one requires confirmation and replaces that save.' }) : null,
    element('div', { className: 'three-column' }, cards),
    element('section', { className: 'panel prose' }, [
      element('h2', { text: 'How to play' }),
      element('p', { text: 'Walk one complete route segment per turn. At junctions, select a route first. Eat, drink or rest when useful; only walking and resting can trigger an event. You may turn back before the summit. After reaching it, your actual outward route becomes the return path.' }),
      element('p', { text: 'After sunset, movement uses the torch’s 120-minute capacity. A crossing of sunset requires confirmation.' }),
    ]),
    linkButton('Back to menu', '#/menu'),
  ]));
}

function metric(label, value, danger = false) {
  return element('div', { className: `metric${danger ? ' metric-danger' : ''}` }, [element('dt', { text: label }), element('dd', { text: String(value) })]);
}

function formatDuration(minutes, daylightMinutes = null) {
  if (daylightMinutes !== null && minutes > daylightMinutes) {
    const after = Math.round(minutes - daylightMinutes);
    return `${Math.floor(daylightMinutes / 60)}h ${Math.round(daylightMinutes % 60)}m daylight used; ${after}m after dark`;
  }
  const value = Math.max(0, Math.round(minutes));
  return `${Math.floor(value / 60)}h ${value % 60}m`;
}

async function persistAction(game, action) {
  try {
    const next = applyAction(game, action);
    if (next.status === 'complete') {
      const result = resultFromGame(next);
      await storage.saveGame(next, result);
      sessionStorage.setItem('summitChallengeLastResult', result.id);
      announce(next.messages.at(-1));
      navigate('#/result', true);
    } else {
      await storage.saveGame(next);
      announce(next.messages.at(-1));
      await renderGame();
    }
  } catch (error) { announce(error.message); window.alert(error.message); }
}

async function renderGame() {
  if (!await requireProfile()) return;
  const game = await storage.getGame(selectedProfile.id);
  if (!game) { navigate('#/menu', true); return; }
  const node = NODES[game.position];
  const preview = walkingPreview(game);
  const choices = availablePathChoices(game);
  const event = game.pendingEvent ? EVENT_BY_ID[game.pendingEvent.id] : null;
  const daylightRemaining = game.daylightMinutes - game.elapsedMinutes;
  const resources = element('dl', { className: 'metrics' }, [
    metric('Energy', `${Math.round(game.energy)}/100`, game.energy <= 25),
    metric('Hydration', `${Math.round(game.hydration)}/100`, game.hydration <= 25),
    metric(daylightRemaining >= 0 ? 'Daylight left' : 'Time after dark', formatDuration(Math.abs(daylightRemaining)), daylightRemaining <= 60),
    metric('Food', game.food, game.food === 0), metric('Water', game.water, game.water === 0),
    metric('Torch', `${Math.round(game.torchMinutesRemaining)}m`, game.torchMinutesRemaining <= 30),
    metric('Weather', game.weather), metric('Distance walked', `${game.stats.distanceTravelled.toFixed(1)} km`),
    metric('Estimated distance remaining', `${estimatedDistanceRemaining(game).toFixed(1)} km`), metric('Elevation', `${node.elevation} m`),
  ]);
  const actionArea = element('section', { className: 'panel actions-panel' }, [element('h2', { text: event ? event.name : 'Available actions' })]);
  if (event) {
    actionArea.append(element('p', { text: event.message }));
    if (event.equipment === 'rainJacket' && game.equipment.rainJacket) actionArea.append(button('Use rain jacket', () => persistAction(game, { type: ACTIONS.USE_EQUIPMENT, equipment: 'rainJacket' }), 'button button-accent'));
    if (event.equipment === 'firstAid' && game.equipment.firstAid) actionArea.append(button('Use first-aid kit', () => persistAction(game, { type: ACTIONS.USE_EQUIPMENT, equipment: 'firstAid' }), 'button button-accent'));
    actionArea.append(button('Continue without equipment', () => persistAction(game, { type: ACTIONS.RESOLVE_EVENT }), 'button button-secondary'));
  } else {
    if (choices.length) {
      actionArea.append(element('p', { text: 'Choose a path. This does not advance time.' }));
      for (const choice of choices) actionArea.append(button(`${choice.name} — ${choice.distance} km, ${choice.minutes} min`, () => persistAction(game, { type: ACTIONS.CHOOSE_PATH, segmentId: choice.id })));
    }
    if (preview) {
      const walkLabel = `${game.mode === 'return' ? 'Return along' : 'Continue walking:'} ${preview.segment.name}`;
      const walk = async () => {
        let confirmed = false;
        if (preview.afterDarkMinutes > 0) confirmed = window.confirm(`This segment includes ${preview.afterDarkMinutes} minutes of movement after sunset and will use the torch. Continue?`);
        if (preview.afterDarkMinutes > 0 && !confirmed) return;
        await persistAction(game, { type: ACTIONS.WALK, confirmDark: confirmed });
      };
      const walkButton = button(walkLabel, walk, 'button button-accent');
      if (!preview.canWalk) { walkButton.disabled = true; walkButton.title = 'Not enough torch time'; }
      actionArea.append(walkButton);
      if (preview.afterDarkMinutes > 0) actionArea.append(element('p', { className: 'warning compact', text: `${preview.afterDarkMinutes} minutes will be after dark. ${preview.canWalk ? 'Confirmation is required.' : 'The remaining torch time is insufficient.'}` }));
    }
    if (game.elapsedMinutes < game.daylightMinutes) actionArea.append(button('Rest 20 minutes', () => persistAction(game, { type: ACTIONS.REST }), 'button button-secondary'));
    if (game.food > 0 && game.energy < 100) actionArea.append(button(`Eat (${game.food})`, () => persistAction(game, { type: ACTIONS.EAT }), 'button button-secondary'));
    if (game.water > 0 && game.hydration < 100) actionArea.append(button(`Drink (${game.water})`, () => persistAction(game, { type: ACTIONS.DRINK }), 'button button-secondary'));
    if (game.position !== 'carpark' && game.position !== 'summit' && game.mode === 'outbound') actionArea.append(button('Turn back', () => persistAction(game, { type: ACTIONS.TURN_BACK }), 'button button-secondary'));
  }
  const log = element('ol', { className: 'message-log' }, game.messages.map((message) => element('li', { text: message })));
  main.replaceChildren(page(game.summitReached ? 'Return safely' : 'Climb Mount Aurora', `${node.name} · ${DIFFICULTIES[game.difficulty].label}`, [
    resources,
    element('div', { className: 'game-layout' }, [actionArea, element('section', { className: 'panel' }, [element('h2', { text: 'Trail log' }), log])]),
    element('section', { className: 'equipment-strip' }, [
      element('h2', { text: 'Equipment' }),
      element('p', { text: `Rain jacket: available · First-aid kit: ${game.equipment.firstAid ? 'available' : 'used'} · Torch: ${Math.round(game.torchMinutesRemaining)} minutes` }),
    ]),
    element('div', { className: 'button-row' }, [
      button('Pause and save', async () => {
        const saved = { ...game, updatedAt: new Date().toISOString(), messages: [...game.messages.slice(-5), 'Game paused and saved locally.'] };
        await storage.saveGame(saved);
        announce('Game paused and saved locally.');
        navigate('#/menu');
      }, 'button button-secondary'),
      !game.pendingEvent ? button('Abandon route', () => { if (window.confirm('Abandon this route? The result will remain in personal history but score zero on the leaderboard.')) persistAction(game, { type: ACTIONS.ABANDON }); }, 'button button-danger-outline') : null,
    ]),
  ]));
}

const outcomeLabels = { summit_safe_return: 'Summit reached and safe return', safe_return: 'Safe return without reaching the summit', rescue: 'Rescue required', abandoned: 'Route abandoned' };

async function renderResult() {
  if (!await requireProfile()) return;
  const results = await storage.listResults(selectedProfile.id);
  const wanted = sessionStorage.getItem('summitChallengeLastResult');
  const result = results.find((item) => item.id === wanted) ?? results.sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  if (!result) { navigate('#/menu', true); return; }
  const components = Object.entries(result.score.components).map(([key, value]) => element('div', { className: 'score-line' }, [element('dt', { text: splitCamel(key) }), element('dd', { text: `${value >= 0 ? '+' : ''}${value}` })]));
  main.replaceChildren(page('Hike complete', outcomeLabels[result.summary.outcome], [
    element('section', { className: 'result-card' }, [
      element('p', { className: 'score-total', text: `${result.score.score} points` }),
      !result.score.eligible ? element('p', { className: 'warning', text: `This outcome is not leaderboard eligible. Its calculated pre-eligibility score was ${result.score.preEligibilityScore}.` }) : null,
      element('dl', { className: 'score-breakdown' }, [...components, element('div', { className: 'score-line total' }, [element('dt', { text: `Subtotal × ${result.score.difficultyMultiplier}` }), element('dd', { text: String(result.score.preEligibilityScore) })])]),
    ]),
    element('div', { className: 'button-row' }, [linkButton('New game', '#/setup', 'button'), linkButton('Main menu', '#/menu'), linkButton('View scores', '#/scores')]),
  ]));
}

async function renderScores() {
  if (!await requireProfile()) return;
  const [allResults] = await Promise.all([storage.listResults()]);
  const personal = allResults.filter((result) => result.profileId === selectedProfile.id).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const profileNames = new Map(profiles.map((profile) => [profile.id, profile.username]));
  const table = (rows, includeName) => {
    const tableNode = element('table');
    const headCells = [...(includeName ? ['Player'] : []), 'Score', 'Difficulty', 'Outcome', 'Completed'].map((text) => element('th', { text, attrs: { scope: 'col' } }));
    tableNode.append(element('thead', {}, element('tr', {}, headCells)));
    const body = element('tbody');
    for (const result of rows) body.append(element('tr', {}, [
      includeName ? element('th', { text: profileNames.get(result.profileId) ?? 'Unknown', attrs: { scope: 'row' } }) : null,
      element('td', { text: String(result.score.score) }), element('td', { text: DIFFICULTIES[result.summary.difficulty]?.label ?? result.summary.difficulty }),
      element('td', { text: outcomeLabels[result.summary.outcome] ?? result.summary.outcome }), element('td', { text: formatDate(result.completedAt) }),
    ]));
    tableNode.append(body);
    return element('div', { className: 'table-scroll' }, tableNode);
  };
  const best = bestResultPerProfile(allResults);
  main.replaceChildren(page('Scores', 'Results are stored only in this browser and can be edited with developer tools. This is a casual leaderboard, not trusted competition.', [
    element('section', { className: 'panel' }, [element('h2', { text: `${selectedProfile.username}’s history` }), personal.length ? table(personal, false) : element('p', { text: 'No completed hikes yet.' })]),
    element('section', { className: 'panel' }, [element('h2', { text: 'Local best by profile' }), best.length ? table(best, true) : element('p', { text: 'No leaderboard-eligible results yet.' })]),
    linkButton('Back to menu', '#/menu'),
  ]));
}

async function downloadExport(profile) {
  const data = await storage.getBundle(profile.id);
  const bundle = createExportBundle(data);
  const url = URL.createObjectURL(new Blob([serialiseBundle(bundle)], { type: 'application/json;charset=utf-8' }));
  const anchor = element('a', { attrs: { href: url, download: safeExportFilename(profile.username) } });
  document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  announce(`Export created for ${profile.username}.`);
}

async function renderTransfer(message = '') {
  await refreshProfiles();
  const status = element('p', { className: 'form-error', text: message, attrs: { role: 'status' } });
  const fileInput = element('input', { attrs: { id: 'import-file', type: 'file', accept: 'application/json,.json' } });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('The selected file is larger than 1 MiB.');
      const bundle = parseImportText(await file.text(), file.size);
      const resolution = resolveImport(bundle, profiles);
      pendingImport = resolution;
      if (resolution.kind === 'replace') { await renderImportConfirmation(`A profile with ID ${bundle.profile.id} already exists. Compare the username shown and explicitly confirm replacement.`, true); return; }
      if (resolution.kind === 'rename_required') { await renderImportRename(bundle); return; }
      await storage.importBundle(resolution.bundle);
      pendingImport = null;
      await renderTransfer(`${bundle.profile.username} was imported successfully.`);
    } catch (error) { status.textContent = error.message; announce(error.message); }
  });
  const exportList = element('div', { className: 'profile-list' });
  for (const profile of profiles) exportList.append(element('div', { className: 'profile-card' }, [element('strong', { text: profile.username }), button('Export profile', () => downloadExport(profile))]));
  main.replaceChildren(page('Import and export', 'Manual JSON files let you back up or transfer one local profile.', [
    element('div', { className: 'two-column' }, [
      element('section', { className: 'panel' }, [element('h2', { text: 'Export' }), element('p', { text: 'The file contains the displayed username, active game and complete history. Store it accordingly; it is not encrypted or proof of identity.' }), exportList]),
      element('section', { className: 'panel' }, [element('h2', { text: 'Import' }), element('label', { text: 'Choose a Summit Challenge JSON export (maximum 1 MiB)', attrs: { for: 'import-file' } }), fileInput, element('p', { className: 'hint', text: 'Files are validated before any local data is changed. Scores are recalculated.' }), status]),
    ]),
    element('div', { className: 'button-row' }, [selectedProfile ? linkButton('Back to menu', '#/menu') : null, linkButton('Manage profiles', '#/profiles')]),
  ]));
}

async function renderImportConfirmation(message) {
  const bundle = pendingImport.bundle;
  const existing = profiles.find((profile) => profile.id === bundle.profile.id);
  const input = element('input', { attrs: { id: 'replace-name', autocomplete: 'off' } });
  const error = element('p', { className: 'form-error', attrs: { role: 'alert' } });
  main.replaceChildren(page('Confirm profile replacement', message, [
    element('section', { className: 'panel danger-panel' }, [
      element('dl', { className: 'comparison' }, [metric('Existing username', existing.username), metric('Imported username', bundle.profile.username), metric('Imported results', bundle.results.length)]),
      element('p', { text: 'Replacement deletes the existing active save and complete history for this exact profile ID, then imports the file in one transaction.' }),
      element('label', { text: `Type ${existing.username} to confirm`, attrs: { for: 'replace-name' } }), input, error,
      element('div', { className: 'button-row' }, [button('Replace profile', async () => {
        if (input.value !== existing.username) { error.textContent = 'The profile name does not match.'; return; }
        try { await storage.importBundle(bundle, { replace: true }); pendingImport = null; await renderTransfer(`${bundle.profile.username} was replaced from the export.`); }
        catch (caught) { error.textContent = caught.message; }
      }, 'button button-danger'), button('Cancel', () => { pendingImport = null; renderTransfer(); }, 'button button-secondary')]),
    ]),
  ]));
  input.focus();
}

async function renderImportRename(bundle) {
  const input = element('input', { attrs: { id: 'rename-import', minlength: '3', maxlength: '20', pattern: '[A-Za-z0-9_]{3,20}', autocomplete: 'off' } });
  const error = element('p', { className: 'form-error', attrs: { role: 'alert' } });
  main.replaceChildren(page('Choose a different username', `${bundle.profile.username} conflicts with another local profile. The imported profile ID will remain unchanged.`, [
    element('section', { className: 'panel narrow' }, [element('label', { text: 'New display username', attrs: { for: 'rename-import' } }), input, error,
      element('div', { className: 'button-row' }, [button('Import with new name', async () => {
        try { const resolution = resolveImport(bundle, profiles, input.value); await storage.importBundle(resolution.bundle); pendingImport = null; await renderTransfer(`${resolution.bundle.profile.username} was imported.`); }
        catch (caught) { error.textContent = caught.message; }
      }), button('Cancel', () => { pendingImport = null; renderTransfer(); }, 'button button-secondary')])]),
  ]));
  input.focus();
}

async function renderAbout() {
  await refreshProfiles();
  main.replaceChildren(page('About local data', 'Summit Challenge is designed for privacy and casual local play.', [
    localDataNotice(),
    element('section', { className: 'panel prose' }, [
      element('h2', { text: 'What the game stores' }),
      element('p', { text: 'The current site origin stores pseudonymous profiles, one active save per profile and completed results in IndexedDB. No account, password, email, IP address, fingerprint, cookie or analytics identifier is used.' }),
      element('h2', { text: 'Limits and recovery' }),
      element('p', { text: 'The eight-profile maximum applies separately to each browser storage origin. Other devices and browser profiles have their own storage. Clearing data, private browsing, browser removal or an origin/domain change can remove access. Export before clearing data or changing the production domain.' }),
      element('h2', { text: 'Security boundary' }),
      element('p', { text: 'Anyone with access to this browser profile can select or modify local records, including through developer tools. GitHub project sites owned by the same account normally share an origin, so the database name prevents accidental collisions but cannot isolate this data from another script on that origin.' }),
    ]),
    linkButton(selectedProfile ? 'Back to menu' : 'Profiles', selectedProfile ? '#/menu' : '#/profiles'),
  ]));
}

function formatDate(value) {
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); } catch { return value; }
}

function splitCamel(value) { return value.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase()); }

async function renderRoute() {
  try {
    const route = window.location.hash.slice(1).split('?')[0] || '/';
    if (route === '/') { await refreshProfiles(); navigate(selectedProfile ? '#/menu' : '#/profiles', true); return; }
    const routes = { '/profiles': renderProfiles, '/menu': renderMenu, '/setup': renderSetup, '/game': renderGame, '/result': renderResult, '/scores': renderScores, '/transfer': renderTransfer, '/about': renderAbout };
    const renderer = routes[route];
    if (!renderer) { navigate(selectedProfile ? '#/menu' : '#/profiles', true); return; }
    await renderer();
    main.focus({ preventScroll: true });
  } catch (error) { showError(error); }
}

window.addEventListener('hashchange', renderRoute);
window.addEventListener('pageshow', (event) => { if (event.persisted) renderRoute(); });
renderRoute();
