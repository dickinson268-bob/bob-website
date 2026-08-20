// Fetches the eight league tables and writes standings.json next to index.html.
//
//   node update-standings.mjs
//
// Source: ESPN's own JSON endpoints — the ones that power espn.com's league
// tables. No key, no sign-up, no daily limit, and the positions update as
// results come in rather than at the end of a game week.
//
// These endpoints are undocumented, so ESPN could change them without warning.
// If a league starts failing, the script keeps the previous run's table and
// says so in the log rather than blanking the page.

import { readFile, writeFile } from 'node:fs/promises';

const config = JSON.parse(await readFile('players.json', 'utf8'));
const OUT = 'standings.json';

let previous = null;
try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* first run */ }

const stat = (entry, name) => entry.stats.find(s => s.name === name)?.value ?? 0;

async function fetchTable(league) {
  const url = `https://site.api.espn.com/apis/v2/sports/soccer/${league.espn}/standings`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const body = await res.json();
  // the current season sits in children[0]; note the /apis/v2/ path —
  // /apis/site/v2/ returns an empty object for standings
  const entries = body.children?.[0]?.standings?.entries;
  if (!entries?.length) throw new Error('no standings in the response');

  return {
    name: `${league.country} ${league.name}`,
    espn: league.espn,
    teams: entries
      .map(e => ({
        rank: stat(e, 'rank'),
        name: e.team.displayName,
        played: stat(e, 'gamesPlayed'),
        points: stat(e, 'points'),
        deductions: stat(e, 'deductions')
      }))
      .sort((a, b) => a.rank - b.rank)
  };
}

const leagues = {};
const failed = [];

for (const league of config.leagues) {
  try {
    leagues[league.key] = await fetchTable(league);
    const t = leagues[league.key].teams;
    console.log(`ok   ${league.key.padEnd(18)} ${t.length} teams, ${t[0].played} games played, top: ${t[0].name}`);
  } catch (err) {
    failed.push(`${league.key}: ${err.message}`);
    if (previous?.leagues?.[league.key]) {
      leagues[league.key] = previous.leagues[league.key];
      console.warn(`old  ${league.key.padEnd(18)} kept last run's table (${err.message})`);
    } else {
      console.error(`FAIL ${league.key.padEnd(18)} ${err.message}  <- ${league.espn}`);
    }
  }
  await new Promise(r => setTimeout(r, 300)); // be a good guest
}

await writeFile(OUT, JSON.stringify({
  updated: new Date().toISOString(),
  source: 'espn',
  season: config.season,
  failed,
  leagues
}, null, 1));
console.log(`\nwrote ${OUT}${failed.length ? ` with ${failed.length} problem(s)` : ''}`);

/* --- flag any pick that won't resolve, and say what it probably meant --- */
const norm = s => s.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function sharedStart(a, b) {
  let n = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { if (a[i] !== b[i]) break; n++; }
  return n;
}

const problems = new Map();
for (const league of config.leagues) {
  const table = leagues[league.key]?.teams || [];
  for (const picked of new Set(config.players.map(p => p.picks[league.key]))) {
    const want = norm(config.aliases[picked] || picked);
    if (table.some(t => norm(t.name) === want)) continue;

    const suggestions = table
      .map(t => ({ name: t.name, score: sharedStart(norm(t.name), want) }))
      .filter(s => s.score > 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => `"${s.name}"`);
    problems.set(`${league.key} / ${picked}`, suggestions.join(' or ') || 'nothing similar in this division');
  }
}

if (problems.size) {
  console.warn('\nThese picks did not match a club. Put the right spelling into "aliases" in players.json:');
  for (const [pick, suggestion] of problems) console.warn(`  ${pick.padEnd(36)} did you mean ${suggestion}?`);
} else {
  console.log('every pick matched a club');
}
