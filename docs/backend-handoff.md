# 샛길: 서버 담당자 전달 메모

2026-11-08 공개 API·로컬 브라우저 최종 재확인 및 서버 main `48b9433`의 [대중교통 웹 계약](https://github.com/dandithon-grip/server/blob/48b9433/docs/transit-web.md) 기준입니다. **파싱 API는 운영에 반영됐습니다. 현재 대중교통 연동의 막힘은 ODsay 키 인증 실패이며, 배포 환경의 웹 키·URI 도메인 등록도 필요합니다.** 기존 데모 500과 푸시 명세 누락도 해소됐습니다. 백엔드·외부 설정은 변경하지 않았습니다. 프런트는 실제 API 연결, 지도·현재 위치·남은 거리·도착 판정, FCM 기기 등록·해제·수신 코드를 구현했고, 실제 인증·업로드·푸시 수신 E2E는 남아 있습니다.

**이미 있는 값:** Notion의 Supabase URL·공개 anon 키와 VAPID 공개키는 로컬 환경에 연결했습니다. 같은 값을 다시 전달받을 필요는 없습니다.

Notion의 현재 `ODSAY_API_KEY` 값도 로컬 전용 `.env.local`의 `VITE_ODSAY_WEB_KEY`에 연결했습니다. 로컬 연결을 인증 성공으로 간주하지 않습니다. 키 값은 이 문서·커밋에 포함하지 않습니다.

사용자가 별도 설정 페이지는 없으며 현재 Notion 페이지의 정보가 전부라고 확인했습니다. Kakao JavaScript 키·Firebase 웹 앱 공개 설정은 공유된 자료에 없고, 기존 서비스 테스트 계정도 확인되지 않았습니다.

## 실제 관측

- 최종 운영 OpenAPI 200, **15개 경로·20개 API 작업**. 앞선 `/stations?line=2` 조회는 200, 역 6개를 반환했습니다.
- `/cards/demo`는 **200**, 오늘 카드·추천 3개·최단 도보 구간 2개를 반환합니다. 선택 추천 polyline은 **101점·약 1.6km**이며, 임의 2~3점 예시선과 다른 상세 경로입니다.
- FCM 등록·해제·테스트·카드 즉시 발송 API가 운영 명세에 반영됐습니다. 실제 인증된 호출·기기 수신은 아직 검증하지 않았습니다.
- 최종 재확인에서 `POST /transit/routes/parse`가 운영 명세에 등재됐고, 무인증 `{"odsay":{}}` 진단 요청은 401 `{"message":"유효하지 않은 토큰입니다"}`를 반환했습니다. 이는 실제 경로 존재·정상 인증 보호를 확인한 것이며, 인증된 파싱 성공을 뜻하지 않습니다.
- 한 단계 앞선 점검에서 파싱 API가 없었던 14경로·19작업 명세는 과거 관측입니다. 운영 반영을 확인했으므로 파싱 API 재배포를 요청하지 않습니다.
- `http://localhost:3000` 실제 브라우저의 ODsay 직접 요청은 HTTP 200이지만 본문은 `error.code: "500"`, `"[ApiKeyAuthFailed] ApiKey authentication failed."`였습니다. 두 번의 조회에서 같은 인증 실패를 확인했고 추가 재시도는 하지 않았습니다. HTTP 200을 후보 검색 성공으로 처리하지 않습니다. 키 유효성·URI 플랫폼 설정을 확인해야 하며, 쿼터나 단순 CORS 문제라고 단정하지 않습니다.
- 개인 저장소의 배포 홈페이지는 `https://grip-front.vercel.app`으로 확인했습니다. 이 배포 환경에 키를 설정하거나 ODsay 도메인을 등록하는 외부 변경은 수행하지 않았고, 키 인증 실패 후 배포 origin의 ODsay 호출을 추가 시험하지 않았습니다.
- 앞선 점검의 데모 500·푸시 경로 404·11경로/15작업은 이전 관측입니다. 당시 로그를 읽지 못해 정확한 장애 원인은 확정하지 못했으며, 현재 정상화만으로 원인을 역산하지 않습니다.
- 앞선 무인증 `/users/me`는 정상적으로 401이었습니다. Supabase `/auth/v1/settings`는 200, 이메일 사용 가능·메일 자동 확인 ON입니다. 실제 계정 로그인 성공을 검증한 것은 아닙니다.
- Supabase `/rest/v1/places?select=id,name&limit=1`은 503 `PGRST002`였습니다. 데모 정상화 뒤 이 Data API는 재검증하지 않았고, 장소 API의 작동하는 대안으로도 확인되지 않았습니다. 이전 데모 500과 같은 원인인지 미확인입니다.

보행 계산은 서버의 TMAP, 대중교통 후보 검색은 ODsay의 역할입니다. **최신 운영 계약은 URI 키로 브라우저가 ODsay를 직접 검색하고 서버가 결과만 파싱하는 방식**입니다. 기존 서버 `ODSAY_API_KEY`와 프런트 `VITE_ODSAY_WEB_KEY`의 용도를 구분합니다. `TMAP_APP_KEY`의 실제 값·현재 설정 여부는 조회하지 않았고 상세 GET은 저장된 경로일 수 있습니다. 카드의 `by_llm: true`도 캐시일 수 있어 신규 LLM 호출·충전 상태·모델을 검증한 것은 아닙니다. 모델 변경의 품질 비교도 미검증입니다.

## 남은 필수 확인·요청 5개

1. **ODsay 브라우저 검색과 신규 파싱 API 연결**
   - 로컬 `VITE_ODSAY_WEB_KEY` 연결은 완료했으나 브라우저에서 `ApiKeyAuthFailed`가 발생했습니다. ODsay Application에서 현재 키의 유효성·**URI 플랫폼** 활성화와 `http://localhost:3000` 등록을 확인합니다. 개인 배포의 `VITE_ODSAY_WEB_KEY` 환경변수 설정 및 URI 도메인 `https://grip-front.vercel.app` 등록도 필요합니다. 이 외부 설정은 아직 변경하지 않았습니다.
   - 브라우저가 ODsay `searchPubTransPathT`를 호출한 원본 JSON을 아래 API로 보냅니다. `SX/EX`는 경도, `SY/EY`는 위도입니다.

   ```text
   POST /transit/routes/parse
   Authorization: Bearer {access_token}
   { "odsay": ODsay 원본 JSON }
   → 200 { paths: [...] } / 401 인증 실패 / 422 결과·형식 오류
   ```

   - 이 API는 운영 명세 등재와 무인증 401을 확인했습니다. 추가 배포 요청 대신 정상 세션·ODsay 후보 응답으로 인증된 파싱 200과 `stops[].external_id`를 검증합니다. 선택한 `kind != "walk"` 구간을 기존 `PUT /commutes/me`의 `transit_legs`로 보내는 저장 계약은 같습니다.
   - 팀 명세상 기존 `GET /transit/routes`는 Server IP가 등록된 로컬 개발용으로 남습니다. URI 키 인증 문제를 기존 서버 호출로 자동 우회하지 않습니다. 현재 키의 실제 URI 플랫폼 허용 상태는 확인되지 않았으며, 설정 확인 후 브라우저 후보 응답부터 다시 검증해야 합니다.

2. **실제 프런트 주소의 CORS 허용**
   - `http://localhost:3000`은 허용돼 있습니다. 최종 HTTPS 배포 origin을 `CORS_ORIGINS`에 추가해 주세요.
   - Authorization·Content-Type을 포함한 사전 요청과 실제 GET·PUT·POST·DELETE가 브라우저에서 가능해야 합니다.
   - 서버 CORS 허용과 ODsay URI 플랫폼의 도메인 등록은 별도 설정입니다.

3. **현재 Supabase 프로젝트의 DB·Storage 가용성 확인**
   - 이미 연결된 URL·anon을 사용하므로 공개 키 재전달이 아니라 실제 테스트 계정의 `/users/me`·동선·기록 조회를 확인하면 됩니다.
   - 사진은 비공개 `records` 버킷에 `{Supabase Auth UUID}/{파일명}`으로 올립니다. 서버 `SUPABASE_RECORD_BUCKET`과 프런트 버킷명을 맞추고 본인 폴더 INSERT·SELECT 정책을 확인해 주세요.
   - `PGRST002` 가용성 문제와 RLS를 구분해 확인해 주세요. service role이나 관리자 비밀키를 프런트에 전달할 필요는 없습니다.

4. **장소 UUID의 표시 정보를 제공할 계약**
   - 경로의 `spots[]`와 기록의 `place_id`에는 이름·좌표가 없으므로 현재는 장소 순서로 표시합니다.
   - 기존 Route 응답에 장소 객체를 넣거나, 아래 같은 읽기 API를 제안합니다. 아래 API는 현재 존재하지 않습니다.

   ```text
   GET /places?ids={UUID 목록}
   → [{ id, name, lat, lng, area 또는 address, description? }]
   ```

   - 최대 ID 수·없는 ID 처리·공개 장소와 개인 출발·도착 좌표의 구분을 정해 주세요. Supabase Data API가 정상화되고 해당 정보의 읽기 권한까지 검증된다면 그 경로도 대안이 될 수 있습니다.

5. **기존 푸시 API의 실제 기기 등록·수신 검증**
   - 아래 계약은 운영 명세에 이미 있습니다. 추가 API나 재배포 대신 누락된 Firebase 웹 설정을 연결한 뒤 실제 인증된 기기에서 등록·수신·해제를 확인하면 됩니다.

   | API | 계약 |
   | --- | --- |
   | `PUT /users/me/push-tokens` | `{token: string}` → `{registered: true}` |
   | `DELETE /users/me/push-tokens` | `{token: string}` → `{registered: false}` |
   | `POST /users/me/push-tokens/test` | 본문 없음 → `{sent: number}` |
   | `POST /cards/today/push` | 본문 없음 → `{sent: number}`; 기존 시연용 |

## 서버 수정과 구분할 외부 설정

- **ODsay URI 플랫폼·도메인 등록 및 프런트 배포 환경변수**는 외부 설정입니다. 로컬 키 연결은 완료했고 인증 실패 원인을 확인해야 합니다. 배포의 `VITE_ODSAY_WEB_KEY`와 URI 도메인 `https://grip-front.vercel.app`은 별도로 적용해야 합니다. 이전의 ‘ODsay는 서버 키만 필요하다’는 설명은 최신 계약에 적용하지 않습니다. 새 파싱 API의 운영 반영은 이미 확인했습니다.
- **Firebase 웹 앱 공개 설정**을 Notion에서 찾지 못했습니다. 같은 프로젝트의 `apiKey`, `projectId`, `messagingSenderId`, `appId` 등 `firebaseConfig`가 필요합니다. **VAPID 공개키는 이미 있습니다.** 서버 서비스 계정 JSON의 비공개 키를 프런트에 전달하지 마세요.
- 서버의 `FCM_SERVICE_ACCOUNT_JSON`, 실제 HTTPS `FRONTEND_URL`, `APP_ENV=prod`는 담당자가 확인하면 됩니다. 자동 알림은 현재 퇴근 10분 전 하루 한 번입니다.
- **Kakao JavaScript 키·사용 설정 ON·SDK 도메인 등록**은 Kakao 앱 설정입니다. 일반 지도와 GPS는 프런트에서 제공하므로 이 키를 서버 구축 요구로 보지 않습니다. Kakao 일반 장소명 검색을 쓰려면 공개 JavaScript 키가 필요합니다.

## 선택 요청: 해당 화면 범위를 유지할 때만

- 15종 취향 직접 선택: 저장·조회 API와 태그 코드·최대 선택 개수·추천 반영 규칙. 현재 `short/full/sunset`과 별점 가중치 조회·초기화는 이미 있습니다.
- 무사진 방문 기록: 현재 `image_path`가 필수이므로 선택 허용 또는 별도 방문 기록 계약.
- 출근·퇴근 개별 알림: 개별 설정 저장·스케줄러 확장. 현재 프런트는 지원되는 퇴근 알림 한 개로 맞췄습니다.
- 상세 회전별 안내: 기존 Route 응답의 `steps[{location,instruction,distance_m,turn_type,polyline_index}]`와 전체 `distance_m` 확장 제안. **GPS·일반 지도·남은 거리·도착 판정은 프런트 구현이므로 서버 추가 요청이 아닙니다.** 경로 이탈 재탐색까지 원하면 경유지를 보존하는 재탐색 계약을 추가로 합의해야 합니다.
- 실시간 계절·장소 상태를 보여주려면 별도 데이터 응답. 현재 계절 소개는 정적 읽을거리입니다.
- AI 제안 후 작성 취소 등으로 남는 미참조 업로드 파일의 정리 정책·유예 기간은 운영 후속 작업입니다.

## 완료 확인 순서

1. 최종 OpenAPI 15경로·20작업, 파싱 API의 정상 인증 보호, 앞선 데모 카드 200은 확인했습니다. ODsay 키·URI 설정의 인증 실패를 해결하고 `https://grip-front.vercel.app`의 환경변수·서버 CORS·ODsay URI 등록을 확인합니다.
2. 기존 테스트 계정 로그인 → `/users/me` → ODsay 브라우저 검색 → 파싱 POST → 후보 선택·동선 저장·경로 생성 → 카드·출퇴근 방향 확인.
3. 정수 별점 저장·취향 조회·초기화 → 사진 업로드·선택적 AI 제안·기록 재조회. 다른 사용자 사진 접근은 거절돼야 합니다.
4. 실제 기기에서 권한 허용·푸시 PUT → 테스트 발송·수신·알림 클릭 → DELETE·로그아웃 후 수신 중단.

`sent: 0`, 샘플 데이터, 모킹 테스트 통과를 운영 수신·저장 성공으로 처리하지 않습니다. 상세 근거와 실패 사례는 [백엔드·외부 설정 의존사항](backend-dependencies.md)에 있습니다.
