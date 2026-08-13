![팀가치 로고](./logo.png)
# 시너지온 팀가치

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
- `html/chat.html`: Realtime 채팅과 Storage 자료함
- `html/progress.html`: 팀원별 진척도와 업무 보드

로그인한 사용자가 참여 중인 팀이 없으면 첫 로그인 시 기본 팀을 한 번만 자동 생성합니다. 새 팀은 할 일과 진척도 등이 모두 0에서 시작합니다.

기본 팀 생성 시 DB 트리거와 RPC가 같은 팀장 멤버십을 중복 생성하지 않도록 처리합니다.

프론트 파일은 `html/`, `css/`, `js/` 폴더로 구분합니다. 루트 주소는 로그인 화면으로 즉시 이동하며, 로그인 화면에서 기존 세션을 확인해 대시보드로 이동합니다.

Supabase 데이터 조회에 실패하면 원인 메시지를 화면 상단에 표시해 연결 문제를 바로 확인할 수 있습니다.

대시보드·할 일·채팅/자료함·진척도 화면의 HTML 기본값은 모두 0 또는 빈 상태입니다. 실제로 등록된 데이터가 있을 때만 Supabase 조회 결과로 숫자와 목록을 표시합니다.

자료함은 `팀 ID/사용자 ID/파일` Storage 경로를 사용하며 파일·이미지·링크 탭에서 업로드, 열기, 다운로드, 삭제를 지원합니다.

할 일은 정확한 날짜, 상세 설명, 기본 담당자와 공동 작업자, 완료 시 증빙파일 필수 여부를 저장합니다. 마감일을 지정하면 캘린더 일정이 자동으로 생성·갱신됩니다.

상단 검색창에서 Enter를 누르면 현재 팀의 할 일·일정·채팅·자료를 통합 검색합니다. 세로 말줄임표 팀 관리 메뉴에서는 팀 전환, 새 팀 생성, 팀 이름 변경과 초대 코드 확인이 가능합니다.

GitHub에 추가된 `logo.png`를 공통 사이드바에 적용하고 캘린더 화면을 활성화했습니다.

외부 AI를 연결하지 않은 상태에서도 오류 화면 대신 최근 대화 자동 정리와 우선순위·마감일 자동 정렬이 동작합니다. 실제 AI 호출은 고교 사용 조건에 맞는 제공자를 선정한 뒤 Supabase Edge Function으로 연결합니다.

## 로컬 실행

```powershell
npx.cmd --yes serve . --listen 4174
```

브라우저에서 <http://localhost:4174>에 접속합니다.

## 보안

- 프론트에는 Supabase Project URL과 Publishable Key만 둡니다.
- Supabase Secret Key와 외부 AI API Key는 커밋하지 않습니다.
- 데이터 접근은 Supabase RLS 정책으로 팀별 제한합니다.
