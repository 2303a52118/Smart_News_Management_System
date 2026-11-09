# Smart News Recommendation and Content Management Platform

A full-stack news platform with JWT authentication, role-based publishing,
reader engagement, and a Python machine-learning recommendation service.

## Role-based frontend

The React/Vite dashboard is available at `http://localhost:5173` and signs in
against the Express API at `http://127.0.0.1:5000/api` by default. To use a
different backend URL, create `frontend/.env` from
[`frontend/.env.example`](./frontend/.env.example) and set `VITE_API_URL`.

- **Reader:** personalized ML feed, article search/category filters, article
  details, likes, comments, bookmarks, reading history, and interest settings.
- **Content Creator:** author-owned drafts, article editing and submission, and
  status tracking.
- **Editor:** pending article reviews, publish/reject workflow, and comment
  moderation.
- **Admin:** newsroom overview, editorial tools, category and user management,
  and MongoDB-backed analytics charts.

Navigation and route access are role-gated in the frontend and remain enforced
by the backend APIs. Public registration supports Reader and Content Creator
accounts. Editor applicants remain Readers until an Admin approves their
application; public registration cannot create Admin accounts.

## Editor applications and live-news drafts

Admins can review pending Editor applications from **People & access**. An
applicant has no editorial API permissions until approval changes their
persisted account role to Editor. Rejection leaves the account as a Reader.

Article drafts retain optional source name, source URL, event date/time, and a
short description alongside headline, summary, story, category, tags, and
cover image. Creators can submit drafts through the existing review workflow;
submission remains Pending until an Editor or Admin publishes or rejects it.

## Local AI writing assistant

The article editor can request headline, summary, description, rewrite/grammar,
category, and tag suggestions from a local Ollama model. Draft text is sent
only to the configured local Ollama URL (the backend rejects non-loopback
hosts). Suggestions are returned for explicit review and are never applied,
saved, or published automatically. Install and start Ollama, then pull the
configured model before using this feature:

```powershell
ollama pull llama3.1
ollama serve
```

Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in `backend/.env` if using a different
local model. If the service or model is unavailable, the API reports an error
and does not substitute fake suggestions. See
[backend/API.md](./backend/API.md#local-ai-writing-assistant).

## Machine-learning recommendation architecture

The Node.js backend authenticates the Reader and reads only that Reader's
interests, liked articles, and reading history from MongoDB. It fetches
published article candidates and sends the profile and content to the separate
FastAPI ML service. The service builds TF-IDF vectors from title, summary,
content, category, and tags, then ranks candidate articles using cosine
similarity. Previously read or liked articles are excluded. New readers and
profiles with no matching vocabulary receive a popularity fallback based on
real article views and likes. If FastAPI is unavailable, the Node backend
returns a clearly marked popularity-based fallback.

The ML service does not connect to MongoDB and does not receive user IDs or
credentials. See [ml-service/README.md](./ml-service/README.md) for algorithm
details, API requests, PowerShell setup, tests, and Docker instructions.

## Run locally (Windows PowerShell)

Start MongoDB and configure `backend/.env` using `backend/.env.example`. The
backend defaults to `http://127.0.0.1:8000` for the ML service; override it with
`ML_SERVICE_URL` if needed.

Terminal 1 — Machine-learning service:

```powershell
Set-Location .\ml-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2 — Backend:

```powershell
Set-Location .\backend
npm install
npm run dev
```

Terminal 3 — Frontend:

```powershell
Set-Location .\frontend
npm install
npm run dev
```

Open `http://localhost:5173`, register a Reader, or sign in with a managed
account. The Admin analytics page uses `GET /api/admin/reports`; its charts and
tables are populated from published articles, reader interactions, comments,
and user roles.

## Image uploads

Article and category images can be uploaded as multipart files and are stored
on the backend filesystem under `backend/uploads/articles` or
`backend/uploads/categories`. MongoDB stores only the resulting `/uploads/...`
URL; Express serves those files publicly so article cards and details can
display them. The upload API accepts JPG/JPEG, PNG, and WEBP files up to 5 MB.
Article image uploads require an authenticated Admin, Editor, or ContentCreator;
category image uploads require an authenticated Admin. Existing external
`imageUrl` values remain supported.

The upload directory is excluded from Git. Local filesystem storage is
appropriate for development; production deployments with ephemeral or
multiple backend instances should use persistent shared storage or an object
storage service before deployment.

See [backend/API.md](./backend/API.md#image-upload) for multipart requests,
routes, and response examples.

## Verification

```powershell
Set-Location .\ml-service
$env:PYTHONPATH = (Get-Location).Path
python -m pytest -q

Set-Location ..\backend
npm test
npm run test:integration

Set-Location ..\frontend
npm run build
npm run lint
```

The backend integration suite uses a disposable, loopback-only MongoDB database
and starts the local ML service for end-to-end recommendation tests.

## Deploy to Render

The root `render.yaml` Blueprint defines the static frontend, Express API, and
FastAPI recommendation service. Push the repository to GitHub, then create a
Blueprint at [Render](https://dashboard.render.com/blueprints/new) using that
repository. Set `MONGO_URI` to the production MongoDB connection string when
Render prompts for it; do not commit database credentials.

The Blueprint uses free web-service instances. Their local filesystems are
ephemeral, so uploaded article and category images will not persist across
service restarts or redeployments. Configure persistent/object storage before
relying on production uploads. The local-only Ollama writing assistant is not
available from the hosted backend.
