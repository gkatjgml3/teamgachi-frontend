![팀가치 로고](./logo.png)

# 시너지온 팀가치

## 팀가치 소개

**팀가치(TeamGachi)**는 팀 프로젝트에 필요한 할 일, 일정, 채팅, 자료 공유와 업무 진척도를 한곳에서 관리하는 웹 협업 프로그램입니다. 여러 서비스를 오가며 정보가 흩어지는 문제를 줄이고, 팀의 현재 진행 상황을 한눈에 확인할 수 있도록 만들고 있습니다.

## 최근 수정사항

- 2026-08-19 `dashboard-완성본.html`의 통계 카드·AI 스마트 추천·우선순위·주요 일정 디자인을 실제 대시보드에 적용하고 Supabase 실데이터와 연결
- 2026-08-19 채팅에서 생성한 최신 AI 요약을 팀별로 Supabase에 저장하고 대시보드 `채팅 요약` 카드에 표시하도록 연결
- 2026-08-19 채팅 화면 높이를 브라우저 안에 고정하고, 메시지가 많아지면 메시지 영역만 위아래로 스크롤되도록 수정
- 2026-08-19 헤더의 `?` 기능 안내 버튼은 제거하고 `⋮` 팀 관리 버튼은 유지하며, 두 기능 모두 프로필 메뉴에서도 사용할 수 있도록 정리
- 2026-08-19 캘린더 `다가오는 마감`에서 완료·취소된 할 일을 제외하고 진행 중인 할 일과 직접 등록한 팀 일정만 표시하도록 수정
- 2026-08-19 자료함에 파일·이미지 다중 선택 버튼, 링크 입력 버튼, 드래그 상태와 업로드 성공·실패 안내를 추가
- 할 일 마감 입력을 날짜+시간으로 변경하고 제목 클릭 상세 보기, 공동 작업자, 완료 증빙 업로드 흐름을 보강
- 상단 검색에 실행 버튼을 추가하고 Enter와 클릭 모두 팀 할 일·일정·채팅·자료 통합 검색이 되도록 수정
- 세로 말줄임표 팀 관리에 새 팀 생성, 팀 전환, 팀 이름 변경, 초대 코드 복사와 초대 코드 참여 기능을 연결
- 프로필 원을 누르면 이름 변경·로그아웃을 선택하는 프로필 메뉴가 열리도록 수정
- 대시보드에 가까운 일정 최대 6개와 정확한 시간을 표시하고 일정 상세 팝업을 연결
- Supabase AI 함수에 Gemini 우선 호출과 OpenAI 보조 호출을 추가하고, API 키가 없을 때는 기존 자동 정리·정렬을 유지
- Gemini 채팅 요약의 Markdown 표시를 제거하고 중요한 할 일·담당자·마감만 최대 3줄로 간단히 표시
- 채팅 메시지를 실제 작성일 기준으로 묶고 날짜가 바뀌는 위치마다 날짜 구분선을 표시
- 본인이 작성한 채팅 메시지의 수정·삭제 기능과 수정 여부 표시 추가
- 2026-08-19 GitHub에 추가된 `*-완성본.html` 7개를 최신 디자인 기준으로 확인하고 실제 서비스 HTML·CSS·JavaScript에 기능형으로 통합
- 캘린더에 월·주·일 보기, 날짜 클릭 일 보기, 보기 단위별 이전·다음 이동을 추가
- 캘린더 `다가오는 마감`을 현재 달 조회와 분리하고 일정과 할 일 마감일을 함께 조회하도록 수정
- 집중 타이머 시간을 15·25·45·60분 중 선택할 수 있게 하고 완료 세션의 사진 인증·설명·응원 피드를 Supabase에 연결
- 대시보드의 진척도 전체 보기·캘린더·전체 대화·공지 전체 링크를 실제 화면 이동으로 연결
- 할 일 `내 완료율` 계산 막대와 `할 일 보기` 버튼을 수정하고 공동 작업 업무도 내 할 일에 포함
- 공지 작성 위치와 권한을 화면에 안내하고 최신순·오래된순 정렬을 연결
- 모든 주요 기능 화면 헤더에 `?` 기능 안내 버튼을 추가
- Netlify 크레딧 제한을 피하기 위해 Cloudflare Pages로 이전하고 GitHub `main` 브랜치 자동 배포 연결 완료
- `수정본` 7개를 최종 HTML 원본으로 재확인하고, 타이머·공지 배포 경로와 전 화면 공통 글자·헤더·사이드바 정렬을 수정
- Google Cloud OAuth 클라이언트를 생성하고 Supabase Google provider를 활성화해 실제 계정 선택 화면까지 동작 확인
- Google OAuth 이동 상태·계정 선택·오류 안내를 보강하고 로그인 완료 후 대시보드로 연결
- GitHub의 `파일명(수정본).html` 7개를 최종 디자인 원본으로 확정하고 실제 서비스 화면에 적용
- 기존 5개 화면에 더해 `집중 타이머`와 `공지사항` 화면을 활성화하고 Supabase 데이터 연결 추가
- 캘린더의 일정 막대와 오른쪽 `다가오는 마감` 항목을 누르면 날짜·시간·구분·D-Day 상세 팝업 표시
- 사이드바의 팀가치 로고를 누르면 어느 화면에서든 대시보드로 이동
- 최종 디자인에 포함된 샘플 숫자·일정·채팅·공지·업무를 제거하고, 등록 전에는 0 또는 빈 상태만 표시
- 대시보드·할 일·채팅·캘린더·진척도 HTML에 공통 팝업 템플릿을 추가하고 화면별 헤더·사이드바·본문 크기를 통일
- 브라우저 기본 입력·경고창을 제거하고 일정·팀·링크 입력, 삭제 확인과 오류 안내를 팀가치 전용 팝업으로 통일
- 팀 생성·전환·이름 변경과 초대 코드 확인 기능 추가
- 할 일에 정확한 마감일, 상세 내용, 공동 작업자와 완료 증빙파일 설정 추가
- 할 일 마감일과 캘린더 일정 자동 연동
- 자료함 파일·이미지·링크 업로드·열기·삭제 수정
- 팀 데이터 통합 검색과 초기 화면 0건·0% 표시 적용
- 로그인·회원가입을 포함한 모든 활성 화면의 보라색 임시 로고를 팀가치 로고로 교체
- 프로필 이미지를 단색 파스텔 원형으로 통일
- 공통 로고·헤더 정렬 및 브라우저 탭 로고 적용
- OpenAI Edge Function 호출을 화면에 연결하고, 키 미등록·호출 실패 시 자동 정리·정렬로 전환
- 로그인 직후 `JWT issued at future`가 발생하면 세션을 자동 재확인한 뒤 대시보드로 이동
- 대시보드 AI기능 강조해서 디자인 수정, 프론트엔드 수정

