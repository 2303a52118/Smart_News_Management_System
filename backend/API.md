# Article API

The backend runs at `http://localhost:5000` by default. Routes that require a
user token accept `Authorization: Bearer <JWT>`.

Run the unit tests with `npm test`. To exercise the article endpoints against
MongoDB using a disposable database derived from the configured loopback
`MONGO_URI`, run `npm run test:integration` from the `backend` directory. The
integration suite uses a unique `smart_news_platform_test_<process>` database
and drops only that test database when it finishes; it refuses non-loopback
MongoDB hosts.

## Registration and Editor applications

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Create a Reader or ContentCreator account, or apply for Editor access |
| POST | `/api/auth/login` | Public | Sign in and return the persisted role and Editor application status |
| PATCH | `/api/admin/users/:id/editor-application` | Admin | Approve or reject a pending Editor application |

Registration accepts `name`, `email`, `password`, and optional `role` (`Reader`,
`ContentCreator`, or `Editor`). The default role is Reader. Admin is rejected
for public registration. An Editor application is stored as
`editorApplicationStatus: "Pending"` while the effective role remains Reader;
the account cannot access editorial APIs until an Admin approves it. Approval
sets the role to Editor and status to Approved. Rejection preserves Reader
access and sets the status to Rejected. Admin-created Editor accounts are
already approved.

Admin review request:

```json
{ "decision": "Approved" }
```

`decision` must be `Approved` or `Rejected`. The Admin route derives authority
from the authenticated account in MongoDB, not from caller-supplied role data.

## Public article endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/articles` | Search and browse published articles |
| GET | `/api/articles/:id` | Get a published article by ID |

The list endpoint supports:

| Query parameter | Behavior |
|---|---|
| `q` | Case-insensitive literal search across title, summary, description, source name, and content |
| `category` | Case-insensitive category filter |
| `tags` | One or more tags; use a comma-separated value or repeat the parameter |
| `page` | One-based page number; defaults to `1`, maximum `10000` |
| `limit` | Results per page; defaults to `10`, maximum `100` |

Public results are always restricted to `Published`. Supplying `status` to the
public list endpoint returns `400`; draft, pending, and rejected articles are
never returned by public list or detail endpoints. A valid ID for an
unpublished article returns `404`.

List responses use this shape:

```json
{
  "totalArticles": 27,
  "currentPage": 1,
  "totalPages": 3,
  "articles": []
}
```

## Authenticated article endpoints

| Method | Endpoint | Allowed roles | Description |
|---|---|---|---|
| GET | `/api/articles/mine` | ContentCreator, Admin | Paginated list of the signed-in user's articles |
| GET | `/api/articles/manage` | Admin, Editor | Paginated editorial list; accepts `status` |
| GET | `/api/articles/:id/manage` | Admin, owning ContentCreator | Get one article for the authorized edit form |
| POST | `/api/articles` | ContentCreator, Admin | Create a draft |
| PUT | `/api/articles/:id` | Owner ContentCreator, Admin | Edit eligible article fields |
| PATCH | `/api/articles/:id/submit` | Owner ContentCreator, Admin | Submit a draft or rejected article |
| PATCH | `/api/articles/:id/publish` | Editor, Admin | Publish a pending article |
| PATCH | `/api/articles/:id/reject` | Editor, Admin | Reject a pending article with a reason |
| DELETE | `/api/articles/:id` | Owner ContentCreator, Admin | Delete an eligible article |
| POST | `/api/articles/images` | Admin, Editor, ContentCreator | Upload an article image |

Management and personal-list endpoints accept `q`, `category`, `tags`, `page`,
and `limit`. Admins and Editors may also filter `/manage` by `status` using
`Draft`, `Pending`, `Published`, or `Rejected`. Content Creators may use
`status` on `/mine` to filter their own articles.

Create and edit request fields are `title`, `summary`, `description`, `content`,
`category`, `tags` (an array of strings), `imageUrl`, `sourceName`, `sourceUrl`,
and `eventDate` (ISO date/time or `null`). Source name, source URL, event date,
and description are optional to preserve compatibility with existing articles.
Source URLs must use HTTP or HTTPS. The server does not accept client-supplied
`status`, `author`, or publishing metadata.

