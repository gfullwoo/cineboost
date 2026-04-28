// Google ID-token verification + session JWT helpers
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

const googleClient = new OAuth2Client();

export async function verifyGoogleIdToken(idToken) {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw new Error('GOOGLE_CLIENT_ID not set on server');
  const ticket = await googleClient.verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new Error('invalid google token');
  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture
  };
}

export function signSession(user) {
  const secret = process.env.SESSION_JWT_SECRET;
  if (!secret) throw new Error('SESSION_JWT_SECRET not set');
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, picture: user.picture },
    secret,
    { expiresIn: '30d' }
  );
}

export function verifySession(token) {
  return jwt.verify(token, process.env.SESSION_JWT_SECRET);
}

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const claims = verifySession(token);
    req.user = { id: claims.sub, email: claims.email, name: claims.name, picture: claims.picture };
    next();
  } catch {
    res.status(401).json({ error: 'invalid_session' });
  }
}