## 저장소 안내

이 저장소는 팀가치 웹 프론트엔드와 Netlify 자동 배포용 저장소입니다. 실제 통합 원본과 Supabase 백엔드는 팀 저장소에서 관리합니다.

## 운영 배포 주소

- 메인 사이트: <https://teamgachi.pages.dev>
- 로그인: <https://teamgachi.pages.dev/login.html>

> 2026-08-14부터 Cloudflare Pages를 운영 배포로 사용합니다. Netlify 사이트는 이전 배포본 확인용으로만 남겨 둡니다.

- 팀 저장소: <https://github.com/gkatjgml3/teamgachi>
- 통합 프론트엔드: `teamgachi/web/`

## 구현 화면

- `html/login.html`: 로그인
- `html/signup.html`: 회원가입 및 팀 초대 코드
- `html/reset-password.html`: 비밀번호 재설정
- `html/dashboard.html`: 팀 대시보드
- `html/todo.html`: 할 일 CRUD와 우선순위 정렬
- `html/chat.html`: Realtime 채팅과 Storage 자료함
- `html/calendar.html`: 팀 일정·할 일 마감 연동과 일정 상세 팝업
- `html/progress.html`: 팀원별 진척도와 업무 보드
- `html/timer.html`: 뽀모도로 집중 타이머와 집중 통계
- `html/notice.html`: 공지 작성·분류·상세 보기와 읽음 처리

## 기능 동작 참고

로그인한 사용자가 참여 중인 팀이 없으면 첫 로그인 시 기본 팀을 한 번만 자동 생성합니다. 새 팀은 할 일과 진척도 등이 모두 0에서 시작합니다.

기본 팀 생성 시 DB 트리거와 RPC가 같은 팀장 멤버십을 중복 생성하지 않도록 처리합니다.

