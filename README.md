# 샛길 (saetgil-app)

출퇴근·등하교 동선 위에서 결심 없이 자연을 지나가게 해주는 서비스 **샛길**의 모바일 웹 프론트엔드입니다.
Figma 디자인(402 × 874, iPhone 기준)을 그대로 구현했고, 데스크톱 브라우저에서는 휴대폰 프레임 안에 표시됩니다.

## 기술 스택

- Vite 5 + React 18 + TypeScript
- react-router-dom 6
- 일반 CSS (`src/styles.css`)
- 폰트: Pretendard, Cafe24 Ssurround

## 실행 방법

### 1. 준비물

- [Node.js](https://nodejs.org/) 18 이상 (npm 포함)

```bash
node -v   # v18 이상인지 확인
```

### 2. 설치

```bash
git clone https://github.com/dandithon-grip/front.git
cd front
npm install
```

### 3. 개발 서버 실행

```bash
npm run dev
```

터미널에 표시되는 주소(기본 `http://localhost:5173`)를 브라우저에서 엽니다.
처음 열면 `/login` 화면으로 이동합니다. 로그인 없이 둘러보려면 **로그인 없이 둘러보기**를 누르세요.

### 4. 빌드 / 미리보기

```bash
npm run build     # 타입 검사 후 dist/ 에 빌드
npm run preview   # 빌드 결과 미리보기
```

## 이미지 에셋

아이콘·지도 선·이미지는 `public/assets/` 에 들어 있어서 별도 작업 없이 바로 실행됩니다.

에셋이 없거나 다시 받아야 하면 아래 명령을 인터넷이 되는 PC에서 실행하세요.

```bash
npm run fetch-assets
```

`scripts/assets.manifest.json` 의 Figma 링크는 임시 주소라 **2026-11-12경까지만** 유효합니다.
이후에는 Figma에서 에셋을 다시 내보낸 뒤 manifest의 URL을 갱신해야 합니다.

## 화면 구성

| 경로 | 화면 |
| --- | --- |
| `/login` | 로그인 |
| `/signup` | 회원가입 |
| `/route-setup` | 일상 경로 설정 |
| `/home` | 홈 |
| `/season` | 계절 더보기 |
| `/route` | 경로 |
| `/guide` | 경로 안내 |
| `/photo` | 사진 남기기 |
| `/record` | 풍경 기록 |
| `/my` | 마이페이지 |
| `/my/edit` | 내 정보 수정 |
| `/my/route` | 일상 경로 수정 |

## 동작 방식

- 로그인·회원가입은 목업이며 입력값에 따라 버튼 활성화 상태만 바뀝니다.
- 일상 경로·프로필·알림 설정·기록은 브라우저 `localStorage` (`saetgil:v1`)에 저장됩니다. 사진은 용량 때문에 저장하지 않습니다.
- 마이페이지에서 알림 시간 옆 연필 아이콘을 눌러 출근·퇴근 시간을 바로 고칠 수 있습니다.
- 경로 화면에서 출발·도착 바꾸기 버튼으로 두 값을 서로 바꿀 수 있습니다 (그 화면 안에서만 유지).
- 뒤로가기는 기록이 없으면(새로고침·주소 직접 입력) 화면별 상위 화면으로 이동합니다.

## 폴더 구조

```
src/
  App.tsx            라우팅, 화면 크기에 맞춘 축소
  main.tsx
  styles.css         전체 스타일
  components/ui.tsx  헤더·하단 탭·입력·버튼 등 공통 UI
  lib/assets.ts      에셋 경로 헬퍼
  lib/store.tsx      상태 + localStorage 저장
  pages/             Auth, Home, Route, Record, My
public/assets/       아이콘·지도·이미지 에셋
scripts/             에셋 다운로드 스크립트와 목록
```
