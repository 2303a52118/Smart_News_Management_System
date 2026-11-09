import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom'
import {
  Activity, Bookmark, ChevronDown, Compass, FilePlus2, FileText, LayoutDashboard,
  LogOut, Menu, Newspaper, Search, Settings2, ShieldCheck, Sparkles, Tags, UserRound, Users,
} from 'lucide-react'
import { useAuth } from './auth-context'
import {
  ArticlePage, ArticleFormPage, AuthPage, CategoriesPage, DiscoverPage, FeedPage,
  InterestsPage, OverviewPage, ProfileSettingsPage, ReviewPage, SavedPage, UsersPage,
} from './pages'
import './App.css'

const ReportsPage = lazy(() => import('./ReportsPage.jsx'))
const linksByRole = {
  Reader: [
    { to: '/feed', label: 'For you', icon: Sparkles },
    { to: '/discover', label: 'Discover', icon: Compass },
    { to: '/saved', label: 'Saved & history', icon: Bookmark },
    { to: '/interests', label: 'Your interests', icon: Settings2 },
    { to: '/settings', label: 'Profile & settings', icon: UserRound },
  ],
  ContentCreator: [
    { to: '/overview', label: 'Overview', icon: LayoutDashboard },
    { to: '/my-articles', label: 'My stories', icon: FileText },
    { to: '/articles/new', label: 'Write a story', icon: FilePlus2 },
    { to: '/settings', label: 'Profile & settings', icon: UserRound },
  ],
  Editor: [
    { to: '/overview', label: 'Overview', icon: LayoutDashboard },
    { to: '/review', label: 'Editorial desk', icon: ShieldCheck },
    { to: '/settings', label: 'Profile & settings', icon: UserRound },
  ],
  Admin: [
    { to: '/overview', label: 'Overview', icon: LayoutDashboard },
    { to: '/articles', label: 'All articles', icon: FileText },
    { to: '/review', label: 'Editorial desk', icon: ShieldCheck },
    { to: '/categories', label: 'Categories', icon: Tags },
    { to: '/users', label: 'People & access', icon: Users },
    { to: '/reports', label: 'Reports', icon: Activity },
    { to: '/settings', label: 'Profile & settings', icon: UserRound },
  ],
}

const homeForRole = (role) => role === 'Reader' ? '/feed' : '/overview'

function RequireAuth() {
  const { user } = useAuth()
  const location = useLocation()
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} />
}

function RoleGate({ roles, children }) {
  const { user } = useAuth()
  return roles.includes(user?.role)
    ? children
    : <Navigate to={homeForRole(user?.role)} replace />
}

function DashboardLayout() {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [todayLabel] = useState(() => new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date()))
  const location = useLocation()
  const navigation = linksByRole[user?.role] || []

  return (
    <div className="app-shell">
      {mobileOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <Link className="brand" to={homeForRole(user.role)} onClick={() => setMobileOpen(false)}>
          <span className="brand-mark"><Newspaper size={21} /></span>
          <span>Smart News<small>NEWSROOM</small></span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={`nav-link ${location.pathname === to ? 'nav-active' : ''}`}
            >
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
              {label === 'For you' && <span className="nav-spark">AI</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-icon"><Sparkles size={16} /></span>
            <div><strong>Stay curious.</strong><p>Good stories make a difference.</p></div>
          </div>
          <button className="profile-button" onClick={logout}>
            <span className="avatar">{user?.name?.slice(0, 1).toUpperCase() || 'U'}</span>
            <span className="profile-copy"><strong>{user?.name}</strong><small>{user?.role}</small></span>
            <LogOut size={17} className="profile-logout" />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Workspace</span><ChevronDown size={14} /><strong>{navigation.find((item) => item.to === location.pathname)?.label || 'Newsroom'}</strong></div>
          <div className="topbar-actions">
            <Link className="top-search" to={user?.role === 'Reader' ? '/discover' : user?.role === 'Admin' ? '/articles' : user?.role === 'Editor' ? '/review' : '/my-articles'} aria-label="Go to search"><Search size={16} /><span>Search stories</span><kbd>⌘ K</kbd></Link>
            <span className="top-date">{todayLabel}</span>
            <span className="avatar avatar-small">{user?.name?.slice(0, 1).toUpperCase() || 'U'}</span>
          </div>
        </header>
        <main className="page-content"><Outlet /></main>
        <footer className="app-footer"><span>Smart News</span><span>Stay informed. Stay curious.</span></footer>
      </div>
    </div>
  )
}

function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={homeForRole(user?.role)} replace />
}

function KeyedArticlePage() {
  const { id } = useParams()
  return <ArticlePage key={id} />
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homeForRole(user.role)} replace /> : <AuthPage mode="login" />} />
      <Route path="/register" element={user ? <Navigate to={homeForRole(user.role)} replace /> : <AuthPage mode="register" />} />
      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>
          <Route index element={<HomeRedirect />} />
          <Route path="feed" element={<RoleGate roles={['Reader']}><FeedPage /></RoleGate>} />
          <Route path="discover" element={<RoleGate roles={['Reader']}><DiscoverPage /></RoleGate>} />
          <Route path="article/:id" element={<RoleGate roles={['Reader']}><KeyedArticlePage /></RoleGate>} />
          <Route path="interests" element={<RoleGate roles={['Reader']}><InterestsPage /></RoleGate>} />
          <Route path="settings" element={<ProfileSettingsPage />} />
          <Route path="saved" element={<RoleGate roles={['Reader']}><SavedPage /></RoleGate>} />
          <Route path="overview" element={<RoleGate roles={['Admin', 'Editor', 'ContentCreator']}><OverviewPage /></RoleGate>} />
          <Route path="my-articles" element={<RoleGate roles={['ContentCreator']}><DiscoverPage managed /></RoleGate>} />
          <Route path="articles" element={<RoleGate roles={['Admin']}><DiscoverPage managed admin /></RoleGate>} />
          <Route path="articles/new" element={<RoleGate roles={['ContentCreator', 'Admin']}><ArticleFormPage /></RoleGate>} />
          <Route path="articles/:id/edit" element={<RoleGate roles={['ContentCreator', 'Admin']}><ArticleFormPage /></RoleGate>} />
          <Route path="review" element={<RoleGate roles={['Admin', 'Editor']}><ReviewPage /></RoleGate>} />
          <Route path="categories" element={<RoleGate roles={['Admin']}><CategoriesPage /></RoleGate>} />
          <Route path="users" element={<RoleGate roles={['Admin']}><UsersPage /></RoleGate>} />
          <Route path="reports" element={<RoleGate roles={['Admin']}><Suspense fallback={<div className="loading-state">Loading analytics...</div>}><ReportsPage /></Suspense></RoleGate>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={user ? homeForRole(user.role) : '/login'} replace />} />
    </Routes>
  )
}

export default function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>
}
