import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Header, Nav } from '../components/ui'
import { A } from '../lib/assets'
import { apiRequest } from '../lib/api'
import { authClient } from '../lib/auth'
import { config } from '../lib/config'
import { todayInKorea } from '../lib/preview'
import { useStore } from '../lib/store'
import './records.css'
import { THUMB_MAX_EDGE, cachedSignedUrls, rememberSignedUrl, signedTtlSeconds, thumbPathOf } from '../lib/recordMedia'

const SEASONS = ['cherry', 'foliage', 'ginkgo', 'snow', 'sunset', 'none'] as const
const STAGES = ['peak', 'mid', 'end', 'none'] as const
type RecordSeason = typeof SEASONS[number]
type RecordStage = typeof STAGES[number]
const LABELS: Record<string, string> = { cherry: '벚꽃', foliage: '단풍', ginkgo: '은행', snow: '눈', sunset: '노을', none: '기타 풍경', 봄: '봄', 여름: '여름', 가을: '가을', 겨울: '겨울' }
const STAGE_LABELS: Record<RecordStage, string> = { peak: '절정', mid: '진행 중', end: '끝물', none: '잘 모르겠어요' }
const validPlaceId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const recordYear = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 4) : '날짜 미상'
interface SavedRecord { id: string; place_id: string; date: string; season: RecordSeason; stage: RecordStage; title: string | null; image_path: string; ai_season?: RecordSeason | null; ai_stage?: RecordStage | null }
interface Suggestion { season: RecordSeason; stage: RecordStage; place_id: string | null }
interface GalleryRecord { id: string; placeId: string; placeLabel?: string; date: string; season: string; stage: string; title: string; imageUrl?: string; thumbUrl?: string }
interface ViewerSelection { records: GalleryRecord[]; index: number; owner: string }
interface PreparedPhoto { blob: Blob; thumb: Blob; preview: string; key: string }
interface UploadedPhoto { key: string; userId: string; path: string; complete: boolean }
interface RecordIdentity { userId?: string; source: 'api' | 'preview' }
const errorText = (cause: unknown, fallback: string) => cause instanceof Error && /[가-힣]/.test(cause.message) ? cause.message.replace('지금 길을 불러오지 못했어요.', '지금 기록을 불러오지 못했어요.') : fallback

/** Drawing decoded pixels to a fresh canvas omits original EXIF/location metadata. */
async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 사진을 골라 주세요.')
  if (!file.type.startsWith('image/')) throw new Error('사진 파일을 골라 주세요.')
  const source = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('이 사진을 열지 못했어요. JPG나 PNG 사진으로 다시 골라 주세요.')); image.src = source })
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('사진 크기를 확인하지 못했어요.')
    const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('이 브라우저에서 사진을 준비하지 못했어요.')
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('사진을 준비하지 못했어요. 다른 사진으로 다시 시도해 주세요.')), 'image/jpeg', .85))
    // 목록용 작은 사진. 전체 사진(1600px, 수백 KB)을 썸네일로 내려받으면 기록 화면이 느리다
    const small = document.createElement('canvas')
    const thumbRatio = Math.min(1, THUMB_MAX_EDGE / Math.max(canvas.width, canvas.height))
    small.width = Math.max(1, Math.round(canvas.width * thumbRatio)); small.height = Math.max(1, Math.round(canvas.height * thumbRatio))
    small.getContext('2d')?.drawImage(canvas, 0, 0, small.width, small.height)
    const thumb = await new Promise<Blob>((resolve) => small.toBlob(result => resolve(result ?? blob), 'image/jpeg', .8))
    return { blob, thumb, preview: URL.createObjectURL(blob), key: crypto.randomUUID() }
  } finally { URL.revokeObjectURL(source) }
}

function fileDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('사진을 읽지 못했어요.')); reader.readAsDataURL(blob) })
}

function RecordLogin() {
  const nav = useNavigate()
  return <section className="record-state"><h2>내 풍경은 로그인하고 남겨 주세요</h2><p>로그인하면 사진과 기록을 다시 찾아볼 수 있어요.</p><Button on onClick={() => nav('/login')}>로그인하기</Button></section>
}

