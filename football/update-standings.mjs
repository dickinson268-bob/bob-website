// Pulls the eight league tables and writes standings.json next to index.html.
// Run it with:  API_FOOTBALL_KEY=xxxx node update-standings.mjs
//
// Costs 8 API calls per run. The free API-Football plan allows 100 a day,
// so four runs a day leaves plenty of headroom.

import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.API_FOOTBALL_KEY;
if (!KEY) { console.error('Set API_FOOTBALL_KEY first.'); process.exit(1); }

const config = JSON.parse(await readFile('players.json', 'utf8'));
const SEASON = config.season;          // 2026 = the 2026/27 season
const OUT = 'standings.json';

// Keep last week's numbers so the page can show movement, and so one bad
// API day never wipes the board.
let previous = null;
try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* first run */ }

async function fetchTable(league) {
  const url = `https://v3.football.api-sports.io/standings?league=${league.apiFootballId}&season=${SEASON}`;
  const res = await fetch(url, { headers: { 'x-apisports-key': KEY } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();

  if (body.errors && Object.keys(body.errors).length) {
    throw new Error(JSON.stringify(body.errors));
  }
  // response[0].league.standings is an array of groups; a straight league has one.
  const group = body.response?.[0]?.league?.standings?.[0];
  if (!group?.length) throw new Error('no standings returned — check the league id and season');

  return {
    name: `${league.country} ${league.name}`,
    teams: group.map(row => ({ rank: row.rank, name: row.team.name, played: row.all.played, points: row.points }))
  };
}

const leagues = {};
const failed = [];

for (const league of config.leagues) {
  try {
    leagues[league.key] = await fetchTable(league);
    console.log(`ok   ${league.key.padEnd(18)} ${leagues[league.key].teams.length} teams`);
  } catch (err) {
    failed.push(`${league.key}: ${err.message}`);
    // fall back to whatever we had last time rather than dropping the league
    if (previous?.leagues?.[league.key]) {
      leagues[league.key] = previous.leagues[league.key];
      console.warn(`old  ${league.key.padEnd(18)} kept last run's table (${err.message})`);
    } else {
      console.error(`FAIL ${league.key.padEnd(18)} ${err.message}`);
    }
  }
  await new Promise(r => setTimeout(r, 400)); // be gentle with the rate limit
}

const out = {
  updated: new Date().toISOString(),
  source: 'api-football',
  season: SEASON,
  failed,
  leagues
};

await writeFile(OUT, JSON.stringify(out, null, 1));
console.log(`\nwrote ${OUT}${failed.length ? ` with ${failed.length} problem(s)` : ''}`);

// Warn about any pick that won't resolve, before anyone sees a dash on the page.
const norm = s => s.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\b(FC|AFC|THE)\b/g, ' ').replace(/\s+/g, ' ').trim();
const unmatched = new Set();
for (const player of config.players) {
  for (const league of config.leagues) {
    const picked = player.picks[league.key];
    const table = leagues[league.key]?.teams || [];
    const target = norm(config.aliases[picked] || picked);
    const hit = table.some(t => {
      const n = norm(t.name);
      return n === target || n.startsWith(target) || target.startsWith(n);
    });
    if (!hit) unmatched.add(`${league.key}: ${picked} (alias "${config.aliases[picked] || '—'}")`);
  }
}
if (unmatched.size) {
  console.warn('\nPicks that need an alias in players.json:');
  for (const u of unmatched) console.warn('  ' + u);
}
