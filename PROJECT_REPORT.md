# Exam Portal Project Report

**Submitted to:** The Dean  
**Department:** School of Information and Computer Sciences  
**Project Title:** Exam Portal — Teacher Dashboard & Student Examination System  
**Version:** 1.0.0  
**Date:** 18 November 2026  
**Supervisor/Project Guide:** [Faculty Name]  
**Student/Developer:** [Your Name]  

---

## 1. Executive Summary

The **Exam Portal** is a lightweight, web-based examination management system designed to facilitate secure and efficient conduct of class tests. The application enables teachers to create classes, design tests (Multiple Choice Questions, Coding, and Writing), share secure access links with students, and monitor submissions in real time. Students can log in using a name, roll number, and test passcode to attempt timed examinations within a browser-based environment that incorporates basic anti-cheating safeguards.

Built using **Node.js** and **Express.js**, the system runs locally on port 3000 and persists data to a JSON file (`data.json`), making it suitable for deployment in computer labs, classrooms, and small-to-medium educational institutions without requiring a dedicated database server.

---

## 2. Introduction

### 2.1 Problem Statement
Traditional paper-based class tests consume significant administrative effort in question paper printing, distribution, invigilation, manual grading, and result compilation. Existing online examination platforms are often expensive, require constant internet connectivity, and lack flexibility for quick classroom deployment. There is a need for a simple, self-hosted solution that supports varied question types and basic exam security.

### 2.2 Objectives
- Enable teachers to create and manage classes and tests through a web dashboard.
- Support Multiple Choice Questions (MCQ), Coding, and Writing question types.
- Provide students with a secure, timed browser-based examination interface.
- Automate grading for MCQs and provide manual grading tools for subjective answers.
- Implement basic anti-cheating mechanisms (tab switching, copy-paste, screenshot detection).
- Allow export of results in CSV format for record-keeping.

### 2.3 Scope
The application is intended for **institutional classroom use** within a local network (Wi-Fi/LAN). It is not a full-featured Learning Management System (LMS) but a focused examination tool for conducting and managing periodic class tests.

---

## 3. System Architecture

### 3.1 High-Level Architecture
The Exam Portal follows a **client-server architecture**:

```
┌─────────────────┐      HTTP/REST      ┌─────────────────────────┐
│   Student       │ ◄─────────────────► │  Node.js + Express.js   │
│   (Browser)     │                     │     Server (server.js)  │
└─────────────────┘                     └─────────────────────────┘
                                              │
                                              │ read/write
                                              ▼
                                      ┌───────────────┐
                                      │   data.json   │
                                      │ (Local File   │
                                      │  Database)    │
                                      └───────────────┘
```

### 3.2 Component Diagram
- **Frontend:** `public/index.html` — Single-page application (SPA) rendered server-side via Express static file serving. Contains teacher dashboard, login screen, and student exam interface.
- **Backend:** `server.js` — Express application handling authentication, class/test management, student attempts, grading, and CSV export.
- **Data Store:** `data.json` — JSON file used as a lightweight database for classes, tests, attempts, submissions, and grades.

---

## 4. Technical Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Runtime | Node.js | v18 or newer | JavaScript runtime environment |
| Web Framework | Express.js | ^4.19.2 | REST API and static file server |
| Frontend | HTML5, CSS3, Vanilla JavaScript | — | User interface and interactivity |
| Data Storage | JSON file (`data.json`) | — | Local persistence without external DB |
| Styling | Custom CSS (dark/light theme support) | — | Responsive UI with premium industrial design |
| Authentication | Token-based (sessionStorage) | — | Teacher session management |

---

## 5. Features and Functionalities

### 5.1 Teacher Module
| Feature | Description |
|---------|-------------|
| **Secure Login** | Password-protected teacher dashboard with token-based session. Default password: `teacher123` (configurable via `TEACHER_PASSWORD` environment variable). |
| **Class Management** | Create classes with optional student roll lists (roll number + name) to restrict test access. |
| **Test Creation** | Create tests with title, type (MCQ/Coding/Writing), time limit (minutes), passcode, marks per question, and number of questions per student. |
| **Question Import** | Paste questions directly or upload `.txt`/`.csv` files. MCQ format: `question \| A \| B \| C \| D \| correct letter`. Coding/Writing: one question per line. |
| **Test Link Generation** | Unique test URLs (e.g., `/t/:testId`) with separate passcodes for student access. |
| **Results Dashboard** | View all submissions per test, including name, roll number, time taken, warnings, and marks. |
| **Manual Grading** | Grade coding and writing submissions by entering marks out of total. |
| **CSV Export** | Download test results as CSV (Name, Roll, Marks, Out of, Warnings, Seconds). |
| **Test Deletion** | Remove tests and associated submissions/attempts. |

### 5.2 Student Module
| Feature | Description |
|---------|-------------|
| **Test Entry** | Students enter name, roll number, and test passcode to start. |
| **Roll Validation** | If a class roll list exists, only listed roll numbers can start the test. |
| **Timed Examination** | Server-enforced time limit with countdown timer displayed on screen. |
| **Question Navigation** | Previous/Next navigation with question palette and unanswered indicators. |
| **Auto-Save** | Answers are saved locally (localStorage) so progress is retained on page reload. |
| **MCQ Auto-Grading** | Instant scoring for MCQs upon submission. |

### 5.3 Anti-Cheating & Security Features
The student exam interface includes the following safeguards:
- **Tab/Window Switch Detection:** Locks the test if the student leaves the exam tab.
- **Copy/Paste Prevention:** Disables copy, cut, and right-click context menus.
- **Keyboard Shortcut Blocking:** Blocks F12, Ctrl+C, Ctrl+V, Ctrl+P, Ctrl+S, Ctrl+U, Ctrl+A, PrintScreen, and developer tools shortcuts.
- **Fullscreen Enforcement:** Attempts to enter fullscreen; locks if the student exits fullscreen.
- **Visibility Change Lock:** Locks if the browser tab is hidden or the window loses focus.
- **Warning Counter:** Each violation increments a warning count stored with the submission.
- **Invigilator Unlock:** A locked test can be unlocked only by entering the invigilator code (`1234`) set in the frontend.

