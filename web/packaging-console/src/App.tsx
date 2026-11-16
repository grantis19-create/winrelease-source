import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { ProjectsListPage } from './pages/ProjectsListPage'
import { ProjectEditorPage } from './pages/ProjectEditorPage'
import { HelpPage } from './pages/HelpPage'
import { SettingsPage } from './pages/SettingsPage'
import { SupportPage } from './pages/SupportPage'
import { LandingPage } from './pages/LandingPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { ReleaseNotesPage } from './pages/ReleaseNotesPage'
import { RequireAuth } from './components/RequireAuth'
import { isMvpMode } from './mode'

export function App() {
  return (
    <Routes>
      {/* The free site opens on the front page; the full console (login, API) goes straight to the projects list. */}
      <Route path="/" element={isMvpMode() ? <LandingPage /> : <Navigate to="/projects" replace />} />
      <Route path="/login" element={isMvpMode() ? <Navigate to="/projects" replace /> : <LoginPage />} />
      <Route
        path="/projects"
        element={
          <RequireAuth>
            <ProjectsListPage />
          </RequireAuth>
        }
      />
      <Route
        path="/projects/:projectId"
        element={
          <RequireAuth>
            <ProjectEditorPage />
          </RequireAuth>
        }
      />
      <Route path="/helper" element={<Navigate to="/settings#quick-start" replace />} />
      <Route
        path="/help"
        element={
          <RequireAuth>
            <HelpPage />
          </RequireAuth>
        }
      />
      {/* /whats-new is the old name; the sample project's Apps-list link still points at it. */}
      <Route path="/whats-new" element={<Navigate to="/release-notes" replace />} />
      <Route
        path="/release-notes"
        element={
          <RequireAuth>
            <ReleaseNotesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/privacy"
        element={
          <RequireAuth>
            <PrivacyPage />
          </RequireAuth>
        }
      />
      <Route
        path="/support"
        element={
          <RequireAuth>
            <SupportPage />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
