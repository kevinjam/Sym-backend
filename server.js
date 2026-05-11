const { Blob, File } = require('buffer');
const dns = require('dns');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

// Node 18 compatibility: some transitive deps (e.g. undici) expect global File/Blob.
if (typeof globalThis.Blob === 'undefined') {
  globalThis.Blob = Blob;
}
if (typeof globalThis.File === 'undefined') {
  globalThis.File = File;
}

// Helps some networks where IPv6/SRV resolution misbehaves (does not fix invalid cluster hostnames).
dns.setDefaultResultOrder('ipv4first');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patient');
const doctorRoutes = require('./routes/doctor');
const clinicRoutes = require('./routes/clinic');
const locationRoutes = require('./routes/locations');
const providerRoutes = require('./routes/provider');
const appointmentRoutes = require('./routes/appointment');
const medicationRoutes = require('./routes/medication');
const notificationRoutes = require('./routes/notification');
const categoryRoutes = require('./routes/category');
const dosageFormRoutes = require('./routes/dosageForm');
const connectionRoutes = require('./routes/doctorPatientRequest');
const faqRoutes = require('./routes/faq');
const supportRoutes = require('./routes/support');
const bugReportRoutes = require('./routes/bugReport');
const healthReportRoutes = require('./routes/healthReport');
const aiHealthReportRoutes = require('./routes/aiHealthReport');
const adherenceRoutes = require('./routes/adherence');
const prescriptionScannerRoutes = require('./routes/prescriptionScanner');
const scannedPrescriptionRoutes = require('./routes/scannedPrescription');
const aiScannerRoutes = require('./routes/aiScanner');
const healgoalRoutes = require('./routes/healgoal');
const calorieScanRoutes = require('./routes/calorieScan');
const mindfulnessRoutes = require('./routes/mindfulness');
const fitnessRoutes = require('./routes/fitness');
const userRoutes = require('./routes/users');
const dashboardRoutes = require('./routes/dashboard');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const schedulerService = require('./utils/scheduler');
const cronJob = require('./config/cron');
require('./config/firebase'); // Initialize Firebase

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Trust proxy - Required when behind reverse proxy (Render, Heroku, etc.)
// This allows Express to correctly identify client IPs from X-Forwarded-For headers
// app.set('trust proxy', true);

// Middleware
app.use(helmet());
// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.CORS_ORIGIN?.split(',') || ['https://www.symhealth-ai.com/']
    : process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://localhost:8080', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:5173', 'http://127.0.0.1:8080'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Cron job
if (process.env.NODE_ENV === 'production') {
  cronJob.start();
}

// Rate limiting (skip cheap read-only reference data — Find Clinics debounces many city lookups)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) =>
    req.method === 'GET' &&
    (req.originalUrl || req.url || '').startsWith('/api/locations'),
});
app.use('/api/', limiter);


// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Public routes (no authentication required)
app.get('/api/public/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    message: 'SYM API is running'
  });
});

app.get('/api/public/version', (req, res) => {
  res.json({ 
    version: '1.0.0',
    name: 'SYM Medication Management API',
    description: 'Backend API for SYM Medication Management App'
  });
});

// Protected routes (authentication required)
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/medication', medicationRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/category', categoryRoutes);
app.use('/api/dosage-form', dosageFormRoutes);
app.use('/api/connection', connectionRoutes);
app.use('/api/faq', faqRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/bug-report', bugReportRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/clinics', clinicRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/health-reports', healthReportRoutes);
// Health check endpoint (must be before AI health routes)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV 
  });
});

app.use('/api/health', aiHealthReportRoutes);
app.use('/api', adherenceRoutes);
app.use('/api/prescription', prescriptionScannerRoutes);
app.use('/api/scanned-prescriptions', scannedPrescriptionRoutes);
app.use('/api/ai-scanner', aiScannerRoutes);
app.use('/api/healgoal', healgoalRoutes);
app.use('/api/calorie-scan', calorieScanRoutes);
app.use('/api/mindfulness', mindfulnessRoutes);
app.use('/api/fitness', fitnessRoutes);

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  res.json({ 
    message: 'CORS is working!',
    timestamp: new Date().toISOString(),
    origin: req.headers.origin
  });
});

// Route test endpoint
app.get('/api/test-routes', (req, res) => {
  res.json({ 
    message: 'Routes are working!',
    availableRoutes: [
      '/api/auth/register',
      '/api/auth/login',
      '/api/auth/profile',
      '/api/patient/medications',
      '/api/doctor/patients',
      '/api/medication',
      '/api/notification'
    ],
    timestamp: new Date().toISOString()
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  socket.on('join-room', (room) => {
    socket.join(room);
    console.log(`Client ${socket.id} joined room: ${room}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Make io available to routes
app.set('io', io);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/sym_medication_app';

// Disable Mongoose buffering so requests fail fast instead of timing out when DB is disconnected.
mongoose.set('bufferCommands', false);

async function startServer() {
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    console.log('Connected to MongoDB');

    // Medication reminder cron must run only after DB is ready (bufferCommands is false).
    schedulerService.start();

    const PORT = process.env.PORT || 9000;
    server.listen(PORT, () => {
      console.log(`🚀 SYM Backend server running on port ${PORT}`);
      console.log(`📚 API Documentation available at http://localhost:${PORT}/api-docs`);
    });
  } catch (err) {
    console.error('MongoDB connection error:', err);
    if (err.code === 'ENOTFOUND' || String(err.message || '').includes('querySrv')) {
      console.error(
        '\nMongoDB SRV lookup failed (ENOTFOUND). The hostname in MONGODB_URI is not in DNS — ' +
          'common causes: cluster deleted/renamed, wrong Atlas project, or an old copied URI.\n' +
          'Fix: Atlas → Database → Connect → Drivers → copy the current string into MONGODB_URI. ' +
          'If SRV is blocked on your network, use the standard mongodb://… connection string from the same screen.\n'
      );
    }
    process.exit(1);
  }
}

mongoose.connection.on('disconnected', () => {
  console.error('MongoDB disconnected');
});

mongoose.connection.on('error', (error) => {
  console.error('MongoDB runtime error:', error);
});

startServer();

module.exports = { app, server, io }; 