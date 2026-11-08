# 백엔드 수정·외부 설정 의존사항

확인 기준: **2026-11-08**, 운영 OpenAPI, 읽기 전용 HTTP 점검, 서버 main `48b9433`의 신규 대중교통 명세와 기존 기능을 확인한 main `661e0ae`·develop `c8e8c10`. 기존 두 브랜치의 파일 내용은 당시 확인 시점에 같았다. 이 문서는 필요한 작업과 검증 방법을 정리한다. 아래 검증 절차는 실행 완료 목록이 아니다. 운영 데이터 저장·회원가입·알림 발송은 조사 중 실행하지 않았다. 짧은 전달용 요청은 [백엔드 전달 메모](backend-handoff.md)에 따로 정리했다.

**2026-11-08 최종 재확인:** 운영 OpenAPI는 **15개 경로·20개 API 작업**이며 신규 파싱 API까지 반영됐다. 앞선 `/cards/demo` 조회는 200으로 정상화됐고 선택 추천은 101개 좌표로 된 약 1.6km 경로를 반환했다. 푸시 등록·해제·테스트·카드 발송 계약도 명세에서 확인했다. 이전 데모 500·푸시 경로 404·파싱 API 명세 미노출은 과거 관측으로, 현재 재배포·복구 요청으로 남기지 않는다. 실제 인증·Storage 업로드·푸시 등록 및 수신 E2E와 Firebase 웹 설정·Kakao JavaScript 키 연결은 여전히 미확인이다.

**추가된 ODsay 계약:** main `48b9433`은 URI 플랫폼 키를 이용한 브라우저 직접 검색과 `POST /transit/routes/parse`를 정의한다. 최종 운영 명세에도 POST가 등재됐으며, 무인증 `{"odsay":{}}` 진단 요청은 401 `{"message":"유효하지 않은 토큰입니다"}`를 반환했다. 이는 경로 존재와 정상 인증 보호를 확인한 것이며 인증된 파싱 성공은 아직 검증하지 않았다.

**ODsay FE 키 재확인:** Notion의 새 `ODSAY_API_KEY_FE`를 로컬 전용 `.env.local`의 기존 `VITE_ODSAY_WEB_KEY`로 교체하고 Vercel Production에도 저장했다. `http://localhost:3000`과 실제 배포 페이지 origin `https://grip-front.vercel.app`의 브라우저 직접 요청은 모두 **HTTP 200, `result.path` 17개, error 없음**이었다. 기존 서버용 키의 `ApiKeyAuthFailed`는 이전 관측이며 개인 배포 origin의 서버 CORS도 허용됐다. 남은 대중교통 E2E는 인증된 파싱·후보 저장이다. Vite 환경변수 변경 후에는 새 빌드가 필요하다.

**추가된 일회성 위치 변경:** 최신 main `48b9433`을 다시 fetch하고 운영 OpenAPI 15개 경로·20개 작업을 확인했다. 저장 없이 임의 좌표의 보행·샛길을 계산하는 API는 없다. 프런트는 원본 동선과 분리한 메모리 상태로 위치 선택·ODsay 후보 재조회·취소·복귀를 구현했으며, 실제 임시 보행선 계산은 아래 11절의 별도 API 제안으로 구분한다. 이번 작업에서 백엔드·서버 설정은 변경하지 않았다.

## 이번 프런트 작업과 검증 경계

이번 프런트에는 출발지 → 도착지 → 출근 시간 → 퇴근 시간 → 교통수단의 5단계 설정과 기본 취향, 실제 API용 인증·동선·카드·경로 연결, 명시적인 샘플 미리보기, 정수 별점 1~5, 취향 가중치 조회·초기화를 연결했다. 사진 업로드·선택적 AI 제안·기록 저장과 실제 개수·장소별·연도별 목록도 코드에 포함한다.

공통 상태·라우팅까지 연결했으며 프로덕션 빌드와 Store·API·좌표 테스트로 검증한다. 테스트는 인증·외부 API를 모킹한 상태 경쟁·계정 분리·요청 계약·지도 좌표 처리를 포함한다. 명시적 예시 모드의 브라우저 전체 흐름도 확인했다. 실제 운영 계정의 로그인부터 사진 업로드까지 이어지는 E2E, Kakao 설정이 적용된 실제 지도와 FCM 수신은 아직 검증하지 않았다. 코드·모킹 테스트의 성공을 운영 연동 성공으로 간주하지 않는다.

미리보기 데이터는 실제 추천이나 저장 결과와 구분한다. 운영 호출 실패를 샘플 성공으로 자동 대체하지 않는다. 지도는 Kakao 설정이 있으면 Kakao SDK, 없으면 Leaflet·OpenStreetMap 배경 지도를 사용한다. 둘 다 불러오지 못하면 실패 상태를 표시한다. 현재 위치·경로 추적·남은 거리·도착 판정은 프런트 기능이며 별도 서버 구축 요청이 아니다.

## 우선순위

| 순위 | 필요한 작업 | 담당 범위 | 완료 판단 |
| --- | --- | --- | --- |
| P0 | 인증된 대중교통 파싱·저장 E2E 검증 | 프런트·서버 통합 검증 | 로컬·배포 후보 각 17개 성공을 바탕으로 인증된 파싱 200 → 후보 선택·저장·재조회 |
| P0 | 기존 Supabase 연결의 실제 로그인·DB 가용성 확인 | Supabase·서버 | 이미 연결한 URL·anon으로 실제 세션·`/users/me`·동선 조회 성공 |
| P1 | Kakao 장소 검색용 JavaScript 키·사용 설정·도메인 | Kakao·프런트 배포 설정 | 일반 장소 검색 성공. 기본 OSM 지도에는 이 키가 필요하지 않음 |
| P1 | 기록용 비공개 Storage 버킷·사용자별 RLS | Supabase·서버 설정 | 본인 업로드·조회 성공, 다른 사용자 접근 거절 |
| P1 | 장소 UUID의 이름·좌표·설명 조회 계약 | 서버 API 추가 또는 응답 확장 | 경로의 모든 `spots`를 실제 장소명으로 표시 |
| P1 | 일회성 좌표의 실제 보행·샛길 계산 계약 검토 | 별도 서버 API 제안 | 영속 데이터 변경 없이 실제 geometry 반환·취소·원본 보존 검증 |
| P1 | Firebase 웹 설정 연결·푸시 실제 기기 검증 | Firebase·서버 설정 | 운영 명세에 있는 API로 기기 등록·실제 수신·해제 확인 |
| P1 | 무사진 기록·계절 태그·위치 저장 안내 정합성 | 기획·서버·프런트 | 화면 문구와 저장 계약 일치 |
| P2 | 15종 취향 직접 선택 저장 | 서버 API·추천 규칙 추가 | 합의한 태그·최대 개수·적용 범위를 왕복 검증 |

