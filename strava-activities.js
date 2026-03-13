// netlify/functions/strava-activities.js
// Fetches your recent runs from Strava and returns them to the page

exports.handler = async (event) => {
  const { token } = event.queryStringParameters;

  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "No token provided" }) };
  }

  const response = await fetch(
    "https://www.strava.com/api/v3/athlete/activities?per_page=12&page=1",
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!response.ok) {
    return { statusCode: response.status, body: JSON.stringify({ error: "Strava API error" }) };
  }

  const activities = await response.json();

  // Filter to runs only, and extract the fields we need
  const runs = activities
    .filter((a) => a.type === "Run")
    .map((a) => ({
      id: a.id,
      name: a.name,
      date: a.start_date_local.split("T")[0],
      distance: (a.distance / 1000).toFixed(1),          // metres → km
      time: formatTime(a.moving_time),                    // seconds → h:mm:ss
      pace: formatPace(a.moving_time, a.distance),        // per km
      elevation: Math.round(a.total_elevation_gain),
      kudos: a.kudos_count,
      polyline: a.map?.summary_polyline || null,
    }));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(runs),
  };
};

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(seconds, metres) {
  if (!metres) return "--";
  const secsPerKm = seconds / (metres / 1000);
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
