import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

let app: App;
let db: Firestore;
let auth: Auth;

export function getAdminDb(): Firestore {
  if (!db) {
    const projectId = (process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').replace(/^["']|["']$/g, '');
    const clientEmail = (process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '').replace(/^["']|["']$/g, '');
    let privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/^["']|["']$/g, '');

    if (!projectId || !clientEmail || !privateKey) {
      const missing = [];
      if (!projectId) missing.push('PROJECT_ID');
      if (!clientEmail) missing.push('ADMIN_CLIENT_EMAIL');
      if (!privateKey) missing.push('ADMIN_PRIVATE_KEY');
      throw new Error(`Missing required Firebase Admin environment variables: ${missing.join(', ')}`);
    }

    if (getApps().length === 0) {
      app = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      app = getApps()[0];
    }
    db = getFirestore(app);
  }
  return db;
}

export function getAdminAuth(): Auth {
  if (!auth) {
    getAdminDb(); // Ensure app is initialized
    auth = getAuth(app);
  }
  return auth;
}
