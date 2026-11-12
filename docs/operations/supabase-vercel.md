# Vercel용 Supabase PostgreSQL 설정

현재 배포 경로는 Cafe24 MariaDB를 사용하지 않습니다. 서버와 EX 동기화 CLI는 `DATABASE_URL`로 Supabase PostgreSQL에만 연결합니다.

Vercel의 Production·Preview·Development 환경에 다음 값을 설정합니다.

```dotenv
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres?sslmode=require
NEXT_PUBLIC_KAKAO_MAP_APP_KEY=
KAKAO_REST_API_KEY=
EX_OPEN_API_KEY=
CRON_SECRET=
ADMIN_PASSWORD=
```

`DATABASE_URL`에는 Supabase Dashboard의 **Connect → Transaction pooler** 연결 문자열을 넣습니다. `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`은 이 프로젝트의 Vercel 환경 변수에 설정하지 않습니다.

로컬 EX 동기화는 다음처럼 실행합니다.

```powershell
npm.cmd run sync:ex-stations
```

전체 동기화는 Supabase의 `tb_ex_station_geocodes`를 갱신하며 수동 주소 매핑 테이블을 조회합니다.

## 주유소 가격 자동 갱신

`vercel.json`의 `/api/cron/ex-station-prices`는 매일 UTC 19시(한국시간 다음 날 오전 4시)에 실행됩니다. Hobby 플랜에서는 해당 시간대 안에서 실행 시각이 달라질 수 있습니다. 음식정보 Cron과 동일한 Production `CRON_SECRET`을 사용하며, `DATABASE_URL`과 `EX_OPEN_API_KEY`도 필요합니다.

주유소 현황 API의 모든 페이지를 검증한 후, 원천 키가 일치하는 `tb_ex_station_geocodes`의 휘발유·경유·LPG 가격과 수집 시각을 하나의 트랜잭션으로 갱신합니다. 기존 좌표·지오코딩·주유소 ID는 보존하며 Kakao API를 호출하지 않습니다. 원천에서 미제공한 유종 가격은 `NULL`로 반영해 오래된 가격이 최신 가격처럼 표시되지 않게 합니다.

API 실패·페이지 누락·빈 목록·중복 코드·DB 오류가 발생하면 기존 가격을 유지합니다. 동시 실행은 PostgreSQL 트랜잭션 잠금으로 차단하고, 더 최근에 갱신된 행에는 오래된 요청이 덮어쓰지 못하도록 수집 시각을 비교합니다. 신규 또는 코드가 변경된 주유소는 `unmatchedCount`로 보고하며, 신규 등록·주소 변경 처리는 기존 `sync:ex-stations` 전체 동기화를 사용합니다.

수동 가격 갱신:

```powershell
npm.cmd run sync:ex-station-prices
```

Production 배포 후 **Settings → Cron Jobs**에서 위 경로가 등록됐는지 확인하고 **Run → View Logs**에서 성공 여부를 확인합니다. 성공 로그에는 `synchronizedAt`, `sourceCount`, `updatedCount`, `unmatchedCount`, `newerSnapshotCount`가 기록됩니다. 인증 없는 직접 호출은 401로 거절됩니다. 코드만 변경한 상태에서는 배포된 예약이 바뀌지 않습니다.

검증 명령: `node --test tests/ex-station-price-sync.test.mts tests/ex-station-price-cron.test.mts tests/ex-station-status.test.mts`. 배포와 예약 실행 확인은 [미해결 목록](../unresolved.md)을 참고합니다.