export function Photo() {
  const nav = useNavigate()
  const { profile, isGuest, dataSource, selectedRoute, addRecord } = useStore()
  const previewMode = dataSource === 'preview'
  const needsLogin = !previewMode && (isGuest || !profile.loggedIn)
  const spots = [...new Set(selectedRoute?.spots || [])].filter(id => previewMode || validPlaceId(id))
  const [placeId, setPlaceId] = useState(spots[0] || '')
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null)
  const [season, setSeason] = useState<RecordSeason>('none')
  const [stage, setStage] = useState<RecordStage>('none')
  const [title, setTitle] = useState('')
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [suggestionError, setSuggestionError] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState<'prepare' | 'suggest' | 'save' | null>(null)
  const lock = useRef(false)
  const mounted = useRef(true)
  const identity = useRef<RecordIdentity>({ userId: profile.authId, source: dataSource })
  identity.current = { userId: profile.authId, source: dataSource }
  const uploaded = useRef<UploadedPhoto | null>(null)
  const attemptedSave = useRef<string | null>(null)
  const canSave = Boolean(photo && placeId && spots.includes(placeId) && !pending)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { setPhoto(null); uploaded.current = null; attemptedSave.current = null; setSuggestion(null); setError(''); setSuggestionError('') }, [profile.authId, dataSource])
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview) }, [photo])
  useEffect(() => { setPlaceId(spots[0] || ''); setSuggestion(null); setSuggestionError('') }, [selectedRoute?.id])

  const sameIdentity = (operation: RecordIdentity) => mounted.current && identity.current.userId === operation.userId && identity.current.source === operation.source
  const assertCurrent = (operation: RecordIdentity) => { if (!sameIdentity(operation)) throw new Error('로그인 정보가 변경됐어요. 다시 시도해 주세요.') }
  const assertLiveIdentity = async (operation: RecordIdentity) => {
    assertCurrent(operation)
    const result = await authClient?.auth.getSession()
    assertCurrent(operation)
    if (!operation.userId || result?.data.session?.user.id !== operation.userId) throw new Error('로그인 정보가 변경됐어요. 다시 로그인해 주세요.')
  }

  const choosePhoto = async (file?: File) => {
    if (!file || lock.current) return
    const operation = { ...identity.current }
    lock.current = true; setPending('prepare'); setError('')
    try {
      const prepared = await preparePhoto(file)
      if (!sameIdentity(operation)) { URL.revokeObjectURL(prepared.preview); return }
      setPhoto(prepared); uploaded.current = null; attemptedSave.current = null; setSuggestion(null); setSuggestionError('')
    } catch (cause) { if (sameIdentity(operation)) setError(errorText(cause, '사진을 준비하지 못했어요. 다시 골라 주세요.')) }
    finally { lock.current = false; if (mounted.current) setPending(null) }
  }

  const upload = async (operation: RecordIdentity) => {
    assertCurrent(operation)
    if (!photo || !authClient) throw new Error('로그인 후 사진을 올릴 수 있어요.')
    const client = authClient
    const { data, error: identityError } = await client.auth.getUser()
    assertCurrent(operation)
    if (identityError || !data.user) throw new Error('로그인이 만료됐어요. 다시 로그인해 주세요.')
    if (!operation.userId || operation.userId !== data.user.id) throw new Error('로그인 정보가 바뀌었어요. 다시 로그인한 뒤 사진을 골라 주세요.')
    await assertLiveIdentity(operation)
    if (!uploaded.current || uploaded.current.key !== photo.key || uploaded.current.userId !== data.user.id) {
      uploaded.current = { key: photo.key, userId: data.user.id, path: `${data.user.id}/${photo.key}.jpg`, complete: false }
    }
    const cached = uploaded.current
    if (!cached.complete) {
      const result = await client.storage.from(config.recordBucket).upload(cached.path, photo.blob, { contentType: 'image/jpeg', upsert: false })
      await assertLiveIdentity(operation)
      if (result.error) {
        // An interrupted response can leave an uploaded object. Reuse its path after verifying access.
        const status = 'statusCode' in result.error ? String(result.error.statusCode) : ''
        const existing = status === '409' ? await client.storage.from(config.recordBucket).createSignedUrl(cached.path, 60) : null
        await assertLiveIdentity(operation)
        if (!existing?.data?.signedUrl) throw new Error('사진을 올리지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
      }
      // 썸네일은 있으면 좋고 없어도 된다 (목록이 전체 사진으로 대신 보여줌)
      await client.storage.from(config.recordBucket).upload(thumbPathOf(cached.path), photo.thumb, { contentType: 'image/jpeg', upsert: true }).catch(() => undefined)
      cached.complete = true
    }
    await assertLiveIdentity(operation)
    return cached.path
  }

  const suggest = async () => {
    if (!canSave || lock.current || previewMode) return
    const operation = { ...identity.current }
    lock.current = true; setPending('suggest'); setError(''); setSuggestionError('')
    try {
      const imagePath = await upload(operation)
      await assertLiveIdentity(operation)
      const result = await apiRequest<Suggestion>('/records/suggest', { method: 'POST', expectedUserId: operation.userId, body: { image_path: imagePath, place_id: placeId } })
      await assertLiveIdentity(operation)
      if (!SEASONS.includes(result.season) || !STAGES.includes(result.stage)) throw new Error('사진의 계절을 알아보지 못했어요. 아래에서 직접 골라 주세요.')
      setSuggestion(result)
      if (result.season === 'none' && result.stage === 'none') setSuggestionError('사진만으로 풍경을 알아보지 못했어요. 직접 골라 저장할 수 있어요.')
    } catch (cause) { if (sameIdentity(operation)) setSuggestionError(errorText(cause, '분류 제안을 불러오지 못했어요. 직접 골라 저장할 수 있어요.')) }
    finally { lock.current = false; if (mounted.current) setPending(null) }
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSave || lock.current || !photo) return
    const operation = { ...identity.current }
    lock.current = true; setPending('save'); setError('')
    try {
      if (previewMode) {
        const photoData = await fileDataUrl(photo.blob)
        assertCurrent(operation)
        addRecord({ place: `예시 자연 장소 ${spots.indexOf(placeId) + 1}`, placeId, season, stage, memo: title.trim(), photo: photoData, date: todayInKorea() })
      } else {
        if (!validPlaceId(placeId)) throw new Error('선택한 경로에서 기록할 장소를 다시 골라 주세요.')
        const imagePath = await upload(operation)
        await assertLiveIdentity(operation)
        if (attemptedSave.current === imagePath) {
          const existing = await apiRequest<SavedRecord[]>('/records', { expectedUserId: operation.userId })
          await assertLiveIdentity(operation)
          if (existing.some(record => record.image_path === imagePath)) { nav('/record', { replace: true }); return }
        }
        attemptedSave.current = imagePath
        await assertLiveIdentity(operation)
        await apiRequest<SavedRecord>('/records', { method: 'POST', expectedUserId: operation.userId, body: { place_id: placeId, season, stage, image_path: imagePath, title: title.trim() || null, ...(suggestion ? { ai_season: suggestion.season, ai_stage: suggestion.stage } : {}) } })
        await assertLiveIdentity(operation)
      }
      assertCurrent(operation)
      nav('/record', { replace: true })
    } catch (cause) { if (sameIdentity(operation)) setError(errorText(cause, '기록을 저장하지 못했어요. 다시 시도해 주세요.')) }
    finally { lock.current = false; if (mounted.current) setPending(null) }
  }

  return <div className="screen screen--flow records-page">
    <Header title="사진 남기기" tone="gray" />
    {needsLogin ? <div className="records-content"><RecordLogin /></div> : <form className="record-photo-form" onSubmit={save} aria-busy={Boolean(pending)}>
      <div className="records-content">
        {previewMode && <p className="record-preview-note">예시 기록이에요. 사진과 내용은 이 브라우저에만 남고 계정에 저장되지 않아요.</p>}
        {!spots.length && <section className="record-state"><h2>기록할 자연 장소가 없어요</h2><p>자연 장소가 포함된 경로를 고른 뒤 사진을 남겨 주세요.</p><Button type="button" line onClick={() => nav('/route')}>경로 선택하기</Button></section>}
        <label className="record-field"><span>이 장소의 사진 <small>필수 · 최대 10MB</small></span><span className="record-upload">
          {photo ? <img className="record-upload__preview" src={photo.preview} alt="선택한 풍경 사진" /> : <span className="record-upload__prompt"><img src={A('icons/camera.svg')} alt="" />사진 추가</span>}
          <input type="file" accept="image/*" aria-label={photo ? '다른 사진 선택' : '사진 추가'} disabled={Boolean(pending)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void choosePhoto(file) }} />
        </span></label>
        <p className="record-help">사진의 위치정보를 지운 뒤 저장해요.{photo ? ' 사진을 누르면 다른 사진으로 바꿀 수 있어요.' : ''}</p>
        <label className="record-field"><span>기록할 장소</span><select value={placeId} onChange={(event) => { setPlaceId(event.target.value); setSuggestion(null); setSuggestionError('') }} disabled={Boolean(pending) || !spots.length}>{!spots.length && <option value="">선택 가능한 장소 없음</option>}{spots.map((id, index) => <option key={id} value={id}>{previewMode ? '예시 경로' : '선택 경로'}의 {index + 1}번째 자연 장소</option>)}</select></label>
        {!!spots.length && !previewMode && <p className="record-help">장소 이름이 제공되지 않아 선택 경로의 자연 장소 순서로 표시해요.</p>}
        {!previewMode && <div className="record-suggest"><Button type="button" line disabled={!canSave} onClick={() => void suggest()}>{pending === 'suggest' ? '풍경을 살펴보는 중…' : 'AI로 계절·상태 제안받기'}</Button><p className="record-help">제안받기는 선택이에요. 직접 고른 뒤 바로 저장해도 돼요.</p></div>}
        {suggestion && <div className="record-suggestion"><p>사진 분류 제안: <strong>{LABELS[suggestion.season]} · {STAGE_LABELS[suggestion.stage]}</strong></p><button type="button" disabled={Boolean(pending)} onClick={() => { setSeason(suggestion.season); setStage(suggestion.stage) }}>이 제안 사용하기</button></div>}
        {suggestionError && <p className="record-help" role="status">{suggestionError}</p>}
        <fieldset className="record-options" disabled={Boolean(pending)}><legend>계절 풍경</legend><div>{SEASONS.map(value => <button key={value} type="button" aria-pressed={season === value} className={season === value ? 'is-selected' : ''} onClick={() => setSeason(value)}>{LABELS[value]}</button>)}</div></fieldset>
        <fieldset className="record-options" disabled={Boolean(pending)}><legend>풍경 상태</legend><div>{STAGES.map(value => <button key={value} type="button" aria-pressed={stage === value} className={stage === value ? 'is-selected' : ''} onClick={() => setStage(value)}>{STAGE_LABELS[value]}</button>)}</div></fieldset>
        <label className="record-field"><span>풍경 한 마디 <small>선택</small></span><input className="inp" placeholder="이 순간, 어떤 기분이었나요?" value={title} maxLength={100} disabled={Boolean(pending)} onChange={(event) => setTitle(event.target.value)} /></label>
        {error && <p className="flow-error" role="alert">{error}</p>}
      </div>
      <footer className="record-save"><p className="record-help">고른 계절과 상태를 확인한 뒤 저장해 주세요.</p><Button type="submit" on={canSave} disabled={!canSave}>{pending === 'prepare' ? '사진 준비 중…' : pending === 'save' ? '기록 저장 중…' : previewMode ? '예시 기록 저장하기' : '기록 저장하기'}</Button></footer>
    </form>}
  </div>
}

