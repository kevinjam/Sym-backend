const cron = require('node-cron');
const PatientMedication = require('../models/PatientMedication');
const NotificationService = require('./notificationService');

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.initializeScheduler();
  }

  // Initialize the scheduler
  initializeScheduler() {
    // Run every minute to check for medication reminders
    cron.schedule('* * * * *', async () => {
      await this.checkMedicationReminders();
    });

    // Run daily at midnight to clean up old notifications
    cron.schedule('0 0 * * *', async () => {
      await this.cleanupOldNotifications();
    });

    console.log('🕐 Medication scheduler initialized');
  }

  // Check for medication reminders
  async checkMedicationReminders() {
    try {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

      // Find active medications that need reminders
      const activeMedications = await PatientMedication.find({
        status: 'active',
        isActive: true
      }).populate('medicationId');

      for (const medication of activeMedications) {
        // Check if any schedule time matches current time
        const shouldSendReminder = medication.schedule.some(timeSlot => 
          timeSlot.isActive && timeSlot.time === currentTime
        );

        if (shouldSendReminder) {
          await this.sendMedicationReminder(medication);
        }
      }
    } catch (error) {
      console.error('Error checking medication reminders:', error);
    }
  }

  // Send medication reminder
  async sendMedicationReminder(patientMedication) {
    try {
      // Check if reminder was already sent recently (within 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      // You could add a field to track last reminder sent time
      // For now, we'll send the reminder
      
      await NotificationService.sendMedicationReminder(
        patientMedication.patientId,
        patientMedication
      );

      console.log(`📅 Sent reminder for medication: ${patientMedication.medicationId.name}`);
    } catch (error) {
      console.error('Error sending medication reminder:', error);
    }
  }

  // Schedule a one-time notification
  async scheduleNotification(notificationData, scheduledTime) {
    try {
      const delay = scheduledTime.getTime() - Date.now();
      
      if (delay <= 0) {
        // Send immediately if scheduled time has passed
        return await NotificationService.createNotification(notificationData);
      }

      // Schedule the notification
      const timeoutId = setTimeout(async () => {
        await NotificationService.createNotification(notificationData);
      }, delay);

      // Store the timeout ID for potential cancellation
      this.jobs.set(notificationData._id, timeoutId);

      return { scheduled: true, scheduledTime };
    } catch (error) {
      console.error('Error scheduling notification:', error);
      throw error;
    }
  }

  // Cancel a scheduled notification
  cancelScheduledNotification(notificationId) {
    const timeoutId = this.jobs.get(notificationId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.jobs.delete(notificationId);
      return true;
    }
    return false;
  }

  // Clean up old notifications (older than 30 days)
  async cleanupOldNotifications() {
    try {
      const Notification = require('../models/Notification');
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const result = await Notification.deleteMany({
        createdAt: { $lt: thirtyDaysAgo },
        isRead: true
      });

      console.log(`🧹 Cleaned up ${result.deletedCount} old notifications`);
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
    }
  }

  // Get medication schedule for a patient
  async getPatientSchedule(patientId) {
    try {
      const medications = await PatientMedication.find({
        patientId,
        status: 'active',
        isActive: true
      }).populate('medicationId');

      const schedule = {};
      
      medications.forEach(medication => {
        medication.schedule.forEach(timeSlot => {
          if (timeSlot.isActive) {
            if (!schedule[timeSlot.time]) {
              schedule[timeSlot.time] = [];
            }
            schedule[timeSlot.time].push({
              id: medication._id,
              name: medication.medicationId.name,
              dosage: medication.dosage,
              priority: medication.priority,
              instructions: medication.dosage.instructions
            });
          }
        });
      });

      return schedule;
    } catch (error) {
      console.error('Error getting patient schedule:', error);
      throw error;
    }
  }

  // Update medication schedule
  async updateMedicationSchedule(patientMedicationId, newSchedule) {
    try {
      const medication = await PatientMedication.findById(patientMedicationId);
      
      if (!medication) {
        throw new Error('Medication not found');
      }

      medication.schedule = newSchedule;
      await medication.save();

      console.log(`📅 Updated schedule for medication: ${medication._id}`);
      return medication;
    } catch (error) {
      console.error('Error updating medication schedule:', error);
      throw error;
    }
  }

  // Get upcoming reminders for a patient
  async getUpcomingReminders(patientId, hours = 24) {
    try {
      const now = new Date();
      const endTime = new Date(now.getTime() + hours * 60 * 60 * 1000);
      
      const medications = await PatientMedication.find({
        patientId,
        status: 'active',
        isActive: true
      }).populate('medicationId');

      const reminders = [];

      medications.forEach(medication => {
        medication.schedule.forEach(timeSlot => {
          if (timeSlot.isActive) {
            const [hours, minutes] = timeSlot.time.split(':');
            const reminderTime = new Date();
            reminderTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

            // If the time has passed today, schedule for tomorrow
            if (reminderTime <= now) {
              reminderTime.setDate(reminderTime.getDate() + 1);
            }

            if (reminderTime <= endTime) {
              reminders.push({
                medicationId: medication._id,
                medicationName: medication.medicationId.name,
                time: timeSlot.time,
                scheduledTime: reminderTime,
                dosage: medication.dosage,
                priority: medication.priority
              });
            }
          }
        });
      });

      return reminders.sort((a, b) => a.scheduledTime - b.scheduledTime);
    } catch (error) {
      console.error('Error getting upcoming reminders:', error);
      throw error;
    }
  }
}

// Create singleton instance
const schedulerService = new SchedulerService();

module.exports = schedulerService; 