Article status transitions:

| Current status | Action | Result |
|---|---|---|
| Draft or Rejected | ContentCreator owner or Admin submits | Pending |
| Pending | Editor/Admin publishes | Published |
| Pending | Editor/Admin rejects with `reason` | Rejected |
| Rejected | Owner edits | Draft |

Only a Pending article can be published or rejected. Rejection reasons are
required, stored on the article as `rejectionReason`, and limited to 1000
characters. Transitions use conditional database updates so duplicate publish
or review actions conflict rather than silently repeating.

Content Creators can edit or delete only their own Draft or Rejected articles.
Admins can manage articles across authors. Editors can review submissions but
cannot edit article content.

## Local AI writing assistant

| Method | Endpoint | Allowed roles | Description |
|---|---|---|---|
| POST | `/api/articles/ai-assist` | ContentCreator, Admin | Get local-model writing suggestions for an unsaved draft |

The endpoint accepts the current draft fields (`title`, `summary`,
`description`, `content`, `category`, `tags`, `sourceName`, and `sourceUrl`).
`content` is required. The request is authenticated and limited to Content
Creators and Admins. The backend sends draft text only to Ollama at
`OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`) and only accepts a
loopback URL; `OLLAMA_MODEL` defaults to `llama3.1`. Install Ollama and pull
the configured model before use. The API does not fall back to another
provider or fake suggestions when Ollama is unavailable.

Successful responses contain suggestions for headline, summary, description,
rewritten content, category, tags, and grammar notes. The user must explicitly
apply individual suggestions in the form. The assistant does not save drafts
or publish articles. Generated text is unverified and must be reviewed.

## Image upload

Upload a file with `multipart/form-data` using the single field name `image`.
Uploads require a valid JWT. Article images are available to Admin, Editor, and
ContentCreator roles; category images are Admin-only. Files must be JPG, JPEG,
PNG, or WEBP and may not exceed 5 MB. The backend checks the file extension,
declared MIME type, and image signature, then saves a UUID-named file in
`backend/uploads/articles` or `backend/uploads/categories`. Original filenames
are not used. MongoDB stores only the returned URL, and Express serves files
from `/uploads`; existing external `imageUrl` values continue to work.

| Method | Endpoint | Allowed roles | Description |
|---|---|---|---|
| POST | `/api/articles/images` | Admin, Editor, ContentCreator | Upload an article image |
| POST | `/api/categories/images` | Admin | Upload a category image |

Example request (replace the token and local file path):

```powershell
curl.exe -X POST "http://localhost:5000/api/articles/images" `
    -H "Authorization: Bearer <JWT>" `
    -F "image=@C:\path\to\article-cover.png"
```

Successful response:

```json
{
  "imageUrl": "/uploads/articles/8f62d861-0c80-4fc6-bc36-08df5da8fb48.png"
}
```

Use the returned `imageUrl` in the existing article or category create/update
request. Invalid file types and files larger than 5 MB return a client error.
The upload directory is local to the backend host and excluded from Git; use
persistent shared or object storage when deploying multiple or ephemeral
backend instances.

## Profile and account settings

All authenticated roles can view and update their own account using the
identity in their JWT; these routes do not accept a user ID. Password hashes
and tokens are never returned.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/account/profile` | View your profile, role, account status, and existing reader interests |
| PUT | `/api/account/profile` | Update your own `name` and/or `email` |
| PATCH | `/api/account/password` | Change password using `currentPassword` and `newPassword` |

Profile updates accept only `name` and `email`; role, account status, and
permissions are read-only. Email addresses are normalized to lowercase and
must be unique. Changing an email does not change the account ID or invalidate
the current JWT; sign in with the updated address on the next login. Password
changes require the current password and a new password of at least six
characters (maximum 72 UTF-8 bytes), which is hashed with bcrypt before storage.
Reader interests remain managed by the existing `/api/readers/me/interests`
endpoints.

Example:

```powershell
Invoke-RestMethod `
    -Uri "http://localhost:5000/api/account/profile" `
    -Method Put `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{ name = "Updated Name"; email = "updated@example.com" } | ConvertTo-Json)
```

## Reader engagement endpoints