function useRecordList() {
  const { records, dataSource, isGuest, profile, sessionReady } = useStore()
  const ownerKey = `${dataSource}:${profile.authId || 'guest'}`
  const currentOwner = useRef(ownerKey)
  currentOwner.current = ownerKey
  const [loadedOwner, setLoadedOwner] = useState(ownerKey)
  const [items, setItems] = useState<GalleryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const previewMode = dataSource === 'preview'
  const needsLogin = !previewMode && (isGuest || !profile.loggedIn)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    if (!sessionReady) return () => controller.abort()
    setLoadedOwner(ownerKey)
    setError('')
    if (previewMode) {
      setItems(records.map(record => ({ id: String(record.id), placeId: record.placeId || `preview-${record.place}`, placeLabel: record.place, date: record.date || '', season: record.season, stage: record.stage || 'none', title: record.memo, imageUrl: record.photo })))
      setLoading(false); return () => controller.abort()
    }
    if (needsLogin) { setItems([]); setLoading(false); return () => controller.abort() }
    setLoading(true); setItems([])
    void (async () => {
      try {
        const expectedUserId = profile.authId
        const assertOwner = async () => {
          if (!active || currentOwner.current !== ownerKey) throw new Error('로그인 정보가 변경됐어요.')
          const session = await authClient?.auth.getSession()
          if (!active || currentOwner.current !== ownerKey || !expectedUserId || session?.data.session?.user.id !== expectedUserId) throw new Error('로그인 정보가 변경됐어요. 다시 로그인해 주세요.')
        }
        const result = await apiRequest<SavedRecord[]>('/records', { signal: controller.signal, expectedUserId })
        await assertOwner()
        if (!Array.isArray(result)) throw new Error('기록을 불러오지 못했어요.')
        // 목록은 바로 보여주고 사진 주소는 뒤따라 채운다 (사진 없이도 날짜·장소·태그는 읽을 수 있다)
        const toItem = (record: SavedRecord, urls: Map<string, string>): GalleryRecord => ({ id: record.id, placeId: record.place_id, date: record.date, season: record.season, stage: record.stage, title: record.title || '',
          imageUrl: urls.get(record.image_path), thumbUrl: urls.get(thumbPathOf(record.image_path)) })
        if (active) { setItems(result.map(record => toItem(record, new Map()))); setLoading(false) }
        const fullPaths = [...new Set(result.map(record => record.image_path).filter(Boolean))]
        // 목록은 썸네일, 큰 사진은 원본. 서명 URL 은 탭 안에서 1시간 캐시해 다시 들어올 때 기다리지 않는다
        const wanted = [...fullPaths, ...fullPaths.map(thumbPathOf)]
        const { hit: urls, missing } = cachedSignedUrls(wanted)
        let photoError = false
        if (missing.length) {
          if (!authClient) photoError = true
          else {
            const signed = await authClient.storage.from(config.recordBucket).createSignedUrls(missing, signedTtlSeconds)
            await assertOwner()
            if (signed.error) photoError = true
            for (const item of signed.data || []) {
              if (item.path && item.signedUrl && !item.error) { urls.set(item.path, item.signedUrl); rememberSignedUrl(item.path, item.signedUrl) }
              else if (item.path && !item.path.endsWith('_thumb.jpg')) photoError = true  // 옛 기록은 썸네일이 없다
            }
          }
        }
        if (!active) return
        setItems(result.map(record => toItem(record, urls)))
        if (photoError) setError('기록은 불러왔지만 일부 사진을 열지 못했어요. 다시 불러와 주세요.')
      } catch (cause) { if (active) setError(errorText(cause, '기록을 불러오지 못했어요. 다시 시도해 주세요.')) }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false; controller.abort() }
  }, [records, dataSource, isGuest, profile.authId, profile.loggedIn, sessionReady, revision])
  const sameOwner = loadedOwner === ownerKey
  return { items: sameOwner ? items : [], loading: loading || !sameOwner, error: sameOwner ? error : '', retry: () => setRevision(value => value + 1), previewMode, needsLogin, ownerKey }
}

