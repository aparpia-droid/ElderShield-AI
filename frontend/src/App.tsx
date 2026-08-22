import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import Live from './pages/Live'
import Debrief from './pages/Debrief'
import Logo from './ui/Logo'

function App() {
  return (
    <BrowserRouter>
      <header className="site-header">
        <Link to="/" className="site-logo-link" aria-label="ElderShield.AI home">
          <Logo size={40} />
          <span className="site-wordmark">ElderShield.AI</span>
        </Link>
      </header>
      <main className="site-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/live/:sessionId" element={<Live />} />
          <Route path="/debrief/:sessionId" element={<Debrief />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}

export default App
