# 샛길 프론트 프로젝트 지침

## 필수: 수정사항을 두 저장소에 모두 푸시

2026-11-08 사용자 명시 지시다. 개인 저장소가 배포에 사용되므로 이후 이 프로젝트의 수정사항은 아래 두 저장소에 모두 반영한다.

| 용도 | 원격 이름 | 저장소 |
| --- | --- | --- |
| 팀 저장소 | `origin` | `https://github.com/dandithon-grip/front.git` |
| 개인 배포 저장소 | `personal` | `https://github.com/yoon-0409/grip-front.git` |

- 현재 두 저장소의 기본 브랜치는 `main`이다. 다른 작업 브랜치를 쓰더라도 사용자에게 별도 지시가 없으면 양쪽의 대응 브랜치에 같은 변경을 반영한다.
- 작업과 푸시 전에 두 원격을 fetch하고, 로컬·원격의 기존 변경을 보존한다. 분기 차이가 있으면 내용을 확인하고 통합한 뒤 진행한다.
- 변경에 맞는 검증을 마친 동일 커밋을 양쪽에 일반 push한다. 한쪽만 푸시하고 작업을 완료로 보고하지 않는다.
- `main`에서 작업한 경우 기본 순서는 다음과 같다.

  ```sh
  git fetch origin
  git fetch personal
  # 기존 변경 확인·통합, 구현·검증·커밋 후
  git push origin main
  git push personal main
  git ls-remote origin refs/heads/main
  git ls-remote personal refs/heads/main
  ```

- 마지막 두 조회의 커밋 SHA가 검증한 최종 커밋과 같은지 확인한다. 한쪽 푸시가 실패하면 원인과 두 저장소의 반영 상태를 보고하고 안전하게 해결한다.
- 강제 푸시로 기존 이력을 덮어쓰지 않는다. 사용자의 후속 명시 지시가 있으면 그 지시를 우선한다.
- `.env.local` 등 로컬 설정과 서버 비밀키는 커밋하거나 푸시하지 않는다.
