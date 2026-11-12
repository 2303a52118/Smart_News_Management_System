import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight, Bookmark, Check, ChevronLeft, Clock3, Compass, Eye, FileText, Heart, LoaderCircle,
  LockKeyhole, Mail, MessageSquare, Plus, Search, Send, Sparkles, Trash2,
  Newspaper, Settings2, TrendingUp, UserRound, X,
} from 'lucide-react'
import api, { getAssetUrl, getErrorMessage } from './api'
import { getPasswordChangeValidationMessage } from './accountValidation'
import { IMAGE_ACCEPT, uploadImage, validateImageSelection } from './imageUpload'
import { useAuth } from './auth-context'

const dateLabel = (value) => value
  ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
  : 'Recently'
const eventDateTimeLabel = (value) => value
  ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : ''

const initials = (value = '') => value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'N'
const dateTimeLocalValue = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const safeHttpUrl = (value) => {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="heading-action">{action}</div>}
    </div>
  )
}

function Notice({ tone = 'error', children, onClose }) {
  if (!children) return null
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onClose && <button className="notice-close" aria-label="Dismiss message" onClick={onClose}><X size={15} /></button>}
    </div>
  )
}

function Loading({ label = 'Loading your newsroom...' }) {
  return <div className="loading-state"><LoaderCircle className="spin" size={22} /><span>{label}</span></div>
}

