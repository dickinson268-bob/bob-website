// netlify/functions/strava-callback.js
// Handles the login redirect from Strava

exports.handler = async (event) => {
  const { code } = event.queryStringParameters;

  if (!code) {
    return { statusCode: 400, body: "Missing code" };
  }

  // Exchange the temporary code for a real access token
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  const data = await response.json();

  if (!data.access_token) {
    return { statusCode: 500, body: "Failed to get token from Strava" };
  }

  // Redirect back to the homepage, passing the token in the URL
  return {
    statusCode: 302,
    headers: {
      Location: `/?token=${data.access_token}`,
    },
    body: "",
  };
};
