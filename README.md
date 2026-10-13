# Cafe24 휴게소 지도 테스트

로컬 Next.js 서버가 Cafe24 MariaDB의 휴게소 정보를 조회하고 카카오맵에 표시합니다.
PC 관리자 화면과 모바일 사용자 화면은 별도 페이지이며 같은 조회 API를 사용합니다.

## 화면

- `/mobile`: 지도 전체 화면과 하단 목록·상세 패널. 마커 또는 목록을 선택하면 상세정보가 열립니다.
- `/admin`: 조회 전용 휴게소 표, 지도, 상세 패널. 좌표 상태와 조회 건수를 확인할 수 있습니다.
- `/`: `/mobile`로 이동합니다. 기기 자동 판별은 하지 않습니다.
- `/api/rest-areas`: DB 조회 결과를 JSON으로 반환하는 GET API입니다.

이번 범위에는 로그인, 수정, 삭제, 검색, 필터, 자동 새로고침이 없습니다.

## 환경변수

프로젝트 루트의 `.env.local`에 [.env.example](.env.example)의 항목을 설정하세요.
이미 `.env`에 설정되어 있다면 Next.js가 자동으로 읽습니다. `.env.local`이 더 높은 우선순위입니다.
비밀값이 있는 환경변수 파일은 Git에서 제외됩니다. 기존 설정 파일을 덮어쓰지 마세요.

| 환경변수 | 내용 |
| --- | --- |
| `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` | 카카오 JavaScript 키. REST API 키 또는 Admin 키가 아닙니다. |
| `DB_HOST` | Cafe24 DB 외부 접속 호스트 |
| `DB_PORT` | DB 포트. 기본값 3306 |
| `DB_USER` | DB 사용자 |
| `DB_PASSWORD` | DB 비밀번호 |
| `DB_NAME` | `test_lounge`가 있는 데이터베이스 이름 |
| `DB_SSL` | 신뢰 가능한 인증서로 TLS 접속을 지원할 때 `true`. 기본값 `false` |

카카오디벨로퍼스에서 카카오맵을 활성화하고 해당 JavaScript 키의 SDK 도메인에
`http://localhost:3000`을 등록하세요. `127.0.0.1`이나 다른 포트로 접속하면 해당 주소도 별도로 등록해야 합니다.
DB 외부 접속을 위해 Cafe24 MySQL 외부 IP 허용 목록에 현재 PC의 공인 IP를 등록해야 합니다.
환경변수를 변경하면 개발 서버를 재시작하세요.

- [카카오 Web SDK 가이드](https://apis.map.kakao.com/web/guide/)
- [카카오맵 활성화 안내](https://developers.kakao.com/docs/ko/kakaomap/common)
- [Cafe24 MySQL 외부 접속 안내](https://help.cafe24.com/faq/web-hosting/introduce/setup-management/webhosting_mysql_external_ip_access/)

## 실행

PowerShell에서 실행 정책에 막히지 않도록 `npm.cmd`를 사용합니다.

```powershell
npm.cmd run dev -- --hostname localhost --port 3000
```

- 모바일: http://localhost:3000/mobile
- PC 관리자: http://localhost:3000/admin

모바일 화면은 PC 브라우저에서도 최대 480px의 앱 화면으로 표시됩니다.
관리자 화면은 PC용 레이아웃으로 별도 구현했습니다.

## DB 읽기 제한

DB 코드는 `lib/db.ts`에만 있으며 `server-only` 모듈입니다.
브라우저에는 DB 접속 정보가 포함되지 않습니다.
실행하는 SQL은 `test_lounge`의 필요한 23개 컬럼을 읽는 고정 SELECT 한 개뿐입니다.
요청에서 SQL·테이블명·조건을 입력받지 않으며, 데이터 변경 SQL·마이그레이션·스키마 생성 코드가 없습니다.
첫 화면 진입과 명시적인 다시 조회/재시도에서만 조회합니다.
연결 풀은 최대 3개 연결과 제한된 대기열을 사용합니다.

조회 결과는 `lib/rest-areas.ts`에서 정규화합니다.

- DECIMAL 문자열을 숫자로 변환하고 위도·경도 범위를 검사합니다.
- 이 Cafe24 DB가 바이너리 메타데이터로 반환하는 UTF-8 텍스트는 앱에서 문자열로 변환합니다.
- 좌표가 없거나 올바르지 않은 행은 지도에서 제외하고 목록에서는 조회할 수 있습니다.
- 시설 값 `1`, `0`, `NULL`을 각각 있음, 없음, 미확인으로 구분합니다.
- 주차 대수 `0`을 유지하며 `NULL`은 정보 없음으로 표시합니다.
- 이름 등 DB 문자열은 React 텍스트 또는 `textContent`로 출력합니다.
- 연결 오류 시 샘플 데이터로 대체하지 않고 실제 오류 상태를 표시합니다.

## 검증

Node.js 24에서 추가 테스트 도구 없이 실행합니다.
테스트는 고정된 메모리 데이터와 카카오 SDK 대역을 사용하며 실제 DB에 접속하거나 쓰지 않습니다.

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

브라우저 수동 확인 시 다음을 점검하세요.

1. `/` 접속 시 `/mobile`로 이동하고 조회된 휴게소 마커가 나타나는지 확인합니다.
2. 모바일에서 목록 열기 → 휴게소 선택 → 상세 확인 → 목록 복귀 → 패널 접기를 확인합니다.
3. 지도 마커를 누르면 같은 휴게소의 상세가 열리고 선택 마커가 강조되는지 확인합니다.
4. 관리자 표와 지도에서 선택이 연동되고 상세정보의 12개 시설 값이 DB 값과 일치하는지 확인합니다.
5. 전체 보기와 확대·축소, 모바일 패널 전환 후 지도 크기와 중심이 정상인지 확인합니다.
6. 키 또는 DB 설정 오류 시 안내와 재시도가 표시되는지 확인합니다.

이번 실행에서는 실제 SELECT 조회로 휴게소 215개와 유효 좌표 215개를 확인했고, 카카오 SDK 요청이 HTTP 200을 반환했습니다.
브라우저 제어 기능이 제공되지 않아 실제 화면과 지도 클릭에 대한 시각 검증은 수행하지 못했습니다.
