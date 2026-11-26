import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { StoreProvider } from './lib/store'
import { NoteDetail } from './pages/NoteDetail'
import { Notes } from './pages/Notes'
import { Quiz } from './pages/Quiz'
import { Review } from './pages/Review'
import { Settings } from './pages/Settings'
import { Today } from './pages/Today'

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Today />} />
            <Route path="notes" element={<Notes />} />
            <Route path="notes/:id" element={<NoteDetail />} />
            <Route path="review" element={<Review />} />
            <Route path="quiz" element={<Quiz />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </StoreProvider>
  )
}
