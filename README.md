# SYM Medication Management Backend

A comprehensive Node.js backend API for the SYM Medication Management App, designed to simplify, prioritize, and track medication administration for patients while giving doctors tools to monitor and adjust prescriptions based on patient symptoms.

## 🚀 Features

### Patient Features
- **Medication Management**: View categorized medication lists with color-coded priorities
- **Adherence Tracking**: Track medication intake and calculate adherence scores
- **Symptom Reporting**: Report symptoms related to medications with severity levels
- **Schedule Management**: View and manage medication schedules with reminders
- **Real-time Notifications**: Receive push notifications for medication reminders and doctor alerts

### Doctor Features
- **Patient Management**: Manage patient list and view patient details
- **Medication Prescription**: Prescribe medications with dosage schedules and priorities
- **Symptom Monitoring**: View and respond to patient-reported symptoms
- **Medication Control**: Stop medications and notify patients automatically
- **Adherence Reports**: Monitor patient medication adherence and progress

### Technical Features
- **Role-based Access Control**: Secure authentication for patients and doctors
- **Real-time Updates**: WebSocket support for live notifications
- **Push Notifications**: Firebase integration for mobile notifications
- **Comprehensive API**: RESTful API with Swagger documentation
- **Scalable Architecture**: MongoDB with optimized queries and indexing

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: Joi for request validation
- **Documentation**: Swagger/OpenAPI 3.0
- **Real-time**: Socket.io
- **Notifications**: Firebase Admin SDK
- **Scheduling**: node-cron
- **Containerization**: Docker & Docker Compose

## 📋 Prerequisites

- Node.js 18 or higher
- MongoDB 6.0 or higher
- Docker (optional, for containerized deployment)

## 🚀 Quick Start

### Option 1: Local Development

1. **Clone and Install**
   ```bash
   cd backend
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Database Setup**
   ```bash
   # Start MongoDB (if not using Docker)
   mongod
   
   # Or use Docker
   docker run -d -p 27017:27017 --name mongodb mongo:6.0
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

### Option 2: Docker Deployment

1. **Build and Run with Docker Compose**
   ```bash
   docker-compose up -d
   ```

2. **View Logs**
   ```bash
   docker-compose logs -f sym_backend
   ```

3. **Stop Services**
   ```bash
   docker-compose down
   ```

## 📚 API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:9000/api-docs
- **Health Check**: http://localhost:9000/api/health
- **CORS Test**: http://localhost:9000/api/cors-test

## 🔐 Authentication

The API uses JWT-based authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Login Flow

```bash
# Register a new user
curl -X POST http://localhost:9000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient@example.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe",
    "role": "patient"
  }'

# Login
curl -X POST http://localhost:9000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient@example.com",
    "password": "password123"
  }'
```

## 🔧 CORS Configuration

The backend is configured to handle CORS requests from common frontend development servers:

### Allowed Origins (Development)
- `http://localhost:3000` (React default)
- `http://localhost:3001` (React alternative)
- `http://localhost:5173` (Vite default)
- `http://localhost:8080` (Vue CLI default)
- `http://127.0.0.1:*` (Alternative localhost)

### CORS Troubleshooting

If you encounter CORS errors:

1. **Check your frontend URL** - Make sure it's in the allowed origins list
2. **Test CORS endpoint** - Visit `http://localhost:9000/api/cors-test`
3. **Update CORS_ORIGIN** - Add your frontend URL to the environment variable:
   ```bash
   CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://your-frontend-url
   ```
4. **Restart the server** - After updating CORS configuration

### Frontend Configuration

For your frontend application, ensure you're making requests to the correct backend URL:

```javascript
// Example fetch request
fetch('http://localhost:9000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include', // For cookies if needed
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123'
  })
});
```

## 🔥 Push Notifications (FCM)

The backend supports Firebase Cloud Messaging (FCM) for push notifications:

### FCM Token Management

