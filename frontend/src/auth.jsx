import { useCallback, useMemo, useState } from 'react'
import api from './api'
import { AuthContext } from './auth-context'

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('smart-news-user') || 'null')
  } catch {
    localStorage.removeItem('smart-news-user')
    localStorage.removeItem('smart-news-token')
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser)

  const establishSession = (data) => {
    localStorage.setItem('smart-news-token', data.token)
    localStorage.setItem('smart-news-user', JSON.stringify(data.user))
    setUser(data.user)
  }

  const login = async (credentials) => {
    const { data } = await api.post('/auth/login', credentials)
    establishSession(data)
    return data.user
  }

  const register = async (details) => {
    const { data } = await api.post('/auth/register', details)
    establishSession(data)
    return data.user
  }

  const updateUser = useCallback((updatedUser) => {
    localStorage.setItem('smart-news-user', JSON.stringify(updatedUser))
    setUser(updatedUser)
  }, [])

  const logout = () => {
    localStorage.removeItem('smart-news-token')
    localStorage.removeItem('smart-news-user')
    setUser(null)
  }

  const value = useMemo(() => ({ user, login, register, updateUser, logout }), [user, updateUser])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
