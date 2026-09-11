import { Routes, Route } from 'react-router-dom'
import Home from './pages/home.jsx'
import LoginPage from './pages/loginPage.jsx'
import Playlists from './pages/playlists.jsx'
import Profile from './pages/profile.jsx'
import SearchPage from './pages/searchPage.jsx'

function App() {
  return (
    <Routes>
      <Route path="/home" element={<Home />} />
      <Route path="/" element={<LoginPage />} />
      <Route path="/playlists" element={<Playlists />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/search" element={<SearchPage />} />
    </Routes>
  )
}

export default App