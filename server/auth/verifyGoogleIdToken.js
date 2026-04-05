const { OAuth2Client } = require('google-auth-library');

/**
 * Verifies a Google Sign-In ID token. Returns payload or throws.
 * @param {string} idToken
 */
async function verifyGoogleIdToken(idToken) {
  const clientId = process.env.DM_GOOGLE_CLIENT_ID;
  if (!clientId || !String(clientId).trim()) {
    throw Object.assign(new Error('Server missing DM_GOOGLE_CLIENT_ID'), { code: 'AUTH_CONFIG' });
  }
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.sub) {
    throw new Error('Invalid Google token payload');
  }
  return payload;
}

module.exports = { verifyGoogleIdToken };
