const fs = require('fs');
const http = require('http');
const { google } = require('googleapis');
const { exec } = require('child_process');

const CREDENTIALS_PATH = './credentials.json';
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const REDIRECT_PORT = 3333;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

async function main() {
  // 1. Read OAuth credentials from credentials.json
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('\n❌ credentials.json not found!');
    console.error('Download it from Google Cloud Console → APIs & Services → Credentials');
    console.error(`Place it at: ${require('path').resolve(CREDENTIALS_PATH)}\n`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const creds = raw.installed || raw.web;

  if (!creds) {
    console.error('\n❌ Invalid credentials.json format. Expected "installed" or "web" key.\n');
    process.exit(1);
  }

  const { client_id, client_secret } = creds;

  // 2. Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

  // 3. Generate auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });

  console.log('\n====================================');
  console.log('  Google Calendar OAuth Setup');
  console.log('====================================\n');
  console.log('Opening browser for authorization...\n');

  // 4. Open browser automatically
  const openCmd = process.platform === 'win32' ? 'start' :
                  process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${openCmd} "${authUrl}"`);

  console.log('If browser did not open, visit this URL manually:\n');
  console.log(authUrl + '\n');

  // 5. Start local server to catch the redirect with the auth code
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
    const code = url.searchParams.get('code');

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h2>No authorization code received. Please try again.</h2>');
      return;
    }

    try {
      // 6. Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code);

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>✅ Authorization successful! You can close this tab.</h2><p>Check your terminal for the refresh token.</p>');

      console.log('====================================');
      console.log('  ✅ Authorization successful!');
      console.log('====================================\n');

      if (tokens.refresh_token) {
        console.log('REFRESH TOKEN (add this to your .env):\n');
        console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
      } else {
        console.log('⚠️  No refresh_token returned. This can happen if you already authorized.');
        console.log('    Go to https://myaccount.google.com/permissions and revoke access,');
        console.log('    then run this script again.\n');
      }

      console.log('GOOGLE_CLIENT_ID=' + client_id);
      console.log('GOOGLE_CLIENT_SECRET=' + client_secret);
      console.log('\nAdd all three to your .env file.\n');

      server.close();
      process.exit(0);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<h2>❌ Token exchange failed. Check terminal.</h2>');
      console.error('\n❌ Token exchange failed:', err.message, '\n');
      server.close();
      process.exit(1);
    }
  });

  server.listen(REDIRECT_PORT, () => {
    console.log(`Waiting for authorization on http://localhost:${REDIRECT_PORT} ...\n`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
