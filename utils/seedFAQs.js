const mongoose = require('mongoose');
const FAQ = require('../models/FAQ');
require('dotenv').config();

const sampleFAQs = [
  // General FAQs
  {
    question: "What is SYM and how does it work?",
    answer: "SYM is a comprehensive medication and symptom management app designed to help patients track their health journey. It allows you to log medications, record symptoms, connect with healthcare providers, and maintain a complete health profile.",
    category: "general",
    priority: 10,
    tags: ["introduction", "overview", "features"]
  },
  {
    question: "How do I get started with SYM?",
    answer: "Getting started is easy! Simply download the app, create an account, and complete your profile. You can then start adding your medications and logging symptoms. We recommend setting up medication reminders for the best experience.",
    category: "general",
    priority: 9,
    tags: ["getting started", "setup", "tutorial"]
  },
  {
    question: "Is SYM free to use?",
    answer: "Yes, SYM offers a free tier with essential features. We also provide premium features for advanced tracking and analytics. Check our pricing page for more details on premium features.",
    category: "general",
    priority: 8,
    tags: ["pricing", "free", "premium"]
  },

  // Account & Profile FAQs
  {
    question: "How do I update my profile information?",
    answer: "You can update your profile by going to the Profile tab and tapping the edit icon. You can modify your name, phone number, and other personal details. Note that your email address cannot be changed for security reasons.",
    category: "account",
    priority: 9,
    tags: ["profile", "edit", "personal information"]
  },
  {
    question: "How do I change my password?",
    answer: "To change your password, go to Settings > Security > Change Password. You'll need to enter your current password and then create a new one. Make sure to use a strong password for better security.",
    category: "account",
    priority: 8,
    tags: ["password", "security", "account"]
  },
  {
    question: "What should I do if I forget my password?",
    answer: "If you forget your password, tap 'Forgot Password' on the login screen. Enter your email address and we'll send you a reset link. Follow the instructions in the email to create a new password.",
    category: "account",
    priority: 7,
    tags: ["forgot password", "reset", "recovery"]
  },

  // Medications FAQs
  {
    question: "How do I add a new medication?",
    answer: "To add a medication, go to the Medications tab and tap the '+' button. Enter the medication name, dosage, frequency, and any notes. You can also set up reminders to help you remember to take your medication.",
    category: "medications",
    priority: 10,
    tags: ["add medication", "dosage", "reminders"]
  },
  {
    question: "Can I set medication reminders?",
    answer: "Yes! When adding or editing a medication, you can set up custom reminders. You can choose specific times, days of the week, and even customize the reminder message. These reminders will help you stay on track with your medication schedule.",
    category: "medications",
    priority: 9,
    tags: ["reminders", "notifications", "schedule"]
  },
  {
    question: "How do I mark a medication as taken?",
    answer: "You can mark a medication as taken by going to the Medications tab and tapping the checkmark next to the medication. You can also add notes about any side effects or observations when marking it as taken.",
    category: "medications",
    priority: 8,
    tags: ["mark taken", "tracking", "compliance"]
  },
  {
    question: "What if I miss a dose?",
    answer: "If you miss a dose, don't panic. Mark it as missed in the app and follow your doctor's instructions. Some medications can be taken late, while others should be skipped. When in doubt, consult your healthcare provider.",
    category: "medications",
    priority: 7,
    tags: ["missed dose", "late", "skip"]
  },

  // Symptoms FAQs
  {
    question: "How do I log a symptom?",
    answer: "To log a symptom, go to the Symptoms tab and tap the '+' button. Select the type of symptom, rate its severity, add any notes, and specify the duration. This helps you and your healthcare provider track patterns over time.",
    category: "symptoms",
    priority: 10,
    tags: ["log symptom", "tracking", "severity"]
  },
  {
    question: "Can I track multiple symptoms at once?",
    answer: "Yes, you can log multiple symptoms in a single entry. This is especially useful when you're experiencing several symptoms simultaneously. The app will help you track patterns and correlations between different symptoms.",
    category: "symptoms",
    priority: 8,
    tags: ["multiple symptoms", "tracking", "patterns"]
  },
  {
    question: "How long should I track symptoms?",
    answer: "We recommend tracking symptoms consistently for at least 2-4 weeks to identify patterns. However, you should continue tracking as long as you're experiencing symptoms or as advised by your healthcare provider.",
    category: "symptoms",
    priority: 7,
    tags: ["duration", "tracking period", "patterns"]
  },

  // Technical Support FAQs
  {
    question: "The app is running slowly. What should I do?",
    answer: "If the app is running slowly, try closing and reopening it, or restart your device. Make sure you have a stable internet connection. If the problem persists, contact our technical support team.",
    category: "technical",
    priority: 8,
    tags: ["slow", "performance", "troubleshooting"]
  },
  {
    question: "I'm not receiving notifications. How do I fix this?",
    answer: "First, check your device's notification settings for SYM. Make sure notifications are enabled in the app settings. If you're still not receiving notifications, try logging out and back in, or reinstall the app.",
    category: "technical",
    priority: 7,
    tags: ["notifications", "settings", "troubleshooting"]
  },
  {
    question: "How do I backup my data?",
    answer: "Your data is automatically backed up to our secure servers when you're connected to the internet. You can also export your data by going to Settings > Data & Privacy > Export Data. This creates a downloadable file with all your information.",
    category: "technical",
    priority: 6,
    tags: ["backup", "export", "data"]
  },

  // Billing FAQs
  {
    question: "How do I cancel my subscription?",
    answer: "You can cancel your subscription by going to Settings > Subscription > Cancel Subscription. Your access to premium features will continue until the end of your current billing period.",
    category: "billing",
    priority: 8,
    tags: ["cancel", "subscription", "billing"]
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards (Visa, MasterCard, American Express) and PayPal. All payments are processed securely through our payment partners.",
    category: "billing",
    priority: 7,
    tags: ["payment", "credit card", "paypal"]
  }
];

async function seedFAQs() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sym-health');
    console.log('Connected to MongoDB');

    // Clear existing FAQs
    await FAQ.deleteMany({});
    console.log('Cleared existing FAQs');

    // Insert sample FAQs
    await FAQ.insertMany(sampleFAQs);
    console.log(`Inserted ${sampleFAQs.length} sample FAQs`);

    console.log('FAQ seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding FAQs:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the seeding function
if (require.main === module) {
  seedFAQs();
}

module.exports = seedFAQs;
