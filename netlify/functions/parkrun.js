// netlify/functions/parkrun.js
// This serverless function fetches and parses a parkrun athlete's results page.
// It runs on Netlify's servers, avoiding browser CORS restrictions.
// Called by the front-end as: /.netlify/functions/parkrun?id=A12345

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  const athleteId = event.queryStringParameters && event.queryStringParameters.id;

  if (!athleteId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing athlete ID" }),
    };
  }

  // Sanitise — only allow alphanumeric IDs
  if (!/^[A-Za-z0-9]+$/.test(athleteId)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid athlete ID format" }),
    };
  }

  const url = `https://www.parkrun.org.uk/parkrunner/${athleteId}/all/`;

  let html;
  try {
    const response = await fetch(url, {
      headers: {
        // Mimic a real browser request
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: `Athlete ID "${athleteId}" not found on parkrun` }),
        };
      }
      throw new Error(`parkrun returned status ${response.status}`);
    }

    html = await response.text();
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: `Could not reach parkrun: ${err.message}` }),
    };
  }

  // --- Parse athlete name ---
  const nameMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
  const name = nameMatch ? nameMatch[1].trim() : athleteId;

  // --- Parse results table ---
  // parkrun's results table has columns: Event | Date | Run # | Time | Age Grade | PB?
  // We extract Date and Event (venue) from each row.
  const runs = [];
  const eventsSeen = new Set();

  // Match each table row in the results
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const stripTags = (s) => s.replace(/<[^>]+>/g, "").trim();

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(stripTags(cellMatch[1]));
    }

    // Results rows have at least 6 cells; first cell is the event name
    if (cells.length >= 6) {
      const eventName = cells[0];
      const dateStr = cells[2]; // format: DD/MM/YYYY

      if (!eventName || !dateStr || !/\d{2}\/\d{2}\/\d{4}/.test(dateStr)) continue;

      // Parse DD/MM/YYYY into a sortable YYYY-MM key
      const [dd, mm, yyyy] = dateStr.split("/");
      if (!dd || !mm || !yyyy) continue;

      const monthKey = `${yyyy}-${mm}`;
      runs.push({ monthKey, eventName });
      eventsSeen.add(eventName);
    }
  }

  if (runs.length === 0) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ name, athleteId, runs: [], totalRuns: 0, totalEvents: 0 }),
    };
  }

  // --- Build monthly cumulative totals ---
  // Sort runs chronologically
  runs.sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  // Cumulative runs per month
  const runsByMonth = {};
  const eventsByMonth = {};
  let cumRuns = 0;
  const eventsSeenByMonth = new Set();

  for (const run of runs) {
    cumRuns++;
    eventsSeenByMonth.add(run.eventName);

    runsByMonth[run.monthKey] = cumRuns;
    eventsByMonth[run.monthKey] = eventsSeenByMonth.size;
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      name,
      athleteId,
      totalRuns: cumRuns,
      totalEvents: eventsSeenByMonth.size,
      runsByMonth,    // { "2023-04": 42, "2023-05": 45, ... }
      eventsByMonth,  // { "2023-04": 7, "2023-05": 8, ... }
    }),
  };
};
