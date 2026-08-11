# 시너지온 | 팀가치 (TeamGachi)

팀 프로젝트에 필요한 **할 일, 일정, 채팅, 자료 공유, 업무 진척도**를 하나의 웹에서 관리하고, AI가 할 일의 우선순위 추천과 채팅 요약을 보조하는 팀 협업 서비스입니다.


## 팀원 및 역할

| 팀원 | 담당 |
| --- | --- |
| 박서아 | 기획·디자인·프로젝트 총괄(PM) |
| 이시윤 | 프론트엔드 |
| 함서희 | 백엔드·DB·AI 연동·배포 |


## 기술 스택

| 구분 | 기술 |
| --- | --- |
| 웹 프론트엔드 | HTML, CSS, JavaScript |
| 백엔드·DB | Supabase, PostgreSQL |
| 인증 | Supabase Auth |
| 실시간 기능 | Supabase Realtime |
| 파일 저장 | Supabase Storage |
| AI 기능 | Supabase Edge Functions, OpenAI API |
| 웹 배포 | Netlify |
| 협업 | GitHub, Figma |

기존 NestJS·Prisma 구현은 `backend/`에 참고용으로 보존되어 있지만, 현재 서비스의 주 백엔드는 Supabase입니다.

## 현재 구현 상태

### 프론트엔드

- [x] 로그인 화면
- [x] 회원가입 화면
- [x] 이메일·비밀번호 Supabase Auth 연결
- [x] Google 로그인 호출 코드 작성
- [x] Netlify 자동 배포
- [x] `/` 접속 시 `/login.html`로 이동
- [ ] Google OAuth 공급자 설정 및 실제 로그인 검증
- [ ] 로그인 이후 서비스 화면
- [ ] 대시보드·팀·할 일·채팅·자료함 등 나머지 UI

로그인 성공 후에는 아직 이동할 서비스 화면이 없으므로 현재 화면에 성공 메시지만 표시합니다.

### 백엔드

- [x] Supabase 클라우드 프로젝트 생성 및 로컬 CLI 연결
- [x] 사용자·팀·할 일·일정·메시지·파일·공지·타이머·진척도 데이터 구조 작성
- [x] DB 마이그레이션 배포
- [x] Row Level Security(RLS) 정책 적용
- [x] 회원가입 시 프로필을 생성하는 Auth 트리거
- [x] Realtime 대상 테이블 설정
- [x] Storage 버킷 및 접근 정책 작성
- [x] 채팅 요약 Edge Function 배포
- [x] 할 일 우선순위 추천 Edge Function 배포
- [ ] `OPENAI_API_KEY` 등록 후 AI 실제 호출 검증
- [ ] 프론트엔드 기능 확장에 맞춘 통합 테스트

## 배포 주소

- 웹: <https://teamgachi-2026.netlify.app>
- 로그인: <https://teamgachi-2026.netlify.app/login.html>
- 회원가입: <https://teamgachi-2026.netlify.app/signup.html>
- 팀 저장소: <https://github.com/gkatjgml3/teamgachi>

실제 원본 코드는 `teamgachi` 저장소에서 관리합니다. 현재 Netlify는 기존 `teamgachi-frontend` 저장소를 임시 배포 미러로 사용하고 있습니다.

## 저장소 구조

```text
teamgachi/
├─ web/                         # 로그인·회원가입 웹 화면
│  ├─ index.html               # 로그인 화면으로 이동
│  ├─ login.html
│  ├─ signup.html
│  ├─ auth.js                  # Supabase Auth 호출
│  ├─ supabase-client.js       # 브라우저용 Supabase 클라이언트
│  ├─ config.js                # Project URL과 Publishable Key
│  └─ style.css
├─ supabase/
│  ├─ migrations/              # 테이블·트리거·RLS·Realtime·Storage
│  ├─ functions/               # AI Edge Functions
│  ├─ tests/                   # RLS 확인용 SQL
│  └─ seed.sql
├─ docs/
│  └─ frontend-supabase-contract.md
├─ backend/                    # 이전 NestJS 구현(참고용)
├─ netlify.toml                # web/ 정적 배포 설정
└─ package.json                # Supabase CLI 명령
```

## 로컬에서 웹 화면 실행

저장소 루트에서 다음 명령을 실행합니다.

```powershell
npx.cmd --yes serve web --listen 4174
```

브라우저에서 <http://localhost:4174>에 접속하면 로그인 화면이 열립니다.

## Supabase 작업 명령

처음 한 번 의존성을 설치합니다.

```powershell
npm.cmd install
```

클라우드 프로젝트 연결과 DB 반영:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref yezdalggrwjtjemkcehj
npm.cmd run db:push
```

AI 비밀키 등록과 Edge Function 배포:

```powershell
npx.cmd supabase secrets set OPENAI_API_KEY=실제키 OPENAI_MODEL=gpt-5.6-luna
npm.cmd run functions:deploy:summary
npm.cmd run functions:deploy:priority
```

## 보안 원칙

- `web/config.js`에는 브라우저용 **Project URL과 Publishable Key**만 둡니다.
- Supabase Secret Key와 OpenAI API Key는 HTML·JavaScript·GitHub에 올리지 않습니다.
- OpenAI API Key는 Supabase Secret으로만 저장합니다.
- 브라우저에서 DB를 호출하더라도 RLS 정책으로 사용자·팀별 데이터를 분리합니다.
- `.env` 파일과 로컬 비밀정보는 커밋하지 않습니다.

## 다음 개발 순서

1. 로그인·회원가입 실제 사용자 흐름 테스트
2. 이메일 인증과 Google OAuth 설정 확인
3. 프론트엔드 담당자가 다음 화면 범위를 확정
4. 확정된 화면부터 Supabase 데이터 연결
5. Realtime 채팅과 Storage 자료함 연결
6. AI 채팅 요약·우선순위 추천 실제 호출 테스트

기능을 한꺼번에 늘리지 않고 **화면 → 저장 → 표시 → 수정·삭제 → 오류 처리** 순서로 하나씩 완성합니다.
