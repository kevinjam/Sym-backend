const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SYM Medication Management API',
      version: '1.0.0',
      description: 'Backend API for SYM Medication Management App - A comprehensive medication tracking and management system for patients and doctors.',
      contact: {
        name: 'SYM Team',
        email: 'support@sym-app.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:9000',
        description: 'Development server'
      },
      {
        url: 'https://api.sym-app.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: { type: 'string', enum: ['patient', 'doctor'] },
            phoneNumber: { type: 'string' },
            dateOfBirth: { type: 'string', format: 'date' },
            gender: { type: 'string', enum: ['male', 'female', 'other'] },
            conditions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                  diagnosedDate: { type: 'string', format: 'date' }
                }
              }
            },
            specialization: { type: 'string' },
            licenseNumber: { type: 'string' },
            hospital: { type: 'string' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        Medication: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            genericName: { type: 'string' },
            category: { type: 'string' },
            description: { type: 'string' },
            dosageForm: { type: 'string' },
            strength: { type: 'string' },
            manufacturer: { type: 'string' },
            isApproved: { type: 'boolean' },
            sideEffects: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  severity: { type: 'string', enum: ['mild', 'moderate', 'severe'] },
                  description: { type: 'string' }
                }
              }
            },
            interactions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  medicationName: { type: 'string' },
                  description: { type: 'string' },
                  severity: { type: 'string', enum: ['low', 'medium', 'high'] }
                }
              }
            }
          }
        },
        PatientMedication: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            patientId: { type: 'string' },
            medicationId: { type: 'string' },
            prescribedBy: { type: 'string' },
            dosage: {
              type: 'object',
              properties: {
                amount: { type: 'number' },
                unit: { type: 'string' },
                frequency: { type: 'string' },
                instructions: { type: 'string' }
              }
            },
            schedule: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  time: { type: 'string' },
                  isActive: { type: 'boolean' }
                }
              }
            },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            status: { type: 'string', enum: ['active', 'paused', 'stopped', 'completed'] },
            adherenceScore: { type: 'number' },
            takenDoses: { type: 'number' },
            missedDoses: { type: 'number' },
            totalDoses: { type: 'number' },
            lastTaken: { type: 'string', format: 'date-time' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' }
          }
        },
        Symptom: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            patientId: { type: 'string' },
            patientMedicationId: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            severity: { type: 'string', enum: ['mild', 'moderate', 'severe'] },
            category: { type: 'string' },
            onsetDate: { type: 'string', format: 'date-time' },
            duration: { type: 'string' },
            isResolved: { type: 'boolean' },
            resolvedDate: { type: 'string', format: 'date-time' },
            reportedToDoctor: { type: 'boolean' },
            doctorNotes: { type: 'string' },
            doctorId: { type: 'string' }
          }
        },
        Notification: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            recipientId: { type: 'string' },
            senderId: { type: 'string' },
            type: { 
              type: 'string', 
              enum: ['medication_reminder', 'medication_stopped', 'symptom_alert', 'doctor_message', 'adherence_alert', 'system_notification']
            },
            title: { type: 'string' },
            message: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
            isRead: { type: 'boolean' },
            isSent: { type: 'boolean' },
            scheduledFor: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        DoctorPatientRequest: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            patientId: { type: 'string' },
            doctorId: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
            message: { type: 'string' },
            requestedAt: { type: 'string', format: 'date-time' },
            respondedAt: { type: 'string', format: 'date-time' },
            responseMessage: { type: 'string' },
            isActive: { type: 'boolean' }
          }
        },
        ConnectionRequest: {
          type: 'object',
          properties: {
            doctorEmail: { type: 'string', format: 'email' },
            message: { type: 'string' }
          },
          required: ['doctorEmail']
        },
        ConnectionResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['approved', 'rejected'] },
            responseMessage: { type: 'string' }
          },
          required: ['status']
        }
      }
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User registration, login, and profile management'
      },
      {
        name: 'Patient',
        description: 'Patient-specific endpoints for medication management and symptom reporting'
      },
      {
        name: 'Doctor',
        description: 'Doctor-specific endpoints for patient management and medication prescription'
      },
      {
        name: 'Medication',
        description: 'Medication catalog and management endpoints'
      },
      {
        name: 'Notification',
        description: 'Notification management and real-time updates'
      },
      {
        name: 'Connection',
        description: 'Doctor-patient connection request management'
      }
    ]
  },
  apis: [
    './routes/*.js',
    './server.js'
  ]
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec; 