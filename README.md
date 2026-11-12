# 휴게소·주유소 지도

Next.js와 Supabase PostgreSQL을 사용해 휴게소와 고속도로 주유소를 카카오맵에 표시합니다. 모바일 사용자는 지도·노선·편의시설 검색과 상세 정보를 이용하고, 관리자는 목록을 조회하고 인증 후 정보를 수정할 수 있습니다.

- `/mobile`: 지도, 검색·필터, 목록과 상세 바텀시트
- `/admin`: 관리자 지도·목록·상세 및 인증 후 편집
- `/`: `/mobile`로 이동
- 주요 스택: TypeScript, Next.js, React, Tailwind CSS, Supabase PostgreSQL

## 협업 시작

1. GitHub 저장소 접근 권한을 받은 뒤 복제하고 기준 브랜치를 확인합니다.
2. Supabase 프로젝트 접근 권한을 받고, 가능하면 **운영 DB와 분리된 개발용 DB**를 사용합니다. GitHub 초대와 Supabase 초대는 별도입니다.
3. Node.js 24 환경에서 의존성을 설치합니다. 이 저장소의 단위 테스트는 Node.js의 TypeScript 실행 기능을 사용합니다.

   ```powershell
   npm.cmd ci
   ```

4. `.env.example`을 참고해 저장소 루트에 `.env.local`을 만들고 필요한 값을 설정합니다. 기존 파일이 있다면 덮어쓰지 마세요.
5. 카카오 개발자 콘솔에서 사용할 JavaScript 키에 카카오맵을 활성화하고 실제 접속 도메인(예: `http://localhost:3000`)을 등록합니다. `127.0.0.1`, 다른 포트 또는 휴대폰 접속 주소는 별도 등록이 필요할 수 있습니다.
6. 개발 서버를 실행합니다. PowerShell에서 실행 정책 오류가 발생할 수 있어 예시는 `npm.cmd`를 사용합니다.

   ```powershell
   npm.cmd run dev -- --hostname localhost --port 3000
   ```

   - 모바일: http://localhost:3000/mobile
   - 관리자: http://localhost:3000/admin

협업자는 [AGENTS.md](AGENTS.md)와 [미해결 목록](docs/unresolved.md)을 먼저 확인하세요. [완료된 데이터 보정 요약](docs/rest-area/data-correction-history.md)과 [디자인 시스템](docs/design-system.md)도 참고할 수 있습니다.

## 환경변수와 접근 권한

[.env.example](.env.example)은 변수 이름만 제공하며 실제 키나 DB 데이터는 포함하지 않습니다. 실행하려는 기능에 필요한 값을 프로젝트 담당자에게 안전한 방법으로 받으세요.

| 변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | 서버의 Supabase PostgreSQL 연결 문자열. 지도 데이터 조회에 필요합니다. 프로젝트 설정은 Transaction pooler를 사용합니다. |
| `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` | 브라우저에 공개되는 카카오 JavaScript 키. 지도 표시에 필요하며 REST API 키와 다릅니다. |
| `KAKAO_REST_API_KEY` | 주소 검색·지오코딩에 사용하는 서버 전용 키. 관련 동기화 작업에 필요합니다. |
| `EX_OPEN_API_KEY` | 한국도로공사 데이터 수집·동기화에 사용하는 서버 전용 키입니다. |
| `ADMIN_PASSWORD` | 관리자 편집 인증 암호. 비워 두면 편집을 잠근 상태로 조회할 수 있습니다. |
| `CRON_SECRET` | 예약 동기화 API 요청을 인증하는 서버 전용 값입니다. |

`DATABASE_URL`에는 DB 계정 권한이 포함됩니다. Supabase 멤버 역할과 DB 연결 계정 권한을 각각 확인하고, 운영 DB 비밀번호·API 키·`.env.local`은 커밋하지 마세요. GitHub, Supabase, 카카오 개발자 계정의 접근 권한은 서로 별개입니다.

`.env.local`, `work-log/`, `food-award-photos/`, `bug.md`, 로그, 로컬 보고서와 빌드 결과물은 Git 제외 대상입니다. 따라서 원본 사진이나 별도로 관리하는 작업일지가 필요하면 프로젝트 담당자에게 요청하세요.

## 주요 동작