```bash
# Update FCM token
curl -X POST http://localhost:9000/api/auth/fcm-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"fcmToken":"your-fcm-token-here"}'

# Remove FCM token (logout)
curl -X DELETE http://localhost:9000/api/auth/fcm-token \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Environment Variables for Firebase

Add these to your `.env` file:

```bash
# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour Private Key\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
```

📖 **Complete FCM Implementation Guide**: See `docs/FCM_TOKEN_GUIDE.md` for detailed setup instructions.

## 📊 Database Schema

### Core Models

- **User**: Patients and doctors with role-based access
- **Medication**: Medication catalog with categories and approval system
- **PatientMedication**: Links patients to medications with dosage schedules
- **Symptom**: Patient-reported symptoms with severity tracking
- **Notification**: Push notifications and in-app alerts

### Key Relationships

```
User (Doctor) → PatientMedication → User (Patient)
Medication → PatientMedication → Symptom
User → Notification (recipient/sender)
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `9000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/sym_medication_app` |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_EXPIRES_IN` | JWT expiration time | `7d` |
| `FIREBASE_PROJECT_ID` | Firebase project ID | Optional |
| `FIREBASE_PRIVATE_KEY` | Firebase private key | Optional |
| `FIREBASE_CLIENT_EMAIL` | Firebase client email | Optional |

### Firebase Setup (for Push Notifications)

1. Create a Firebase project
2. Generate a service account key
3. Add Firebase credentials to `.env`
4. Update the notification service configuration

## 📱 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### Patient Endpoints
- `GET /api/patient/medications` - Get patient's medications
- `POST /api/patient/medications/:id/take` - Mark medication as taken
- `POST /api/patient/medications/:id/miss` - Mark medication as missed
- `POST /api/patient/symptoms` - Report symptom
- `GET /api/patient/symptoms` - Get patient's symptoms
- `GET /api/patient/adherence` - Get adherence summary
- `GET /api/patient/schedule` - Get medication schedule

### Doctor Endpoints
- `GET /api/doctor/patients` - Get patient list
- `GET /api/doctor/patients/:id` - Get patient details
- `POST /api/doctor/medications/prescribe` - Prescribe medication
- `POST /api/doctor/medications/:id/stop` - Stop medication
- `GET /api/doctor/symptoms` - Get reported symptoms
- `POST /api/doctor/symptoms/:id/resolve` - Resolve symptom
- `GET /api/doctor/adherence/:patientId` - Get patient adherence report

### Medication Endpoints
- `GET /api/medication` - Get medication catalog
- `GET /api/medication/categories` - Get medication categories
- `GET /api/medication/:id` - Get medication details
- `POST /api/medication` - Create medication (Doctor only)
- `PUT /api/medication/:id` - Update medication (Doctor only)
- `POST /api/medication/:id/approve` - Approve medication (Doctor only)

### Notification Endpoints
- `GET /api/notification` - Get user notifications
- `POST /api/notification/:id/read` - Mark notification as read
- `POST /api/notification/read-all` - Mark all notifications as read
- `GET /api/notification/unread-count` - Get unread count

## 🔄 Real-time Features

### WebSocket Events

- `join-room` - Join user-specific room for notifications
- `notifications-updated` - Real-time notification updates
- `medication-reminder` - Medication reminder alerts

### WebSocket Connection

const socket = io('http://localhost:9000');

socket.on('connect', () => {
  console.log('Connected to SYM backend');
  socket.emit('join-room', userId);
});

socket.on('notifications-updated', (data) => {
  console.log('New notification:', data);
});
```

## 🧪 Testing

### Run Tests
```bash
npm test
```

### Test Coverage
```bash
npm run test:coverage
```

## 📦 Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start development server with nodemon |
| `npm test` | Run test suite |

| `npm run swagger` | Generate Swagger documentation |
| `npm run clear-db` | Clear all data from database |

## 🚀 Deployment

### Production Checklist

1. **Environment Variables**
   - Set `NODE_ENV=production`
   - Configure secure `JWT_SECRET`
   - Set up Firebase credentials
   - Configure MongoDB connection

2. **Security**
   - Enable HTTPS
   - Configure CORS properly
   - Set up rate limiting
   - Use environment variables for secrets

3. **Monitoring**
   - Set up logging (Winston/Morgan)
   - Configure health checks
   - Monitor database performance
   - Set up error tracking

### Docker Production

```bash
# Build production image
docker build -t sym-backend .

# Run with production environment
docker run -d \
  -p 9000:9000 \
  -e NODE_ENV=production \
  -e MONGODB_URI=your-mongodb-uri \
  -e JWT_SECRET=your-secret \
  sym-backend
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the API documentation at `/api-docs`

## 🔮 Roadmap

- [ ] Admin dashboard for medication management
- [ ] Integration with external medication APIs (RxNorm, openFDA)
- [ ] Advanced analytics and reporting
- [ ] Mobile app integration
- [ ] Multi-language support
- [ ] Advanced notification scheduling
- [ ] Medication interaction checking
- [ ] Telemedicine features

---

**Built with ❤️ for better medication management** 