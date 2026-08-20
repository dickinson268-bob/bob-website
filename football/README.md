# Eight From Eight — live prediction league

A static page that shows the 39 entries ranked by the combined league positions of
their eight picks. No server, no database: a scheduled job writes a JSON file, the
page reads it.

```
players.json          the 39 entries, their eight picks, and the club-name alias list
update-standings.mjs  pulls the eight league tables, writes standings.json
standings.json        created by the script above (not in the repo yet)
index.html            the page — reads standings.json, falls back to sample numbers
```

## 1. Get an API key

Sign up at **api-football.com** (or api-sports.io). The free plan gives 100 requests
a day, which is the only free tier that covers all eight of these divisions —
League One, League Two, the National League and the Scottish tiers are missing from
most of the others.

Before trusting the league IDs in `players.json`, confirm them once:

```
curl -H "x-apisports-key: YOUR_KEY" \
  "https://v3.football.api-sports.io/leagues?country=england&season=2026"
```

The IDs currently set are 39 Premier League, 40 Championship, 41 League One,
42 League Two, 43 National League, 180 Scottish Championship, 183 Scottish League One,
184 Scottish League Two. IDs are stable across seasons, but check them once rather
than debugging an empty table later.

## 2. Run it locally

```
API_FOOTBALL_KEY=your_key node update-standings.mjs
npx serve .          # or: python3 -m http.server
```

Opening `index.html` straight off disk works too, but the browser blocks the
`fetch` of `standings.json`, so you'll see the sample numbers instead of live ones.

The script prints any pick it can't match to a club in a real table. Fix those by
adding a line to `aliases` in `players.json` — that's the one bit of maintenance
this thing needs.

## 3. Put it online

**GitHub Pages + Actions** is the least fuss: the same repo hosts the page and runs
the updater. Add your key at Settings → Secrets and variables → Actions, then commit
`.github/workflows/update.yml`:

```yaml
name: Update standings
on:
  schedule:
    - cron: '0 6,12,18,22 * * *'   # 4 runs a day = 32 of your 100 requests
  workflow_dispatch:
jobs:
  update:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: node update-standings.mjs
        env:
          API_FOOTBALL_KEY: ${{ secrets.API_FOOTBALL_KEY }}
      - run: |
          git config user.name  "standings bot"
          git config user.email "bot@users.noreply.github.com"
          git add standings.json
          git diff --staged --quiet || git commit -m "standings $(date -u +%F\ %H:%M)"
          git push
```

**Netlify** works the same way if you'd rather keep it there: point it at the repo
for the static files and let the Action commit `standings.json`, or move the fetch
into a scheduled function. Either way the key stays server-side — never put it in
`index.html`, because anyone can read that.

## Things worth knowing

- **The spreadsheet's numbers aren't live positions.** The lookup table at the bottom
  runs 1, 2, 3… per league, so it's a provisional ordering rather than a real snapshot
  (Liverpool sits on 99). The page ships with those numbers as sample data so it renders
  before you have a key; real tables will spread scores much wider, because the National
  League has 24 clubs.
- **Ties.** Equal totals currently share a position, shown as `=4`, and are then listed
  alphabetically. If the competition has a real tie-break, that's the one line to change
  in `score()`.
- **Points deductions and postponed games** are already baked into the positions the API
  returns, so nothing to do there.
- **The sheet's headings are off by one column.** The block labelled "Scottish National"
  is really the English National League — Carlisle, Southend, Boreham Wood and the rest.
  The totals still add up; only the label is wrong.
