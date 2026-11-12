# MariaDB 비상 복구 지침

현재 기본 배포 대상은 Supabase PostgreSQL입니다. `DATABASE_URL`이 있는 현재 코드에서 Cafe24 MariaDB로 자동 전환하지 않으며, 이 문서는 Supabase 전환에 문제가 생겼을 때만 사용하는 별도 복구 절차입니다.

## 보존 기준

MariaDB 연결 구현 전체는 전환 직전 커밋 `5cadee1` (`feat: 관리자 지도 화면 개선`)에 보존되어 있습니다. 이 커밋에는 `lib/db.ts`, `lib/db-config.ts`, EX 동기화 CLI와 MariaDB용 환경 변수 구성이 모두 포함되어 있습니다. 현재 Supabase 전환 커밋은 이 이력과 별개로 유지합니다.

## 원칙

- 현재 Vercel 프로젝트에는 `DATABASE_URL`만 설정하고 `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`은 설정하지 않습니다.
- MariaDB 복구는 현재 Supabase 코드에 환경 변수 하나를 추가하는 방식으로 하지 않습니다. 반드시 `5cadee1`에서 분기한 별도 브랜치 또는 별도 Vercel 프로젝트에서만 검증합니다.
- Cafe24 MariaDB가 운영 DB라면, 확인 전에는 `ADMIN_PASSWORD`를 설정하지 않아 편집 API를 잠근 상태로 둡니다.
- EX 동기화 및 데이터 저장 CLI는 MariaDB 복구 환경에서 실행하지 않습니다. 이 명령들은 테이블 변경·삭제를 수행할 수 있습니다.

## Supabase 장애 시 복구 절차

1. Supabase 환경 변수 또는 스키마 문제인지 먼저 확인합니다. 이 단계에서는 MariaDB에 접속하지 않습니다.
2. 복구가 필요하면 작업 트리가 깨끗한 별도 디렉터리에서 전환 직전 상태를 분리합니다.

   ```powershell
   git worktree add ..\next-map-test-mariadb-fallback 5cadee1
   ```

3. 생성된 별도 작업 폴더에서만 필요한 UI 변경을 선별 적용하고, 별도 Vercel Preview 프로젝트에 배포합니다.
4. Preview에서 조회만 확인합니다. 운영 MariaDB를 사용한다면 `ADMIN_PASSWORD`를 비워두고, 저장·동기화 명령은 실행하지 않습니다.
5. 운영 전환이 불가피한 경우에는 데이터 백업·변경 범위·관리자 쓰기 권한을 별도로 승인한 뒤, 기존 Vercel 배포로 롤백하거나 별도 프로젝트를 승격합니다.

## MariaDB 전용 환경 변수

아래 값은 `5cadee1` 기반 복구 프로젝트에서만 사용합니다. 현재 Supabase 프로젝트나 저장소의 `.env.local`에는 넣지 않습니다.

```dotenv
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
DB_SSL=false
```

이 절차 자체는 MariaDB에 연결하거나 데이터를 변경하지 않습니다.