## 1. 운영 정상화 재확인과 이전 장애 이력

### 2026-11-08 최신 공개 조회 결과

- 최종 운영 `/openapi.json`: 200, **15개 경로·20개 API 작업**.
- `GET /stations?line=2`: 200, 6개 정류장.
- `GET /cards/demo`: **200**, 날짜 `2026-11-08`, 선택 경로·추천 3개·최단 도보 구간 2개 반환.
- 선택 추천 polyline은 101점, 선분 합산 거리는 약 1,616m다. 양끝 직선거리 약 913m보다 길고 굴곡이 있어, 임의 2~3점으로 만든 프런트 예시선과 구분된다. 다른 추천은 61점·61점, 최단 도보 구간은 19점·36점이다. 거리 합산은 응답 좌표를 이용한 근사값이다.
- `/users/me/push-tokens`의 PUT·DELETE, `/users/me/push-tokens/test`의 POST, `/cards/today/push`의 POST가 운영 명세에 나타난다. 푸시 API는 공개 명세 GET으로만 확인했으므로 인증된 등록·발송 성공을 뜻하지 않는다.
- 신규 `POST /transit/routes/parse`도 명세에 나타나며 무인증 진단 POST는 401이었다. 정상 인증 보호를 확인했지만 인증된 파싱 성공은 별도 E2E로 남는다.
- 개인 배포 origin `https://grip-front.vercel.app`의 인증 GET·파싱 POST 사전 요청은 200이었다. Authorization·Content-Type과 해당 origin이 허용됐고, 같은 Origin 헤더의 무인증 `/users/me`도 401과 해당 `Access-Control-Allow-Origin`을 반환했다. 이 origin의 서버 CORS 추가 설정을 요청하지 않는다.
- 실제 실행 커밋과 운영 비밀 설정은 조회하지 않았다. 기존 배포·데모 복구 요청은 현재 공개 응답과 명세 기준으로 해소됐으며, 같은 작업을 다시 요청하지 않는다.

### 이전 관측과 남은 검증 경계

- 앞선 점검에서는 OpenAPI 11개 경로·15개 작업, `/cards/demo` 500 `Internal Server Error`, 푸시 경로 GET 404였다. 당시 GitHub의 11/7 main `661e0ae` 배포 기록은 `in_progress`였고 직전 `e4dbe58`은 `success`였다. 이 기록은 당시 상태의 근거이며 현재 상태를 나타내지 않는다.
- 이후 데모·푸시가 정상화된 중간 점검은 14개 경로·19개 작업이며 신규 파싱 API가 없었다. 최종 점검의 15개 경로·20개 작업과 POST의 401 응답으로 이 미노출 상태도 해소됐음을 확인했다.
- 당시 Railway 페이지의 Login·프로젝트 404 때문에 예외 로그를 읽지 못했다. **이전 500의 정확한 원인은 여전히 미확인**이며, 정상화만으로 LLM 잔액·TMAP 설정·DB 중 어느 것이 원인이었는지 확정하지 않는다.
- 앞선 무인증 `/users/me`는 401 `{"message":"유효하지 않은 토큰입니다"}`였다. 정상 토큰을 이용한 로그인·동선 저장·새 경로 생성은 별도 E2E로 확인해야 한다.
- 장애가 재발할 때 실제 요청에 대응하는 로그·실행 커밋·마이그레이션을 확인한다. `railway.json`은 `alembic upgrade head` 후 Uvicorn을 시작하고 확인한 소스의 마이그레이션은 `0016`까지지만, 이번 정상 응답만으로 운영 설정 전체를 검증한 것은 아니다.

### TMAP·ODsay·LLM 역할과 확인 한계

서버의 보행 경로 계산은 TMAP을 사용하며 설정명은 `TMAP_APP_KEY`다. 소스상 키 누락·호출 실패는 502로 처리하고 직선 경로로 대체하지 않는다. 정상 GET은 저장된 polyline을 반환할 수 있으므로, 이번 상세 경로 조회를 서버 키의 실제 값·현재 설정 여부나 신규 TMAP 호출 검증으로 간주하지 않는다. 팀의 ‘TMAP은 보행 경로 계산용으로 사용’ 설명은 이 역할과 일치한다. ODsay의 대중교통 후보 조회 역할과도 충돌하지 않으며, 최신 계약에서는 그 검색 주체가 서버에서 브라우저로 바뀌었다.

오늘 카드의 `by_llm: true`는 확인했다. 다만 카드 캐시가 반환될 수 있으므로 이번 요청에서 LLM을 새로 호출했거나 충전 상태·사용 모델을 확인한 것은 아니다. 낮은 비용의 모델로 변경할 수 있는지에 대한 비교 평가는 아직 하지 않았다. 카드 문구·사진 태그·구조화 응답의 품질, 실패 시 대체 동작, 비용·지연을 같은 사례로 비교한 뒤 별도로 판단해야 한다.

### ODsay 브라우저 검색·서버 파싱으로 변경된 계약

