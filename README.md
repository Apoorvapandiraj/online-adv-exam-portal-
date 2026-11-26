# online-adv-exam-portal-

Online exam portal with a student exam screen, teacher dashboard, and admin dashboard.
Teachers create classes and timed MCQ, coding, or writing tests and share them with students.
MCQ tests are graded automatically; teachers grade coding and writing submissions.

## Run locally

1. Install Node.js 18 or newer.
2. In this folder run:
   ```sh
   npm ci
   npm start
   ```
3. Open the teacher dashboard at `http://localhost:3000/teacher` or the admin dashboard at `http://localhost:3000/admin`.

For local development only, the default teacher password is `teacher123` and the default admin login is `admin` / `admin123`.

## Deploy to a Node.js host

This application runs an Express server; GitHub Pages alone cannot host it.

- Use Node.js 18 or newer.
- Build/install command: `npm ci`
- Start command: `npm start`
- Configure these environment variables **before the first start**:
  - `NODE_ENV=production`
  - `TEACHER_PASSWORD`: a strong teacher password.
  - `ADMIN_ID`: a non-default admin ID.
  - `ADMIN_PASSWORD`: a strong admin password.
- Attach persistent storage and set `DATA_FILE` to a file on that volume (for example, `/var/data/data.json`). Without persistent storage, classes, tests, users, and results may be lost when the host restarts or redeploys.
- Keep `.env`, `data.json`, and backups private; these are excluded from Git.

On Render, create a **Web Service** from this GitHub repository, use the build and start commands above, add the environment variables, and attach a persistent disk. Create classes and tests from the deployed teacher dashboard so the generated links use the public host address.

Set `DATA_FILE` to the mounted volume path used by your provider. The server uses the host-provided `PORT` automatically.

## Student test links

On the same Wi-Fi, open the teacher dashboard using the server's LAN address, create a test, and share the generated link and passcode. For internet hosting, create tests on the deployed site and share its generated public link.

## Question format

Paste or upload a `.txt` or `.csv` file:
- MCQ: `question | option A | option B | option C | option D | correct letter`
- Coding or writing: one question per line

## Project files

- `server.js`: Express API and server.
- `public/index.html`: teacher login/dashboard and student exam experience.
- `public/admin.html`, `public/admin.css`, `public/admin.js`: admin dashboard.
- `data.json`: local JSON storage, created when the server runs; do not commit it.

## Limitations

Browser-based controls cannot prevent screenshots on every device or stop a student from using a second device. The invigilator unlock code is configured in the frontend. Student answers are submitted to the server when the test is submitted.
