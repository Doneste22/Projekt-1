#!/usr/bin/env node
'use strict';

/**
 * setup-package-manager.js — legt fest, welcher Paketmanager für dieses
 * Projekt gilt, und liest die aktuelle Einstellung wieder aus.
 *
 *   node scripts/setup-package-manager.js --global  pnpm
 *   node scripts/setup-package-manager.js --project bun
 *   node scripts/setup-package-manager.js --local   yarn
 *   node scripts/setup-package-manager.js --detect
 *
 * Geschrieben wird jeweils der Schlüssel env.CLAUDE_PACKAGE_MANAGER in einer
 * settings.json — global in ~/.claude, projektweit in <root>/.claude. Die
 * Umgebungsvariable CLAUDE_PACKAGE_MANAGER hat immer Vorrang.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ENV_KEY = 'CLAUDE_PACKAGE_MANAGER';
const SUPPORTED = ['npm', 'pnpm', 'yarn', 'bun'];
const DEFAULT_PM = 'npm';

/* ------------------------------------------------------------------ Pfade */

function globalConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

/** Projektwurzel: nach oben suchen bis .git oder package.json, sonst cwd. */
function findProjectRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (
      fs.existsSync(path.join(dir, '.git')) ||
      fs.existsSync(path.join(dir, 'package.json'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

function scopePath(scope, root) {
  switch (scope) {
    case 'global':
      return path.join(globalConfigDir(), 'settings.json');
    case 'project':
      return path.join(root, '.claude', 'settings.json');
    case 'local':
      return path.join(root, '.claude', 'settings.local.json');
    default:
      throw new Error(`Unbekannter Geltungsbereich: ${scope}`);
  }
}

/* ------------------------------------------------------------------- I/O */

function readSettings(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
  if (raw.trim() === '') return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('erwartet wird ein JSON-Objekt');
    }
    return parsed;
  } catch (err) {
    throw new Error(`${file} lässt sich nicht lesen: ${err.message}`);
  }
}

function writeSettings(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

function settingValue(file) {
  const env = readSettings(file).env;
  if (env && typeof env === 'object' && typeof env[ENV_KEY] === 'string') {
    return env[ENV_KEY].trim() || null;
  }
  return null;
}

/* ------------------------------------------------------------- Erkennung */

/** Aus dem Projekt selbst ableiten: packageManager-Feld, dann Lockfiles. */
function detectFromProject(root) {
  const pkgFile = path.join(root, 'package.json');
  if (fs.existsSync(pkgFile)) {
    try {
      const field = JSON.parse(fs.readFileSync(pkgFile, 'utf8')).packageManager;
      if (typeof field === 'string') {
        const name = field.split('@')[0].trim();
        if (SUPPORTED.includes(name)) {
          return { value: name, source: `package.json (packageManager: ${field})` };
        }
      }
    } catch (err) {
      // Kaputte package.json blockiert die Erkennung nicht.
    }
  }

  const lockfiles = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['package-lock.json', 'npm'],
  ];
  for (const [file, pm] of lockfiles) {
    if (fs.existsSync(path.join(root, file))) {
      return { value: pm, source: `Lockfile ${file}` };
    }
  }
  return null;
}

/**
 * Auflösung in fester Reihenfolge. Der erste Treffer gewinnt, die übrigen
 * Kandidaten werden für --detect trotzdem mitgeführt.
 */
function resolve(root) {
  const candidates = [];

  const fromEnv = (process.env[ENV_KEY] || '').trim();
  if (fromEnv) {
    candidates.push({ value: fromEnv, source: `Umgebungsvariable ${ENV_KEY}` });
  }

  for (const scope of ['local', 'project', 'global']) {
    const file = scopePath(scope, root);
    let value = null;
    try {
      value = settingValue(file);
    } catch (err) {
      candidates.push({ value: null, source: file, error: err.message });
      continue;
    }
    if (value) candidates.push({ value, source: file, scope });
  }

  const fromProject = detectFromProject(root);
  if (fromProject) candidates.push(fromProject);

  const winner = candidates.find((c) => c.value);
  return {
    packageManager: winner ? winner.value : DEFAULT_PM,
    source: winner ? winner.source : `Vorgabe (${DEFAULT_PM})`,
    supported: winner ? SUPPORTED.includes(winner.value) : true,
    candidates,
  };
}

/* ------------------------------------------------------------- Kommandos */

function setPackageManager(scope, pm, root) {
  const file = scopePath(scope, root);
  const settings = readSettings(file);
  if (!settings.env || typeof settings.env !== 'object' || Array.isArray(settings.env)) {
    settings.env = {};
  }
  const previous = typeof settings.env[ENV_KEY] === 'string' ? settings.env[ENV_KEY] : null;
  settings.env[ENV_KEY] = pm;
  writeSettings(file, settings);
  return { file, previous };
}

function unsetPackageManager(scope, root) {
  const file = scopePath(scope, root);
  const settings = readSettings(file);
  const env = settings.env;
  if (!env || typeof env !== 'object' || !(ENV_KEY in env)) {
    return { file, removed: null };
  }
  const removed = env[ENV_KEY];
  delete env[ENV_KEY];
  if (Object.keys(env).length === 0) delete settings.env;
  writeSettings(file, settings);
  return { file, removed };
}

function reportDetect(result, asJson) {
  if (asJson) {
    console.log(
      JSON.stringify(
        {
          packageManager: result.packageManager,
          source: result.source,
          supported: result.supported,
          candidates: result.candidates,
        },
        null,
        2
      )
    );
    return;
  }
  console.log(`Paketmanager: ${result.packageManager}`);
  console.log(`Quelle:       ${result.source}`);
  if (!result.supported) {
    console.log(`Hinweis:      unbekannter Wert, bekannt sind ${SUPPORTED.join(', ')}`);
  }
  for (const c of result.candidates) {
    if (c.error) console.warn(`Warnung:      ${c.error} — Datei wird übergangen.`);
  }
  const winnerIndex = result.candidates.findIndex((c) => c.value);
  const others = result.candidates.filter((c, idx) => c.value && idx !== winnerIndex);
  if (others.length) {
    console.log('Überstimmt:');
    for (const c of others) {
      console.log(`  - ${c.value} aus ${c.source}`);
    }
  }
}

const USAGE = `setup-package-manager — Paketmanager für dieses Projekt festlegen

Verwendung:
  node scripts/setup-package-manager.js --detect [--json]
  node scripts/setup-package-manager.js --global  <${SUPPORTED.join('|')}>
  node scripts/setup-package-manager.js --project <${SUPPORTED.join('|')}>
  node scripts/setup-package-manager.js --local   <${SUPPORTED.join('|')}>
  node scripts/setup-package-manager.js --unset --global|--project|--local

Optionen:
  --detect        aktuelle Einstellung samt Quelle ausgeben
  --json          Ausgabe von --detect als JSON
  --global  <pm>  in ${path.join('~', '.claude', 'settings.json')} schreiben
  --project <pm>  in <Projektwurzel>/.claude/settings.json schreiben (eingecheckt)
  --local   <pm>  in <Projektwurzel>/.claude/settings.local.json schreiben (nicht eingecheckt)
  --unset         den Eintrag im angegebenen Bereich wieder entfernen
  --root <pfad>   Projektwurzel explizit setzen
  -h, --help      diese Hilfe

Vorrang: ${ENV_KEY} > settings.local.json > settings.json (Projekt) >
settings.json (global) > packageManager-Feld/Lockfile > ${DEFAULT_PM}.`;

function parseArgs(argv) {
  const opts = { sets: [], detect: false, json: false, unset: false, help: false, root: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--detect':
        opts.detect = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--unset':
        opts.unset = true;
        break;
      case '--root':
        opts.root = argv[++i];
        if (!opts.root) throw new Error('--root erwartet einen Pfad');
        break;
      case '--global':
      case '--project':
      case '--local': {
        const scope = arg.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith('-')) {
          opts.sets.push({ scope, value: next });
          i += 1;
        } else {
          opts.sets.push({ scope, value: null });
        }
        break;
      }
      default:
        throw new Error(`Unbekanntes Argument: ${arg}`);
    }
  }
  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`Fehler: ${err.message}\n`);
    console.error(USAGE);
    return 2;
  }

  if (opts.help || argv.length === 0) {
    console.log(USAGE);
    return opts.help ? 0 : 2;
  }

  const root = opts.root ? path.resolve(opts.root) : findProjectRoot(process.cwd());

  if (opts.unset) {
    if (opts.sets.length === 0) {
      console.error('Fehler: --unset braucht --global, --project oder --local.');
      return 2;
    }
    for (const { scope, value } of opts.sets) {
      if (value) {
        console.error(`Fehler: --unset und ein Wert (${value}) schließen sich aus.`);
        return 2;
      }
      const { file, removed } = unsetPackageManager(scope, root);
      console.log(
        removed
          ? `Entfernt: ${ENV_KEY}=${removed} aus ${file}`
          : `Nichts zu entfernen: ${ENV_KEY} steht nicht in ${file}`
      );
    }
    return 0;
  }

  for (const { scope, value } of opts.sets) {
    if (!value) {
      console.error(`Fehler: --${scope} erwartet einen Wert (${SUPPORTED.join(', ')}).`);
      return 2;
    }
    if (!SUPPORTED.includes(value)) {
      console.error(`Fehler: unbekannter Paketmanager "${value}". Erlaubt: ${SUPPORTED.join(', ')}.`);
      return 2;
    }
    const { file, previous } = setPackageManager(scope, value, root);
    console.log(
      previous && previous !== value
        ? `Gesetzt: ${ENV_KEY}=${value} in ${file} (vorher ${previous})`
        : `Gesetzt: ${ENV_KEY}=${value} in ${file}`
    );
  }

  if (opts.detect || opts.sets.length === 0) {
    reportDetect(resolve(root), opts.json);
  } else {
    const result = resolve(root);
    if (result.candidates.length && result.candidates[0].source.startsWith('Umgebungsvariable')) {
      console.log(
        `Hinweis: ${ENV_KEY}=${result.candidates[0].value} ist in dieser Shell gesetzt und ` +
          'überstimmt die Datei. Neue Sitzung starten oder Variable löschen.'
      );
    }
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`Fehler: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { resolve, setPackageManager, unsetPackageManager, SUPPORTED, ENV_KEY };
