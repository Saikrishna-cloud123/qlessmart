import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const envConfig = fs.readFileSync('.env.local', 'utf8')
  .split('\n')
  .reduce((acc, line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      acc[match[1]] = match[2];
    }
    return acc;
  }, {});

let privateKey = (envConfig.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/^["']|["']$/g, '');
const clientEmail = (envConfig.FIREBASE_ADMIN_CLIENT_EMAIL || '').replace(/^["']|["']$/g, '');
const projectId = (envConfig.VITE_FIREBASE_PROJECT_ID || envConfig.FIREBASE_PROJECT_ID || '').replace(/^["']|["']$/g, '');

console.log('Project ID:', projectId);
console.log('Client Email:', clientEmail);
console.log('Private key length:', privateKey.length);
console.log('Starts with:', privateKey.substring(0, 30));
console.log('Ends with:', privateKey.substring(privateKey.length - 30));

privateKey = privateKey.replace(/\\n/g, '\n');

console.log('After repl, Starts with:', privateKey.substring(0, 30));
console.log('After repl, has newlines:', privateKey.includes('\n'));
console.log('Final Key Ends with:', privateKey.substring(privateKey.length - 30));

try {
  const app = initializeApp({
    credential: cert({
        projectId,
        clientEmail,
        privateKey,
    })
  });
  
  const db = getFirestore(app);
  db.collection('user_roles').limit(1).get().then(() => {
     console.log("SUCCESS!");
     process.exit(0);
  }).catch(e => {
     console.error("FIRESTORE ERR:", e);
     process.exit(1);
  });
} catch (e) {
  console.error("INIT ERR:", e);
  process.exit(1);
}