기존 서버 REST 검색은 `ODSAY_API_KEY`로 외부 ODsay를 호출했다. 최신 [팀 대중교통 웹 명세](https://github.com/dandithon-grip/server/blob/48b9433/docs/transit-web.md)는 Server 플랫폼의 요청 IP 제한과 Railway 출구 IP 문제를 설명하고, 운영 검색을 **URI 플랫폼 키를 이용한 브라우저 직접 호출**로 바꾼다. 기존 `GET /transit/routes`는 등록된 Server IP에서 사용하는 로컬 개발용으로 남는다. 따라서 이전의 ‘ODsay 키는 서버에만 두며 프런트 변수는 필요 없다’는 판단은 새 계약에 적용하지 않는다.

1. 프런트 `VITE_ODSAY_WEB_KEY`에 URI 플랫폼용 FE 키를 연결한다. 현재 Notion의 **`ODSAY_API_KEY_FE`**를 로컬 전용 `.env.local`과 Vercel Production의 이 변수로 연결했고 두 origin의 검색 성공을 확인했다. 기존 서버용 `ODSAY_API_KEY`와 용도를 구분하며 값은 문서·커밋에 기록하지 않는다. Vite 환경변수 변경 후에는 새 빌드가 필요하다.
2. 브라우저가 `https://api.odsay.com/v1/api/searchPubTransPathT`를 호출한다. `SX`·`EX`는 경도, `SY`·`EY`는 위도이며 `apiKey`를 함께 전달한다.
3. 원본 JSON을 `{ "odsay": 원본응답 }`으로 서버 `POST /transit/routes/parse`에 보낸다. `Authorization: Bearer {access_token}`이 필수다. 서버는 이 단계에서 ODsay를 다시 호출하지 않고 JSON을 해석한다.
4. 성공은 기존과 같은 `{ "paths": [...] }`이며 `summary`, `legs`, `stops[].external_id`를 포함한다. 인증 실패는 401, ODsay error 객체·읽을 수 없는 형식은 422다.
5. 선택 경로의 `kind != "walk"` 탑승 구간을 기존 `PUT /commutes/me`의 `transit_legs`로 보낸다. 보행 샛길 계산은 계속 서버 TMAP의 역할이다.

**최종 운영 관측:** 공개 OpenAPI GET은 200, 15개 경로·20개 작업으로 `/transit/routes/parse` POST가 등재됐다. 무인증 `{"odsay":{}}` 진단 요청은 401 `{"message":"유효하지 않은 토큰입니다"}`였다. 이전 명세 미노출은 해소됐고 추가 배포를 요청하지 않는다. 다만 401은 정상 인증 보호이며, 올바른 세션·ODsay 응답을 이용한 파싱 200과 후보 저장 성공은 아직 미검증이다.

**최신 FE 키 브라우저 실측:** Notion `ODSAY_API_KEY_FE`를 기존 프런트 변수에 연결한 뒤 `http://localhost:3000`과 실제 배포 페이지 origin `https://grip-front.vercel.app`의 직접 요청이 각각 HTTP 200, `result.path` 17개, error 없음으로 성공했다. 두 키·origin 조합의 후보 조회는 확인했으나 앱 로그인 후 파싱·동선 저장까지 검증한 것은 아니다.

**이전 키 실패 이력:** 서버용 Notion `ODSAY_API_KEY`를 브라우저에 사용했던 두 번의 `500 / ApiKeyAuthFailed`는 FE 키 적용 전의 관측이다. FE 키로 두 origin의 성공을 확인했으므로 현재 인증 실패로 남기지 않는다. 실제 키 값·콘솔 자격증명은 기록하지 않는다.

개인 저장소 메타데이터의 홈페이지는 `https://grip-front.vercel.app`이다. Vercel Production에 `VITE_ODSAY_WEB_KEY`를 저장했고 성공 메시지를 확인했다. 기존 Supabase·API·버킷·VAPID 환경변수도 존재한다. 환경변수 저장·두 origin의 직접 조회 성공을 인증된 파싱·후보 저장 E2E 성공으로 확대하지 않는다. Vite 환경변수는 빌드에 반영되므로 변경 후 새 빌드가 필요하다.

근거: [서버 시작·라우터](https://github.com/dandithon-grip/server/blob/661e0ae/app/main.py), [배포 안내](https://github.com/dandithon-grip/server/blob/661e0ae/docs/deploy.md), [데모 처리](https://github.com/dandithon-grip/server/blob/661e0ae/app/domain/card/service.py#L206), [운영 명세](https://server-production-f8be.up.railway.app/docs#/).

## 2. CORS와 프런트 배포 origin

조사 시 사전 요청 결과는 다음과 같았다.

| Origin | 응답 |
| --- | --- |
| `http://localhost:3000` | 200, 해당 origin 허용 |
| `https://grip-front.vercel.app` | 인증 GET·파싱 POST의 OPTIONS 200, 해당 origin·Authorization·Content-Type 허용 |
| `http://localhost:5173` | 400, `Disallowed CORS origin` |
| `http://127.0.0.1:5173` | 400, `Disallowed CORS origin` |

Vite의 기본 포트 5173으로 실행하면 현재 운영 서버 호출이 브라우저에서 막힌다. 로컬을 3000으로 실행하거나 서버 `CORS_ORIGINS`에 실제 사용하는 origin을 추가해야 한다. `localhost`와 `127.0.0.1`, 서로 다른 포트는 각각 별도 origin이다.

개인 배포 origin `https://grip-front.vercel.app`은 실제 사전 요청으로 허용을 확인했다. 같은 Origin 헤더의 무인증 `/users/me`도 401과 `Access-Control-Allow-Origin: https://grip-front.vercel.app`을 반환했다. 이 주소에 대한 서버 CORS 추가 요청은 필요하지 않다. 다른 배포 주소를 추가하면 `CORS_ORIGINS`의 정확한 HTTPS origin과 프런트 `VITE_API_BASE_URL`을 다시 확인한다.

서버 `CORS_ORIGINS`와 ODsay URI 플랫폼의 도메인 등록은 별도 설정이다. 현재 서버 CORS와 로컬·배포 origin의 ODsay 직접 조회는 확인했다. 인증된 파싱·선택 경로 저장은 별도 E2E로 남으며 한쪽 설정만으로 전체 흐름 성공을 판단하지 않는다.

읽기 전용 사전 요청 예시:

```bash
curl -i -X OPTIONS 'https://server-production-f8be.up.railway.app/users/me' \
  -H 'Origin: http://localhost:3000' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization,content-type'
```

검증: 실제 배포 브라우저에서 Authorization 헤더가 있는 GET을 호출한다. 서버가 200 또는 정상적인 401을 반환하는 것과 브라우저가 응답을 읽을 수 있는 것을 모두 확인한다.

## 3. Supabase Auth와 ‘아이디’ 정리

서버의 정식 인증은 **이메일·비밀번호**다. 별도의 아이디 로그인 API는 없다.

Notion에서 확인한 프로젝트 URL과 공개 anon 키는 이미 로컬 환경에 연결했다. 같은 값을 다시 요청할 필요는 없다. 해당 연결로 읽은 `/auth/v1/settings`는 200, 이메일 인증 사용 가능·메일 자동 확인 ON·익명 로그인 OFF였다. 이것은 프로젝트 Auth 설정 조회 성공이며 실제 테스트 계정 로그인 성공을 뜻하지 않는다.

- 프런트: Supabase `signUp` / `signInWithPassword`; 가입 닉네임은 `options.data.nickname`.
- 서버: `Authorization: Bearer {access_token}` 검증. 첫 `/users/me` 호출 시 서버 사용자를 생성한다.
- 현재 프런트 설정 이름: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. 기존 공개 anon 키 호환용으로 `VITE_SUPABASE_ANON_KEY`도 읽는다.
- 프런트 코드·Vite 환경변수에는 service role, secret key, DB 비밀번호, 서버용 Firebase 비공개 키를 넣지 않는다.
- 현재 프런트 화면은 이메일 라벨·입력 검증으로 통일했다. 임의 문자열 아이디를 지원하려면 별도의 식별자 계약이 필요하다.
- 서버 명세의 인증 메일 OFF와 실제 조회한 자동 확인 ON 설정은 일치했다. 메일 확인을 사용하는 환경에서는 가입 직후 세션이 없을 수 있으므로 가입 성공과 로그인 완료를 구분해야 한다.
- 닉네임은 Supabase 메타데이터 수정 후 갱신된 JWT를 사용하면 서버가 동기화한다. 비밀번호 변경도 Supabase Auth 경로로 처리한다. 닉네임 메타데이터를 접근 권한 판단에 사용하지 않는다.

검증: 기존 테스트 계정의 로그인 → `/users/me` 200 → 새로고침 세션 복원 → 만료 시 갱신 → 로그아웃 후 보호 기능 제한을 확인한다. 가입 검증이 필요하면 별도 테스트 계정과 정해진 환경에서 진행한다.

근거: [서버 인증 명세](https://github.com/dandithon-grip/server/blob/661e0ae/docs/spec.md#L148), [닉네임 동기화](https://github.com/dandithon-grip/server/blob/661e0ae/app/domain/user/service.py#L28).

## 4. 일반 지도·현재 위치와 Kakao 장소 검색

일반 지도는 프런트의 Leaflet·OpenStreetMap으로 제공하며, Kakao JavaScript 키가 있으면 Kakao SDK를 우선 사용한다. API의 실제 `polyline`을 배경 지도에 표시하고, 선택한 경로의 시작·끝과 현재 위치를 구분한다. 브라우저 위치 권한을 이용한 추적·경로 위 남은 거리·도착 판정도 프런트에서 처리한다. GPS 오차·권한 거절·지도 타일 실패는 화면에 표시한다. 이 기능을 위해 새 백엔드나 Kakao 보행 API를 요구하지 않는다.

**일반 장소명 검색용 Kakao JavaScript 키는 Notion에서 찾지 못했다.** 이 공개 설정이 필요한 경우 앱 담당자가 아래를 준비하면 된다. 이미 연결된 Supabase·VAPID 값을 다시 받을 이유는 없다.

1. `VITE_KAKAO_JAVASCRIPT_KEY`에 Web SDK용 JavaScript 키를 설정한다.
2. 해당 Kakao 앱의 카카오맵 사용 설정을 ON으로 설정한다.
3. JavaScript SDK 도메인에 실제 로컬·배포 origin을 등록한다.
4. 앱의 공식 쿼터·사용 조건을 확인한다. REST API 키를 지도 SDK appkey에 넣지 않는다.

키 없이 장소를 고를 때는 공개 `/stations?line=2` 정류장 검색과 지도 좌표 선택을 사용할 수 있지만, 모든 일반 주소·장소명 검색을 대체하지는 못한다.

외부 카카오맵 길 찾기 링크는 보조 기능이다. 선택한 도보 구간의 처음·끝 좌표를 넘기므로 외부 서비스가 중간 경유지와 샛길 전체 선을 동일하게 재현한다고 보장하지 않는다. 앱의 현재 위치·거리·도착 판정과 외부 경로 재탐색을 구분한다. ‘지금 왼쪽으로’ 같은 상세 안내는 현재 서버 응답에 없으며 필요한 경우 아래 선택 요청의 `steps` 계약을 추가한다.

공식 근거: [Kakao Web API 가이드](https://apis.map.kakao.com/web/guide/), [카카오맵 사용 설정·플랫폼 키](https://developers.kakao.com/docs/ko/kakaomap/common).

## 5. Firebase 웹 푸시: 프런트 구현과 남은 연결

프런트 기기 등록·해제, 서비스워커, 포그라운드 수신, 로그아웃 정리를 구현했다. Firebase SDK는 필요한 때 동적으로 불러온다. 권한은 사용자가 알림을 켜는 순간에만 요청하고, 서버 PUT이 성공하기 전에는 켜짐으로 표시하지 않는다.

- 설정 없음, 미지원 브라우저, 권한 거절, 서버 404·503, 네트워크 실패를 구분한다.
- 백그라운드의 notification payload는 FCM 자동 표시에 맡겨 중복 표시하지 않는다. 포그라운드는 앱 안 배너 한 개로 표시하며 메시지를 중복 처리하지 않는다.
- 알림 클릭은 같은 origin의 허용된 앱 경로만 연다. 외부 URL·임의 스크립트 링크는 홈으로 제한한다.
- 로그아웃 전 등록된 기기만 서버 DELETE와 브라우저 토큰 폐기를 수행한다. 다른 탭에서 계정이 바뀌면 이전 계정의 브라우저 구독을 폐기한다. 서버 정리 실패와 기기 폐기 성공을 구분해 반환한다.
- 이 동작은 모킹 테스트로 확인했다. **실제 FCM 등록·발송·수신 E2E는 아직 미검증**이다.

다음 API는 최신 서버 소스에 있으며 **2026-11-08 재확인한 운영 OpenAPI에도 모두 반영됐다.** 새 API 구현이나 재배포를 다시 요청하지 않는다. 명세 반영과 실제 인증된 기기 등록·발송·수신 성공은 구분한다.

| API | 요청·응답 |
| --- | --- |
| `PUT /users/me/push-tokens` | `{ "token": "FCM 등록 토큰" }` → `{ "registered": true }` |
| `DELETE /users/me/push-tokens` | 같은 token 본문 → `{ "registered": false }` |
| `POST /users/me/push-tokens/test` | 본문 없음 → `{ "sent": 발송한 기기 수 }` |
| `POST /cards/today/push` | 본문 없음 → `{ "sent": 발송한 기기 수 }`, 서버의 시연용 기능 |

필요한 외부 설정:

- **VAPID 공개키는 이미 Notion에서 확인해 로컬 환경에 연결했다.**
- 같은 Firebase 프로젝트의 **웹 앱 공개 설정 `firebaseConfig`는 Notion에서 찾지 못했다.** 서비스 계정 JSON 첨부가 있다는 사실만 확인했으며 프런트 설정을 얻으려고 비공개 키를 열거나 사용하지 않았다. 추정 hosting init URL도 404라 대체하지 않았다.
- 프런트 환경변수는 `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_VAPID_KEY`다. 앞의 웹 앱 공개 설정과 기존 VAPID가 같은 프로젝트인지 확인한다.
- 서버의 `FCM_SERVICE_ACCOUNT_JSON`, HTTPS `FRONTEND_URL`, `APP_ENV=prod`는 서버·Firebase 담당자가 확인할 설정이다. 서비스 계정 비공개 키는 프런트에 전달하지 않는다.
- SDK의 신규 FID 등록 방식을 섞지 않고, 현재 서버가 요구하는 FCM token 계약에 맞춰 호환 `getToken`·`deleteToken`을 사용한다.

**현재 서버 자동 알림은 퇴근 10분 전, 하루 한 번이다.** UI도 한 개의 퇴근 알림으로 맞췄다. 출근·퇴근 개별 토글·별도 알림 시각을 다시 제공하려면 사용자 설정 모델·API·스케줄러 확장이 필요하다.

완료 검증은 실제 로그인한 테스트 기기에서 권한 허용 → PUT 등록 응답 확인 → 테스트 발송 → 실제 수신 → 클릭 후 홈 카드 확인 → DELETE 해제 → 로그아웃 후 수신 중단 순서다. 404는 미배포·경로 불일치, 503은 서버 FCM 발송 설정 미완료로 구분한다. `sent: 0`을 실제 수신 성공으로 처리하지 않는다. iOS는 홈 화면에 추가한 웹앱 등 실제 지원 조건을 확인한다.

근거: [팀 푸시 문서](https://github.com/dandithon-grip/server/blob/661e0ae/docs/notification.md), [푸시 라우터](https://github.com/dandithon-grip/server/blob/661e0ae/app/domain/notification/router.py), [공식 Firebase 웹 시작 가이드](https://firebase.google.com/docs/cloud-messaging/web/get-started), [수신 동작](https://firebase.google.com/docs/cloud-messaging/web/receive-messages).

## 6. 사진 Storage 버킷과 사용자별 접근

서버는 사진 파일을 업로드받지 않는다. 프런트가 Supabase Storage에 직접 업로드한 뒤 `image_path`만 서버에 전달한다.

- 비공개 버킷 기본 이름은 `records`. 서버 `SUPABASE_RECORD_BUCKET`과 프런트 `VITE_SUPABASE_RECORD_BUCKET`이 같아야 한다.
- 객체 경로는 `{Supabase Auth 사용자 UUID}/{고유 파일명}`. 서버 `users.id`와 Supabase Auth UUID는 다르므로 혼동하지 않는다. `image_path`에 버킷명은 붙이지 않는다.
- `storage.objects`의 INSERT·SELECT 정책은 `authenticated` 역할뿐 아니라 **해당 버킷과 본인 UUID 폴더**까지 제한한다. 인증된 사용자라는 조건만으로 모든 사진에 접근시키지 않는다.
- 새 고유 파일 업로드는 INSERT, 본인 미리보기·서버 비전 다운로드는 SELECT가 필요하다. 덮어쓰기 방식을 추가하면 SELECT·UPDATE 정책도 검토한다.
- 비공개 사진은 사용자 토큰 다운로드 또는 수명이 제한된 signed URL로 표시한다. 공개 URL을 만들어 버킷의 비공개 설정을 우회하지 않는다.
- 서버 비전 다운로드에는 `SUPABASE_URL`, 공개 `SUPABASE_ANON_KEY`가 사용된다. 요청자의 access token으로 본인 사진을 읽는다.
- 업로드 전 재인코딩 등으로 위치 메타데이터 제거를 확인한다. 프런트의 사진 선택 성공과 실제 업로드·서버 기록 저장 성공을 구분한다.

검증: 사용자 A의 사진 업로드·본인 조회·`/records/suggest` 성공 → 사용자 B와 게스트가 A의 경로에 접근할 때 거절 → 목록 재조회·새로고침 후 사진 유지. 비전이 실패한 경우 사용자가 태그를 직접 고를 수 있어야 한다.

공식 근거: [비공개 버킷](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Storage RLS](https://supabase.com/docs/guides/storage/security/access-control), [비공개 파일 조회](https://supabase.com/docs/guides/storage/serving/downloads).

### 미참조 업로드 파일 정리: 운영 후속 작업

현재 프런트는 한 사진의 업로드 경로를 재사용하고, 저장 응답이 끊긴 뒤 재시도할 때 기존 기록을 조회해 중복 저장을 줄인다. 하지만 AI 제안을 위해 업로드한 뒤 사용자가 작성을 취소하거나 페이지를 떠나면 `records.image_path`에서 참조하지 않는 파일이 남을 수 있다. 자동 정리 작업은 아직 구현하지 않았다.

서버·운영 측에서 비공개 버킷 객체와 기록의 `image_path`를 대조해 미참조 파일을 찾고, 저장·재시도 중인 파일을 지우지 않도록 유예 기간과 삭제 기준을 정해야 한다. 정리 정책에는 실패·취소·계정 삭제 시 처리, 삭제 권한, 재시도와 경합하는 경우를 포함한다. 프런트의 페이지 이탈 이벤트만으로 삭제 완료를 보장하지 않는다. 검증은 테스트 버킷에서 취소·저장 실패·재시도·정상 저장 시나리오를 구분해 진행한다.

## 7. 장소 이름·좌표·설명 조회 계약

현재 경로는 `spots: UUID[]`를 반환한다. 기록도 `place_id`를 사용한다. 하지만 공개 OpenAPI에는 장소 상세·일괄 조회 API가 없고, 경로의 장소 UUID마다 이름·좌표·주소를 반환하는 구조도 없다.

기존 Supabase Data API를 대안으로 쓸 수 있는지도 동일한 공개 anon 연결로 읽기 확인했다. `/rest/v1/places?select=id,name&limit=1`은 503 `PGRST002`(schema cache 조회 실패)를 반환했다. 따라서 현재 작동하는 대안으로 검증되지 않았다. 이를 이전 Railway `/cards/demo` 500과 같은 원인이라고 단정하지 않는다. 데모 정상화 이후 Data API는 재검증하지 않았으며, 가용성·노출 권한을 확인하기 전 우회 조회를 구현하지 않았다.

필요한 계약은 **새 API 추가 또는 기존 응답 확장** 중 하나다. 예를 들어 아래는 제안이며 현재 존재하는 API가 아니다.

```text
GET /places?ids={UUID 목록}

각 항목:
  id: UUID
  name: 표시할 실제 장소명
  lat, lng: 장소 좌표
  area 또는 address: 위치 설명
  type, description: 화면에 필요한 선택 정보
```

또는 Route 응답에 같은 필드의 장소 객체 배열을 추가한다. 요청 가능한 최대 ID 수, 없는 ID의 처리, 공개 장소와 사용자 사적 좌표의 구분은 서버 계약으로 확정한다.

이 계약이 필요한 이유:

- 선택 경로의 자연 지점을 실제 지도 마커와 장소명으로 표시.
- 사진 기록 시 `place_id`와 장소명을 정확히 연결.
- 기록 목록의 장소별 묶음·필터를 하드코딩 없이 표시.

현재 `/records/suggest`는 장소 ID가 없으면 현재 좌표 100m 안의 장소를 찾아 제안할 수 있지만, 결과는 ID 또는 null이다. 일반적인 장소 탐색·표시 메타데이터 API를 대신하지 못한다. 장소를 못 찾았을 때 임의 UUID나 고정 ‘상동교’를 저장하면 안 된다.

## 8. 취향 15종 직접 선택과 ‘조용한 길’ 불일치

현재 서버가 저장하는 기본 취향은 **`short`·`full`·`sunset` 중 하나**다. 홈의 오늘만 취향 변경도 같은 값이다. 프런트 라벨은 각각 ‘짧게 걷기’·‘자연 가득’·‘노을길’로 연결한다. **‘조용한 길’을 `short`에 대응시키지 않는다.** 짧은 우회와 조용함은 다른 조건이다.

Figma의 하천길·나무숲길·밤길·조용한 길 등 15종 직접 선택을 저장하는 API는 없다. `/users/me/tag-weights`는 GET·DELETE만 제공한다.

현재 가능한 것은:

- 경로 별점으로 `river`, `park`, `trees`, `sunset`, `bridge` 5종 가중치가 누적되는 것.
- 가중치 조회와 제안 문구 표시.
- 누적 가중치 초기화.

사용자가 직접 고르는 최대 태그 수는 서버에 정의돼 있지 않다. `top_tags(limit=2)`는 LLM에 전달할 양수 가중치 상위 2개이지, UI 선택 최대 개수가 아니다.

직접 선택을 구현하려면 별도 저장 API(예: `PUT /users/me/preferences`) 또는 기존 계약 확장이 필요하다. 아래를 먼저 합의한다.

1. 15개 화면 라벨의 정식 코드와 데이터 근거. 현재 서버에 없는 조용함·밤길·활기 등을 다른 태그에 임의 매핑하지 않는다.
2. 단일·다중 선택, 최대 개수, 선택 해제·빈 배열의 의미.
3. 명시적 선택과 별점으로 누적된 가중치의 우선순위·동시 적용 방식.
4. 오늘만 변경과 기본 취향 변경의 구분, 기존 카드 갱신 여부.
5. 로그인 사용자별 영속 저장, 조회 응답과 초기화 범위.

**현재 초기화는 가중치를 `{}`로 바꿀 뿐이다.** 과거 Feedback, 기본 `Commute.preference`, 오늘 카드 캐시는 유지한다. 과거 별점으로 제안 문구를 다시 계산하므로 초기화 후에도 제안은 남을 수 있다. 이번 프런트 취향 화면은 이 조회·초기화 범위로 작성하며, 미지원 선택을 저장 완료로 표시하지 않는다.

근거: [취향 GET·DELETE](https://github.com/dandithon-grip/server/blob/661e0ae/app/domain/feedback/router.py#L45), [초기화·제안 처리](https://github.com/dandithon-grip/server/blob/661e0ae/app/domain/feedback/service.py#L121), [기본 취향 enum](https://github.com/dandithon-grip/server/blob/661e0ae/app/domain/commute/models.py#L27).

## 9. 사진 필수·계절 코드·정수 별점

### 사진 기록

`POST /records`의 필수 필드는 `place_id`, `image_path`, `season`, `stage`다. 따라서 ‘사진 없이 방문 기록’은 현재 서버에서 지원하지 않는다. 이 기능을 유지하려면 이미지 경로의 선택 허용·별도 방문 기록 모델 등 서버 계약을 변경해야 한다. 프런트는 무사진 동작을 저장 성공처럼 처리하지 않는다.

계절 코드는 일반적인 사계절 필터와 다르다.

| 필드 | 서버 허용 값 |
| --- | --- |
| `season` | `cherry`, `foliage`, `ginkgo`, `snow`, `sunset`, `none` |
| `stage` | `peak`, `mid`, `end`, `none` |

‘봄·여름·가을·겨울’을 이 enum에 일대일로 치환하지 않는다. 기록 입력은 벚꽃·단풍·은행·눈·노을·해당 없음과 절정·중간·끝물·해당 없음으로 정리하거나, 사계절 정보를 별도 필드로 추가해야 한다. 비전의 `ai_season`, `ai_stage`와 사용자의 최종 `season`, `stage`는 구분해서 보낸다.

검증 순서: 본인 사진 업로드 → `POST /records/suggest` → 제안 수정 → `POST /records` 201 → `GET /records`로 영속 저장 확인. 장소가 null인 상태에서는 다른 장소 선택·메타데이터 해결 없이 저장 완료로 넘어가지 않는다.

### 별점

`POST /feedback`는 `{route_id, rating}`이며 `rating`은 **정수 1~5**다. Figma의 반쪽 별 모양을 4.5점 요청으로 구현하지 않는다. 서버의 소개 문구 일부에 남은 👍/👎보다 실제 요청 스키마가 우선한다.

평가 요청이 성공한 뒤에만 완료를 표시한다. 같은 날 같은 경로의 재평가는 이전 별점과의 차이만 반영한다. 최신 서버에는 경로 재생성 후에도 평가 기록과 당시 태그를 보존하는 처리가 있다. 카톡의 이른 시점에 미수정이라고 적힌 내용을 최신 코드보다 우선하지 않는다.

근거: [기록 스키마](https://github.com/dandithon-grip/server/blob/661e0ae/app/domain/record/schemas.py), [별점 스키마](https://github.com/dandithon-grip/server/blob/661e0ae/app/domain/feedback/schemas.py), [평가 기록 보존](https://github.com/dandithon-grip/server/blob/661e0ae/app/domain/feedback/models.py#L30).

## 10. 출발·도착 좌표 저장 안내 수정

현재 서버는 출발·도착 좌표를 필수 입력으로 받아 **서버 DB에 영속 저장**한다.

- `SaveCommuteRequest`: 출발·도착 위경도 4개 필수.
- `CommuteService.save_commute`: `from_location`, `to_location`을 POINT로 구성해 upsert하고 commit.
- `Commute` 모델: `commutes` 테이블에 SRID 4326 POINT 컬럼 저장.
- 본인의 동선 조회 응답으로 좌표를 다시 반환.

따라서 ‘위치는 이 기기에만 저장’은 실제 동작과 맞지 않는다. 서버 기능명세의 화면 표에는 이 문구가 남아 있지만, 상세 명세에는 **11/3 결정으로 경로선 저장·재계산을 위해 서버 저장으로 변경**했다고 기록돼 있다.

실제 계약에 맞는 안내 예시는 ‘경로 추천을 위해 출발·도착 위치를 저장하며, 다른 사용자에게 공개하지 않아요.’다. 최종 문구는 실제 저장·보관·삭제 동작에 맞춰 팀에서 확인한다. 기기 저장만으로 바꾸려면 문구 변경을 넘어 서버 스케줄러·동선 재조회·재생성 구조까지 재설계해야 한다.

근거: [좌표 입력](https://github.com/dandithon-grip/server/blob/661e0ae/app/domain/commute/schemas.py#L45), [upsert·commit](https://github.com/dandithon-grip/server/blob/661e0ae/app/domain/commute/service.py#L97), [DB 컬럼](https://github.com/dandithon-grip/server/blob/661e0ae/app/domain/commute/models.py#L74), [상세 명세](https://github.com/dandithon-grip/server/blob/661e0ae/docs/spec.md#L158).

## 11. 일회성 위치 변경·대중교통 재조회와 원본 보존

### 현재 API로 가능한 범위

지도에서 출발·도착을 고르고 일회성 위치를 별도 메모리에 적용하는 것은 프런트 기능이다. ODsay 브라우저 검색과 `POST /transit/routes/parse`도 저장된 동선을 인자로 쓰지 않으므로 새 좌표로 후보를 조회하는 데 이용할 수 있다. 파싱 로직은 동선·경로를 저장하지 않는다. 다만 인증은 필요하며, 게스트에게 실제 인증 파싱 성공을 표시하지 않는다.

추가 구현은 기존 일상 동선·경로·카드와 분리한 일회성 상태다. 출발·도착 수정·교환·교통수단 변경 시 이전 후보·선택을 비우고 새 좌표로 재조회한다. 편집 취소는 새 초안만 버리고 이전 탐색을 유지한다. 원래 경로 복귀는 적용한 임시 상태만 제거하며, 새로고침·로그아웃·계정 변경 시에도 원본 동선을 덮어쓰지 않는다. 조회 취소·화면 이탈·계정 변경 시 요청을 취소하고 늦게 온 응답을 무시한다. 일상 동선을 복원하기 위한 PUT은 호출하지 않는다. 요청 취소는 브라우저의 대기·결과 적용 취소이며 이미 시작된 외부 계산의 중단을 보장하는 것은 아니다.

자동 테스트는 원본 동선·방향·선택·캐시 보존과 동선 PUT·재생성 POST 미호출, 후보 재조회·취소·실패 후 재시도·경쟁 응답·계정 분리를 검증한다. 로컬 브라우저에서 지도 클릭·장소 수정·취소·임시 적용·원본 복귀·새로고침 복원, Escape 포커스 복원과 390×844 모바일 화면을 확인했다. 실제 계정의 인증된 파싱·운영 전체 E2E는 미검증이다. 임시 탐색 중에는 기존 경로의 GPS·평가·사진 작성 대상으로 혼동하지 않도록 파생 선택 경로를 비우고 평가 요청을 거절하며, 복귀하면 원래 선택을 다시 제공한다.

최신 운영 명세의 `POST /commutes/me/routes`는 요청 본문 없이 `direction`만 받는다. 라우터는 저장된 내 동선을 읽어 TMAP 계산에 사용한다. 임의 출발·도착 좌표를 받아 비영속 계산하는 도보·샛길 API는 확인되지 않았다. 따라서 이번 프런트의 일회성 위치 선택·교통 후보 기능과 실제 임시 보행선 계산을 구분해야 한다.

ODsay 파싱 응답에는 `summary`, 시간, `legs`, 탑승 구간의 `stops[].{name,lat,lng,external_id}`가 있다. 도보 구간은 시간만 남고 `stops`는 빈 배열이며 `polyline`·회전별 안내는 없다. 원본 응답의 `info.mapObj`도 현재 파서가 응답에 포함하지 않는다. 정류장 좌표를 연결한 개요선을 실제 도로선으로 표시하거나 이를 근거로 보행 진행·도착을 계산하지 않는다.

### ‘잠시 저장 → 계산 → 원본 저장’이 안전하지 않은 이유

- `PUT /commutes/me`는 사용자당 한 동선을 upsert한 뒤 즉시 commit한다. 일회성·TTL·취소 복원 인자가 없다. 탭 종료·네트워크 실패·계정 변경 시 후속 복원 요청은 보장되지 않고 다른 기기의 변경을 덮어쓸 수도 있다.
- `POST /commutes/me/routes`는 기존 Route를 삭제하고 새 ID로 생성·commit한다. 이전 ID는 되돌아오지 않는다. 생성이 실패해 그 요청의 트랜잭션이 롤백돼도 앞선 PUT은 이미 저장됐으므로 동선과 이전 경로가 불일치할 수 있다.
- Route 삭제 시 `TodayCard.route_id`와 `Feedback.route_id`는 `SET NULL`이다. 별점·당시 태그 자체는 보존되지만 원래 경로 연결은 복구되지 않는다. 카드 문장 캐시는 남아 새 경로와 맞지 않거나 선택 경로가 null이 될 수 있다.
- GET 동선에는 `transit_legs`, `alight_early_station_ids`, `board_late_station_ids`가 없다. 응답의 역 ID만 다시 PUT하면 ODsay 정류장의 `external_id`가 있는 경우 중간 하차·늦은 탑승 후보는 빈 목록이 된다. GET 스냅샷만으로 원래 교통 동선을 완전 복구할 수 없다.
- 서버의 카드 사전 생성·알림도 저장된 동선을 사용하므로 임시로 덮어쓴 값이 다른 요청에 보일 수 있다. 원본을 클라이언트 화면에만 다시 표시하는 것으로 서버 복원 성공을 주장하지 않는다.

근거: [동선 upsert·commit 및 정류장 복원 조건](https://github.com/dandithon-grip/server/blob/48b9433/app/domain/commute/service.py#L71), [기존 경로 삭제·생성](https://github.com/dandithon-grip/server/blob/48b9433/app/domain/route/service.py#L222), [경로 생성 라우터](https://github.com/dandithon-grip/server/blob/48b9433/app/domain/route/router.py#L53), [동선·교통 응답](https://github.com/dandithon-grip/server/blob/48b9433/app/domain/commute/schemas.py#L71), [ODsay 도보 파싱](https://github.com/dandithon-grip/server/blob/48b9433/app/clients/odsay.py#L148), [카드 연결](https://github.com/dandithon-grip/server/blob/48b9433/app/domain/card/models.py#L35), [평가 연결 보존 정책](https://github.com/dandithon-grip/server/blob/48b9433/app/domain/feedback/models.py#L30).

### 실제 임시 보행선·샛길을 위한 새 API 제안

아래는 **검토용 제안이며 현재 구현·배포된 계약이 아니다.** 이번 프런트 작업에서 백엔드를 변경하거나 제안 API를 호출하지 않는다.

```text
POST /routes/preview  # 명칭 제안
요청:
  from: {lat, lng}             # 이번 이동의 출발점
  to: {lat, lng}               # 이번 이동의 도착점
  transport_mode: walk | transit | car
  preference: short | full | sunset
  transit_legs?: [{line, stops}]  # transit일 때 선택한 탑승 구간

응답 제안:
  preview_id, expires_at
  candidates, shortest
  각 경로: 임시 id, 실제 polyline, legs, distance_m, minutes
```

필수 합의 사항:

1. 동선·결과를 기존 `commutes`·`routes`·오늘 카드·평가·취향 가중치에 저장·삭제·수정하지 않는다. 임시 계산의 실패·취소도 같은 불변 조건을 지켜야 한다.
2. `from`·`to`는 이번 실제 이동 순서로 해석한다. 선택 교통 구간의 좌표·정류장 검증, 지원 도시·큐레이션 범위, 후보 없음과 외부 API 실패 응답을 명시한다.
3. 실제 geometry의 좌표 순서·구간 경계·도보/교통 구분·거리 단위를 정의한다. 경로 진행에 필요한 선이 없는 구간을 구분하고, 상세 회전별 안내를 제공한다면 `steps` 계약을 추가한다.
4. 임시 경로 ID를 기존 Route UUID와 구분하고 수명·만료·새로고침·재계산 의미를 정한다. 기존 `/feedback`는 저장된 본인 Route를 요구하므로 임시 ID를 그대로 보내지 않는다. 평가를 지원하려면 경로 스냅샷·임시 세션의 별도 저장 범위와 만료 후 처리 계약이 필요하다.
5. 사진 기록은 유효한 `place_id`·장소명·좌표의 제공 여부와 일회성 경로 연결 방식을 정한다. 평가·기록을 지원하지 않는다면 UI에서도 저장 성공으로 처리하지 않는다.

완료 검증은 임시 좌표 계산 전후의 일상 동선·경로 ID·카드·평가 연결이 같은지, 취소·실패·탭 종료·계정 변경·연속 재조회가 원본을 바꾸지 않는지 확인하는 것이다. 실제 선·구간을 확인하기 전 외부 지도 보조 링크나 정류장 개요를 샛길 계산 성공으로 표시하지 않는다.

## 선택 요청: 상세 길 안내가 서비스 범위에 포함될 때

현재 위치 추적·경로 선·남은 거리·도착 판정은 기존 polyline을 이용한 프런트 기능이다. 이 부분을 서버 추가 작업으로 요청하지 않는다. 다만 서버는 TMAP 응답에서 시간·거리·선만 추출하므로 실제 회전별 안내와 경로 이탈 재탐색을 제공하려면 계약이 더 필요하다.

상세 안내가 필요한 경우 기존 Route 응답에 `distance_m`과 `steps[]`를 확장하는 방안을 합의한다. 제안 필드는 `location`, `instruction`, `distance_m`, `turn_type`, `polyline_index`다. 필드의 좌표·거리 단위, 경유지 보존, 역방향 경로의 안내, 재탐색 시 비용·실패 처리를 함께 정의한다. 이것은 기존에 제공되는 응답이라고 표시하지 않는다.

## 통합 확인 순서

1. 운영 명세 15개 경로·20개 작업, 파싱 API의 정상 인증 보호, 데모 카드 200, 로컬·배포 origin의 FE 키 후보 각 17개, Production 웹 키 저장·서버 CORS를 확인했다. Vite 환경변수 변경 후에는 새 빌드가 필요하다.
2. Supabase와 Kakao 공개 설정을 적용하고 기존 테스트 계정으로 인증·장소 선택을 확인한다.
3. ODsay URI 키·도메인 연결 → 브라우저 후보 검색 → 인증된 파싱 POST → 후보 선택·동선 저장 → 경로 생성 → 오늘 카드 → 다른 길 → 출퇴근 방향 변경 → 선택 경로 안내를 확인한다. GET 조회와 POST 재생성을 구분해 불필요하게 외부 API를 반복 호출하지 않는다.
4. 정수 별점 저장·재평가, 취향 조회·초기화의 실제 의미를 확인한다.
5. Storage와 장소 메타데이터 준비 후 사진 업로드·태그 수정·기록 영속 저장을 확인한다.
6. 푸시 API의 운영 명세 반영은 확인했다. 누락된 Firebase 웹 설정을 연결한 뒤 별도 테스트 기기에서 등록·발송·수신·해제를 검증한다.
7. 미리보기, 게스트, 로그인 사용자의 저장 가능 범위를 각각 확인하고, 실패 응답이 완료 화면으로 이어지지 않는지 확인한다.
8. 일회성 위치 수정·대중교통 재조회·취소·원래 경로 복귀가 기존 동선·경로·카드를 변경하지 않는지 확인한다. 실제 임시 보행선은 11절 제안 계약이 마련되기 전 제공된 기능으로 표시하지 않는다.

검증 결과에는 ‘코드에 있음’, ‘운영 명세에 있음’, ‘실제 요청 성공’, ‘실제 기기 확인’을 구분해 남긴다. 키·토큰·사진 원본·개인 출발·도착 좌표는 이 문서나 검증 로그에 기록하지 않는다.
