# 시너지온 팀가치 프론트엔드

팀가치 웹 프론트엔드와 Netlify 자동 배포용 저장소입니다. 실제 통합 원본과 Supabase 백엔드는 팀 저장소에서 관리합니다.

## 운영 배포 주소

- 메인 사이트: <https://teamgachi.netlify.app>
- 로그인: <https://teamgachi.netlify.app/login.html>

- 팀 저장소: <https://github.com/gkatjgml3/teamgachi>
- 통합 프론트엔드: `teamgachi/web/`

## 구현 화면

- `html/login.html`: 로그인
- `html/signup.html`: 회원가입 및 팀 초대 코드
- `html/reset-password.html`: 비밀번호 재설정
- `html/dashboard.html`: 팀 대시보드
- `html/todo.html`: 할 일 CRUD와 우선순위 정렬
- `chat.html`: Realtime 채팅과 Storage 자료함
- `html/progress.html`: 팀원별 진척도와 업무 보드

로그인한 사용자가 참여 중인 팀이 없으면 첫 로그인 시 기본 팀을 한 번만 자동 생성합니다. 새 팀은 할 일과 진척도 등이 모두 0에서 시작합니다.

## 로컬 실행

```powershell
npx.cmd --yes serve . --listen 4174
```

브라우저에서 <http://localhost:4174>에 접속합니다.

## 보안

- 프론트에는 Supabase Project URL과 Publishable Key만 둡니다.
- Supabase Secret Key와 OpenAI API Key는 커밋하지 않습니다.
- 데이터 접근은 Supabase RLS 정책으로 팀별 제한합니다.
