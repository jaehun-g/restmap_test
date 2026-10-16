# Vercel용 Supabase PostgreSQL 설정

현재 배포 경로는 Cafe24 MariaDB를 사용하지 않습니다. 서버와 EX 동기화 CLI는 `DATABASE_URL`로 Supabase PostgreSQL에만 연결합니다.

Vercel의 Production·Preview·Development 환경에 다음 값을 설정합니다.

```dotenv
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres?sslmode=require
NEXT_PUBLIC_KAKAO_MAP_APP_KEY=
KAKAO_REST_API_KEY=
EX_OPEN_API_KEY=
ADMIN_PASSWORD=
```

`DATABASE_URL`에는 Supabase Dashboard의 **Connect → Transaction pooler** 연결 문자열을 넣습니다. `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`은 이 프로젝트의 Vercel 환경 변수에 설정하지 않습니다.

로컬 EX 동기화는 다음처럼 실행합니다.

```powershell
npm.cmd run sync:ex-stations
```

동기화는 Supabase의 `test_ex_station_geocodes`만 upsert·삭제하며 다른 테이블에는 쓰지 않습니다.
