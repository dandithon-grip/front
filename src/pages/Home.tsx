import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header, HomeIndicator, Nav, StatusBar, Stat } from '../components/ui'
import { A } from '../lib/assets'

const PICKS = [
  { img: 'img/home-sunset.png', title: '12분 둘러가면 만날 수 있는 신천 노을길', plus: 12, green: 64 },
  { img: 'img/home-autumn.png', title: '8분 둘러가면 만날 수 있는 가을빛 가득한 범어공원', plus: 8, green: 64 },
  { img: 'img/home-autumn.png', title: '8분 둘러가면 만날 수 있는 가을빛 가득한 범어공원', plus: 8, green: 64 },
]

/** 홈 (Figma 243:429) */
export function Home() {
  const nav = useNavigate()
  const [showSeason, setShowSeason] = useState(true)

  return (
    <div className="screen screen--grad">
      <StatusBar />
      <p className="home__logo brand">샛길</p>
      <div className="home__badge" />
      <div className="scroll" style={{ top: 94, bottom: 0 }}>
        <div className="home__list" style={{ position: 'static', margin: '0 22px' }}>
          {showSeason && (
            <section className="season-card">
              <button className="season-card__x" aria-label="닫기" onClick={() => setShowSeason(false)}>
                <img src={A('icons/close-x.svg')} alt="" />
              </button>
              <span className="chip-date">10.23 - 11.07</span>
              <h2>
                서리가 내려앉는 계절,
                <br />
                상강에 다다랐어요.
              </h2>
              <button className="more" onClick={() => nav('/season')}>
                계절 더보기
                <img src={A('icons/chevron-right-gray.svg')} alt="" />
              </button>
            </section>
          )}
          <div>
            <div className="sec-title">
              <small>2026년 10월 23일</small>
              <strong>오늘의 퇴근 샛길</strong>
            </div>
            <div className="cards" style={{ marginTop: 7 }}>
              {PICKS.map((p, i) => (
                <button key={i} className="pick" onClick={() => nav('/route')}>
                  <img className="pick__img" src={A(p.img)} alt="" />
                  <div className="pick__body">
                    <span className="tag" style={{ alignSelf: 'flex-start' }}>둘러가기</span>
                    <p className="pick__title">{p.title}</p>
                    <div className="stats">
                      <Stat icon="icons/clock.svg" size={12}>+{p.plus}분</Stat>
                      <Stat icon="icons/leaf.svg" size={14}>녹지 {p.green}%</Stat>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: 110 }} />
        </div>
      </div>
      <Nav />
      <HomeIndicator />
    </div>
  )
}

const INFO = [
  ['계절', '늦가을'],
  ['의미', " '서리가 내린다'는 뜻을 가지고 있는 상강은 가을의 마지막 절기이자 겨울을 앞두고 계절이 깊어지는 시기예요."],
  ['특징', '낮과 밤의 기온 차가 커지고 아침저녁으로 쌀쌀해져요. 풀잎과 땅 위에는 하얀 서리가 맺히기 시작하며, 나뭇잎은 붉고 노랗게 물들어 떨어져요. 들판의 곡식과 열매가 결실을 맺고 자연은 겨울을 맞이할 준비를 해요.'],
  ['풍경', '서리 내린 들판, 붉게 물든 산, 차가워진 아침 공기'],
  ['추천', '단풍길 산책, 국화 감상, 따뜻한 차 마시기'],
  ['다음', '입동(立冬)'],
]

/** 계절 더보기 (Figma 230:1367) */
export function Season() {
  return (
    <div className="screen screen--season">
      <Header title="상강 소개보기" tone="gray" />
      <StatusBar />
      <div className="scroll" style={{ top: 108, bottom: 0 }}>
        <div className="season__body" style={{ position: 'relative', left: 22, top: 21, paddingBottom: 60 }}>
          <div>
            <div className="season__hero">
              <img src={A('img/season-frost.png')} alt="" />
            </div>
            <div className="season__cap">
              가을의 마지막,
              <br />
              24절기 중 18번째 절기
            </div>
          </div>
          <ul className="info">
            {INFO.map(([k, v]) => (
              <li key={k}>
                <span className="pill">{k}</span>
                <p>{v}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <HomeIndicator />
    </div>
  )
}
