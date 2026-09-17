# ReachInbox Scheduler

ReachInbox Scheduler is an email campaign scheduling application built with React, Express, Prisma, PostgreSQL, Redis, BullMQ, Elasticsearch, Passport Google OAuth, and Nodemailer.

## Features

- CSV-based recipient import
- Delayed and rate-limited email scheduling
- BullMQ and Redis email queue
- Campaign status and recipient statistics
- Bull Board queue dashboard
- Google OAuth with Passport
- Elasticsearch campaign and recipient search
- Ethereal SMTP-compatible email delivery
- Docker Compose setup for PostgreSQL, Redis, and Elasticsearch

## Project Structure

```text
backend/       Express API, Prisma schema, queue, and worker
frontend-app/  React and Vite dashboard
docker-compose.yml  Local PostgreSQL, Redis, and Elasticsearch services
```

## Prerequisites

- Node.js 20 or newer
- npm
- Docker Desktop with Docker Compose
- A Google OAuth application for live Google login
- SMTP credentials for sending email

## Configuration

Create `backend/.env` with values for the following settings:

```env
DATABASE_URL="postgresql://reachinbox:reachinbox_password@localhost:5432/reachinbox?schema=public"
PORT=5000
SESSION_SECRET=replace-with-a-long-random-value
LOCAL_USER_EMAIL=local@reachinbox.test

REDIS_HOST=localhost
REDIS_PORT=6379
WORKER_CONCURRENCY=2
EMAIL_JOB_ATTEMPTS=3

ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_INDEX=reachinbox

SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=your-ethereal-user
SMTP_PASSWORD=your-ethereal-password
SMTP_FROM=your-ethereal-user@example.com

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback
```

Google OAuth must include this authorized redirect URI:

```text
http://localhost:5000/auth/google/callback
```

The application uses a local user automatically when no Google session is present, so campaigns can be tested locally without OAuth credentials. Search returns a graceful unavailable response when Elasticsearch is not reachable.

## Start Infrastructure

From the repository root:

```powershell
docker compose up -d
```

This starts:

- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- Elasticsearch on `localhost:9200`

## Install and Prepare the Backend

```powershell
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
```

For local schema development, use `npx prisma migrate dev` instead of `npx prisma migrate deploy`.

## Run the Application

Open three terminals from the repository root.

### 1. Backend API

```powershell
cd backend
npm start
```

The API listens on `http://localhost:5000`.

### 2. BullMQ Worker

```powershell
cd backend
npm run worker
```

The worker processes scheduled email jobs from Redis.

### 3. Frontend

```powershell
cd frontend-app
npm install
npm run dev
```

The dashboard is available at the Vite URL, normally `http://localhost:5173`.

## Useful Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Backend health check |
| `GET /auth/google` | Start Google OAuth |
| `GET /auth/me` | Get the current session |
| `POST /auth/logout` | End the current session |
| `GET /campaigns` | List campaigns |
| `GET /campaigns/:id` | Get campaign details and statistics |
| `GET /search?q=value` | Search campaigns and recipients |
| `POST /upload-csv` | Create and schedule a campaign |
| `GET /admin/queues` | Bull Board queue dashboard |

## CSV Upload

The CSV must contain an `email` column. A `name` column is optional.

Example:

```csv
email,name
alex@example.com,Alex
sam@example.com,Sam
```

`POST /upload-csv` expects a multipart form with:

- `file`: CSV file
- `name`: campaign name, optional
- `subject`: email subject
- `body`: email body
- `delaySeconds`: delay between scheduled recipients
- `hourlyLimit`: campaign rate limit

Example PowerShell request:

```powershell
$form = @{
  file = Get-Item .\test.csv
  name = "Demo campaign"
  subject = "ReachInbox test"
  body = "This is a scheduled test email."
  delaySeconds = "0"
  hourlyLimit = "100"
}
Invoke-RestMethod -Uri http://localhost:5000/upload-csv -Method Post -Form $form
```

## Verification

Backend type checking:

```powershell
cd backend
npm run typecheck
```

Frontend production build:

```powershell
cd frontend-app
npm run build
```

Basic runtime checks:

```powershell
Invoke-RestMethod http://localhost:5000/health
Invoke-WebRequest http://localhost:5000/admin/queues -UseBasicParsing
```

A healthy backend returns `{"status":"ok"}` from `/health`, and Bull Board returns HTTP `200`.

## Stop Services

Stop the local infrastructure with:

```powershell
docker compose down
```

Add `-v` only when you intentionally want to remove the PostgreSQL, Redis, and Elasticsearch volumes.