Reader interaction endpoints require a Reader JWT. A unique database index on
`(user, article)` stores one interaction record per reader/article pair.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/reader/interactions/?articleId=:id` | Get the signed-in Reader's like and bookmark state for one published article |
| PUT | `/api/articles/:id/like` | Like a published article; repeated requests do not add duplicate likes |
| DELETE | `/api/articles/:id/like` | Unlike a published article |
| GET | `/api/articles/:id/interaction` | Read the signed-in Reader's like and bookmark state for a published article |
| PUT | `/api/articles/:id/bookmark` | Save a published article |
| DELETE | `/api/articles/:id/bookmark` | Remove a saved article |
| POST | `/api/articles/:id/view` | Record a view and update the reader's history |
| GET | `/api/readers/me/bookmarks` | Paginated saved published articles |
| GET | `/api/readers/me/history` | Paginated reading history, newest first |
| GET | `/api/readers/me/interests` | Read the reader's interests |
| PUT | `/api/readers/me/interests` | Replace interests with an array of up to 30 strings |

View requests require an `X-Reading-Session-Id` UUID generated by the client
for one article-reading session. Reuse that same UUID for retries or repeated
view requests during that session; the backend atomically counts at most one
view per reader/article/session. Generate a new UUID for a later reading
session. The article total and reader history count unique sessions. Likes and
bookmarks are idempotent and do not create duplicate interaction records.
Interest entries are trimmed, deduplicated, and limited to 60 characters.
Unpublished or deleted articles are hidden from public details, comments,
bookmarks, and reading history. Readers may still clear their own stale likes
or bookmarks by article ID.

The interaction-state endpoint requires `articleId`, validates that the article
is published, and returns only the authenticated Reader's state:

```json
{
  "liked": true,
  "bookmarked": false
}
```

## Personalized recommendations

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/api/recommendations?limit=10` | Reader | Get personalized published article recommendations |

The optional `limit` must be an integer from 1 to 50. The backend builds the
profile from the authenticated Reader's interests, liked articles, and reading
history; a client cannot supply another user's profile. The FastAPI service
uses TF-IDF and cosine similarity to rank published articles and excludes
articles the Reader has already read or liked. New readers and profiles without
matching article terms receive a popularity ranking. If FastAPI is unavailable,
the backend returns unread published articles ranked by views and likes with
`fallback: true`.

Configure `ML_SERVICE_URL` in the backend environment (default:
`http://127.0.0.1:8000`). Start the ML service from the project root using
PowerShell:

```powershell
Set-Location .\ml-service
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal, start the backend, then request recommendations with a
Reader token:

```powershell
Set-Location .\backend
npm run dev

$recommendations = Invoke-RestMethod `
    -Uri "http://localhost:5000/api/recommendations?limit=10" `
    -Headers $headers
$recommendations.recommendations
```

The ML service Swagger UI is available at `http://127.0.0.1:8000/docs`.

## Analytics reports

`GET /api/admin/reports` is restricted to Admin accounts. It returns category
article/view/like totals, the ten most-viewed published articles, monthly
publishing activity for the latest six months, user counts by role, and reader
engagement totals (views, likes, active readers, bookmarks, and comment
moderation counts). The dashboard charts use aggregates from MongoDB, not
sample or hard-coded values.

## Comments and moderation

| Method | Endpoint | Roles | Description |
|---|---|---|---|
| GET | `/api/articles/:id/comments` | Public | Paginated approved comments for a published article |
| POST | `/api/articles/:id/comments` | Reader | Submit a comment for moderation |
| GET | `/api/comments/manage` | Editor, Admin | Paginated moderation queue; defaults to Pending |
| PUT | `/api/comments/:id` | Comment owner (Reader) | Edit own pending/rejected comment; resubmits for moderation |
| DELETE | `/api/comments/:id` | Comment owner, Editor, Admin | Delete own comment or moderate/remove any comment |
| PATCH | `/api/comments/:id/moderate` | Editor, Admin | Approve or reject a pending comment |

New comments are Pending and are not returned by the public comments endpoint
until an Editor or Admin approves them. Rejecting a comment requires a reason.
Readers may edit their own Pending or Rejected comments; edits return the
comment to Pending. A reader cannot edit an Approved comment.

