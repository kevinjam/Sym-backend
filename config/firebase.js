const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
let firebaseApp;

try {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    console.log('Firebase Admin SDK initialized successfully');
  } else {
    console.warn('Firebase configuration incomplete. Google authentication and push notifications will not work.');
  }
} catch (error) {
  console.error('Firebase initialization error:', error.message);
}

module.exports = { firebaseApp, admin };
