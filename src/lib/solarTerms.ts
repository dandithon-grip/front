/** 24절기 중 서비스 기간(가을~겨울)에 보이는 절기. 날짜만으로 고르는 정적 읽을거리이며 실제 날씨와 무관하다. */
export interface SolarTerm {
  name: string; hanja: string; month: number; day: number
  headline: [string, string]; season: string; meaning: string; feature: string; scenery: string; tip: string; next: string
}

export const SOLAR_TERMS: SolarTerm[] = [
  { name: '한로', hanja: '寒露', month: 10, day: 8, headline: ['찬 이슬이 맺히는', '가을 한가운데를 걸어요.'], season: '가을',
    meaning: "'찬 이슬'이라는 뜻의 한로는 공기가 선선해지고 단풍이 시작되는 절기예요.", feature: '아침 이슬이 차가워지고 국화가 피어요. 단풍이 산 위에서부터 내려와요.',
    scenery: '노랗게 물들기 시작한 가로수, 맑고 높은 하늘', tip: '단풍 시작 구간 걷기, 국화 감상', next: '상강(霜降)' },
  { name: '상강', hanja: '霜降', month: 10, day: 23, headline: ['서리가 내려앉은', '늦가을의 풍경을 만나요.'], season: '늦가을',
    meaning: "'서리가 내린다'는 뜻을 가진 상강은 가을의 마지막 절기예요. 겨울을 앞두고 계절이 깊어지는 시기예요.", feature: '낮과 밤의 기온 차가 커지고 아침저녁으로 쌀쌀해져요. 풀잎에 서리가 맺히고, 나뭇잎은 붉고 노랗게 물들어요.',
    scenery: '서리 내린 들판, 붉게 물든 산, 차가워진 아침 공기', tip: '단풍길 산책, 국화 감상, 따뜻한 차 마시기', next: '입동(立冬)' },
  { name: '입동', hanja: '立冬', month: 11, day: 7, headline: ['겨울이 문을 여는', '늦가을 끝자락을 걸어요.'], season: '초겨울',
    meaning: "'겨울에 들어선다'는 뜻의 입동은 겨울의 첫 절기예요. 단풍이 절정을 지나 떨어지기 시작해요.", feature: '찬바람이 처음 불고 해가 눈에 띄게 짧아져요. 은행잎이 노랗게 깔리고 낙엽이 길을 덮어요.',
    scenery: '노란 은행잎이 깔린 길, 일찍 지는 해, 하얗게 보이는 입김', tip: '퇴근길 낙엽 밟기, 해 지기 전 산책, 김장 준비', next: '소설(小雪)' },
  { name: '소설', hanja: '小雪', month: 11, day: 22, headline: ['첫눈 소식이 들리는', '초겨울의 풍경을 만나요.'], season: '초겨울',
    meaning: "'작은 눈'이라는 뜻의 소설은 첫눈이 내릴 무렵의 절기예요. 겨울 채비를 마무리하는 때예요.", feature: '바람이 차가워지고 땅이 얼기 시작해요. 나뭇가지가 드러나고 하늘이 낮아져요.',
    scenery: '앙상한 가지 사이로 보이는 하늘, 첫눈, 김 서린 창', tip: '해 질 녘 강변 걷기, 따뜻한 음료와 짧은 산책', next: '대설(大雪)' },
  { name: '대설', hanja: '大雪', month: 12, day: 7, headline: ['눈이 많이 내린다는', '한겨울의 문턱이에요.'], season: '겨울',
    meaning: "'큰 눈'이라는 뜻의 대설은 눈이 가장 많이 내린다는 절기예요. 본격적인 겨울이 시작돼요.", feature: '기온이 영하로 내려가고 강가에 살얼음이 생겨요. 눈 내린 아침이 조용해요.',
    scenery: '눈 덮인 공원, 얼어붙은 물가, 맑은 겨울 하늘', tip: '눈길 안전하게 걷기, 양지바른 공원 산책', next: '동지(冬至)' },
  { name: '동지', hanja: '冬至', month: 12, day: 22, headline: ['밤이 가장 긴 날,', '짧은 해를 아껴 걸어요.'], season: '한겨울',
    meaning: '동지는 일 년 중 밤이 가장 긴 날이에요. 이날을 지나면 해가 조금씩 길어져요.', feature: '해가 가장 일찍 져요. 퇴근길이 어둡고, 노을이 짧고 붉어요.',
    scenery: '이른 노을, 불 켜진 거리, 팥죽 끓는 연기', tip: '해 지기 전 짧은 산책, 팥죽 먹기', next: '소한(小寒)' },
  { name: '소한', hanja: '小寒', month: 1, day: 5, headline: ['가장 추운 때를 지나는', '한겨울의 풍경이에요.'], season: '한겨울',
    meaning: "'작은 추위'라는 이름과 달리 소한은 일 년 중 가장 추운 절기예요.", feature: '강이 얼고 바람이 매서워요. 맑은 날엔 공기가 투명해 멀리까지 보여요.',
    scenery: '얼어붙은 강, 눈 쌓인 나뭇가지, 투명한 겨울 공기', tip: '양지쪽 짧은 산책, 따뜻하게 입고 걷기', next: '대한(大寒)' },
  { name: '대한', hanja: '大寒', month: 1, day: 20, headline: ['겨울의 끝에서', '봄을 기다리며 걸어요.'], season: '늦겨울',
    meaning: "'큰 추위'라는 뜻의 대한은 24절기의 마지막이에요. 추위가 고비를 넘기고 봄으로 향해요.", feature: '추위가 누그러지는 날이 늘어요. 해가 길어진 게 느껴져요.',
    scenery: '녹기 시작한 강, 길어진 오후 햇살', tip: '해 질 녘 강변 걷기, 봄 준비', next: '입춘(立春)' },
]

/** 오늘 이전에 시작한 절기 중 가장 최근 것. 연초(1/1~1/4)는 전해 동지. */
export function currentSolarTerm(now: Date = new Date()): SolarTerm {
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const month = kst.getMonth() + 1, day = kst.getDate()
  const key = (m: number, d: number) => m * 100 + d
  const today = key(month, day)
  // 1월 절기(소한·대한)는 12월 절기보다 "뒤"다. 연도를 넘기는 비교를 위해 1~2월은 +1200
  const order = (m: number, d: number) => (m <= 2 ? key(m, d) + 1200 : key(m, d))
  const todayOrder = month <= 2 ? today + 1200 : today
  const started = SOLAR_TERMS.filter(term => order(term.month, term.day) <= todayOrder)
  return started.length ? started[started.length - 1] : SOLAR_TERMS[SOLAR_TERMS.length - 3]
}
