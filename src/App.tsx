import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider } from './lib/store'
import { Login, RouteSetup, Signup } from './pages/Auth'
import { Home, Season } from './pages/Home'
import { Guide, RouteMap } from './pages/Route'
import { Photo, Record } from './pages/Record'
import { EditProfile, EditRoute, My } from './pages/My'

/** 402×874 프레임을 화면에 맞춰 축소 (작은 폰 / 낮은 창) */
function useFit() {
  useEffect(() => {
    const fit = () => {
      const framed = window.innerWidth > 480
      const s = Math.min(1, window.innerWidth / 402, (window.innerHeight - (framed ? 32 : 0)) / 874)
      document.documentElement.style.setProperty('--s', String(s))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
}

export default function App() {
  useFit()
  return (
    <StoreProvider>
      <BrowserRouter>
        <div className="stage">
          <div className="app">
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/route-setup" element={<RouteSetup />} />
              <Route path="/home" element={<Home />} />
              <Route path="/season" element={<Season />} />
              <Route path="/route" element={<RouteMap />} />
              <Route path="/guide" element={<Guide />} />
              <Route path="/photo" element={<Photo />} />
              <Route path="/record" element={<Record />} />
              <Route path="/my" element={<My />} />
              <Route path="/my/edit" element={<EditProfile />} />
              <Route path="/my/route" element={<EditRoute />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </StoreProvider>
  )
}
