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

## 추가 요청: 일회성 위치 변경과 원래 경로 복귀

최신 main `48b9433`을 다시 fetch하고 운영 명세를 확인했지만, **임의 좌표로 저장 없이 도보·샛길을 계산하는 API는 없습니다.** 프런트에는 저장된 일상 동선·경로·카드를 보존하고 별도 메모리에 일회성 출발·도착 위치와 선택한 대중교통 후보를 두는 기능을 구현했습니다. 편집 취소는 새 초안만 버리고 이전 탐색을 유지하며, 일상 경로 복귀는 적용한 임시 상태만 제거합니다. 조회 취소·화면 이탈 시 진행 중 요청을 취소하고 늦은 응답을 무시합니다. 일상 동선을 다시 PUT하지 않으며 서버·설정도 변경하지 않았습니다.

자동 테스트는 원본 동선·방향·선택·캐시 보존, 동선 PUT·재생성 POST 미호출, 후보 재조회·취소·경쟁 응답·계정 분리를 검증합니다. 로컬 브라우저에서 지도 클릭·장소 수정·취소·임시 적용·원래 경로 복귀·새로고침 복원과 모바일 화면도 확인했습니다. 실제 운영 계정의 인증된 파싱 E2E는 아직 미검증입니다.

`PUT /commutes/me`로 잠깐 덮어썼다가 복구하는 방식은 사용하지 않습니다. PUT은 즉시 영속 저장하고, `POST /commutes/me/routes`는 기존 경로를 삭제·재생성합니다. 이때 평가 데이터는 보존돼도 `Feedback.route_id`와 카드의 경로 연결은 비워집니다. GET 동선에는 원래 `transit_legs`·중간 하차 후보가 없어 ODsay 동선을 완전하게 복구할 수도 없습니다.

현재 ODsay 파싱 응답은 시간·노선·탑승 정류장 좌표를 주지만 실제 도로 polyline은 주지 않으며 도보 구간의 정류장 배열도 비어 있습니다. 정류장을 연결한 선을 실제 보행선으로 표시하거나 임시 경로를 저장된 경로 ID로 평가하지 않습니다.

실제 일회성 도보·샛길까지 제공하려면 아래와 같은 **새 계약을 제안**합니다. 명칭·필드는 검토용이며 현재 존재하는 API가 아닙니다.

```text
POST /routes/preview  # 제안
{ from: {lat, lng}, to: {lat, lng}, transport_mode, preference,
  transit_legs?: 선택한 탑승 구간 [{line, stops}] }
→ { preview_id, expires_at, candidates, shortest }
각 경로: 임시 id, 실제 polyline, legs, distance_m, minutes
```

- 계산 중에도 기존 `commutes`·`routes`·오늘 카드·평가·취향 가중치를 저장·삭제·수정하지 않아야 합니다.
- 출발·도착은 이번 이동 순서로 전달하고, 지원 지역·후보 없음·외부 API 실패를 정의합니다. 안내에 쓸 실제 geometry와 구간 경계, 상세 안내를 제공한다면 `steps`를 명시합니다.
- 임시 ID의 수명·만료 후 재계산을 정하고, 기존 `/feedback`에 사용할 수 있는지 별도 계약으로 명시합니다. 사진 기록은 유효한 `place_id`·장소 정보 제공 여부와 임시 경로의 연결 방식을 정해야 합니다. 지원하지 않는 평가·기록은 완료한 것처럼 처리하지 않습니다.

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
5. 일회성 위치 변경·대중교통 재조회·취소·원래 경로 복귀에서 원본 동선·카드·경로 ID가 바뀌지 않는지 확인합니다. 임시 보행선 계산·평가·기록은 위 제안 계약이 마련되기 전 실제 지원 범위로 표시하지 않습니다.

`sent: 0`, 샘플 데이터, 모킹 테스트 통과를 운영 수신·저장 성공으로 처리하지 않습니다. 상세 근거와 실패 사례는 [백엔드·외부 설정 의존사항](backend-dependencies.md)에 있습니다.
