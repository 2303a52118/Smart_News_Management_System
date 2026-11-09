import { useEffect, useState } from 'react'
import { Eye, FileText, Heart, LoaderCircle, UserRound } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import api, { getErrorMessage } from './api'

const chartColors = ['#7b61d1', '#43a58b', '#e7a24c', '#5682d4', '#d97583', '#5aa6bd']
const dateLabel = (value) => value
  ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
  : 'Recently'

function PageHeader({ title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">INSIGHTS &amp; ANALYTICS</div>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      <div className="heading-action">{action}</div>
    </div>
  )
}

function Notice({ children }) {
  return children ? <div className="notice notice-error" role="alert">{children}</div> : null
}

function Loading() {
  return <div className="loading-state"><LoaderCircle className="spin" size={22} /><span>Loading your newsroom...</span></div>
}

function EmptyState({ title, description }) {
  return <div className="empty-state"><h3>{title}</h3><p>{description}</p></div>
}

function StatCard({ label, value, icon: Icon, tone, delta }) {
  return <div className="stat-card"><span className={`stat-icon stat-${tone}`}><Icon size={18} /></span><span className="stat-label">{label}</span><strong className="stat-value">{typeof value === 'number' ? value.toLocaleString() : value}</strong><span className="stat-delta">{delta}</span></div>
}

export default function ReportsPage() {
  const [reports, setReports] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    api.get('/admin/reports')
      .then(({ data }) => setReports(data))
      .catch((requestError) => setError(getErrorMessage(requestError)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <PageHeader title="The newsroom, in perspective." description="Real-time reporting from published stories, reader interactions, and account activity." action={<span className="live-status"><span className="live-dot" /> Live from MongoDB</span>} />
      <Notice>{error}</Notice>
      {loading ? <Loading /> : reports && <>
        <div className="stat-grid report-stat-grid">
          <StatCard label="Published stories" value={reports.engagement.articles} icon={FileText} tone="violet" delta="Currently live" />
          <StatCard label="Total article views" value={reports.engagement.views} icon={Eye} tone="blue" delta="Across published stories" />
          <StatCard label="Story likes" value={reports.engagement.likes} icon={Heart} tone="rose" delta={`${reports.engagement.bookmarks} reader saves`} />
          <StatCard label="Active readers" value={reports.engagement.activeReaders} icon={UserRound} tone="green" delta={`${reports.engagement.comments} reader notes`} />
        </div>
        <div className="report-grid">
          <section className="panel chart-panel">
            <div className="panel-heading"><div><div className="eyebrow">CONTENT MIX</div><h2>Stories by category</h2></div></div>
            {reports.categoryReport.length
              ? <div className="chart-area"><ResponsiveContainer width="100%" height={260}><BarChart data={reports.categoryReport} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf0f2" /><XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fill: '#8a9099', fontSize: 11 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#8a9099', fontSize: 11 }} /><Tooltip cursor={{ fill: '#f6f5fb' }} /><Bar dataKey="articles" name="Published stories" radius={[5, 5, 0, 0]}>{reports.categoryReport.map((entry, index) => <Cell key={entry.category} fill={chartColors[index % chartColors.length]} />)}</Bar></BarChart></ResponsiveContainer></div>
              : <EmptyState title="No category data yet" description="Published articles will appear here." />}
          </section>
          <section className="panel chart-panel">
            <div className="panel-heading"><div><div className="eyebrow">NEWSROOM ACTIVITY</div><h2>Publishing cadence</h2></div></div>
            {reports.publishingActivity.length
              ? <div className="chart-area"><ResponsiveContainer width="100%" height={260}><BarChart data={reports.publishingActivity} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf0f2" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#8a9099', fontSize: 11 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#8a9099', fontSize: 11 }} /><Tooltip /><Bar dataKey="published" name="Published" fill="#43a58b" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
              : <EmptyState title="No recent publishing activity" description="Newly published stories appear in the last six months." />}
          </section>
          <section className="panel chart-panel">
            <div className="panel-heading"><div><div className="eyebrow">COMMUNITY</div><h2>Members by role</h2></div></div>
            {reports.userRoles.length
              ? <div className="role-chart-layout"><ResponsiveContainer width="100%" height={225}><PieChart><Pie data={reports.userRoles} dataKey="count" nameKey="role" innerRadius={55} outerRadius={83} paddingAngle={3}>{reports.userRoles.map((entry, index) => <Cell key={entry.role} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="chart-legend">{reports.userRoles.map((entry, index) => <div key={entry.role}><span style={{ backgroundColor: chartColors[index % chartColors.length] }} /><span>{entry.role}</span><strong>{entry.count}</strong></div>)}</div></div>
              : <EmptyState title="No members yet" description="Registered users appear here." />}
          </section>
          <section className="panel chart-panel top-articles-panel">
            <div className="panel-heading"><div><div className="eyebrow">READER FAVORITES</div><h2>Most viewed stories</h2></div></div>
            {reports.mostViewedArticles.length
              ? reports.mostViewedArticles.map((article, index) => <div className="top-story-row" key={article._id}><span className="rank-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{article.title}</strong><small>{article.category} · {dateLabel(article.publishedAt)}</small></div><span className="story-views"><Eye size={14} />{article.views?.toLocaleString() || 0}</span></div>)
              : <EmptyState title="No published stories yet" description="Publish a story to begin tracking reach." />}
          </section>
        </div>
      </>}
    </>
  )
}
