# Eight From Eight — live prediction league

A static page ranking the 39 entries by the combined league positions of their
eight picks. No server, no database, no API key: a scheduled job writes a JSON
file, the page reads it.

```
players.json          the 39 entries, their picks, the club-name aliases, any points deductions
update-standings.mjs  downloads results, builds the eight tables, writes standings.json
standings.json        created by the script above
index.html            the page — reads the two JSON files above
```

## Where the data comes from

ESPN's own JSON endpoints — the ones that power the league tables on espn.com.
No key, no sign-up, no daily limit, and positions update as results come in.

```
https://site.api.espn.com/apis/v2/sports/soccer/{league}/standings
```

| Our league | ESPN slug |
|---|---|
| Premier League | `eng.1` |
| Championship | `eng.2` |
| League One | `eng.3` |
| League Two | `eng.4` |
| National League | `eng.5` |
| Scottish Championship | `sco.2` |
| Scottish League One | `sco.3` |
| Scottish League Two | `sco.4` |

Note the `/apis/v2/` path. The more commonly seen `/apis/site/v2/` returns an
empty object for standings.

Because ESPN publishes the finished table, points deductions are already applied
and there is nothing to compute. The trade-off is that these endpoints are
undocumented and ESPN can change them without notice — so the script keeps the
previous run's table if a league fails, and logs the failure rather than
blanking the page.

Sources considered and rejected: API-Football's free plan (current season is
paywalled), TheSportsDB's free key (truncates tables to five rows), and
football-data.org's free tier (stops at the Championship). football-data.co.uk
publishes free results CSVs covering all eight divisions and works well, but
only updates once a round of fixtures finishes.

## Run it

```
node update-standings.mjs
npx serve .            # or: python3 -m http.server
```

Node 18 or newer. Opening `index.html` straight off disk works, but the browser
blocks the JSON files, so you'll see the sample numbers rather than live ones.

## Keeping it fed

`.github/workflows/update-standings.yml` runs the script on a schedule and
commits the result. Nothing secret is involved, so there's no key to configure.

## Things worth knowing

- **Points deductions aren't in the results data.** If a club gets docked
  points, add it to `deductions` in `players.json` and the table will follow:
  `"eng_league_two": { "Salford": 4 }`. The club name must match the spelling
  in the CSV.
- **Club names are short-form** — "Man United", "Sheffield Weds", "Bristol Rvs",
  "Inverness C". The `aliases` list in `players.json` maps the spreadsheet names
  onto them. When one doesn't match, the script prints the near misses from that
  division so you can paste the right spelling in.
- **The tables are sorted the same way the real ones are**: points, then goal
  difference, then goals scored, then alphabetically.
- **The results file updates when a round of fixtures finishes**, not minute by
  minute. For a competition that gets a weekly email, that's plenty.
- **The sheet's headings are off by one column.** The block labelled "Scottish
  National" is really the English National League — Carlisle, Southend, Boreham
  Wood and the rest. The totals still add up; only the label is wrong.
- **Ties** share a position, shown as `=4`, then list alphabetically. One line in
  `score()` if the competition has a real tie-break.
