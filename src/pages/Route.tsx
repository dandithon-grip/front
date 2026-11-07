import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, HomeIndicator, Nav, Rot, StatusBar, Stat } from '../components/ui'
import { A } from '../lib/assets'
import { useStore } from '../lib/store'

const CARDS = [
  { name: '신천 노을길', plus: 12, green: 64 },
  { name: '신천 노을길', plus: 12, green: 64 },
]

/** 경로 (Figma 285:488) */
export function RouteMap() {
  const nav = useNavigate()
  const { commute } = useStore()
  const [sel, setSel] = useState(0)
  const [pair, setPair] = useState({ from: commute.from, to: commute.to })

  return (
    <div className="screen">
      <StatusBar />

      <div className="search">
        <button className="search__swap" aria-label="출발·도착 바꾸기" onClick={() => setPair(({ from, to }) => ({ from: to, to: from }))}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#262626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 20V5" />
            <path d="M4 9l4-4 4 4" />
            <path d="M16 4v15" />
            <path d="M12 15l4 4 4-4" />
          </svg>
        </button>
        <div className="search__col">
          {[
            [pair.from, 'icons/clear-x-a.svg'],
            [pair.to, 'icons/clear-x-b.svg'],
          ].map(([text, x]) => (
            <div className="search__box" key={x}>
              {text}
              <button aria-label="지우기">
                <img src={A(x)} alt="" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="map" style={{ top: 196, bottom: 0 }} />
      {/* 지도 (Figma 좌표 그대로) */}
      <Rot box={{ left: 0, top: 330, w: 402, h: 26 }} rot={3.7} len={402.84} src="map/route-line293.svg" />
      <Rot box={{ left: 83, top: 196, w: 42, h: 577 }} rot={85.84} len={578.527} src="map/route-line295.svg" />
      <Rot box={{ left: 241, top: 193, w: 29, h: 582 }} rot={92.85} len={582.722} src="map/route-line296.svg" />
      <Rot box={{ left: 1, top: 483, w: 402.442, h: 53 }} rot={-7.5} len={405.917} src="map/route-line294.svg" />
      <img className="abs" src={A('map/route-river.svg')} alt="" style={{ left: -27 - 434 * 0.0123, top: 405.36 - 30.42 * 0.5282, width: 434 * 1.0209, height: 30.42 * 2.0706 }} />
      <img className="abs" src={A('map/route-end.svg')} alt="" style={{ left: 327, top: 291, width: 23, height: 23 }} />
      <img className="abs" src={A('map/route-short.svg')} alt="" style={{ left: 83 - 257 * 0.004, top: 302 - 244 * 0.0045, width: 257 * 1.008, height: 244 * 1.009 }} />
      <img className="abs" src={A('map/route-green.svg')} alt="" style={{ left: 76.5 - 262 * 0.0094, top: 301.5, width: 262 * 1.0188, height: 255 * 1.0015 }} />
      <div className="pinlabel" style={{ left: 180, top: 421 }}>
        <img src={A('map/route-nature-pin.svg')} alt="" />
        <span>상동교 노을</span>
      </div>
      <img className="abs" src={A('map/route-start.svg')} alt="" style={{ left: 65, top: 543, width: 23, height: 23 }} />

      <div className="legend">
        <p><img className="l" src={A('icons/legend-short.svg')} alt="" />최단</p>
        <p><img className="l" src={A('icons/legend-route.svg')} alt="" />샛길</p>
        <p className="r"><img src={A('icons/legend-nature.svg')} alt="" width={8} height={8} />자연</p>
      </div>

      <div className="carousel">
        {CARDS.map((c, i) => (
          <div key={i} className={`route-card${i === sel ? ' is-sel' : ''}`} onClick={() => setSel(i)}>
            <div>
              <strong>{c.name}</strong>
              <div className="stats">
                <Stat icon="icons/clock.svg" size={12}>+{c.plus}분</Stat>
                <Stat icon="icons/leaf.svg" size={14}>녹지 {c.green}%</Stat>
              </div>
            </div>
            <button
              className="go"
              aria-label={`${c.name} 안내 시작`}
              onClick={(e) => {
                e.stopPropagation()
                nav('/guide')
              }}
            >
              <img src={A('icons/go-button.svg')} alt="" width={32} height={32} />
            </button>
          </div>
        ))}
        <div style={{ flex: 'none', width: 9 }} />
      </div>

      <Nav />
      <HomeIndicator />
    </div>
  )
}

/** 경로 안내 (Figma 230:574) */
export function Guide() {
  const nav = useNavigate()
  return (
    <div className="screen">
      <div className="map" style={{ top: 108, height: 732 }} />
      <Rot box={{ left: -0.42, top: 270, w: 402.84, h: 0 }} len={402.84} src="map/guide-line293.svg" inset={8} />
      <Rot box={{ left: 74, top: 108, w: 0, h: 599 }} rot={-90} len={599} src="map/guide-line295.svg" inset={8} />
      <Rot box={{ left: 74, top: 481, w: 0, h: 226 }} rot={-90} len={226} src="map/guide-line298.svg" inset={5} />
      <Rot box={{ left: 263, top: 108, w: 0, h: 599 }} rot={-90} len={599} src="map/guide-line295.svg" inset={8} />
      <Rot box={{ left: 339, top: 108, w: 0, h: 599 }} rot={-90} len={599} src="map/guide-line295.svg" inset={8} />
      <Rot box={{ left: -0.42, top: 485, w: 402.84, h: 0 }} len={402.84} src="map/guide-line293.svg" inset={8} />
      <div className="rot" style={{ left: 153, top: 99, width: 30, height: 710 }}>
        <div style={{ position: 'relative', flex: 'none', width: 710, height: 30, transform: 'rotate(-90deg) scaleY(-1)' }}>
          <img
            className="abs"
            src={A('map/guide-river.svg')}
            alt=""
            style={{ left: '-0.96%', right: '-0.67%', top: '-112.23%', bottom: '-113.33%', width: '101.63%', height: '325.56%' }}
          />
        </div>
      </div>
      <Rot box={{ left: 78, top: 485, w: 185, h: 0 }} len={185} src="map/guide-line299.svg" inset={5} />
      <Rot box={{ left: 265, top: 108, w: 0, h: 377 }} rot={-90} len={377} src="map/guide-line300.svg" inset={5} />
      <img className="abs" src={A('map/guide-pin.svg')} alt="" style={{ left: 60, top: 471, width: 23, height: 23 }} />
      <span className="nature-pill">자연 구간</span>

      <div className="sheet-bg">
        <img src={A('icons/sheet-bg.svg')} alt="" />
      </div>

      <Header title="경로 안내" tone="gray" />
      <StatusBar />

      <div className="dir">
        <div className="dir__arrow">
          <img src={A('icons/arrow-left-long.svg')} alt="" />
        </div>
        <div>
          <strong>지금 왼쪽, 신천 산책로 억새</strong>
          <span>이 구간 남은 거리 400m</span>
        </div>
      </div>

      <p className="sheet__note">
        <img src={A('icons/info.svg')} alt="" />
        잠깐, 이 풍경을 기록해 보세요.
      </p>
      <span className="sheet__eta">9:46 도착 예정</span>
      <div className="sheet__btns">
        <button onClick={() => nav('/photo')}>이 장소에 사진 남기기</button>
        <button onClick={() => nav('/record')}>사진 없이 방문 기록</button>
      </div>
      <button className="sheet__skip" onClick={() => nav('/route')}>
        이번 장소 건너뛰기
      </button>
      <HomeIndicator />
    </div>
  )
}
