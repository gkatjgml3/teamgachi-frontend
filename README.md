# 시너지온 팀가치 프론트엔드

팀가치 웹 프론트엔드 작업 저장소입니다. HTML, CSS, JavaScript로 화면을 구현하며 Supabase 백엔드 연결 코드를 함께 관리합니다.

통합 프로젝트의 실제 원본은 아래 팀 저장소에 있습니다.

- 팀 저장소: <https://github.com/gkatjgml3/teamgachi>
- 통합 프론트엔드 경로: `teamgachi/web/`
- 배포 사이트: <https://teamgachi-2026.netlify.app>

## 현재 화면

- `login.html`: 로그인
- `signup.html`: 회원가입 및 팀 초대 코드
- `reset-password.html`: 비밀번호 재설정
- `dashboard.html`: 대시보드 디자인

대시보드 카드의 수치와 목록은 현재 디자인 확인용 예시 데이터입니다. 로그인·회원가입·프로필 표시는 Supabase와 연결되어 있습니다.

## 파일 규칙

중간 버전 파일명인 `_2`, `1~3`, `최종`은 사용하지 않습니다. 최신 화면은 항상 아래 표준 파일명에 반영합니다.

```text
index.html
login.html
signup.html
reset-password.html
dashboard.html
style.css
auth.js
dashboard.js
reset-password.js
supabase-client.js
config.js
```

## 로컬 실행

```powershell
npx.cmd --yes serve . --listen 4174
```

브라우저에서 <http://localhost:4174>에 접속합니다.

## 주의사항

- 화면 디자인 수정은 이 저장소의 표준 파일에서 진행합니다.
- Supabase Project URL과 Publishable Key만 `config.js`에 둘 수 있습니다.
- Supabase Secret Key와 OpenAI API Key는 프론트엔드 코드에 넣지 않습니다.
- 백엔드 스키마·RLS·Edge Function은 `gkatjgml3/teamgachi` 저장소에서 관리합니다.