function GalleryImage({ record, full = false }: { record: GalleryRecord; full?: boolean }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [record.imageUrl, record.thumbUrl])
  // 목록은 썸네일(없거나 못 열면 원본), 큰 보기는 원본
  const src = full ? record.imageUrl : (!failed && record.thumbUrl) || record.imageUrl
  return src ? <img src={src} alt={record.title || `${LABELS[record.season] || '풍경'} 기록`} loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <span className="record-image-missing">사진을 불러오지 못했어요</span>
}

/** 네이티브 모달이 포커스를 가두며, 닫으면 사진을 열었던 버튼으로 돌아간다. */
export function RecordViewer({ records, index, onClose, onMove }: { records: GalleryRecord[]; index: number; onClose: () => void; onMove: (index: number) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const record = records[index]
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const modal = dialog.current
    if (!modal) return
    modal.showModal()
    close.current?.focus()
    return () => { if (modal.open) modal.close(); if (previous?.isConnected) previous.focus() }
  }, [])
  if (!record) return null
  return <dialog ref={dialog} className="record-viewer" aria-labelledby="record-viewer-title" aria-describedby="record-viewer-caption" onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }} onKeyDown={(event) => {
    if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); onMove(index - 1) }
    if (event.key === 'ArrowRight' && index < records.length - 1) { event.preventDefault(); onMove(index + 1) }
  }}>
    <div className="record-viewer__panel">
      <header><h2 id="record-viewer-title">남겨 둔 풍경 <span>{index + 1} / {records.length}</span></h2><button ref={close} type="button" aria-label="큰 사진 닫기" onClick={onClose}><img src={A('icons/close-x.svg')} alt="" /></button></header>
      <div className="record-viewer__image"><GalleryImage record={record} full /></div>
      <div className="record-viewer__caption" id="record-viewer-caption" aria-live="polite"><time dateTime={record.date || undefined}>{record.date || '날짜 미상'}</time><span>{LABELS[record.season] || '풍경'} · {STAGE_LABELS[record.stage as RecordStage] || '상태 미상'}</span><p>{record.title || '이 풍경에 남긴 한 마디가 없어요.'}</p></div>
      {records.length > 1 && <nav aria-label="사진 이동"><button type="button" disabled={index === 0} onClick={() => onMove(index - 1)}>‹ 이전 사진</button><button type="button" disabled={index === records.length - 1} onClick={() => onMove(index + 1)}>다음 사진 ›</button></nav>}
    </div>
  </dialog>
}

