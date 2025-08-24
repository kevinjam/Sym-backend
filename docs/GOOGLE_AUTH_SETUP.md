# Google Authentication Setup Guide

This guide explains how to set up Google authentication for the SYM Medication Management app using Firebase.

## Prerequisites

1. A Google Cloud Project
2. Firebase project enabled
3. Google Sign-In API enabled
4. Firebase Admin SDK service account

## Setup Steps

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Sign-In API:
   - Go to APIs & Services > Library
   - Search for "Google Sign-In API"
   - Click Enable

### 2. Firebase Project Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Enable Authentication:
   - Click on "Authentication" in the left sidebar
   - Click "Get started"
   - Go to "Sign-in method" tab
   - Enable "Google" as a sign-in provider
   - Configure OAuth consent screen if prompted

### 3. Get Firebase Admin SDK Credentials

1. In Firebase Console, go to Project Settings (gear icon)
2. Go to "Service accounts" tab
3. Click "Generate new private key"
4. Download the JSON file
5. Extract the following values:
   - `project_id`
   - `private_key`
   - `client_email`

### 4. Environment Variables

Add these to your `.env` file:

```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour Private Key Here\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
```

**Important**: The `FIREBASE_PRIVATE_KEY` should include the newlines as `\n` characters.

### 5. Mobile App Configuration

#### Android
1. Add your SHA-1 fingerprint to Firebase project
2. Download `google-services.json` and place it in `android/app/`
3. Update your `android/app/build.gradle`:

```gradle
apply plugin: 'com.google.gms.google-services'
```

4. Update your `android/build.gradle`:

```gradle
classpath 'com.google.gms:google-services:4.3.15'
```

#### iOS
1. Download `GoogleService-Info.plist` from Firebase
2. Add it to your iOS project
3. Update your `ios/Podfile`:

```ruby
pod 'GoogleSignIn'
```

## API Endpoints

### Google Authentication
- **POST** `/api/auth/google` - Google signup/login
- **POST** `/api/auth/google/verify` - Verify Google token

### Request Body for Google Auth
```json
{
  "idToken": "google-id-token-from-client",
  "role": "patient" // or "doctor"
}
```

## How It Works

1. **Client Side**: User signs in with Google on mobile app
2. **Token Exchange**: App sends Google ID token to backend
3. **Token Verification**: Backend verifies token with Firebase Admin SDK
4. **User Creation/Lookup**: Backend creates new user or finds existing one
5. **JWT Generation**: Backend generates JWT token for the user
6. **Response**: Backend returns user data and JWT token

## User Model Updates

The User model now supports:
- `provider`: Authentication provider ('local', 'google', 'facebook')
- `providerId`: Unique ID from the provider
- `emailVerified`: Whether email is verified
- Password is optional for social login users

## Security Features

- Google ID tokens are verified server-side
- Only verified Google accounts are accepted
- JWT tokens are generated for authenticated sessions
- Rate limiting is applied to all endpoints

## Testing

1. Test with a valid Google account
2. Verify error handling for invalid tokens
3. Test user creation and login flows
4. Verify JWT token generation and validation

## Troubleshooting

### Common Issues

1. **"Firebase not configured" warning**
   - Check environment variables
   - Ensure Firebase config file is loaded

2. **"Invalid private key" error**
   - Verify private key format in .env
   - Ensure newlines are preserved as `\n`

3. **"Project not found" error**
   - Verify FIREBASE_PROJECT_ID
   - Check Firebase project exists and is accessible

4. **"Unauthorized" error**
   - Verify service account has proper permissions
   - Check if Google Sign-In API is enabled

### Debug Mode

Enable debug logging by setting:
```env
NODE_ENV=development
```

## Production Considerations

1. **Environment Variables**: Use secure environment variable management
2. **Rate Limiting**: Ensure proper rate limiting is configured
3. **Monitoring**: Set up logging and monitoring for authentication events
4. **Backup**: Regular backups of user data
5. **Compliance**: Ensure compliance with data protection regulations

## Support

For issues related to:
- **Firebase Setup**: Check Firebase documentation
- **Google Cloud**: Check Google Cloud documentation
- **Backend Issues**: Check server logs and error messages
- **Mobile App**: Check Firebase console for authentication logs
