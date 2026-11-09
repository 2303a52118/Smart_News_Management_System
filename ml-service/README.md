# Smart News ML Recommendation Service

FastAPI microservice for content-based news ranking. It receives a reader
profile and published article candidates from the Node.js backend; it does not
connect directly to MongoDB or accept a reader identity. The backend derives
all profile data from the authenticated user's own records.

## Recommendation architecture

1. The backend loads the authenticated Reader's selected `User.interests`,
   `ReaderInteraction` reading history and liked articles, and published
   `Article` candidates.
2. The backend sends that profile to `POST /recommend`.
3. This service combines each article's title, summary, content, category, and
   tags into normalized text and vectorizes candidate/profile documents with
   scikit-learn `TfidfVectorizer`.
4. It uses `cosine_similarity` to score how closely each candidate matches the
   reader profile, then sorts by similarity. Articles in reading history or
   liked articles are excluded.
5. If the reader has no useful profile or no vocabulary overlap, the service
   sorts unread published articles by actual views and likes (with recency as a
   tie-breaker).

Liked article text receives additional weight when constructing a profile.
Reading-history text also contributes preference signals. The response
includes a similarity score and a human-readable reason for each result.
Duplicate article IDs are collapsed and only `Published` candidates are
eligible.

## Install and run on Windows PowerShell

From the project root:

```powershell
Set-Location .\ml-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The Swagger UI is at `http://127.0.0.1:8000/docs`; OpenAPI JSON is at
`http://127.0.0.1:8000/openapi.json`.

Run tests in another terminal:

```powershell
Set-Location .\ml-service
$env:PYTHONPATH = (Get-Location).Path
python -m pytest -q
```

Tests use local realistic samples and do not call external APIs.

## Endpoints

### `GET /health`

Returns service status.

### `POST /recommend`

Accepts `reader_interests`, `preferred_categories`, `preferred_tags`,
`reading_history`, `liked_articles`, `articles`, and a result `limit`.
Article IDs and text lengths are validated with Pydantic. Requests with unknown
fields or invalid article records are rejected with HTTP 422. Article records
have `id`, `title`, `summary`, `content`, `category`, `tags`, `status`, `views`,
`likes`, `published_at`, and `image_url` fields.

Example:

```powershell
$body = @{
    reader_interests = @("astronomy", "space")
    preferred_categories = @("Science")
    preferred_tags = @("telescope")
    reading_history = @()
    liked_articles = @()
    limit = 5
    articles = @(
        @{
            id = "article-1"
            title = "A new space telescope"
            summary = "Astronomy discoveries from a distant galaxy."
            content = "Researchers study stars, space, and galaxies."
            category = "Science"
            tags = @("astronomy", "telescope")
            status = "Published"
            views = 25
            likes = 3
            image_url = ""
        },
        @{
            id = "article-2"
            title = "City football final"
            summary = "Local sports teams meet in the final."
            content = "The football match drew a large crowd."
            category = "Sports"
            tags = @("football")
            status = "Published"
            views = 100
            likes = 8
            image_url = ""
        }
    )
} | ConvertTo-Json -Depth 8

Invoke-RestMethod `
    -Uri "http://127.0.0.1:8000/recommend" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
```

The response contains `recommendations`, `count`, and a `message`. Each
recommendation contains `article_id`, `title`, `category`, `summary`,
`image_url`, `similarity_score`, and `recommendation_reason`.

## Node.js integration

Start the ML service at port 8000 and configure the backend with
`ML_SERVICE_URL=http://127.0.0.1:8000` (the backend uses that default if the
variable is absent). Start the backend with `Set-Location .\backend; npm run
dev`. Authenticated Reader clients request `GET /api/recommendations?limit=10`.
If the ML service is down, the backend returns a `fallback: true` response
ranked using published unread article views and likes.

The Node integration tests start a local Uvicorn process and use the existing
isolated disposable MongoDB integration database:

```powershell
Set-Location .\backend
npm run test:integration
```

## Docker

Build and run the standalone service from the project root:

```powershell
docker build -f .\ml-service\Dockerfile -t smart-news-ml .\ml-service
docker run --rm -p 8000:8000 smart-news-ml
```