export function Record() {
  const nav = useNavigate()
  const { items, loading, error, retry, previewMode, needsLogin, ownerKey } = useRecordList()
  const [filter, setFilter] = useState('all')
  const [viewing, setViewing] = useState<ViewerSelection | null>(null)
  useEffect(() => { setViewing(null) }, [ownerKey])
  const filtered = useMemo(() => items.filter(record => filter === 'all' || record.season === filter), [items, filter])
  const allPlaces = [...new Set(items.map(record => record.placeId))]
  const groups = [...new Set(filtered.map(record => record.placeId))]
  const legacyFilters = [...new Set(items.map(record => record.season).filter(season => !SEASONS.includes(season as RecordSeason)))]
  return <div className="screen screen--flow records-page"><Header title="풍경 기록" /><main className="records-content records-gallery">
    {previewMode && <p className="record-preview-note">이 브라우저의 예시 기록이에요. 계정에 저장된 기록과는 달라요.</p>}
    {needsLogin ? <RecordLogin /> : <>
      <div className="record-gallery-head"><p>{loading ? '기록 불러오는 중…' : `전체 ${items.length}개${filter !== 'all' ? ` · 선택 ${filtered.length}개` : ''}`}</p><button type="button" onClick={retry} disabled={loading}>새로고침</button></div>
      <div className="record-filters" aria-label="계절 풍경 필터">{['all', ...SEASONS, ...legacyFilters].map(value => <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'is-selected' : ''} onClick={() => setFilter(value)}>{value === 'all' ? '전체' : LABELS[value] || '기타'}</button>)}</div>
      {error && <div className="flow-error" role="alert">{error}<button type="button" className="record-text-button" onClick={retry}>다시 불러오기</button></div>}
      {loading ? <p className="record-help" role="status">내가 남긴 풍경을 찾아보고 있어요.</p> : !filtered.length ? <section className="record-state"><h2>{items.length ? '이 계절의 기록이 아직 없어요' : '아직 남긴 풍경이 없어요'}</h2><p>샛길에서 만난 풍경을 사진으로 남겨 보세요.</p><Button line onClick={() => nav('/route')}>샛길 둘러보기</Button></section> : groups.map(place => {
        const group = filtered.filter(record => record.placeId === place)
        const name = previewMode ? group[0].placeLabel || '예시 자연 장소' : `자연 장소 ${allPlaces.indexOf(place) + 1}`
        return <section className="record-group" key={place}><button type="button" className="record-group__heading" onClick={() => nav(`/record/${encodeURIComponent(place)}`)}><h2>{name}</h2><span>{group.length}개 · 모두 보기 ›</span></button><div className="record-thumbnails">{group.map((record, index) => <button type="button" key={record.id} className="record-thumbnail" aria-label={`${name}, ${record.date || '날짜 미상'}, ${record.title || LABELS[record.season] || '풍경'} 큰 사진 보기`} onClick={() => setViewing({ records: group, index, owner: ownerKey })}><GalleryImage record={record} /></button>)}</div></section>
      })}
      {!previewMode && !!items.length && <p className="record-help">장소 이름이 제공되지 않아 기록에 등장한 순서로 표시해요.</p>}
    </>}
  </main><Nav />{viewing?.owner === ownerKey && <RecordViewer records={viewing.records} index={viewing.index} onClose={() => setViewing(null)} onMove={(index) => setViewing(previous => previous && ({ ...previous, index }))} />}</div>
}

