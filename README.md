# 시너지온 팀가치 프론트엔드

팀가치의 HTML/CSS/JavaScript 프론트엔드입니다. Supabase 프로젝트 `teamgachi`의 Auth·PostgreSQL·Realtime에 연결되어 있습니다.

## 실행

정적 파일 서버로 실행해야 JavaScript 모듈이 동작합니다.

```powershell
npx.cmd --yes serve .
```

## 현재 연결된 기능

- 이메일 회원가입·로그인·로그아웃
- 이메일 비밀번호 재설정
- Google 로그인 호출(사용 전 Supabase Provider 설정 필요)
- 팀 생성·선택
- 할 일 등록·완료·삭제 및 Realtime 갱신

`config.js`에는 브라우저용 Supabase Publishable Key만 들어 있습니다. DB 비밀번호, Secret Key, OpenAI API 키는 이 저장소에 넣지 않습니다.
