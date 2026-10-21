# 휴게소 음식정보 동기화

## 현재 적재 결과

- 원본 전체 7,240개 메뉴를 `test_food_menus`에 적재했다. 복합 식별자(`stdRestCd|seq`) 7,240개가 모두 유일하다.
- `app=Y` 6,891개를 조회 대상으로 두고, `app=N` 349개는 DB에 보존하되 화면에서 제외한다.
- 이름·노선·방향이 모두 맞는 161개 원본 휴게소 코드를 `test_lounge.id` 161곳에 각각 연결했다.
- 나머지 79개 원본 휴게소는 자동 연결하지 않고 후보 휴게소 ID와 원본 정보를 `test_food_area_mappings`에 남긴다.
- 이름·노선·방향 비교가 필요한 항목은 [대조 보고서](./food-menu-rest-area-unmatched.md)에 기록했다.

## 데이터 정책

- 화면 음식 항목은 음식명, 가격, 추천 여부, 인기 여부만 사용한다.
- 메뉴 키는 `stdRestCd|seq`이며, 휴게소 코드는 문자열로 저장해 앞자리 0을 보존한다. 주유소 코드는 연결에 사용하지 않는다.
- 자동 매칭은 정규화한 휴게소명, 노선, 방향이 모두 일치하고 대상이 하나일 때만 수행한다. 방향 누락, 노선 불일치, 복수 후보는 미매칭/검토 상태로 유지한다.
- 전체 페이지 수·건수·키 중복을 확인한 원본 스냅샷만 트랜잭션에 반영한다. 일부 페이지/API 실패나 DB 쓰기 실패는 기존 메뉴 스냅샷을 유지한다.
- 성공한 전체 스냅샷에서 사라진 메뉴는 삭제하지 않고 `source_present=false`, `missing_since`로 보존한 뒤 화면에서 숨긴다. `app=N`도 삭제하지 않는다.
- 중복 동기화는 원본 키의 upsert로 같은 행을 갱신한다. 동시 실행은 PostgreSQL advisory lock으로 직렬화한다.

## 데이터베이스 및 실행

테이블 준비와 최초 적재는 다음 명령을 사용한다.

```powershell
npm.cmd run db:setup-food-menus
npm.cmd run sync:food-menus
```

`db:setup-food-menus`는 Supabase PostgreSQL에 `test_food_area_mappings`, `test_food_menus`, `test_food_menu_sync_runs`를 생성한다. `sync:food-menus`는 EX API의 모든 페이지를 검증한 뒤 한 번에 반영한다. 관리 화면과 같은 인증 세션으로 `POST /api/admin/food-menus/sync`를 호출해 수동 동기화할 수도 있다.

## 화면 및 일일 실행

- `/api/rest-areas`는 휴게소별 메뉴 수와 대표 메뉴 최대 2개를 포함한다. 인포윈도우는 대표 메뉴와 추천/인기 표시를 요약한다.
- `/api/rest-areas/{id}/food-menus`는 해당 휴게소에 매핑된 노출 가능 메뉴명·가격·추천/인기 여부·원본 수정일을 반환한다. PC와 모바일 공용 상세정보에서 목록과 기준일을 표시한다.
- `vercel.json`은 매일 `18:00 UTC`(한국시간 다음 날 `03:00`) `/api/cron/food-menus`를 호출하도록 설정했다. Vercel Cron은 프로덕션 배포에 연결할 때 활성화된다.
- Vercel 프로덕션 환경변수에 `DATABASE_URL`, `EX_OPEN_API_KEY`, `CRON_SECRET`을 설정해야 한다. Cron 요청은 `Authorization: Bearer <CRON_SECRET>`으로 검증한다.

## 검증

- `tests/food-menu-source.test.mts`, `tests/food-menu-matching.test.mts`, `tests/food-menu-sync.test.mts`: 파싱, 앞자리 0, 누락 페이지, 방향·노선 엄격 매칭, 중복 타깃, 메뉴 변경/추가/누락, 원본/API 및 DB 쓰기 실패 롤백 검증.
- `e2e/kakao-map-zoom.spec.ts`: 지도 인포윈도우 대표 메뉴·가격·배지와 상세 메뉴/기준일, 메뉴 없는 휴게소의 빈 상태를 모바일에서 검증.
- 이 검증은 `npm.cmd run e2e:food-menu`로 빌드부터 서버 종료까지 실행한다. Windows에서 별도 `next start` 자식 프로세스가 남지 않도록 실행 스크립트가 테스트 서버 프로세스 트리를 정리한다.
- 2026-10-21 Supabase 적재 후 DB에서 메뉴 총수/유일키/노출 수/매핑 수/동기화 성공 상태를 조회해 확인했다.
- 프로덕션 빌드와 실제 로컬 API를 확인했다. 휴게소 API 215곳, 샘플 휴게소 메뉴 53개 및 대표 메뉴 2개가 반환됐고, 기준일은 `YYYY-MM-DD` 형식이다.