export function PlaceRecord() {
  const nav = useNavigate()
  const { placeId = '' } = useParams()
  const { items, loading, error, retry, previewMode, needsLogin, ownerKey } = useRecordList()
  const [viewing, setViewing] = useState<ViewerSelection | null>(null)
  useEffect(() => { setViewing(null) }, [ownerKey])
  const selected = items.filter(record => record.placeId === placeId)
  const years = [...new Set(selected.map(record => recordYear(record.date)))].sort((a, b) => a === '날짜 미상' ? 1 : b === '날짜 미상' ? -1 : b.localeCompare(a))
  return <div className="screen screen--flow records-page"><Header title="이 장소의 풍경" tone="gray" /><main className="records-content records-place">
    <button type="button" className="record-text-button" onClick={() => nav('/record')}>‹ 전체 기록</button>
    {previewMode && <p className="record-preview-note">이 브라우저에만 남긴 예시 기록이에요.</p>}
    {needsLogin ? <RecordLogin /> : <>
      {error && <div className="flow-error" role="alert">{error}<button type="button" className="record-text-button" onClick={retry}>다시 불러오기</button></div>}
      {loading ? <p className="record-help" role="status">이 장소의 풍경을 불러오고 있어요.</p> : !selected.length ? <section className="record-state"><h2>이 장소의 기록이 없어요</h2><Button line onClick={() => nav('/record')}>전체 기록 보기</Button></section> : <><p className="record-help">한 장소에서 남긴 풍경 {selected.length}개</p>{years.map(year => <section className="record-year" key={year}><h2>{year === '날짜 미상' ? year : `${year}년`}</h2><div className="record-year__photos">{selected.filter(record => recordYear(record.date) === year).map(record => <figure className="record-detail" key={record.id}><button type="button" className="record-detail__open" aria-label={`${record.date || '날짜 미상'}, ${record.title || '풍경'} 큰 사진 보기`} onClick={() => setViewing({ records: selected, index: selected.findIndex(item => item.id === record.id), owner: ownerKey })}><GalleryImage record={record} /></button><figcaption><time dateTime={record.date || undefined}>{record.date || '날짜 미상'}</time><span>{LABELS[record.season] || '풍경'} · {STAGE_LABELS[record.stage as RecordStage] || '상태 미상'}</span>{record.title && <p>{record.title}</p>}</figcaption></figure>)}</div></section>)}</>}
    </>}
  </main><Nav />{viewing?.owner === ownerKey && <RecordViewer records={viewing.records} index={viewing.index} onClose={() => setViewing(null)} onMove={(index) => setViewing(previous => previous && ({ ...previous, index }))} />}</div>
}
