import { Routes, Route } from 'react-router-dom'
import Home from './pages/home.jsx'
import LoginPage from './pages/loginPage.jsx'
import Profile from './pages/profile.jsx'
import SearchPage from './pages/searchPage.jsx'
import SignUpPage from './pages/signUpPage.jsx'
import ForgotPasswordPage from './pages/forgotPasswordPage.jsx'


function App() {
  return (
    <Routes>
      <Route path="/home" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/signUpPage" element={<SignUpPage />} />
      <Route path="/forgotPasswordPage" element={<ForgotPasswordPage />} />
    </Routes>
  )
}

export default App