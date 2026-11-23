# Exam Portal (teacher dashboard + student exams)

Teachers create classes and tests (MCQ, Coding, Writing) with a time limit and passcode,
then share one link. Students enter name, roll number and passcode, and take a timed test.
Copy, screenshot, tab-switch and full-screen-exit attempts lock the test until the
invigilator enters code 1234. MCQ is auto-graded on the server; coding and writing are graded by the teacher.

## Run it
1. Install Node.js 18 or newer.
2. In this folder run:  `npm install`  then  `npm start`
3. Teacher dashboard:  http://localhost:3000/teacher   (default password: teacher123)

Set your own password:
- Windows (PowerShell):  `$env:TEACHER_PASSWORD="mypass"; npm start`
- Mac/Linux:  `TEACHER_PASSWORD=mypass npm start`

## Share the student link
- Same Wi-Fi: the terminal prints an address like http://192.168.1.20:3000. Open /teacher on that
  address, create the test, and send students the link shown (it already has that address).
- Over the internet: deploy to Render, Railway or any Node host (start command `npm start`,
  set TEACHER_PASSWORD). Create tests from the deployed /teacher page so the link uses the public address.
  Free hosts can erase data.json on restart: attach a persistent disk and set DATA_FILE to a path on it.

## Test question format (paste or upload .txt / .csv)
- MCQ:  `question | option A | option B | option C | option D | correct letter`
- Coding or Writing: one question per line

## Files
- server.js: Express API, data saved to data.json
- public/index.html: teacher dashboard and student exam screens

## Known limits
Browsers cannot fully block phone screenshots or a second device. The unlock code (1234) is
set in public/index.html (`const CODE`). Student answers are stored on the server only after submit.