## PowerShell examples

Register or log in, then keep the returned token for authenticated requests:

```powershell
$baseUrl = "http://localhost:5000"
$login = @{
    email = "creator@example.com"
    password = "your-password"
} | ConvertTo-Json

$session = Invoke-RestMethod `
    -Uri "$baseUrl/api/auth/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body $login

$headers = @{ Authorization = "Bearer $($session.token)" }
```

Search and paginate public articles:

```powershell
$articles = Invoke-RestMethod `
    -Uri "$baseUrl/api/articles?q=climate&category=Science&tags=AI,Policy&page=1&limit=10" `
    -Method Get

$articles.totalArticles
$articles.articles
```

Create a draft and submit it for review:

```powershell
$newArticle = @{
    title = "Example headline"
    summary = "A short article summary."
    content = "Full article content."
    category = "Science"
    tags = @("AI", "Policy")
    imageUrl = ""
} | ConvertTo-Json

$created = Invoke-RestMethod `
    -Uri "$baseUrl/api/articles" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $newArticle

$articleId = $created.article._id
Invoke-RestMethod `
    -Uri "$baseUrl/api/articles/$articleId/submit" `
    -Method Patch `
    -Headers $headers
```

An Editor or Admin can review the item. Use an Editor/Admin token in
`$reviewHeaders`:

```powershell
$reviewHeaders = @{ Authorization = "Bearer $reviewToken" }

Invoke-RestMethod `
    -Uri "$baseUrl/api/articles/$articleId/publish" `
    -Method Patch `
    -Headers $reviewHeaders
```

To reject instead, provide a reason:

```powershell
$rejection = @{ reason = "Please add sources for the key claims." } |
    ConvertTo-Json

Invoke-RestMethod `
    -Uri "$baseUrl/api/articles/$articleId/reject" `
    -Method Patch `
    -Headers $reviewHeaders `
    -ContentType "application/json" `
    -Body $rejection
```

Invalid pagination is rejected with HTTP `400`:

```powershell
try {
    Invoke-RestMethod -Uri "$baseUrl/api/articles?page=0&limit=500" -Method Get
} catch {
    $_.Exception.Message
}
```

Like, save, and track a published article as a Reader:

```powershell
$readerHeaders = @{ Authorization = "Bearer $readerToken" }
$articleId = "REPLACE_WITH_PUBLISHED_ARTICLE_ID"

Invoke-RestMethod `
    -Uri "$baseUrl/api/articles/$articleId/like" `
    -Method Put `
    -Headers $readerHeaders

Invoke-RestMethod `
    -Uri "$baseUrl/api/articles/$articleId/bookmark" `
    -Method Put `
    -Headers $readerHeaders

$readingSessionId = [guid]::NewGuid().ToString()
Invoke-RestMethod `
    -Uri "$baseUrl/api/articles/$articleId/view" `
    -Method Post `
    -Headers ($readerHeaders + @{
        "X-Reading-Session-Id" = $readingSessionId
    })

$savedArticles = Invoke-RestMethod `
    -Uri "$baseUrl/api/readers/me/bookmarks?page=1&limit=10" `
    -Headers $readerHeaders
```

Submit a comment and approve it with an Editor/Admin token:

```powershell
$comment = @{ content = "Useful coverage." } | ConvertTo-Json
$submitted = Invoke-RestMethod `
    -Uri "$baseUrl/api/articles/$articleId/comments" `
    -Method Post `
    -Headers $readerHeaders `
    -ContentType "application/json" `
    -Body $comment

$moderation = @{ status = "Approved" } | ConvertTo-Json
Invoke-RestMethod `
    -Uri "$baseUrl/api/comments/$($submitted.comment._id)/moderate" `
    -Method Patch `
    -Headers $reviewHeaders `
    -ContentType "application/json" `
    -Body $moderation
```

Update reader interests:

```powershell
$preferences = @{ interests = @("Science", "Technology", "World News") } |
    ConvertTo-Json
Invoke-RestMethod `
    -Uri "$baseUrl/api/readers/me/interests" `
    -Method Put `
    -Headers $readerHeaders `
    -ContentType "application/json" `
    -Body $preferences
```
