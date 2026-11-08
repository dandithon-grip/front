import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider, useStore } from './lib/store'
import { Login, RouteSetup, Signup } from './pages/Auth'
import { Home, Season } from './pages/Home'
import { Guide, OtherRoutes, RouteMap } from './pages/Route'
import { Photo, PlaceRecord, Record } from './pages/Record'
import { EditProfile, EditRoute, My } from './pages/My'
import { Rating } from './pages/Rating'
import { Preferences } from './pages/Preferences'
import { NotificationListener } from './components/NotificationListener'

function Entry() {
  const { profile, dataSource, sessionReady } = useStore()
  if (!sessionReady) return <div className="flow-page app-loading" role="status">샛길을 준비하고 있어요.</div>
  return <Navigate to={profile.loggedIn || dataSource === 'preview' ? '/home' : '/login'} replace />
}

function SessionBoundary({ children }: { children: ReactNode }) {
  const { sessionReady } = useStore()
  return sessionReady ? children : <div className="flow-page app-loading" role="status">나의 샛길을 불러오고 있어요.</div>
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <div className="stage">
          <div className="app">
            <NotificationListener />
            <SessionBoundary><Routes>
              <Route path="/" element={<Entry />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/route-setup" element={<RouteSetup />} />
              <Route path="/home" element={<Home />} />
              <Route path="/season" element={<Season />} />
              <Route path="/route" element={<RouteMap />} />
              <Route path="/routes" element={<OtherRoutes />} />
              <Route path="/guide" element={<Guide />} />
              <Route path="/rating" element={<Rating />} />
              <Route path="/photo" element={<Photo />} />
              <Route path="/record" element={<Record />} />
              <Route path="/record/:placeId" element={<PlaceRecord />} />
              <Route path="/my" element={<My />} />
              <Route path="/my/edit" element={<EditProfile />} />
              <Route path="/my/route" element={<EditRoute />} />
              <Route path="/my/preferences" element={<Preferences />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes></SessionBoundary>
          </div>
        </div>
      </BrowserRouter>
    </StoreProvider>
  )
}