프론트 파일은 `html/`, `css/`, `js/` 폴더로 구분합니다. 루트 주소는 로그인 화면으로 즉시 이동하며, 로그인 화면에서 기존 세션을 확인해 대시보드로 이동합니다.

Supabase 데이터 조회에 실패하면 원인 메시지를 화면 상단에 표시해 연결 문제를 바로 확인할 수 있습니다.

대시보드·할 일·채팅/자료함·진척도 화면의 HTML 기본값은 모두 0 또는 빈 상태입니다. 실제로 등록된 데이터가 있을 때만 Supabase 조회 결과로 숫자와 목록을 표시합니다.

자료함은 `팀 ID/사용자 ID/파일` Storage 경로를 사용하며 파일·이미지·링크 탭에서 업로드, 열기, 다운로드, 삭제를 지원합니다.

할 일은 정확한 날짜, 상세 설명, 기본 담당자와 공동 작업자, 완료 시 증빙파일 필수 여부를 저장합니다. 마감일을 지정하면 캘린더 일정이 자동으로 생성·갱신됩니다.

상단 검색창에서 Enter를 누르면 현재 팀의 할 일·일정·채팅·자료를 통합 검색합니다. 세로 말줄임표 팀 관리 메뉴에서는 팀 전환, 새 팀 생성, 팀 이름 변경과 초대 코드 확인이 가능합니다.

일정 추가는 일정명·날짜·시작 시간을 한 팝업에서 입력하며, 팀 생성·이름 변경·링크 추가·자료 및 할 일 삭제 확인·오류 안내도 브라우저 기본 창 대신 같은 디자인의 웹 내부 팝업을 사용합니다.

활성 HTML 화면에는 `app-modal-root`와 `app-modal-template`이 직접 포함되어 있습니다. `shared-layout.css`가 사이드바 220px, 헤더 64px, 본문 여백 24px 기준을 모든 주요 화면에 동일하게 적용합니다.

GitHub에 추가된 `logo.png`를 공통 사이드바에 적용하고 캘린더 화면을 활성화했습니다.

브라우저 탭의 기본 지구본 아이콘 대신 `logo.png`를 파비콘으로 표시합니다.

AI 버튼은 Supabase Edge Function에서 `GEMINI_API_KEY`를 먼저 사용하고, 필요하면 `OPENAI_API_KEY`를 보조로 사용합니다. 두 키가 없거나 호출에 실패하면 오류 화면 대신 최근 대화 자동 정리와 우선순위·마감일 자동 정렬로 전환됩니다. 18세 미만 사용자는 보호자 동의와 대회 규정을 확인한 뒤 API를 사용합니다.

Gemini 키는 프론트 코드나 GitHub에 넣지 않고 다음처럼 Supabase Secret으로만 저장합니다.

```powershell
npx.cmd supabase secrets set GEMINI_API_KEY=발급받은_키 --project-ref yezdalggrwjtjemkcehj
npx.cmd supabase functions deploy summarize-chat --project-ref yezdalggrwjtjemkcehj
npx.cmd supabase functions deploy recommend-priority --project-ref yezdalggrwjtjemkcehj
```

## 로컬 실행

```powershell
npx.cmd --yes serve . --listen 4174
```

브라우저에서 <http://localhost:4174>에 접속합니다.

## 보안

- 프론트에는 Supabase Project URL과 Publishable Key만 둡니다.
- Supabase Secret Key와 외부 AI API Key는 커밋하지 않습니다.
- 데이터 접근은 Supabase RLS 정책으로 팀별 제한합니다.
- Google OAuth Client Secret은 GitHub에 저장하지 않고 Supabase의 Google provider 설정에만 입력합니다.

## Google 로그인 설정

- 승인된 JavaScript 원본: `https://teamgachi.pages.dev`
- Google OAuth 리디렉션 URI: `https://yezdalggrwjtjemkcehj.supabase.co/auth/v1/callback`
- Supabase Site URL: `https://teamgachi.pages.dev`
- Supabase Redirect URLs: `https://teamgachi.pages.dev/**` (이전 Netlify 주소는 전환 기간 동안 보조 주소로 유지)
- 2026-08-14: Supabase `Authentication → Sign In / Providers → Google`에 Client ID와 Client Secret을 안전하게 저장하고 provider 활성화를 완료했습니다.