- 모바일은 노선·방향·편의시설 필터, 주유소만 보기와 라운지 토글을 제공합니다. 필터 시트와 상세 시트는 스와이프로 확장·축소할 수 있습니다.
- 지도 마커나 목록에서 휴게소·주유소 상세를 열 수 있습니다. 휴게소 상세의 시설·음식·주유 탭은 관련 정보를 표시하며, 음식 메뉴는 탭을 열 때 별도로 조회합니다.
- 위치 권한을 허용하면 현재 위치 기준 반경 검색을 사용합니다. 최초 반경은 15km이며 지도 줌에 따라 변경됩니다. 지도 내 재검색은 보이는 지도 영역을 기준으로 합니다.
- 노선 선택 시 해당 노선의 선형과 결과를 표시합니다. 노선 주변 주유소는 선형과의 직선거리 2km 조건으로 조회하며 실제 진입 가능 여부를 뜻하지 않습니다.
- 좌표가 없거나 올바르지 않은 시설은 지도 마커에서 제외될 수 있습니다. 위치 권한을 거부해도 전체 조회와 지도 내 재검색을 사용할 수 있습니다.
- 브라우저 위치 API는 보안 연결이 필요합니다. `localhost`는 개발 예외지만 휴대폰에서 `http://PC의내부IP:3000`으로 접속하면 위치 조회가 제한될 수 있습니다.

## 데이터와 변경 작업

앱은 서버에서 `DATABASE_URL`로 Supabase PostgreSQL에 접속합니다. 주요 테이블은 `tb_lounge`, `tb_ex_station_geocodes`, `tb_highway_routes`, `tb_food_area_mappings`, `tb_food_menus`입니다. 필요한 스키마와 데이터가 준비된 DB를 사용해야 합니다. 조회 오류를 샘플 데이터로 대체하지 않습니다.

관리자 편집 API는 인증과 동일 출처를 확인하고, 저장 시 revision을 비교해 충돌을 방지합니다. 화면에서의 저장뿐 아니라 일부 동기화·DB 스크립트도 실제 데이터를 변경할 수 있습니다. **DB 주소와 실행 명령의 적용 범위를 확인하기 전에는 운영 데이터에 실행하지 마세요.**

특히 다음 명령은 DB에 쓰기를 수행합니다.

```powershell
npm.cmd run sync:ex-stations
npm.cmd run sync:ex-station-prices
npm.cmd run sync:food-menus
```

휴게소 동기화는 `--apply`를 명시할 때 DB를 변경합니다. 자세한 절차와 보고서 위치는 [휴게소 동기화](docs/rest-area/rest-area-sync.md), [음식정보 동기화](docs/food/food-menu-sync.md), [Supabase·Vercel 설정](docs/operations/supabase-vercel.md)을 참고하세요.

`vercel.json`에는 음식정보 `18:00 UTC`, 주유소 가격 `19:00 UTC`의 일일 Cron이 설정되어 있습니다. 실제 배포 및 실행 상태는 Vercel에서 별도로 확인해야 합니다.

## 관련 API

| 경로 | 역할 |
| --- | --- |
| `GET /api/rest-areas` | 휴게소 목록 조회 |
| `GET /api/gas-stations` | 주유소 목록과 선택 조건 조회 |
| `GET /api/highway-routes?routeName=경부선` | 선택 노선의 경로 조회 |
| `GET /api/map-detail?kind=rest&id=1` | 모바일 상세에 필요한 단일 시설 조회 |
| `GET /api/rest-areas/{id}/food-menus` | 해당 휴게소의 음식 메뉴 조회 |
| `/api/admin/session` 및 `/api/admin/*` | 관리자 인증·저장 및 수동 동기화 |
| `/api/cron/*` | 시크릿으로 보호된 예약 동기화 |

## 검증

작업할 때는 변경과 관련된 테스트만 선택해 실행합니다. 예를 들어 음식 메뉴 작업은 다음처럼 확인할 수 있습니다.

```powershell
node --test tests/food-menu-matching.test.mts tests/food-menu-sync.test.mts
npm.cmd run lint
npm.cmd run build
```

전체 테스트 명령은 `npm.cmd test`이지만, 작업마다 전체 테스트를 실행하지 않습니다. 브라우저 테스트는 관련 시나리오만 선택하고 DB·외부 API를 실제로 사용하는 테스트인지 먼저 확인하세요. 현재 알려진 테스트 및 데이터 확인 사항은 [미해결 목록](docs/unresolved.md)을 참고합니다.

## 추가 문서

- [휴게소 동기화](docs/rest-area/rest-area-sync.md)
- [음식정보 동기화](docs/food/food-menu-sync.md)
- [Supabase·Vercel 설정](docs/operations/supabase-vercel.md)
- [MariaDB 비상 복구 지침](docs/operations/mariadb-fallback.md)
- [디자인 시스템](docs/design-system.md)