function EmptyState({ title, description, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Sparkles size={20} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

function ArticleCard({ article, compact = false }) {
  const id = article._id || article.article_id
  const category = article.category || ''
  const author = article.author?.name || article.author
  const publishedAt = article.publishedAt || article.published_at || article.createdAt
  return (
    <article className={`article-card ${compact ? 'article-card-compact' : ''}`}>
      <Link to={`/article/${id}`} className={`article-visual${category ? ` category-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}`} aria-label={`Read ${article.title}`}>
        {article.imageUrl || article.image_url
          ? <img src={getAssetUrl(article.imageUrl || article.image_url)} alt="" loading="lazy" />
          : <span className="visual-monogram">{initials(category || article.title || 'News')}</span>}
        {category && <span className="category-pill">{category}</span>}
      </Link>
      <div className="article-card-body">
        {(author || publishedAt) && <div className="article-meta">{author && <span>{author}</span>}{author && publishedAt && <span className="meta-dot" />}{publishedAt && dateLabel(publishedAt)}</div>}
        <Link to={`/article/${id}`} className="article-title-link"><h3>{article.title}</h3></Link>
        <p className="article-summary">{article.summary || article.description || 'Read the latest story from our newsroom.'}</p>
        {!compact && <div className="article-card-footer"><span><Clock3 size={14} /> 4 min read</span><span>{article.recommendation_reason || article.recommendationReason || ''}</span></div>}
      </div>
    </article>
  )
}

function ArticleGrid({ articles, compact = false }) {
  return <div className={`article-grid ${compact ? 'article-grid-compact' : ''}`}>{articles.map((article) => <ArticleCard key={article._id || article.article_id} article={article} compact={compact} />)}</div>
}

export function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const { login, register } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [values, setValues] = useState({ name: '', email: '', password: '', role: 'Reader' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const signedInUser = isRegister
        ? await register(values)
        : await login({ email: values.email, password: values.password })
      const roleHome = signedInUser?.role === 'Reader' ? '/feed' : '/overview'
      navigate(location.state?.from?.pathname || roleHome, { replace: true })
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-story">
        <Link className="brand auth-brand" to="/login"><span className="brand-mark"><span className="brand-glyph">S</span></span><span>Smart News<small>NEWSROOM</small></span></Link>
        <div className="auth-story-copy">
          <span className="story-kicker"><span className="live-dot" /> THE WORLD, IN CONTEXT</span>
          <h1>Stories worth<br />your <em>attention.</em></h1>
          <p>Thoughtful journalism, tailored to what matters to you. Find your next perspective.</p>
          <div className="auth-story-foot"><span>Independent voices.</span><span>Better informed.</span></div>
        </div>
        <div className="auth-quote"><span>“</span><p>A well-informed mind is a curious mind.</p>        <small>THE SMART NEWS EDITION</small></div>
      </div>
      <div className="auth-form-side">
        <div className="auth-form-wrap">
          <span className="mobile-auth-brand">Smart News</span>
          <div className="eyebrow">{isRegister ? 'JOIN THE CONVERSATION' : 'WELCOME BACK'}</div>
          <h2>{isRegister ? 'Create your account' : 'Sign in to Smart News'}</h2>
          <p className="auth-subtitle">{isRegister ? 'A more thoughtful news feed starts here.' : 'Your daily briefing is just a moment away.'}</p>
          <Notice>{error}</Notice>
          <form onSubmit={submit} className="form-stack">
            {isRegister && <label className="field-label">Full name<div className="input-wrap"><UserRound size={17} /><input autoComplete="name" required maxLength={100} placeholder="Your name" value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></div></label>}
            {isRegister && <label className="field-label">Account type<select className="text-input" required value={values.role} onChange={(event) => setValues({ ...values, role: event.target.value })}><option value="Reader">Reader</option><option value="ContentCreator">Content Creator</option><option value="Editor">Editor (requires Admin approval)</option></select></label>}
            <label className="field-label">Email address<div className="input-wrap"><Mail size={17} /><input type="email" autoComplete="email" required placeholder="you@example.com" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></div></label>
            <label className="field-label">Password<div className="input-wrap"><LockKeyhole size={17} /><input type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} required minLength={isRegister ? 6 : 1} placeholder="Enter your password" value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} /></div>{isRegister && <small className="field-help">Use at least 6 characters.</small>}</label>
            <button className="button button-primary button-wide" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{isRegister ? 'Create account' : 'Sign in'}<ArrowRight size={17} /></button>
          </form>
          <div className="auth-switch">{isRegister ? 'Already part of the newsroom?' : 'New to Smart News?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></div>
          <div className="reader-note"><ShieldInfo /> Admin accounts are created by an Admin. Editor access is granted after Admin approval.</div>
        </div>
      </div>
    </div>
  )
}

function ShieldInfo() {
  return <LockKeyhole size={14} />
}


export function FeedPage() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [message, setMessage] = useState('')
  const [fallback, setFallback] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')

  useEffect(() => {
    let active = true

    api.get('/recommendations?limit=12')
      .then(({ data }) => {
        if (!active) return
        setItems(data.recommendations || [])
        setMessage(data.message || '')
        setFallback(Boolean(data.fallback))
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const categories = [
    'All',
    ...new Set(items.map((item) => item.category).filter(Boolean)),
  ]

  const filteredItems = activeCategory === 'All'
    ? items
    : items.filter((item) => item.category === activeCategory)

  const featured = filteredItems[0]
  const remainingItems = filteredItems.slice(1)

  return (
    <div className="premium-feed">
      <motion.section
        className="feed-welcome"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65 }}
      >
        <div>
          <span className="premium-eyebrow">
            <Sparkles size={14} /> YOUR PERSONAL NEWSROOM
          </span>
          <h1>
            Stay Curious.
            <br />
            <span>Stay Informed.</span>
          </h1>
          <p>
            Welcome back, {user?.name?.split(' ')[0] || 'Reader'}.
            Your personalized briefing brings the stories that matter into focus.
          </p>
        </div>

        <div className="welcome-orbit" aria-hidden="true">
          <div className="orbit-ring orbit-ring-one" />
          <div className="orbit-ring orbit-ring-two" />
          <Sparkles size={35} />
        </div>
      </motion.section>

      {user?.editorApplicationStatus === 'Pending' && (
        <Notice tone="success">
          Your Editor application is awaiting Admin approval. Reader access remains available while it is reviewed.
        </Notice>
      )}

      {user?.editorApplicationStatus === 'Rejected' && (
        <Notice>
          Your Editor application was not approved. You can continue using your Reader account.
        </Notice>
      )}

      <motion.div
        className="premium-feed-banner"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
      >
        <span className="premium-banner-icon">
          <Sparkles size={19} />
        </span>
        <div>
          <strong>
            {fallback ? 'Trending across the newsroom' : 'Curated around your interests'}
          </strong>
          <p>
            {message || 'Your reading journey helps us discover stories you may love.'}
          </p>
        </div>
        <Link to="/interests" className="premium-tune-link">
          Personalize <ArrowRight size={15} />
        </Link>
      </motion.div>

      {error && <Notice>{error}</Notice>}

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState
          title="Your next story is around the corner"
          description="There are no recommendations yet. Explore the latest articles or update your interests."
          action={
            <Link className="button button-secondary" to="/discover">
              Explore stories
            </Link>
          }
        />
      ) : (
        <>
          <motion.section
            className="feed-section"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.55 }}
          >
            <div className="premium-section-heading">
              <div>
                <span className="premium-eyebrow">EDITOR'S PICK FOR YOU</span>
                <h2>Today's spotlight</h2>
              </div>
              <span className="live-indicator">
                <span /> LIVE FEED
              </span>
            </div>

            <div className="featured-story">
              {featured ? (
                <>
                  <Link
                    to={`/article/${featured._id || featured.article_id}`}
                    className="featured-image"
                    aria-label={`Read ${featured.title}`}
                  >
                    {featured.imageUrl || featured.image_url ? (
                      <img
                        src={getAssetUrl(featured.imageUrl || featured.image_url)}
                        alt=""
                      />
                    ) : (
                      <div className="featured-image-placeholder">
                        <Newspaper size={54} />
                      </div>
                    )}
                    {featured.category && <span className="featured-image-label">{featured.category}</span>}
                  </Link>

                  <div className="featured-copy">
                    <span className="featured-kicker">
                      <Sparkles size={13} /> FEATURED STORY
                    </span>
                    <h2>{featured.title}</h2>
                    <p>
                      {featured.summary ||
                        featured.description ||
                        'Explore this story and discover a fresh perspective.'}
                    </p>
                    {(featured.author?.name || featured.author || featured.publishedAt || featured.published_at || featured.createdAt) && (
                      <div className="featured-meta">
                        {(featured.author?.name || featured.author) && <span>{featured.author?.name || featured.author}</span>}
                        {(featured.author?.name || featured.author) && (featured.publishedAt || featured.published_at || featured.createdAt) && <span>•</span>}
                        {(featured.publishedAt || featured.published_at || featured.createdAt) && <span>{dateLabel(featured.publishedAt || featured.published_at || featured.createdAt)}</span>}
                      </div>
                    )}
                    <Link
                      to={`/article/${featured._id || featured.article_id}`}
                      className="featured-read-button"
                    >
                      Read full story <ArrowRight size={17} />
                    </Link>
                  </div>
                </>
              ) : (
                <p className="premium-empty-filter">
                  No stories in this category yet. Choose another topic.
                </p>
              )}
            </div>
          </motion.section>

          <section className="feed-section">
            <div className="premium-section-heading">
              <div>
                <span className="premium-eyebrow">EXPLORE YOUR INTERESTS</span>
                <h2>Find your next read</h2>
              </div>
            </div>

            <div className="premium-category-list">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`premium-category ${
                    activeCategory === category ? 'premium-category-active' : ''
                  }`}
                  onClick={() => setActiveCategory(category)}
                >
                  {category === 'All' && <Compass size={14} />}
                  {category}
                </button>
              ))}
            </div>
          </section>

          <section className="feed-section">
            <div className="premium-section-heading">
              <div>
                <span className="premium-eyebrow">
                  {fallback ? 'POPULAR RIGHT NOW' : 'POWERED BY YOUR READING INTERESTS'}
                </span>
                <h2>{fallback ? 'Trending stories' : 'Picked for you'}</h2>
              </div>
              <Link to="/discover" className="premium-view-all">
                Discover all <ArrowRight size={15} />
              </Link>
            </div>

            {remainingItems.length > 0 ? (
              <motion.div
                className="article-grid premium-article-grid"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: {
                    transition: { staggerChildren: 0.09 },
                  },
                }}
              >
                {remainingItems.map((article) => (
                  <motion.div
                    key={article._id || article.article_id}
                    variants={{
                      hidden: { opacity: 0, y: 22 },
                      visible: { opacity: 1, y: 0 },
                    }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                    whileHover={{ y: -7, transition: { duration: 0.2 } }}
                  >
                    <ArticleCard article={article} />
                  </motion.div>
                ))}
              </motion.div>
            ) : featured ? (
              <p className="premium-empty-filter">
                That's all the stories in this category for now. Try another category.
              </p>
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}


export function DiscoverPage({ managed = false, admin = false }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [categories, setCategories] = useState([])
  const [articles, setArticles] = useState([])
  const [loadedKey, setLoadedKey] = useState('')
  const [error, setError] = useState('')
  const requestKey = `${managed}:${category}:${status}`
  const loading = loadedKey !== requestKey

  useEffect(() => {
    api.get('/categories').then(({ data }) => setCategories(data)).catch((requestError) => setError(getErrorMessage(requestError)))
  }, [])

  const fetchArticles = useCallback(async () => {
      const endpoint = admin ? '/articles/manage' : managed ? '/articles/mine' : '/articles'
      const { data } = await api.get(endpoint, {
        params: {
          ...(submittedSearch.trim() ? { q: submittedSearch.trim() } : {}),
          ...(category ? { category } : {}),
          ...(managed && status ? { status } : {}),
          limit: 30,
        },
      })
      return data.articles || []
  }, [admin, category, managed, status, submittedSearch])

  useEffect(() => {
    let active = true
    fetchArticles()
      .then((result) => {
        if (!active) return
        setArticles(result)
        setError('')
        setLoadedKey(requestKey)
      })
      .catch((requestError) => {
        if (!active) return
        setError(getErrorMessage(requestError))
        setLoadedKey(requestKey)
      })
    return () => { active = false }
  }, [fetchArticles, requestKey])

  const refreshArticles = async () => {
    setLoadedKey('')
    try {
      setArticles(await fetchArticles())
      setError('')
      setLoadedKey(requestKey)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
      setLoadedKey(requestKey)
    }
  }

  const loadArticles = (event) => {
    event.preventDefault()
    if (submittedSearch === search) {
      refreshArticles()
    } else {
      setLoadedKey('')
      setSubmittedSearch(search)
    }
  }

  const deleteArticle = async (articleId) => {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return
    try {
      await api.delete(`/articles/${articleId}`)
      await refreshArticles()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    }
  }

  const submitArticle = async (articleId) => {
    try {
      await api.patch(`/articles/${articleId}/submit`)
      await refreshArticles()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    }
  }

  return (
    <>
      <PageHeader eyebrow={admin ? 'PLATFORM CONTENT' : managed ? 'YOUR WORKSPACE' : 'THE LATEST'} title={admin ? 'The newsroom archive' : managed ? 'Your stories' : 'Explore the latest'} description={admin ? 'Search and manage stories across every author and publishing status.' : managed ? 'Draft, refine, and follow your stories through review.' : 'A considered selection from across the newsroom.'} action={managed && <Link className="button button-primary" to="/articles/new"><Plus size={17} /> New story</Link>} />
      <form className="filter-toolbar" onSubmit={loadArticles}>
        <div className="search-field"><Search size={17} /><input placeholder="Search headlines, topics, and more" value={search} onChange={(event) => setSearch(event.target.value)} /><button type="submit">Search</button></div>
        <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item._id} value={item.name}>{item.name}</option>)}</select>
        {managed && <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{['Draft', 'Pending', 'Published', 'Rejected'].map((value) => <option key={value}>{value}</option>)}</select>}
      </form>
      <Notice>{error}</Notice>
      {loading ? <Loading /> : articles.length ? <div className={managed ? 'managed-article-list' : ''}>
        {managed ? articles.map((article) => (
          <article className="managed-article" key={article._id}>
            <div className="managed-copy">{article.imageUrl && <img className="managed-article-image" src={getAssetUrl(article.imageUrl)} alt="" loading="lazy" />}<div className="article-meta"><span className={`status-pill status-${article.status?.toLowerCase()}`}>{article.status}</span><span>{article.category}</span><span>{dateLabel(article.updatedAt)}</span></div><h3>{article.title}</h3><p>{article.summary}</p>{article.rejectionReason && <p className="rejection-note">Editor's note: {article.rejectionReason}</p>}</div>
            <div className="managed-actions">{(admin || ['Draft', 'Rejected'].includes(article.status)) && <><Link className="button button-secondary button-small" to={`/articles/${article._id}/edit`}>Edit</Link>{['Draft', 'Rejected'].includes(article.status) && <button className="button button-quiet button-small" onClick={() => submitArticle(article._id)}>Submit</button>}<button className="icon-button danger-action" aria-label="Delete article" onClick={() => deleteArticle(article._id)}><Trash2 size={16} /></button></>}</div>
          </article>
        )) : <ArticleGrid articles={articles} />}
      </div> : <EmptyState title={managed ? 'Nothing in your story list yet' : 'No stories found'} description={managed ? 'Start with a story idea and bring it to the newsroom.' : 'Try a different search or category.'} action={managed && <Link className="button button-primary" to="/articles/new"><Plus size={16} /> Write a story</Link>} />}
    </>
  )
}

export function ArticlePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [article, setArticle] = useState(null)
  const [comments, setComments] = useState([])
  const [comment, setComment] = useState('')
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [interactionError, setInteractionError] = useState(null)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [interactionArticleId, setInteractionArticleId] = useState('')
  const [likeBusy, setLikeBusy] = useState(false)
  const [bookmarkBusy, setBookmarkBusy] = useState(false)
  const likeRequestLock = useRef(false)
  const bookmarkRequestLock = useRef(false)

  useEffect(() => {
    let active = true
    api.get(`/articles/${id}`)
      .then(({ data }) => {
        if (!active) return
        setArticle(data)
        setError('')
        if (user?.role === 'Reader') {
          const storageKey = `reading-session-${id}`
          let sessionId = sessionStorage.getItem(storageKey)
          if (!sessionId) {
            sessionId = crypto.randomUUID()
            sessionStorage.setItem(storageKey, sessionId)
          }
          api.post(`/articles/${id}/view`, {}, {
            headers: { 'X-Reading-Session-Id': sessionId },
          }).catch((viewError) => {
            if (active) setError(getErrorMessage(viewError))
          })
        }
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    api.get('/reader/interactions/', { params: { articleId: id } })
      .then(({ data }) => {
        if (!active) return
        setLiked(data.liked)
        setSaved(data.bookmarked)
        setInteractionError(null)
      })
      .catch((requestError) => {
        if (active) {
          setInteractionError({
            articleId: id,
            message: getErrorMessage(requestError),
          })
        }
      })
      .finally(() => {
        if (active) setInteractionArticleId(id)
      })

    api.get(`/articles/${id}/comments?limit=20`)
      .then(({ data }) => {
        if (active) setComments(data.comments || [])
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError))
      })
    return () => { active = false }
  }, [id, user?.role])

  const toggleLike = async () => {
    if (likeRequestLock.current || interactionArticleId !== id || interactionError?.articleId === id) return
    const nextLiked = !liked
    likeRequestLock.current = true
    setLikeBusy(true)
    try {
      await api({ method: liked ? 'delete' : 'put', url: `/articles/${id}/like` })
      setLiked(nextLiked)
      setError('')
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      likeRequestLock.current = false
      setLikeBusy(false)
    }
  }
  const toggleBookmark = async () => {
    if (bookmarkRequestLock.current || interactionArticleId !== id || interactionError?.articleId === id) return
    const nextSaved = !saved
    bookmarkRequestLock.current = true
    setBookmarkBusy(true)
    try {
      await api({ method: saved ? 'delete' : 'put', url: `/articles/${id}/bookmark` })
      setSaved(nextSaved)
      setNotice(nextSaved ? 'Saved to your reading list.' : 'Removed from your reading list.')
      setError('')
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      bookmarkRequestLock.current = false
      setBookmarkBusy(false)
    }
  }
  const postComment = async (event) => {
    event.preventDefault()
    try {
      await api.post(`/articles/${id}/comments`, { content: comment })
      setComment('')
      setNotice('Your comment was sent to the moderation queue.')
    } catch (requestError) { setError(getErrorMessage(requestError)) }
  }

  if (loading || (article && String(article._id) !== id)) return <Loading label="Opening your story..." />
  if (error && !article) return <><Notice>{error}</Notice><Link to="/discover" className="text-link"><ChevronLeft size={16} /> Back to stories</Link></>
  if (!article) return null

  return (
    <div className="article-detail">
      <Link className="back-link" to={user?.role === 'Reader' ? '/discover' : '/my-articles'}><ChevronLeft size={16} /> Back to stories</Link>
      <div className="article-detail-heading"><span className="category-pill">{article.category}</span><h1>{article.title}</h1><p className="article-detail-summary">{article.summary}</p><div className="article-meta detail-meta"><span>By {article.author?.name || 'Smart News Desk'}</span><span className="meta-dot" />{dateLabel(article.publishedAt)}<span className="meta-dot" /><Eye size={14} /> {article.views || 0} views</div>{(article.sourceName || article.eventDate) && <div className="source-details">{article.sourceName && <span>Source: {safeHttpUrl(article.sourceUrl) ? <a href={safeHttpUrl(article.sourceUrl)} target="_blank" rel="noreferrer">{article.sourceName}</a> : article.sourceName}</span>}{article.eventDate && <span>Event date: {eventDateTimeLabel(article.eventDate)}</span>}</div>}{article.description && <p className="article-detail-description">{article.description}</p>}</div>
      {(article.imageUrl) && <img className="detail-image" src={getAssetUrl(article.imageUrl)} alt="" />}
      <div className="article-reading-layout"><div className="article-content">{article.content?.split(/\n+/).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>)}</div><aside className="reading-actions"><span className="eyebrow">YOUR READING</span><button onClick={toggleLike} disabled={interactionArticleId !== id || interactionError?.articleId === id || likeBusy} className={`reading-action ${liked ? 'reading-action-active' : ''}`}><Heart size={17} fill={liked ? 'currentColor' : 'none'} /> {interactionArticleId !== id ? 'Checking...' : likeBusy ? 'Updating...' : liked ? 'Liked' : 'Like story'}</button><button onClick={toggleBookmark} disabled={interactionArticleId !== id || interactionError?.articleId === id || bookmarkBusy} className={`reading-action ${saved ? 'reading-action-active' : ''}`}><Bookmark size={17} fill={saved ? 'currentColor' : 'none'} /> {interactionArticleId !== id ? 'Checking...' : bookmarkBusy ? 'Updating...' : saved ? 'Saved' : 'Save for later'}</button><div className="reading-note">Thoughtful journalism, at your own pace.</div></aside></div>
      <Notice>{interactionError?.articleId === id ? interactionError.message : ''}</Notice><Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
      <section className="comments-section"><div className="section-title-row"><div><div className="eyebrow">JOIN THE CONVERSATION</div><h2>Reader notes <span className="count-badge">{comments.length}</span></h2></div></div>
        {user?.role === 'Reader' && <form className="comment-form" onSubmit={postComment}><textarea aria-label="Write a comment" required maxLength={5000} placeholder="Add a thoughtful comment..." value={comment} onChange={(event) => setComment(event.target.value)} /><div><small>Comments are reviewed before appearing publicly.</small><button className="button button-primary button-small" disabled={!comment.trim()}><Send size={14} /> Send note</button></div></form>}
        {comments.map((item) => <div className="comment-item" key={item._id}><span className="avatar avatar-comment">{initials(item.author?.name)}</span><div><strong>{item.author?.name || 'Reader'}</strong><small>{dateLabel(item.createdAt)}</small><p>{item.content}</p></div></div>)}
        {!comments.length && <p className="muted-copy">No reader notes yet. Be the first to share a perspective.</p>}
      </section>
    </div>
  )
}

export function InterestsPage() {
  const [interests, setInterests] = useState([])
  const [entry, setEntry] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  useEffect(() => {
    api.get('/readers/me/interests').then(({ data }) => setInterests(data.interests || [])).catch((requestError) => setError(getErrorMessage(requestError))).finally(() => setLoading(false))
  }, [])

  const addInterest = (event) => {
    event.preventDefault()
    const value = entry.trim()
    if (!value) return
    if (value.length > 60) { setError('Each interest must be 60 characters or fewer.'); return }
    if (interests.length >= 30 && !interests.includes(value)) { setError('You can add up to 30 interests.'); return }
    setInterests([...new Set([...interests, value])])
    setEntry('')
    setError('')
    setSuccess('')
  }
  const save = async () => {
    setSaving(true); setError(''); setSuccess('')
    try {
      const { data } = await api.put('/readers/me/interests', { interests })
      setInterests(data.interests)
      setSuccess('Your interests are saved. Your recommendations will adapt.')
    } catch (requestError) { setError(getErrorMessage(requestError)) } finally { setSaving(false) }
  }
  if (loading) return <Loading />
  return (
    <>
      <PageHeader eyebrow="MAKE IT YOURS" title="Follow your curiosity." description="Choose topics you care about. Smart News uses them to shape your personalized feed." />
      <div className="preferences-layout"><section className="panel preferences-panel"><div className="panel-heading"><span className="panel-icon lavender"><Sparkles size={18} /></span><div><h2>Your topics</h2><p>Add a few topics to get started. You can change them anytime.</p></div></div><form className="interest-entry" onSubmit={addInterest}><input maxLength={60} aria-label="Add an interest" placeholder="e.g. climate, design, local news" value={entry} onChange={(event) => setEntry(event.target.value)} /><button className="button button-secondary" disabled={!entry.trim()}><Plus size={16} /> Add topic</button></form><div className="interest-chips">{interests.map((interest) => <span className="interest-chip" key={interest}>{interest}<button aria-label={`Remove ${interest}`} onClick={() => setInterests(interests.filter((item) => item !== interest))}><X size={13} /></button></span>)}{!interests.length && <span className="muted-copy">Your topics will appear here.</span>}</div><Notice>{error}</Notice><Notice tone="success">{success}</Notice><div className="panel-actions"><span>{interests.length} of 30 topics</span><button className="button button-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save preferences'} <ArrowRight size={16} /></button></div></section><aside className="preferences-aside"><span className="aside-spark"><Sparkles size={20} /></span><h3>Better signal.<br />Less noise.</h3><p>Your interests work alongside the stories you read and like to make your feed more relevant.</p><Link className="text-link" to="/feed">See your feed <ArrowRight size={15} /></Link></aside></div>
    </>
  )
}

export function ProfileSettingsPage() {
  const { user, updateUser } = useAuth()
  const [profile, setProfile] = useState(user)
  const [draft, setDraft] = useState({ name: user?.name || '', email: user?.email || '' })
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    api.get('/account/profile')
      .then(({ data }) => {
        setProfile(data.user)
        setDraft({ name: data.user.name, email: data.user.email })
        updateUser(data.user)
      })
      .catch((requestError) => setError(getErrorMessage(requestError)))
      .finally(() => setLoading(false))
  }, [updateUser])

  const saveProfile = async (event) => {
    event.preventDefault()
    setSavingProfile(true)
    setError('')
    setSuccess('')
    try {
      const { data } = await api.put('/account/profile', draft)
      setProfile(data.user)
      setDraft({ name: data.user.name, email: data.user.email })
      updateUser(data.user)
      setSuccess('Your profile has been updated.')
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSavingProfile(false)
    }
  }

  const changePassword = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    const validationMessage = getPasswordChangeValidationMessage(
      passwords.newPassword,
      passwords.confirmPassword
    )
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    setSavingPassword(true)
    try {
      const { data } = await api.patch('/account/password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      })
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setSuccess(data.message)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSavingPassword(false)
    }
  }

  if (loading) return <Loading label="Loading your account settings..." />

  return (
    <>
      <PageHeader eyebrow="YOUR ACCOUNT" title="Profile & settings." description="Manage your account details and sign-in security." />
      <Notice>{error}</Notice>
      <Notice tone="success">{success}</Notice>
      <div className="settings-layout">
        <form className="panel settings-panel" onSubmit={saveProfile}>
          <div className="panel-heading"><span className="panel-icon lavender"><UserRound size={18} /></span><div><h2>Profile information</h2><p>Update your name and email address.</p></div></div>
          <label className="field-label">Full name<input className="text-input" autoComplete="name" required maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className="field-label">Email address<input className="text-input" type="email" autoComplete="email" required maxLength={254} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
          <label className="field-label">Role<input className="text-input settings-readonly" value={profile?.role || user?.role || ''} readOnly /></label>
          <div className="form-button-row"><button type="button" className="button button-quiet" disabled={savingProfile} onClick={() => setDraft({ name: profile?.name || '', email: profile?.email || '' })}>Cancel changes</button><button className="button button-primary" disabled={savingProfile}>{savingProfile ? 'Saving...' : 'Save profile'}</button></div>
        </form>

        <form className="panel settings-panel" onSubmit={changePassword}>
          <div className="panel-heading"><span className="panel-icon lavender"><LockKeyhole size={18} /></span><div><h2>Change password</h2><p>Confirm your current password before choosing a new one.</p></div></div>
          <label className="field-label">Current password<input className="text-input" type="password" autoComplete="current-password" required value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} /></label>
          <label className="field-label">New password<input className="text-input" type="password" autoComplete="new-password" required minLength={6} maxLength={72} value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} /><small className="field-help">Use at least 6 characters.</small></label>
          <label className="field-label">Confirm new password<input className="text-input" type="password" autoComplete="new-password" required minLength={6} maxLength={72} value={passwords.confirmPassword} onChange={(event) => setPasswords({ ...passwords, confirmPassword: event.target.value })} /></label>
          <div className="form-button-row"><button className="button button-primary" disabled={savingPassword}>{savingPassword ? 'Updating...' : 'Update password'}</button></div>
        </form>

        <section className="panel settings-panel account-settings-panel">
          <div className="panel-heading"><span className="panel-icon lavender"><Settings2 size={18} /></span><div><h2>Account settings</h2><p>Your role and account state are managed securely.</p></div></div>
          <div className="settings-summary"><span>Account status</span><strong>{profile?.isActive === false ? 'Inactive' : 'Active'}</strong></div>
          {user?.role === 'Reader' && <div className="settings-summary"><span>Reader interests</span><span>{profile?.interests?.length || 0} topics <Link className="text-link" to="/interests">Manage interests <ArrowRight size={14} /></Link></span></div>}
        </section>
      </div>
    </>
  )
}

export function SavedPage() {
  const [params, setParams] = useSearchParams()
  const selected = params.get('view') === 'history' ? 'history' : 'bookmarks'
  const [articles, setArticles] = useState([])
  const [loadedView, setLoadedView] = useState('')
  const loading = loadedView !== selected
  const [error, setError] = useState('')
  useEffect(() => {
    api.get(`/readers/me/${selected}`, { params: { limit: 30 } })
      .then(({ data }) => {
        setArticles(data.articles || [])
        setError('')
        setLoadedView(selected)
      })
      .catch((requestError) => {
        setError(getErrorMessage(requestError))
        setLoadedView(selected)
      })
  }, [selected])
  return (
    <>
      <PageHeader eyebrow="YOUR LIBRARY" title="Keep the good ones." description="Stories you saved and the ones you've spent time with." />
      <div className="segmented-control"><button className={selected === 'bookmarks' ? 'segment-active' : ''} onClick={() => setParams({ view: 'bookmarks' })}><Bookmark size={15} /> Saved stories</button><button className={selected === 'history' ? 'segment-active' : ''} onClick={() => setParams({ view: 'history' })}><Clock3 size={15} /> Reading history</button></div>
      <Notice>{error}</Notice>
      {loading ? <Loading /> : articles.length ? <ArticleGrid articles={articles} /> : <EmptyState title={selected === 'history' ? 'Your reading journey starts here' : 'A place for stories to come back to'} description={selected === 'history' ? 'Stories you open will show up in your reading history.' : 'Save an article to keep it close for later.'} action={<Link className="button button-secondary" to="/discover">Find a story</Link>} />}
    </>
  )
}

export function ArticleFormPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const [form, setForm] = useState({ title: '', summary: '', description: '', content: '', category: '', tags: '', imageUrl: '', sourceName: '', sourceUrl: '', eventDate: '' })
  const [busy, setBusy] = useState(false)
  const [assistantBusy, setAssistantBusy] = useState(false)
  const [suggestions, setSuggestions] = useState(null)
  const [assistantNotice, setAssistantNotice] = useState('')
  const [imageUploading, setImageUploading] = useState(false)
  const [imagePreview, setImagePreview] = useState('')
  const [imageMessage, setImageMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => () => {
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
  }, [imagePreview])
  useEffect(() => {
    if (!editing) return
    api.get(`/articles/${id}/manage`)
      .then(({ data: article }) => {
        setForm({
          title: article.title,
          summary: article.summary,
          description: article.description || '',
          content: article.content,
          category: article.category,
          tags: (article.tags || []).join(', '),
          imageUrl: article.imageUrl || '',
          sourceName: article.sourceName || '',
          sourceUrl: article.sourceUrl || '',
          eventDate: dateTimeLocalValue(article.eventDate),
        })
      })
      .catch((requestError) => setError(getErrorMessage(requestError)))
  }, [editing, id])
  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
    setSuggestions(null)
    setAssistantNotice('')
  }
  const selectImage = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      validateImageSelection(file)
      setError('')
      setImageMessage('')
      setImagePreview(URL.createObjectURL(file))
      setImageUploading(true)
      const imageUrl = await uploadImage('/articles/images', file)
      setForm((current) => ({ ...current, imageUrl }))
      setImagePreview('')
      setImageMessage('Image uploaded and attached to this story.')
    } catch (requestError) {
      setImagePreview('')
      setError(getErrorMessage(requestError))
    } finally {
      setImageUploading(false)
    }
  }
  const updateImageUrl = (event) => {
    setImagePreview('')
    setForm((current) => ({ ...current, imageUrl: event.target.value }))
    setImageMessage('')
  }
  const requestSuggestions = async () => {
    if (assistantBusy || busy || !form.content.trim()) return
    setAssistantBusy(true)
    setError('')
    setAssistantNotice('')
    try {
      const { data } = await api.post('/articles/ai-assist', {
        ...form,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      })
      setSuggestions(data.suggestions)
      setAssistantNotice(data.notice)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setAssistantBusy(false)
    }
  }
  const applySuggestion = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setAssistantNotice('Suggestion applied to the draft. Review it before saving or submitting.')
  }
  const submit = async (event) => {
    event.preventDefault()
    if (imageUploading) return
    setBusy(true); setError('')
    const payload = {
      ...form,
      eventDate: form.eventDate ? new Date(form.eventDate).toISOString() : null,
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    }
    try {
      if (editing) await api.put(`/articles/${id}`, payload)
      else await api.post('/articles', payload)
      navigate(user?.role === 'Admin' ? '/articles' : '/my-articles')
    } catch (requestError) { setError(getErrorMessage(requestError)) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHeader eyebrow={editing ? 'STORY WORKSHOP' : 'NEW STORY'} title={editing ? 'Refine your story.' : 'Start with a good idea.'} description="Draft your piece. You can review it and submit it to the editorial desk when you're ready." />
      <form className="panel story-form" onSubmit={submit}>
        <Notice>{error}</Notice>
        <section className="ai-assistant-panel">
          <div><div className="eyebrow">LOCAL AI WRITING ASSISTANT</div><strong>Polish your draft, keep editorial control.</strong><p>Suggestions use the configured local Ollama model. Review every suggestion; nothing is applied or published automatically.</p></div>
          <button className="button button-secondary" type="button" onClick={requestSuggestions} disabled={assistantBusy || busy || imageUploading || !form.content.trim()}>{assistantBusy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{assistantBusy ? 'Generating suggestions...' : 'Suggest improvements'}</button>
          {assistantNotice && <Notice tone="success">{assistantNotice}</Notice>}
          {suggestions && <div className="ai-suggestions">
            {[['headline', 'title', 'Headline'], ['summary', 'summary', 'Summary'], ['description', 'description', 'Description'], ['rewrittenContent', 'content', 'Grammar & rewrite'], ['category', 'category', 'Category'], ['tags', 'tags', 'Tags']].map(([key, field, label]) => {
              const value = Array.isArray(suggestions[key]) ? suggestions[key].join(', ') : suggestions[key]
              return <div className="ai-suggestion" key={key}><div><strong>{label}</strong><p>{value || 'No suggestion provided.'}</p></div><button className="button button-quiet button-small" type="button" disabled={!value} onClick={() => applySuggestion(field, value)}>Use suggestion</button></div>
            })}
            {suggestions.grammarNotes?.length > 0 && <div className="ai-grammar-notes"><strong>Grammar notes</strong><ul>{suggestions.grammarNotes.map((note) => <li key={note}>{note}</li>)}</ul></div>}
          </div>}
        </section>
        <label className="field-label">Headline<input className="text-input" required maxLength={200} value={form.title} onChange={update('title')} placeholder="A clear, compelling headline" /></label>
        <label className="field-label">Short summary<textarea className="text-input" required maxLength={2000} rows={3} value={form.summary} onChange={update('summary')} placeholder="Give readers a reason to keep going..." /></label>
        <label className="field-label">Description <span className="label-optional">optional, up to 500 characters</span><textarea className="text-input" maxLength={500} rows={2} value={form.description} onChange={update('description')} placeholder="A concise description for article previews and metadata." /></label>
        <label className="field-label">Story<textarea className="text-input story-content-input" required maxLength={100000} rows={14} value={form.content} onChange={update('content')} placeholder="Write the story here..." /></label>
        <div className="form-two-columns"><label className="field-label">Category<input className="text-input" required maxLength={100} value={form.category} onChange={update('category')} placeholder="e.g. Technology" /></label><label className="field-label">Tags <span className="label-optional">comma-separated</span><input className="text-input" value={form.tags} onChange={update('tags')} placeholder="AI, policy, climate" /></label></div>
        <div className="eyebrow">LIVE NEWS DETAILS <span className="label-optional">optional</span></div>
        <div className="form-two-columns"><label className="field-label">Source name<input className="text-input" maxLength={150} value={form.sourceName} onChange={update('sourceName')} placeholder="News agency or publication" /></label><label className="field-label">Source URL<input className="text-input" type="url" maxLength={2048} value={form.sourceUrl} onChange={update('sourceUrl')} placeholder="https://source.example/story" /></label></div>
        <label className="field-label">Event date and time<input className="text-input" type="datetime-local" value={form.eventDate} onChange={update('eventDate')} /></label>
        <label className="field-label">Upload cover image <span className="label-optional">JPG, PNG, or WEBP · max 5 MB</span><input className="text-input image-file-input" type="file" accept={IMAGE_ACCEPT} disabled={imageUploading || busy} onChange={selectImage} />{imageUploading && <small className="field-help">Uploading image...</small>}{imageMessage && <small className="field-help">{imageMessage}</small>}{(imagePreview || form.imageUrl) && <img className="image-upload-preview" src={imagePreview || getAssetUrl(form.imageUrl)} alt="Cover image preview" />}</label>
        <label className="field-label">Cover image URL <span className="label-optional">optional fallback</span><input className="text-input" type="url" maxLength={2048} value={form.imageUrl} onChange={updateImageUrl} placeholder="https://..." /></label>
        <div className="form-footer"><span><LockKeyhole size={14} /> Your draft is only visible to you and the editorial team.</span><button className="button button-primary" disabled={busy || assistantBusy || imageUploading}>{imageUploading ? 'Uploading image...' : assistantBusy ? 'Reviewing draft...' : busy ? 'Saving...' : editing ? 'Save changes' : 'Create draft'} <ArrowRight size={16} /></button></div>
      </form>
    </>
  )
}

export function OverviewPage() {
  const { user } = useAuth()
  const [articles, setArticles] = useState([])
  const [reports, setReports] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const requests = user.role === 'Admin'
      ? [api.get('/admin/reports'), api.get('/articles/manage', { params: { status: 'Pending', limit: 5 } })]
      : user.role === 'Editor'
        ? [api.get('/articles/manage', { params: { status: 'Pending', limit: 5 } })]
        : [api.get('/articles/mine', { params: { limit: 5 } })]
    Promise.all(requests)
      .then((results) => {
        if (user.role === 'Admin') { setReports(results[0].data); setArticles(results[1].data.articles || []) }
        else setArticles(results[0].data.articles || [])
      })
      .catch((requestError) => setError(getErrorMessage(requestError)))
      .finally(() => setLoading(false))
  }, [user.role])
  const totalArticles = reports?.engagement?.articles ?? articles.length
  const statusCounts = useMemo(() => articles.reduce((result, article) => {
    result[article.status] = (result[article.status] || 0) + 1
    return result
  }, {}), [articles])

  return (
    <>
      <PageHeader eyebrow={`${user.role.toUpperCase()} WORKSPACE`} title={`Good to see you, ${user.name?.split(' ')[0]}.`} description={user.role === 'Admin' ? 'Here is what is happening across your platform today.' : user.role === 'Editor' ? 'Your editorial desk is ready for its next story.' : 'Keep your stories moving from draft to publication.'} />
      <Notice>{error}</Notice>
      {loading ? <Loading /> : <>
        <div className="stat-grid">
          <StatCard label={user.role === 'Admin' ? 'Published stories' : user.role === 'Editor' ? 'Awaiting review' : 'Your stories'} value={user.role === 'Admin' ? totalArticles : user.role === 'Editor' ? (statusCounts.Pending || 0) : articles.length} icon={FileText} tone="violet" delta={user.role === 'Admin' ? 'Across the platform' : 'In your workspace'} />
          <StatCard label="Total views" value={reports?.engagement?.views ?? '—'} icon={Eye} tone="blue" delta={user.role === 'Admin' ? 'Reader reach' : 'Explore your reports'} />
          <StatCard label="Reader engagement" value={reports?.engagement?.likes ?? (user.role === 'Editor' ? (statusCounts.Pending || 0) : '—')} icon={Heart} tone="rose" delta={user.role === 'Admin' ? 'Article likes' : 'Stories in motion'} />
          <StatCard label="Active readers" value={reports?.engagement?.activeReaders ?? '—'} icon={UserRound} tone="green" delta={user.role === 'Admin' ? 'Engaged with stories' : 'Across the platform'} />
        </div>
        <div className="dashboard-columns">
          <section className="panel dashboard-panel"><div className="panel-heading panel-heading-spread"><div><div className="eyebrow">{user.role === 'Admin' ? 'PLATFORM HEALTH' : user.role === 'Editor' ? 'EDITORIAL QUEUE' : 'YOUR STORY PIPELINE'}</div><h2>{user.role === 'Admin' ? 'A newsroom in motion' : user.role === 'Editor' ? 'Stories need your eye' : 'Keep your ideas moving'}</h2></div>{user.role === 'Admin' && <span className="live-status"><span className="live-dot" /> Live data</span>}</div>
            {articles.length ? articles.slice(0, 4).map((article) => <div className="queue-row" key={article._id}><span className="queue-category">{initials(article.category)}</span><div className="queue-copy"><strong>{article.title}</strong><small>{article.category} · {dateLabel(article.createdAt)}</small></div><span className={`status-pill status-${article.status.toLowerCase()}`}>{article.status}</span>{user.role === 'Editor' && <Link className="icon-button" to="/review" aria-label="Open editorial desk"><ArrowRight size={16} /></Link>}</div>) : <div className="inline-empty"><p>{user.role === 'Editor' ? 'The review queue is clear. Nice work.' : 'No stories to show just yet.'}</p>{user.role === 'ContentCreator' && <Link className="text-link" to="/articles/new">Create your first story <ArrowRight size={15} /></Link>}</div>}
          </section>
          <aside className="panel quick-panel"><div className="eyebrow">QUICK ACTIONS</div><h2>What would you like to do?</h2>
            {(user.role === 'Admin' ? [
              ['/users', 'Manage people', 'Roles and account access', UserRound],
              ['/categories', 'Organize topics', 'Manage newsroom categories', Search],
              ['/reports', 'View analytics', 'Understand reader engagement', TrendingUp],
            ] : user.role === 'Editor' ? [
              ['/review', 'Review stories', 'Keep the newsroom moving', Check],
              ['/review', 'Moderate comments', 'Keep conversations thoughtful', MessageSquare],
            ] : [
              ['/articles/new', 'Write a story', 'Start a new draft', Plus],
              ['/my-articles', 'View your stories', 'Track drafts and submissions', FileText],
            ]).map(([to, label, detail, Icon]) => <Link className="quick-action" to={to} key={label}><span><Icon size={17} /></span><div><strong>{label}</strong><small>{detail}</small></div><ArrowRight size={15} /></Link>)}
          </aside>
        </div>
      </>}
    </>
  )
}

function StatCard({ label, value, icon: Icon, tone, delta }) {
  return <div className="stat-card"><span className={`stat-icon stat-${tone}`}><Icon size={18} /></span><span className="stat-label">{label}</span><strong className="stat-value">{typeof value === 'number' ? value.toLocaleString() : value}</strong><span className="stat-delta">{delta}</span></div>
}

export function ReviewPage() {
  const [articles, setArticles] = useState([])
  const [comments, setComments] = useState([])
  const [reasons, setReasons] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const fetchQueue = useCallback(async () => {
    const [articleResponse, commentResponse] = await Promise.all([
      api.get('/articles/manage', { params: { status: 'Pending', limit: 50 } }),
      api.get('/comments/manage', { params: { status: 'Pending', limit: 50 } }),
    ])
    return {
      articles: articleResponse.data.articles || [],
      comments: commentResponse.data.comments || [],
    }
  }, [])
  useEffect(() => {
    let active = true
    fetchQueue()
      .then((result) => {
        if (!active) return
        setArticles(result.articles)
        setComments(result.comments)
        setLoading(false)
      })
      .catch((requestError) => {
        if (!active) return
        setError(getErrorMessage(requestError))
        setLoading(false)
      })
    return () => { active = false }
  }, [fetchQueue])
  const loadQueue = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchQueue()
      setArticles(result.articles)
      setComments(result.comments)
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }

  const publish = async (id) => {
    try { await api.patch(`/articles/${id}/publish`); setNotice('Story published.'); await loadQueue() }
    catch (requestError) { setError(getErrorMessage(requestError)) }
  }
  const reject = async (id) => {
    const reason = reasons[id]?.trim()
    if (!reason) { setError('Add an editorial note before rejecting a story.'); return }
    try { await api.patch(`/articles/${id}/reject`, { reason }); setNotice('Story returned to its author with your note.'); await loadQueue() }
    catch (requestError) { setError(getErrorMessage(requestError)) }
  }
  const moderateComment = async (id, status) => {
    const reason = reasons[id]?.trim() || ''
    if (status === 'Rejected' && !reason) { setError('Add a reason before rejecting a comment.'); return }
    try { await api.patch(`/comments/${id}/moderate`, { status, ...(reason ? { reason } : {}) }); setNotice(`Comment ${status.toLowerCase()}.`); await loadQueue() }
    catch (requestError) { setError(getErrorMessage(requestError)) }
  }

  return (
    <>
      <PageHeader eyebrow="EDITORIAL DESK" title="Good stories, better together." description="Review submissions and keep the conversation thoughtful." />
      <Notice>{error}</Notice><Notice tone="success">{notice}</Notice>
      {loading ? <Loading /> : <>
        <div className="review-section-heading"><div><span className="eyebrow">STORY SUBMISSIONS</span><h2>Waiting for an editor <span className="count-badge">{articles.length}</span></h2></div></div>
        {articles.length ? <div className="review-list">{articles.map((article) => <article className="review-card" key={article._id}><div className="review-card-top"><div><span className="category-pill">{article.category}</span><span className="article-meta inline-meta">{article.author?.name || 'Author'} · {dateLabel(article.createdAt)}</span></div><span className="status-pill status-pending">Pending review</span></div><h3>{article.title}</h3><p>{article.summary}</p>{article.sourceName && <p className="source-details">Source: {safeHttpUrl(article.sourceUrl) ? <a href={safeHttpUrl(article.sourceUrl)} target="_blank" rel="noreferrer">{article.sourceName}</a> : article.sourceName}{article.eventDate && ` · Event ${eventDateTimeLabel(article.eventDate)}`}</p>}<details className="review-preview"><summary>Read full story</summary><p>{article.description}</p><p>{article.content}</p></details><div className="review-action-row"><input className="text-input" placeholder="Editorial note (required to reject)" value={reasons[article._id] || ''} onChange={(event) => setReasons({ ...reasons, [article._id]: event.target.value })} /><button className="button button-secondary" onClick={() => reject(article._id)}>Request changes</button><button className="button button-primary" onClick={() => publish(article._id)}><Check size={16} /> Publish</button></div></article>)}</div> : <EmptyState title="No stories waiting for review" description="New submissions will appear here when creators are ready." />}
        <div className="review-section-heading comment-review-heading"><div><span className="eyebrow">COMMUNITY</span><h2>Reader notes <span className="count-badge">{comments.length}</span></h2></div></div>
        {comments.length ? <div className="review-list">{comments.map((item) => <article className="comment-review-card" key={item._id}><div className="comment-review-info"><span className="avatar avatar-comment">{initials(item.author?.name)}</span><div><strong>{item.author?.name || 'Reader'}</strong><small>on {item.article?.title || 'an article'} · {dateLabel(item.createdAt)}</small><p>{item.content}</p></div></div><div className="comment-review-actions">{<input className="text-input" placeholder="Reason if rejecting" value={reasons[item._id] || ''} onChange={(event) => setReasons({ ...reasons, [item._id]: event.target.value })} />}<button className="button button-secondary button-small" onClick={() => moderateComment(item._id, 'Rejected')}>Reject</button><button className="button button-primary button-small" onClick={() => moderateComment(item._id, 'Approved')}><Check size={15} /> Approve</button></div></article>)}</div> : <p className="muted-copy">No reader notes need moderation.</p>}
      </>}
    </>
  )
}

export function CategoriesPage() {
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState({ name: '', description: '', imageUrl: '' })
  const [editing, setEditing] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [imagePreview, setImagePreview] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const load = () => api.get('/categories/manage').then(({ data }) => setCategories(data)).catch((requestError) => setError(getErrorMessage(requestError))).finally(() => setLoading(false))
  useEffect(() => { load() }, [])
  useEffect(() => () => {
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
  }, [imagePreview])
  const selectCategoryImage = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      validateImageSelection(file)
      setError('')
      setSuccess('')
      setImagePreview(URL.createObjectURL(file))
      setImageUploading(true)
      const imageUrl = await uploadImage('/categories/images', file)
      setForm((current) => ({ ...current, imageUrl }))
      setImagePreview('')
      setSuccess('Category image uploaded. Save the category to keep the change.')
    } catch (requestError) {
      setImagePreview('')
      setError(getErrorMessage(requestError))
    } finally {
      setImageUploading(false)
    }
  }
  const save = async (event) => {
    event.preventDefault()
    if (imageUploading) return
    setBusy(true); setError(''); setSuccess('')
    try {
      if (editing) await api.patch(`/categories/${editing}`, form)
      else await api.post('/categories', form)
      setForm({ name: '', description: '', imageUrl: '' }); setEditing(''); setImagePreview(''); setSuccess('Category saved.'); await load()
    } catch (requestError) { setError(getErrorMessage(requestError)) } finally { setBusy(false) }
  }
  const edit = (item) => { setEditing(item._id); setForm({ name: item.name, description: item.description || '', imageUrl: item.imageUrl || '' }); setImagePreview('') }
  const activate = async (item) => {
    try {
      await api.patch(`/categories/${item._id}`, { isActive: !item.isActive })
      await load()
    } catch (requestError) { setError(getErrorMessage(requestError)) }
  }
  return (
    <>
      <PageHeader eyebrow="CONTENT ORGANIZATION" title="A home for every topic." description="Keep categories clear, useful, and easy for readers to explore." />
      <div className="admin-content-layout"><form className="panel category-form" onSubmit={save}><div className="eyebrow">{editing ? 'EDIT CATEGORY' : 'NEW CATEGORY'}</div><h2>{editing ? 'Make an update.' : 'Add a category.'}</h2><label className="field-label">Name<input className="text-input" required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Science" /></label><label className="field-label">Description<textarea className="text-input" rows={4} maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What stories belong here?" /></label><label className="field-label">Upload category image <span className="label-optional">JPG, PNG, or WEBP · max 5 MB</span><input className="text-input image-file-input" type="file" accept={IMAGE_ACCEPT} disabled={imageUploading || busy} onChange={selectCategoryImage} />{imageUploading && <small className="field-help">Uploading image...</small>}{(imagePreview || form.imageUrl) && <img className="image-upload-preview" src={imagePreview || getAssetUrl(form.imageUrl)} alt="Category image preview" />}</label><label className="field-label">Category image URL <span className="label-optional">optional fallback</span><input className="text-input" type="url" maxLength={2048} value={form.imageUrl} disabled={imageUploading} onChange={(event) => { setImagePreview(''); setForm({ ...form, imageUrl: event.target.value }) }} placeholder="https://..." /></label><Notice>{error}</Notice><Notice tone="success">{success}</Notice><div className="form-button-row"><button className="button button-primary" disabled={busy || imageUploading}>{imageUploading ? 'Uploading image...' : busy ? 'Saving...' : editing ? 'Save category' : 'Add category'}</button>{editing && <button className="button button-quiet" type="button" onClick={() => { setEditing(''); setForm({ name: '', description: '', imageUrl: '' }); setImagePreview('') }}>Cancel</button>}</div></form><section className="panel category-table-panel"><div className="panel-heading panel-heading-spread"><div><div className="eyebrow">TOPIC DIRECTORY</div><h2>All categories <span className="count-badge">{categories.length}</span></h2></div></div>{loading ? <Loading /> : categories.length ? categories.map((item) => <div className="category-row" key={item._id}>{item.imageUrl ? <img className="category-image" src={getAssetUrl(item.imageUrl)} alt="" /> : <span className="category-color">{initials(item.name)}</span>}<div className="category-row-copy"><strong>{item.name}</strong><small>{item.description || 'No description added'}</small></div><span className={`status-pill ${item.isActive ? 'status-published' : 'status-rejected'}`}>{item.isActive ? 'Active' : 'Inactive'}</span><button className="button button-quiet button-small" onClick={() => edit(item)}>Edit</button><button className="button button-quiet button-small" onClick={() => activate(item)}>{item.isActive ? 'Deactivate' : 'Reactivate'}</button></div>) : <EmptyState title="No categories yet" description="Create a category to organize published stories." />}</section></div>
    </>
  )
}

export function UsersPage() {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ name: '', email: '', password: '', role: '' })
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const createUserFormRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [reviewingApplicationId, setReviewingApplicationId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const { user: currentUser } = useAuth()
  const load = () => api.get('/admin/users').then(({ data }) => setUsers(data)).catch((requestError) => setError(getErrorMessage(requestError))).finally(() => setLoading(false))
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (createUserOpen) {
      createUserFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [createUserOpen])
  const addUser = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setSuccess('')
    try {
      await api.post('/admin/users', form)
      setForm({ name: '', email: '', password: '', role: '' })
      setCreateUserOpen(false)
      setSuccess('User created. Share their sign-in details securely.')
      await load()
    } catch (requestError) { setError(getErrorMessage(requestError)) } finally { setBusy(false) }
  }
  const updateRole = async (item, role) => {
    try { await api.patch(`/admin/users/${item._id || item.id}/role`, { role }); await load() }
    catch (requestError) { setError(getErrorMessage(requestError)) }
  }
  const toggleStatus = async (item) => {
    try { await api.patch(`/admin/users/${item._id || item.id}/status`, { isActive: !item.isActive }); await load() }
    catch (requestError) { setError(getErrorMessage(requestError)) }
  }
  const reviewEditorApplication = async (item, decision) => {
    const id = item._id || item.id
    if (reviewingApplicationId) return
    setReviewingApplicationId(id)
    setError('')
    setSuccess('')
    try {
      await api.patch(`/admin/users/${id}/editor-application`, { decision })
      setSuccess(`Editor application ${decision.toLowerCase()}.`)
      await load()
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setReviewingApplicationId('')
    }
  }
  return (
    <>
      <PageHeader eyebrow="PEOPLE & ACCESS" title="The people behind the stories." description="Manage newsroom access and review public Editor applications." action={<button className="button button-primary" type="button" onClick={() => { setCreateUserOpen((open) => !open); setError(''); setSuccess('') }}><Plus size={16} /> {createUserOpen ? 'Close form' : 'Create User'}</button>} />
      <Notice>{error}</Notice><Notice tone="success">{success}</Notice>
      <div className="admin-content-layout user-admin-layout">
        {createUserOpen && (
          <form className="panel staff-form" ref={createUserFormRef} onSubmit={addUser}>
            <div className="eyebrow">NEW ACCOUNT</div>
            <h2>Create a user.</h2>
            <label className="field-label">Full name<input className="text-input" autoComplete="name" maxLength={100} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label className="field-label">Email<input className="text-input" type="email" autoComplete="email" maxLength={254} required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label className="field-label">Select User Type<select className="text-input" aria-label="Select User Type" required value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="" disabled>Select User Type</option>
              <option value="Admin">Admin</option>
              <option value="Editor">Editor</option>
              <option value="ContentCreator">Content Creator</option>
              <option value="Reader">Reader</option>
            </select></label>
            <label className="field-label">Password<input className="text-input" type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small className="field-help">At least 12 characters. Share it through a secure channel.</small></label>
            <button className="button button-primary button-wide" disabled={busy}><Plus size={16} /> {busy ? 'Creating account...' : 'Create User'}</button>
          </form>
        )}
        <section className="panel users-table-panel">
          <div className="panel-heading panel-heading-spread">
            <div><div className="eyebrow">ACCOUNT DIRECTORY</div><h2>People <span className="count-badge">{users.length}</span></h2></div>
            <span className="live-status"><span className="live-dot" /> {users.filter((item) => item.isActive !== false).length} active</span>
          </div>
          {loading ? <Loading /> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Member</th><th>Role</th><th>Editor application</th><th>Status</th><th>Access</th></tr></thead><tbody>{users.map((item) => <tr key={item._id || item.id}><td><div className="table-person"><span className="avatar avatar-table">{initials(item.name)}</span><span><strong>{item.name}</strong><small>{item.email}</small></span></div></td><td><select className="role-select" value={item.role} disabled={String(item._id || item.id) === String(currentUser.id || currentUser._id)} onChange={(event) => updateRole(item, event.target.value)}>{['Reader', 'ContentCreator', 'Editor', 'Admin'].map((role) => <option key={role} value={role}>{role === 'ContentCreator' ? 'Content Creator' : role}</option>)}</select></td><td>{item.editorApplicationStatus === 'Pending' ? <div className="application-actions"><span className="status-pill status-pending">Pending</span><button className="button button-primary button-small" disabled={Boolean(reviewingApplicationId)} onClick={() => reviewEditorApplication(item, 'Approved')}>{reviewingApplicationId === String(item._id || item.id) ? 'Reviewing...' : 'Approve'}</button><button className="button button-quiet button-small" disabled={Boolean(reviewingApplicationId)} onClick={() => reviewEditorApplication(item, 'Rejected')}>Reject</button></div> : <span className={`status-pill ${item.editorApplicationStatus === 'Approved' ? 'status-published' : item.editorApplicationStatus === 'Rejected' ? 'status-rejected' : ''}`}>{item.editorApplicationStatus || 'Not requested'}</span>}</td><td><span className={`status-pill ${item.isActive === false ? 'status-rejected' : 'status-published'}`}>{item.isActive === false ? 'Inactive' : 'Active'}</span></td><td><button className="button button-quiet button-small" disabled={String(item._id || item.id) === String(currentUser.id || currentUser._id)} onClick={() => toggleStatus(item)}>{item.isActive === false ? 'Activate' : 'Deactivate'}</button></td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </>
  )
}