---

## 6. API Endpoints

All teacher endpoints require an `x-token` header obtained from `/api/login`.

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/login` | Teacher authentication | No |
| GET | `/api/classes` | List all classes | Yes |
| POST | `/api/classes` | Create a new class | Yes |
| GET | `/api/tests` | List all tests | Yes |
| POST | `/api/tests` | Create a new test | Yes |
| DELETE | `/api/tests/:id` | Delete a test | Yes |
| GET | `/api/results/:tid` | Get submissions for a test | Yes |
| POST | `/api/grade` | Manually grade a submission | Yes |
| GET | `/api/export/:tid` | Export results as CSV | Yes |
| POST | `/api/start` | Start a student test attempt | No |
| POST | `/api/submit` | Submit student answers | No |

---

## 7. Installation and Setup

### 7.1 Prerequisites
- Node.js version 18 or newer
- npm (bundled with Node.js)

### 7.2 Steps to Run
1. **Clone or copy** the project folder to the desired machine.
2. Open a terminal in the project directory and run:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
   Or with a custom teacher password:
   ```bash
   # Mac/Linux
   TEACHER_PASSWORD=yourpassword npm start

   # Windows (PowerShell)
   $env:TEACHER_PASSWORD="yourpassword"; npm start
   ```
4. Open the browser and navigate to:
   ```
   http://localhost:3000/teacher
   ```
5. Log in with the default password: **`teacher123`**

### 7.3 Network Access
The server prints the LAN/Wi-Fi address in the terminal (e.g., `http://172.16.40.107:3000`). Students on the same network can access the teacher dashboard and test links using this address.

---

## 8. User Guide

### 8.1 For Teachers
1. Open `http://localhost:3000/teacher` and log in.
2. **Classes Tab:** Create a class (e.g., "MCA Sem 3 Section A"). Optionally add a roll list (one per line: `21MCA001, Asha Rao`).
3. **Tests Tab:** Create a test:
   - Enter test title, select class, choose type (MCQ/Coding/Writing).
   - Set time limit (minutes), passcode, marks per question, and questions per student.
   - Paste questions in the required format or upload a `.txt`/`.csv` file.
   - Click "Create test and get link."
4. Share the generated test link and passcode with students.
5. After the test, go to **Results**, grade coding/writing submissions manually, and click **Download CSV** to export marks.

### 8.2 For Students
1. Open the test link shared by the teacher.
2. Enter name, roll number, and passcode, then click Start.
3. Answer questions using navigation buttons or the question palette.
4. Click **Finish test** twice to submit.
5. MCQ scores are shown immediately; coding/writing results await teacher grading.

---

## 9. File Structure

```
/exam-portal/
├── server.js          # Express backend API and server logic
├── package.json       # Project metadata and dependencies
├── package-lock.json  # Locked dependency versions
├── README.md          # User documentation
├── PROJECT_REPORT.md  # This report
├── public/
│   └── index.html     # Frontend: teacher dashboard + student exam UI
└── data.json          # Auto-generated local database (created on first run)
```

---

## 10. Limitations and Future Enhancements

### Current Limitations
- **Single-file storage:** Data is stored in `data.json`; free cloud hosts may erase it on restart unless persistent storage is configured.
- **Basic authentication:** Teacher login uses a shared password; no role-based multi-user system.
- **Client-side anti-cheating:** Protections can be bypassed by technically advanced users; suitable for supervised classroom environments.
- **No email/SMS notifications:** Results and links must be shared manually.

### Recommended Enhancements
1. **Database Integration:** Replace `data.json` with MongoDB, PostgreSQL, or SQLite for production deployment.
2. **User Management:** Separate teacher and student accounts with email-based registration and password reset.
3. **Proctoring Integration:** Webcam snapshots and screen recording during exams (requires additional permissions and server infrastructure).
4. **Question Bank:** Reusable question pools with tagging and difficulty levels.
5. **Analytics:** Graphical performance analytics per class and per student.
6. **Deployment:** Docker containerization and deployment to Render, Railway, or AWS with persistent disk.

---

## 11. Conclusion

The Exam Portal provides a practical, low-cost solution for conducting secure, timed class tests within an educational institution. Its modular design, support for multiple question types, automated MCQ grading, manual grading for subjective answers, and CSV export make it suitable for regular academic assessment. The built-in anti-cheating features ensure reasonable exam integrity in supervised lab environments. The system is easy to install, requires no external database, and can be deployed on any machine with Node.js.

---

## 12. Appendix

### Appendix A: Sample Question Formats

**MCQ Format:**
```
What is the full form of CPU? | Central Processing Unit | Computer Personal Unit | Central Processor Unit | Control Processing Unit | A
Which of the following is an operating system? | Windows | Chrome | Word | Excel | A
```

**Coding/Writing Format:**
```
Write a Python function to check if a number is prime.
Write a Python program to reverse a string without using built-in reverse().
```

### Appendix B: Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port number | `3000` |
| `TEACHER_PASSWORD` | Teacher login password | `teacher123` |
| `DATA_FILE` | Path to data storage file | `data.json` |

### Appendix C: Default Unlock Code
The invigilator unlock code for locked student tests is `1234` (configured in `public/index.html`).

---

**Prepared by:**  
[Your Name]  
[Roll Number / Student ID]  
[Department / Program]  
[College / University Name]  
Date: 18 November 2026