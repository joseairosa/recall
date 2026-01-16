/**
 * Firebase Admin SDK initialization
 *
 * Used for verifying Firebase ID tokens from the frontend.
 * No service account key needed for just token verification.
 */

import admin from 'firebase-admin';

// Initialize Firebase Admin with project ID
// For token verification, we only need the project ID
const projectId = process.env.FIREBASE_PROJECT_ID || 'recallmcp';

if (!admin.apps.length) {
  admin.initializeApp({
    projectId,
  });
}

export const firebaseAdmin = admin;
export const firebaseAuth = admin.auth();

/**
 * Verify a Firebase ID token
 * @param idToken - The ID token from the frontend
 * @returns The decoded token with user info, or null if invalid
 */
export async function verifyFirebaseToken(
  idToken: string
): Promise<admin.auth.DecodedIdToken | null> {
  try {
    const decodedToken = await firebaseAuth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('[Firebase] Token verification failed:', error);
    return null;
  }
}
