import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Header, HomeIndicator, Nav, Segment, StatusBar } from '../components/ui'
import { A } from '../lib/assets'
import { useStore, type Season } from '../lib/store'

const SEASONS: readonly Season[] = ['봄', '여름', '가을', '겨울']
const PLACE = '상동교 · 신천 산책로'

/** 사진 남기기 (Figma 230:619 · 상태 230:749) */
export function Photo() {
  const nav = useNavigate()
  const { addRecord } = useStore()
  const [photo, setPhoto] = useState<string>()
  const [season, setSeason] = useState<Season>('여름')
  const [memo, setMemo] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const ready = !!photo || memo.trim() !== ''

  const pick = (file?: File) => {
    if (!file) return
    const r = new FileReader()
    r.onload = () => setPhoto(String(r.result))
    r.readAsDataURL(file)
  }

  return (
    <div className="screen">
      <Header title="사진 남기기" tone="gray" />
      <StatusBar />
      <div className="photo-form">
        <p className="lbl2">이 장소의 사진 (선택)</p>
        <div className="upload">
          {photo ? (
            <img className="pv" src={photo} alt="선택한 사진" />
          ) : (
            <>
              <img className="cam" src={A('icons/camera.svg')} alt="" />
              사진 추가
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" aria-label="사진 추가" onChange={(e) => pick(e.target.files?.[0])} />
        </div>

        <p className="lbl2" style={{ marginTop: 14 }}>장소 (자동)</p>
        <input className="inp fixed" value={PLACE} readOnly />

        <p className="lbl2" style={{ marginTop: 22 }}>계절</p>
        <Segment variant="season" options={SEASONS} value={season} onChange={setSeason} />

        <p className="lbl2" style={{ marginTop: 14 }}>풍경 한 마디</p>
        <input className="inp" placeholder="이 순간, 어떤 기분이었나요?" value={memo} onChange={(e) => setMemo(e.target.value)} />
      </div>
      <div className="bottom-actions" style={{ top: 772 }}>
        <Button
          on={ready}
          disabled={!ready}
          onClick={() => {
            addRecord({ place: PLACE, season, memo: memo.trim(), photo })
            nav('/record', { replace: true })
          }}
        >
          기록 저장하기
        </Button>
      </div>
      <HomeIndicator />
    </div>
  )
}

const FILTERS = ['전체', ...SEASONS] as const
const PLACES = ['상동교 · 신천 산책로', '범어로 가로수길', '수성못']
const PLACEHOLDERS = 5

/** 풍경 기록 (Figma 230:671) */
export function Record() {
  const { records } = useStore()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('전체')

  const visible = useMemo(() => records.filter((r) => filter === '전체' || r.season === filter), [records, filter])
  const total = PLACES.length * PLACEHOLDERS // 디자인 기준 15

  return (
    <div className="screen">
      <Header title="풍경 기록" />
      <StatusBar />
      <p className="rec__count">전체 {total}</p>
      <div className="rec__chips">
        {FILTERS.map((f) => (
          <button key={f} className={f === filter ? 'is-on' : ''} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      <div className="scroll rec__body">
        {PLACES.map((place) => {
          const mine = visible.filter((r) => r.place === place)
          const blanks = filter === '전체' ? PLACEHOLDERS : 0
          return (
            <section className="rec__place" key={place}>
              <h3>{place}</h3>
              <div className="rec__row">
                {mine.map((r) => (
                  <div className="thumb" key={r.id} title={r.memo}>
                    {r.photo && <img src={r.photo} alt={r.memo || `${r.season} 기록`} />}
                  </div>
                ))}
                {Array.from({ length: blanks }, (_, i) => (
                  <div className="thumb" key={`b${i}`} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
      <Nav />
      <HomeIndicator />
    </div>
  )
}
