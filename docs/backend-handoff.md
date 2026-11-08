# 샛길: 서버 담당자 전달 메모

2026-11-08 공개 API·브라우저 재확인 및 서버 main `48b9433`의 [대중교통 웹 계약](https://github.com/dandithon-grip/server/blob/48b9433/docs/transit-web.md) 기준입니다. **새 FE 키로 로컬·개인 배포 origin 모두 ODsay 후보 17개를 확인했고, Vercel Production 웹 키 저장과 운영 파싱 API·서버 CORS도 확인했습니다.** 남은 대중교통 E2E는 로그인 후 파싱·저장입니다. 기존 데모 500과 푸시 명세 누락도 해소됐으며 백엔드는 변경하지 않았습니다. 프런트는 실제 API 연결, 지도·현재 위치·남은 거리·도착 판정, FCM 기기 등록·해제·수신 코드를 구현했고, 실제 인증·업로드·푸시 수신 E2E는 남아 있습니다.

**이미 있는 값:** Notion의 Supabase URL·공개 anon 키와 VAPID 공개키는 로컬 환경에 연결했습니다. 같은 값을 다시 전달받을 필요는 없습니다.

Notion의 새 **`ODSAY_API_KEY_FE`** 값을 로컬 전용 `.env.local`의 기존 **`VITE_ODSAY_WEB_KEY`**로 연결해 브라우저 검색에 성공했습니다. 기존 `ODSAY_API_KEY`는 서버용이며 FE 키와 구분합니다. 키 값은 이 문서·커밋에 포함하지 않습니다.

사용자가 별도 설정 페이지는 없으며 현재 Notion 페이지의 정보가 전부라고 확인했습니다. Kakao JavaScript 키·Firebase 웹 앱 공개 설정은 공유된 자료에 없고, 기존 서비스 테스트 계정도 확인되지 않았습니다.

## 실제 관측

- 최종 운영 OpenAPI 200, **15개 경로·20개 API 작업**. 앞선 `/stations?line=2` 조회는 200, 역 6개를 반환했습니다.
- `/cards/demo`는 **200**, 오늘 카드·추천 3개·최단 도보 구간 2개를 반환합니다. 선택 추천 polyline은 **101점·약 1.6km**이며, 임의 2~3점 예시선과 다른 상세 경로입니다.
- FCM 등록·해제·테스트·카드 즉시 발송 API가 운영 명세에 반영됐습니다. 실제 인증된 호출·기기 수신은 아직 검증하지 않았습니다.
- 최종 재확인에서 `POST /transit/routes/parse`가 운영 명세에 등재됐고, 무인증 `{"odsay":{}}` 진단 요청은 401 `{"message":"유효하지 않은 토큰입니다"}`를 반환했습니다. 이는 실제 경로 존재·정상 인증 보호를 확인한 것이며, 인증된 파싱 성공을 뜻하지 않습니다.
- 한 단계 앞선 점검에서 파싱 API가 없었던 14경로·19작업 명세는 과거 관측입니다. 운영 반영을 확인했으므로 파싱 API 재배포를 요청하지 않습니다.
- 새 FE 키 연결 후 `http://localhost:3000` 실제 브라우저의 ODsay 직접 요청은 **HTTP 200, `result.path` 17개, error 없음**으로 성공했습니다. 로그인 후 파싱·동선 저장까지 완료한 것은 아닙니다.
- 서버용 `ODSAY_API_KEY`로 두 번 발생했던 `ApiKeyAuthFailed`는 FE 키 적용 전의 이전 관측입니다.
- 개인 배포 origin `https://grip-front.vercel.app`의 서버 CORS를 확인했습니다. 인증 GET·파싱 POST의 OPTIONS는 200이며 Authorization·Content-Type을 허용합니다. 같은 origin 헤더의 무인증 `/users/me`는 401과 올바른 `Access-Control-Allow-Origin`을 반환했습니다. 서버 CORS 추가 요청은 필요하지 않습니다.
- Vercel Production에 `VITE_ODSAY_WEB_KEY`를 저장했고 성공 메시지를 확인했습니다. 실제 배포 페이지 origin `https://grip-front.vercel.app`의 ODsay 직접 요청도 **HTTP 200, `result.path` 17개, error 없음**이었습니다. 기존 Supabase·API·버킷·VAPID 환경변수도 존재합니다. Vite 환경변수 변경 후에는 새 빌드가 필요합니다.
- 앞선 점검의 데모 500·푸시 경로 404·11경로/15작업은 이전 관측입니다. 당시 로그를 읽지 못해 정확한 장애 원인은 확정하지 못했으며, 현재 정상화만으로 원인을 역산하지 않습니다.
- 앞선 무인증 `/users/me`는 정상적으로 401이었습니다. Supabase `/auth/v1/settings`는 200, 이메일 사용 가능·메일 자동 확인 ON입니다. 실제 계정 로그인 성공을 검증한 것은 아닙니다.
- Supabase `/rest/v1/places?select=id,name&limit=1`은 503 `PGRST002`였습니다. 데모 정상화 뒤 이 Data API는 재검증하지 않았고, 장소 API의 작동하는 대안으로도 확인되지 않았습니다. 이전 데모 500과 같은 원인인지 미확인입니다.

보행 계산은 서버의 TMAP, 대중교통 후보 검색은 ODsay의 역할입니다. **최신 운영 계약은 URI 키로 브라우저가 ODsay를 직접 검색하고 서버가 결과만 파싱하는 방식**입니다. 기존 서버 `ODSAY_API_KEY`와 프런트 `VITE_ODSAY_WEB_KEY`의 용도를 구분합니다. `TMAP_APP_KEY`의 실제 값·현재 설정 여부는 조회하지 않았고 상세 GET은 저장된 경로일 수 있습니다. 카드의 `by_llm: true`도 캐시일 수 있어 신규 LLM 호출·충전 상태·모델을 검증한 것은 아닙니다. 모델 변경의 품질 비교도 미검증입니다.

## 현재 요청: 지도에서 일상 출퇴근 위치를 저장하고 재계산

사용자가 지도 편집 결과를 **일상 동선에 영구 저장**하도록 승인했습니다. 지도 기본 편집을 저장 → 실제 샛길 재생성으로 전환했습니다. **현재 요청은 기존 API로 진행할 수 있으며, 비영속 일회성 계산 API의 부재는 막힘이 아닙니다.** 백엔드 코드·설정은 변경하지 않았습니다. 구현과 모의 API 자동 테스트, 실제 장소 검색·미리보기와 로그인 저장 구분의 브라우저 검증을 완료했으며, 실제 계정의 저장·파싱·재계산 E2E는 아직 미검증입니다.

1. 장소는 실제 검색과 지도 좌표 선택을 사용합니다. 미리보기 fixture를 실제 검색 결과로 쓰지 않습니다. Kakao JavaScript 키가 없으면 공개 역 목록 검색으로 제한되며, 일반 장소는 지도에서 좌표를 선택하고 이름·지역을 입력할 수 있습니다.
2. 영구 저장은 실제 로그인한 API 모드에서만 허용합니다. PUT의 좌표와 `transit_legs`는 항상 **집→회사, 출근 기준**입니다. 퇴근 화면은 화면 도착지를 집, 화면 출발지를 회사로 매핑합니다. 저장용 ODsay 후보도 이 기준으로 조회합니다. 반대 방향 정류장 ID가 다르므로 퇴근 후보를 단순 반전해 저장하지 않습니다.
3. `PUT /commutes/me` → `POST /commutes/me/routes?direction=D` → `GET /cards/today?preference=P`와 `GET /commutes/me/routes?direction=D&preference=P` 순서로 갱신합니다. `D`는 편집했던 지도 방향이고, 기존 출퇴근 시각·기본 취향을 보존합니다. 카드의 preference를 명시해 이전 경로의 카드 캐시를 다시 만들며, 서버가 방향을 적용한 선을 프런트에서 다시 뒤집지 않습니다.
4. 취소는 저장 전 초안·후보 조회에만 적용합니다. 저장 중에는 취소 동작을 제공하지 않습니다. PUT 성공 후 재생성이 실패하면 **새 위치는 저장됐지만 샛길 생성은 실패한 부분 성공**으로 표시하며, 저장 취소·원래 위치 복원으로 표시하지 않습니다.
5. PUT 전 계정별 재생성 필요 표시를 남깁니다. POST 성공 후에는 카드 강제 갱신 필요 단계로 바꾸고 카드·경로 GET까지 성공해야 제거합니다. 재생성 실패 후 재조회·새로고침하면 현재 저장된 동선을 다시 읽고 POST를 먼저 성공시킨 뒤 카드·경로 GET을 수용합니다. POST는 성공했지만 카드 갱신만 실패했다면 POST를 반복하지 않고 preference를 명시해 카드를 다시 조회합니다. 예전 선·카드 문구를 새 위치의 결과로 표시하지 않으며, 이 표시에 좌표는 저장하지 않습니다.

기존 경로 재생성은 Route를 삭제하고 새 ID를 만듭니다. 별점·당시 태그는 보존돼도 기존 평가의 경로 연결은 비워지고 카드도 새 경로 기준 갱신이 필요합니다. 이는 승인된 영구 변경에서 처리할 동작이며 새 API를 기다릴 이유가 아닙니다.

## 남은 필수 확인·요청 4개

1. **인증된 대중교통 파싱·저장 E2E 검증**
   - 로컬·배포 origin의 FE 키 검색은 각각 후보 17개로 성공했고 Production 환경변수도 저장했습니다. 남은 검증은 실제 로그인 세션으로 아래 파싱 API를 호출하고 선택한 경로를 저장·재조회하는 것입니다.
   - 브라우저가 ODsay `searchPubTransPathT`를 호출한 원본 JSON을 아래 API로 보냅니다. `SX/EX`는 경도, `SY/EY`는 위도입니다.

   ```text
   POST /transit/routes/parse
   Authorization: Bearer {access_token}
   { "odsay": ODsay 원본 JSON }
   → 200 { paths: [...] } / 401 인증 실패 / 422 결과·형식 오류
   ```

   - 이 API는 운영 명세 등재와 무인증 401을 확인했습니다. 추가 배포 요청 대신 정상 세션·ODsay 후보 응답으로 인증된 파싱 200과 `stops[].external_id`를 검증합니다. 선택한 `kind != "walk"` 구간을 기존 `PUT /commutes/me`의 `transit_legs`로 보내는 저장 계약은 같습니다.
   - 팀 명세상 기존 `GET /transit/routes`는 Server IP가 등록된 로컬 개발용으로 남습니다. 브라우저 검색 실패를 기존 서버 호출로 자동 우회하지 않습니다. 서버 CORS 허용과 ODsay URI 도메인은 별도 설정이며, 현재 개인 배포 origin의 서버 CORS 허용은 확인했습니다.

2. **현재 Supabase 프로젝트의 DB·Storage 가용성 확인**
   - 이미 연결된 URL·anon을 사용하므로 공개 키 재전달이 아니라 실제 테스트 계정의 `/users/me`·동선·기록 조회를 확인하면 됩니다.
   - 사진은 비공개 `records` 버킷에 `{Supabase Auth UUID}/{파일명}`으로 올립니다. 서버 `SUPABASE_RECORD_BUCKET`과 프런트 버킷명을 맞추고 본인 폴더 INSERT·SELECT 정책을 확인해 주세요.
   - `PGRST002` 가용성 문제와 RLS를 구분해 확인해 주세요. service role이나 관리자 비밀키를 프런트에 전달할 필요는 없습니다.

3. **장소 UUID의 표시 정보를 제공할 계약**
   - 경로의 `spots[]`와 기록의 `place_id`에는 이름·좌표가 없으므로 현재는 장소 순서로 표시합니다.
   - 기존 Route 응답에 장소 객체를 넣거나, 아래 같은 읽기 API를 제안합니다. 아래 API는 현재 존재하지 않습니다.

   ```text
   GET /places?ids={UUID 목록}
   → [{ id, name, lat, lng, area 또는 address, description? }]
   ```

   - 최대 ID 수·없는 ID 처리·공개 장소와 개인 출발·도착 좌표의 구분을 정해 주세요. Supabase Data API가 정상화되고 해당 정보의 읽기 권한까지 검증된다면 그 경로도 대안이 될 수 있습니다.

4. **기존 푸시 API의 실제 기기 등록·수신 검증**
   - 아래 계약은 운영 명세에 이미 있습니다. 추가 API나 재배포 대신 누락된 Firebase 웹 설정을 연결한 뒤 실제 인증된 기기에서 등록·수신·해제를 확인하면 됩니다.

   | API | 계약 |
   | --- | --- |
   | `PUT /users/me/push-tokens` | `{token: string}` → `{registered: true}` |
   | `DELETE /users/me/push-tokens` | `{token: string}` → `{registered: false}` |
   | `POST /users/me/push-tokens/test` | 본문 없음 → `{sent: number}` |
   | `POST /cards/today/push` | 본문 없음 → `{sent: number}`; 기존 시연용 |

## 서버 수정과 구분할 외부 설정

- **ODsay URI 플랫폼·프런트 배포 환경변수**는 외부 설정입니다. Notion `ODSAY_API_KEY_FE`를 기존 `VITE_ODSAY_WEB_KEY`로 로컬과 Vercel Production에 연결했고 두 origin의 직접 조회가 성공했습니다. 이 설정과 서버 파싱 API·현재 배포 origin의 서버 CORS를 다시 요청하지 않습니다. Vite 환경변수 변경 후에는 새 빌드가 필요합니다.
- **Firebase 웹 앱 공개 설정**을 Notion에서 찾지 못했습니다. 같은 프로젝트의 `apiKey`, `projectId`, `messagingSenderId`, `appId` 등 `firebaseConfig`가 필요합니다. **VAPID 공개키는 이미 있습니다.** 서버 서비스 계정 JSON의 비공개 키를 프런트에 전달하지 마세요.
- 서버의 `FCM_SERVICE_ACCOUNT_JSON`, 실제 HTTPS `FRONTEND_URL`, `APP_ENV=prod`는 담당자가 확인하면 됩니다. 자동 알림은 현재 퇴근 10분 전 하루 한 번입니다.
- **Kakao JavaScript 키·사용 설정 ON·SDK 도메인 등록**은 Kakao 앱 설정입니다. 일반 지도와 GPS는 프런트에서 제공하므로 이 키를 서버 구축 요구로 보지 않습니다. Kakao 일반 장소명 검색을 쓰려면 공개 JavaScript 키가 필요합니다.

## 선택 요청: 해당 화면 범위를 유지할 때만

- **저장 없는 일회성 보행·샛길 계산**은 이전 요구의 선택 확장입니다. 현재 영구 저장 흐름과 별개이며, 제안 `POST /routes/preview`에 `from/to`, `transport_mode`, `preference`, 선택 `transit_legs`를 받고 실제 `polyline/legs`와 임시 ID·수명을 반환하는 계약을 검토할 수 있습니다. 기존 동선·카드·평가를 바꾸지 않는 조건과 임시 경로의 평가·기록 지원 범위가 필요합니다. 이 API는 현재 없으며 이번 작업에서 추가하지 않습니다. PUT 후 원본을 재저장하는 방식은 Route 삭제와 불완전한 교통 동선 복구 때문에 비영속 동작을 보장하지 못합니다.
- 15종 취향 직접 선택: 저장·조회 API와 태그 코드·최대 선택 개수·추천 반영 규칙. 현재 `short/full/sunset`과 별점 가중치 조회·초기화는 이미 있습니다.
- 무사진 방문 기록: 현재 `image_path`가 필수이므로 선택 허용 또는 별도 방문 기록 계약.
- 출근·퇴근 개별 알림: 개별 설정 저장·스케줄러 확장. 현재 프런트는 지원되는 퇴근 알림 한 개로 맞췄습니다.
- 상세 회전별 안내: 기존 Route 응답의 `steps[{location,instruction,distance_m,turn_type,polyline_index}]`와 전체 `distance_m` 확장 제안. **GPS·일반 지도·남은 거리·도착 판정은 프런트 구현이므로 서버 추가 요청이 아닙니다.** 경로 이탈 재탐색까지 원하면 경유지를 보존하는 재탐색 계약을 추가로 합의해야 합니다.
- 실시간 계절·장소 상태를 보여주려면 별도 데이터 응답. 현재 계절 소개는 정적 읽을거리입니다.
- AI 제안 후 작성 취소 등으로 남는 미참조 업로드 파일의 정리 정책·유예 기간은 운영 후속 작업입니다.

## 완료 확인 순서

1. OpenAPI 15경로·20작업, 파싱 API의 정상 인증 보호, 데모 카드 200, 로컬·배포 origin의 ODsay 후보 각 17개, Production 웹 키 저장·서버 CORS를 확인했습니다.
2. 기존 테스트 계정 로그인 → `/users/me` → ODsay 브라우저 검색 → 파싱 POST → 후보 선택·동선 저장·경로 생성 → 카드·출퇴근 방향 확인.
3. 정수 별점 저장·취향 조회·초기화 → 사진 업로드·선택적 AI 제안·기록 재조회. 다른 사용자 사진 접근은 거절돼야 합니다.
4. 실제 기기에서 권한 허용·푸시 PUT → 테스트 발송·수신·알림 클릭 → DELETE·로그아웃 후 수신 중단.
5. 지도 위치 변경에서 실제 검색·좌표 선택 → 출근 기준 교통 후보 선택 → 동선 PUT·재생성 → 편집했던 방향의 새 경로·카드 갱신을 확인합니다. 저장 전 취소, 저장 중 중복·취소 차단, PUT 성공 후 재생성 실패의 부분 성공, 새로고침 후 새 좌표 유지를 각각 검증합니다.

`sent: 0`, 샘플 데이터, 모킹 테스트 통과를 운영 수신·저장 성공으로 처리하지 않습니다. 상세 근거와 실패 사례는 [백엔드·외부 설정 의존사항](backend-dependencies.md)에 있습니다.
