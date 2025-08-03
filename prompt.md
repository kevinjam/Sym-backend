

**🔧 Backend Development Prompt – Node.js API for SYM Medication Management App**

We’re building the backend for a mobile health application called **SYM**, designed to simplify, prioritize, and track medication administration for patients while giving doctors tools to monitor and adjust prescriptions based on patient symptoms.

---

### 🎯 Objective

Develop a **Node.js (Express)** backend that supports:

* Categorized medication listings (e.g., Blood Pressure → Aspirin)
* Patient-specific prioritization of medications based on existing conditions
* Symptom tracking per medication
* Doctor interventions (e.g., stopping medications due to side effects)
* Dosage schedules and push notification reminders
* Adherence tracking and scoring
* Role-based access for **Patients** and **Doctors**

---

### 🔍 Core Features

#### ✅ Patient Functionality

* Register/login
* View medication list with color-coded priorities
* View dosage schedule with reminders
* Track and report symptoms
* View adherence score and medication progress
* Receive doctor notifications to stop medication

#### ✅ Doctor Functionality

* Manage patient list
* Assign or adjust medications for a patient
* View symptoms reported per medication
* Stop a medication and notify the patient automatically
* Ensure only approved medications can be assigned

---

### 💊 Medication Logic

* Medication is grouped by category
* Each med has color-coded priority based on the patient’s conditions
* If a patient is prone to heart attacks → heart-related meds are prioritized
* Side effects and symptoms are linked to medications
* Symptoms flagged by patients can trigger alerts for doctors

---

### 🔔 Notifications

* Scheduled reminders based on medication schedule (e.g., 8am + 8pm)
* Push notification when doctor stops a medication
* Symptom alert triggers if adverse effects are detected

---

### 🛠️ Technical Requirements

* **Node.js + Express.js**
* **MongoDB**
* **JWT-based authentication**
* **Role-based access (doctor, patient)**
* **Swagger API documentation**
* **Dockerized setup**
* **Push notifications via Firebase**
* **Adherence scoring logic (e.g., med taken/missed)**

---

### 🧪 Bonus (if time permits)

* Use WebSockets for real-time updates
* Admin dashboard (to seed medication categories)
* Integration with a medication API (e.g., RxNorm or openFDA)

---

If you're ready, please help us:

* Set up the backend repo with best practices
* Create a well-structured folder layout (MVC)
* Build scalable APIs with Swagger documentation
* Suggest improvements where needed

---

