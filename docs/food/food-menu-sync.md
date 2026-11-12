# 휴게소 음식정보 동기화

## 현재 적재 결과

2026-11-12 한국시간 기준 설정된 DB를 읽기 전용으로 조회한 결과다. 동기화 후 수치는 바뀔 수 있다.

- `tb_food_menus`: 총 7,343개, 원천에 존재하고 화면 노출 대상인 메뉴 6,910개.
- `tb_food_area_mappings`: 원천 휴게소 코드 240개 중 214개 연결, 26개 미연결. 미연결 26개 중 21개는 서비스에서 제외한 민자 휴게소 코드이며, 나머지 5개는 확인이 필요하다.
- 마지막 음식 동기화 기록은 2026-11-12 04:00:09 한국시간 성공, 원천 7,295개다. 이 기록만으로 실행 주체가 Vercel Cron인지 확인할 수는 없다.
- 이름·노선·방향 비교가 필요한 항목은 [미해결 목록](../unresolved.md)에 기록했다.

## 데이터 정책

- 화면 음식 항목은 음식명, 가격, 추천 여부, 인기 여부만 사용한다.
- 메뉴 키는 `stdRestCd|seq`이며, 휴게소 코드는 문자열로 저장해 앞자리 0을 보존한다. 주유소 코드는 연결에 사용하지 않는다.
- `tb_lounge.lg_std_rest_cd`와 원본 코드가 일치하면 코드를 우선한다. 코드가 없는 DB 행에만 이름·노선·방향으로 보조 매칭하며, 원본 코드 그룹의 속성 충돌과 복수 후보는 검토 상태로 유지한다.
- 전체 페이지 수·건수·키 중복을 확인한 원본 스냅샷만 트랜잭션에 반영한다. 일부 페이지/API 실패나 DB 쓰기 실패는 기존 메뉴 스냅샷을 유지한다.
- 성공한 전체 스냅샷에서 사라진 메뉴는 삭제하지 않고 `source_present=false`, `missing_since`로 보존한 뒤 화면에서 숨긴다. `app=N`도 삭제하지 않는다.
- 중복 동기화는 원본 키의 upsert로 같은 행을 갱신한다. 동시 실행은 PostgreSQL advisory lock으로 직렬화한다.

## 데이터베이스 및 실행

테이블 준비와 최초 적재는 다음 명령을 사용한다.

```powershell
npm.cmd run db:setup-food-menus
npm.cmd run sync:food-menus
```

`db:setup-food-menus`는 Supabase PostgreSQL에 `tb_food_area_mappings`, `tb_food_menus`, `tb_food_menu_sync_runs`를 준비한다. `sync:food-menus`는 EX API의 모든 페이지를 검증한 뒤 한 번에 반영한다. 관리 화면과 같은 인증 세션으로 `POST /api/admin/food-menus/sync`를 호출해 수동 동기화할 수도 있다.

## 화면 및 일일 실행

- `/api/rest-areas`는 초기 조회에서 음식 메뉴를 집계하지 않는다. 휴게소 상세의 음식 탭을 열 때 메뉴를 별도로 조회한다.
- `/api/rest-areas/{id}/food-menus`는 해당 휴게소에 매핑된 노출 가능 메뉴명·가격·추천/인기 여부와 수집 정보를 반환한다. 공용 상세 음식 탭은 메뉴를 표시하고 로딩 중에는 스켈레톤을 보여준다.
- `vercel.json`은 매일 `18:00 UTC`(한국시간 다음 날 `03:00`) `/api/cron/food-menus`를 호출하도록 설정했다. Vercel Cron은 프로덕션 배포에 연결할 때 활성화된다.
- Vercel 프로덕션 환경변수에 `DATABASE_URL`, `EX_OPEN_API_KEY`, `CRON_SECRET`을 설정해야 한다. Cron 요청은 `Authorization: Bearer <CRON_SECRET>`으로 검증한다.

## 검증

- `tests/food-menu-source.test.mts`, `tests/food-menu-matching.test.mts`, `tests/food-menu-sync.test.mts`: 파싱, 앞자리 0, 누락 페이지, 방향·노선 엄격 매칭, 중복 타깃, 메뉴 변경/추가/누락, 원본/API 및 DB 쓰기 실패 롤백 검증.
- `e2e/kakao-map-zoom.spec.ts`: 모바일 상세 음식 탭의 독립 조회·로딩·메뉴·빈 상태를 검증.
- 이 검증은 `npm.cmd run e2e:food-menu`로 빌드부터 서버 종료까지 실행한다. Windows에서 별도 `next start` 자식 프로세스가 남지 않도록 실행 스크립트가 테스트 서버 프로세스 트리를 정리한다.
