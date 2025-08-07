const admin = require('firebase-admin');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Initialize Firebase Admin SDK
let firebaseApp;
try {
  if (process.env.FIREBASE_PROJECT_ID) {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
  }
} catch (error) {
  console.warn('Firebase not configured:', error.message);
}

class NotificationService {
  // Create and send notification
  static async createNotification(notificationData) {
    try {
      const notification = new Notification(notificationData);
      await notification.save();
      
      // Send push notification if scheduled for now or immediate
      if (!notification.scheduledFor || notification.scheduledFor <= new Date()) {
        await this.sendPushNotification(notification);
      }
      
      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  // Send push notification via Firebase
  static async sendPushNotification(notification) {
    if (!firebaseApp) {
      console.warn('Firebase not configured, skipping push notification');
      return;
    }

    try {
      const recipient = await User.findById(notification.recipientId);
      if (!recipient || !recipient.fcmToken) {
        console.log('No FCM token for user:', notification.recipientId);
        return;
      }

      const message = {
        token: recipient.fcmToken,
        notification: {
          title: notification.title,
          body: notification.message,
        },
        data: {
          type: notification.type,
          notificationId: notification._id.toString(),
          ...notification.data
        },
        android: {
          priority: this.getPriority(notification.priority),
          notification: {
            sound: 'default',
            channelId: 'medication-reminders'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      const response = await firebaseApp.messaging().send(message);
      console.log('Push notification sent:', response);
      
      // Update notification as sent
      notification.isSent = true;
      notification.sentAt = new Date();
      await notification.save();
      
    } catch (error) {
      console.error('Error sending push notification:', error);
      
      // Increment retry count
      notification.retryCount += 1;
      if (notification.retryCount >= notification.maxRetries) {
        notification.isSent = true; // Mark as sent to prevent infinite retries
      }
      await notification.save();
    }
  }

  // Get Firebase priority level
  static getPriority(priority) {
    switch (priority) {
      case 'urgent':
        return 'high';
      case 'high':
        return 'high';
      default:
        return 'normal';
    }
  }

  // Send medication reminder
  static async sendMedicationReminder(patientId, medicationData) {
    const notification = await this.createNotification({
      recipientId: patientId,
      type: 'medication_reminder',
      title: 'Medication Reminder',
      message: `Time to take ${medicationData.name} - ${medicationData.dosage.amount}${medicationData.dosage.unit}`,
      priority: medicationData.priority === 'critical' ? 'urgent' : 'high',
      data: {
        medicationId: medicationData.medicationId,
        patientMedicationId: medicationData._id,
        dosage: medicationData.dosage
      }
    });
    
    return notification;
  }

  // Send medication stopped notification
  static async sendMedicationStoppedNotification(patientId, medicationData, reason) {
    const notification = await this.createNotification({
      recipientId: patientId,
      type: 'medication_stopped',
      title: 'Medication Stopped',
      message: `Your medication ${medicationData.name} has been stopped. Reason: ${reason}`,
      priority: 'high',
      data: {
        medicationId: medicationData.medicationId,
        patientMedicationId: medicationData._id,
        reason: reason
      }
    });
    
    return notification;
  }

  // Send symptom alert to doctor
  static async sendSymptomAlert(patientId, doctorId, symptomData) {
    const notification = await this.createNotification({
      recipientId: doctorId,
      senderId: patientId,
      type: 'symptom_alert',
      title: 'New Symptom Reported',
      message: `Patient reported ${symptomData.severity} symptom: ${symptomData.name}`,
      priority: symptomData.severity === 'severe' ? 'urgent' : 'high',
      data: {
        symptomId: symptomData._id,
        patientId: patientId,
        severity: symptomData.severity,
        category: symptomData.category
      }
    });
    
    return notification;
  }

  // Send adherence alert
  static async sendAdherenceAlert(patientId, medicationData, adherenceScore) {
    let message = '';
    let priority = 'normal';
    
    if (adherenceScore < 50) {
      message = `Your adherence to ${medicationData.name} is very low (${adherenceScore}%). Please take your medication as prescribed.`;
      priority = 'high';
    } else if (adherenceScore < 80) {
      message = `Your adherence to ${medicationData.name} is below target (${adherenceScore}%). Please improve your medication routine.`;
      priority = 'normal';
    }

    if (message) {
      const notification = await this.createNotification({
        recipientId: patientId,
        type: 'adherence_alert',
        title: 'Adherence Alert',
        message: message,
        priority: priority,
        data: {
          medicationId: medicationData.medicationId,
          patientMedicationId: medicationData._id,
          adherenceScore: adherenceScore
        }
      });
      
      return notification;
    }
  }

  // Mark notification as read
  static async markAsRead(notificationId, userId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipientId: userId },
      { 
        isRead: true, 
        readAt: new Date() 
      },
      { new: true }
    );
    
    return notification;
  }

  // Mark all notifications as read
  static async markAllAsRead(userId) {
    const result = await Notification.updateMany(
      { recipientId: userId, isRead: false },
      { 
        isRead: true, 
        readAt: new Date() 
      }
    );
    
    return result;
  }

  // Get user notifications
  static async getUserNotifications(userId, options = {}) {
    const { page = 1, limit = 20, unreadOnly = false } = options;
    const skip = (page - 1) * limit;
    
    const query = { recipientId: userId };
    if (unreadOnly) {
      query.isRead = false;
    }
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('senderId', 'firstName lastName');
    
    const total = await Notification.countDocuments(query);
    
    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Send medication prescribed notification
  static async sendMedicationPrescribedNotification(patientId, patientMedicationData, doctorData) {
    try {
      const notification = await this.createNotification({
        recipientId: patientId,
        senderId: doctorData._id,
        type: 'medication_prescribed',
        title: 'New Medication Prescribed',
        message: `Dr. ${doctorData.lastName} has prescribed ${patientMedicationData.medicationId.name} for you.`,
        priority: 'high',
        data: {
          medicationId: patientMedicationData._id.toString(),
          medicationName: patientMedicationData.medicationId.name,
          doctorId: doctorData._id.toString(),
          doctorName: `Dr. ${doctorData.firstName} ${doctorData.lastName}`
        }
      });
      
      return notification;
    } catch (error) {
      console.error('Error sending medication prescribed notification:', error);
      throw error;
    }
  }

  // Send symptom reported notification
  static async sendSymptomReportedNotification(doctorId, symptomData, patientData) {
    try {
      const notification = await this.createNotification({
        recipientId: doctorId,
        senderId: patientData._id,
        type: 'symptom_reported',
        title: 'New Symptom Reported',
        message: `${patientData.firstName} ${patientData.lastName} has reported a ${symptomData.severity} symptom: ${symptomData.name}`,
        priority: symptomData.severity === 'severe' ? 'urgent' : symptomData.severity === 'moderate' ? 'high' : 'normal',
        data: {
          symptomId: symptomData._id.toString(),
          symptomName: symptomData.name,
          severity: symptomData.severity,
          patientId: patientData._id.toString(),
          patientName: `${patientData.firstName} ${patientData.lastName}`
        }
      });
      
      return notification;
    } catch (error) {
      console.error('Error sending symptom reported notification:', error);
      throw error;
    }
  }

  // Send connection request notification
  static async sendConnectionRequestNotification(doctorId, patientData, message) {
    try {
      const notification = await this.createNotification({
        recipientId: doctorId,
        senderId: patientData._id,
        type: 'connection_request',
        title: 'New Connection Request',
        message: `${patientData.firstName} ${patientData.lastName} wants to connect with you for medication management.`,
        priority: 'normal',
        data: {
          patientId: patientData._id.toString(),
          patientName: `${patientData.firstName} ${patientData.lastName}`,
          patientEmail: patientData.email,
          message: message || ''
        }
      });
      
      return notification;
    } catch (error) {
      console.error('Error sending connection request notification:', error);
      throw error;
    }
  }

  // Send connection response notification
  static async sendConnectionResponseNotification(patientId, doctorData, status, responseMessage) {
    try {
      const title = status === 'approved' ? 'Connection Approved' : 'Connection Rejected';
      const message = status === 'approved' 
        ? `Dr. ${doctorData.lastName} has approved your connection request.`
        : `Dr. ${doctorData.lastName} has rejected your connection request.`;
      
      const notification = await this.createNotification({
        recipientId: patientId,
        senderId: doctorData._id,
        type: 'connection_response',
        title: title,
        message: message,
        priority: 'normal',
        data: {
          doctorId: doctorData._id.toString(),
          doctorName: `Dr. ${doctorData.firstName} ${doctorData.lastName}`,
          status: status,
          responseMessage: responseMessage || ''
        }
      });
      
      return notification;
    } catch (error) {
      console.error('Error sending connection response notification:', error);
      throw error;
    }
  }

  // Send symptom resolved notification
  static async sendSymptomResolvedNotification(patientId, symptomData, doctorData, notes) {
    try {
      const notification = await this.createNotification({
        recipientId: patientId,
        senderId: doctorData._id,
        type: 'symptom_resolved',
        title: 'Symptom Resolved',
        message: `Dr. ${doctorData.lastName} has marked your symptom "${symptomData.name}" as resolved.`,
        priority: 'normal',
        data: {
          symptomId: symptomData._id.toString(),
          symptomName: symptomData.name,
          doctorId: doctorData._id.toString(),
          doctorName: `Dr. ${doctorData.firstName} ${doctorData.lastName}`,
          notes: notes || ''
        }
      });
      
      return notification;
    } catch (error) {
      console.error('Error sending symptom resolved notification:', error);
      throw error;
    }
  }
}

module.exports = NotificationService; 