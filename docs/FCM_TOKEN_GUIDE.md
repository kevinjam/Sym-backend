# FCM Token Implementation Guide

## 🔥 Firebase Cloud Messaging (FCM) Token Flow

### Overview
FCM tokens are generated on the client-side (frontend/mobile app) and sent to your backend to enable push notifications. Here's how to implement this in your SYM Medication Management App.

## 📱 Client-Side Implementation

### 1. Frontend (Web) - Using Firebase SDK

```javascript
// Install Firebase SDK
// npm install firebase

import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// Firebase configuration
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// Request permission and get FCM token
async function requestNotificationPermission() {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, {
        vapidKey: 'your-vapid-key'
      });
      
      // Send token to backend
      await sendFcmTokenToBackend(token);
      return token;
    }
  } catch (error) {
    console.error('Error getting FCM token:', error);
  }
}

// Send FCM token to backend
async function sendFcmTokenToBackend(fcmToken) {
  try {
    const response = await fetch('http://localhost:9000/api/auth/fcm-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ fcmToken })
    });
    
    if (response.ok) {
      console.log('FCM token updated successfully');
    }
  } catch (error) {
    console.error('Error updating FCM token:', error);
  }
}

// Handle incoming messages when app is in foreground
onMessage(messaging, (payload) => {
  console.log('Message received:', payload);
  // Show notification to user
  showNotification(payload.notification.title, payload.notification.body);
});

// Call this when user logs in
requestNotificationPermission();
```

### 2. React Native Implementation

```javascript
// Install Firebase React Native SDK
// npm install @react-native-firebase/app @react-native-firebase/messaging

import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';

class FCMService {
  async requestUserPermission() {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      console.log('Authorization status:', authStatus);
      return this.getFCMToken();
    }
  }

  async getFCMToken() {
    try {
      const fcmToken = await messaging().getToken();
      console.log('FCM Token:', fcmToken);
      
      // Store token locally
      await AsyncStorage.setItem('fcmToken', fcmToken);
      
      // Send to backend
      await this.sendTokenToBackend(fcmToken);
      
      return fcmToken;
    } catch (error) {
      console.error('Error getting FCM token:', error);
    }
  }

  async sendTokenToBackend(fcmToken) {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await fetch('http://localhost:9000/api/auth/fcm-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fcmToken })
      });
      
      if (response.ok) {
        console.log('FCM token sent to backend successfully');
      }
    } catch (error) {
      console.error('Error sending FCM token to backend:', error);
    }
  }

  async onTokenRefresh() {
    messaging().onTokenRefresh(token => {
      console.log('New FCM token:', token);
      this.sendTokenToBackend(token);
    });
  }

  async onMessageReceived() {
    messaging().onMessage(async remoteMessage => {
      console.log('Message received in foreground:', remoteMessage);
      // Handle foreground message
    });
  }

  async onNotificationOpenedApp() {
    messaging().onNotificationOpenedApp(remoteMessage => {
      console.log('Notification opened app:', remoteMessage);
      // Navigate to specific screen based on notification
    });
  }

  async getInitialNotification() {
    const remoteMessage = await messaging().getInitialNotification();
    if (remoteMessage) {
      console.log('Initial notification:', remoteMessage);
      // Handle initial notification
    }
  }
}

// Usage in your app
const fcmService = new FCMService();

// Initialize FCM when app starts
useEffect(() => {
  fcmService.requestUserPermission();
  fcmService.onTokenRefresh();
  fcmService.onMessageReceived();
  fcmService.onNotificationOpenedApp();
  fcmService.getInitialNotification();
}, []);
```

## 🔧 Backend Implementation

### 1. Environment Variables

Add these to your `.env` file:

```bash
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour Private Key\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
```

### 2. API Endpoints

The backend already includes these endpoints:

#### Update FCM Token
```bash
POST /api/auth/fcm-token
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "fcmToken": "your-fcm-token-here"
}
```

#### Remove FCM Token (Logout)
```bash
DELETE /api/auth/fcm-token
Authorization: Bearer <jwt_token>
```

### 3. User Model

The User model already includes the `fcmToken` field:

```javascript
{
  fcmToken: String, // For push notifications
  // ... other fields
}
```

## 📋 Implementation Steps

### Step 1: Set up Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing one
3. Add your app (Web/iOS/Android)
4. Download configuration files

### Step 2: Configure Backend
1. Add Firebase environment variables to `.env`
2. The notification service is already configured to use FCM tokens

### Step 3: Implement Client-Side
1. Install Firebase SDK
2. Initialize Firebase in your app
3. Request notification permissions
4. Get FCM token and send to backend
5. Handle incoming messages

### Step 4: Test Implementation
1. Start your backend server
2. Test FCM token update endpoint
3. Send test notification from Firebase Console
4. Verify notification delivery

## 🔍 Testing FCM Token Flow

### 1. Test Token Update
```bash
# Login first to get JWT token
curl -X POST http://localhost:9000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Update FCM token
curl -X POST http://localhost:9000/api/auth/fcm-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"fcmToken":"test-fcm-token-123"}'
```

### 2. Test Notification Sending
```bash
# Send test notification (this will be handled by the notification service)
curl -X POST http://localhost:9000/api/notification \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "recipientId": "USER_ID",
    "type": "medication_reminder",
    "title": "Medication Reminder",
    "message": "Time to take your medication!"
  }'
```

## 🚨 Common Issues & Solutions

### 1. FCM Token Not Generated
- **Issue**: Permission denied or Firebase not initialized
- **Solution**: Check notification permissions and Firebase configuration

### 2. Token Not Sent to Backend
- **Issue**: Network error or authentication issue
- **Solution**: Check API endpoint and JWT token validity

### 3. Notifications Not Received
- **Issue**: Invalid FCM token or Firebase configuration
- **Solution**: Verify Firebase project settings and token validity

### 4. Token Expired
- **Issue**: FCM tokens can expire
- **Solution**: Implement token refresh logic in client

## 📱 Platform-Specific Notes

### Web
- Requires HTTPS in production
- Uses VAPID key for web push
- Limited background processing

### iOS
- Requires APNs certificate
- Different permission flow
- Background app refresh needed

### Android
- Requires google-services.json
- Automatic token refresh
- Better background processing

## 🔄 Token Refresh Strategy

```javascript
// Client-side token refresh
messaging().onTokenRefresh(token => {
  // Send new token to backend
  sendFcmTokenToBackend(token);
});

// Backend token validation
static async validateFcmToken(userId, fcmToken) {
  try {
    const response = await firebaseApp.messaging().send({
      token: fcmToken,
      data: { test: 'validation' }
    });
    return true;
  } catch (error) {
    // Token is invalid, remove it
    await User.findByIdAndUpdate(userId, { fcmToken: null });
    return false;
  }
}
```

This implementation provides a complete FCM token management system for your SYM Medication Management App! 🎉 