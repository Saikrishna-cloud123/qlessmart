import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let app: App;
let db: Firestore;

export function getAdminDb(): Firestore {
  if (!db) {
    if (getApps().length === 0) {
      app = initializeApp({
        credential: cert({
          projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          // Vercel stores multi-line env vars with literal \n — replace them
          privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
      });
    } else {
      app = getApps()[0];
    }
    db = getFirestore(app);
  }
  return db;
}
