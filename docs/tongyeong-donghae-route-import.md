# 통영대전선·동해선 선형 적재 및 노선명 통합

반영 시각: 2026-10-22T06:08:15.111Z

사용자가 제공한 GeoJSON을 기존 변환 도구로 검증한 뒤 경도·위도를 위도·경도로 변환하고 소수점 5자리로 저장했다. 끊어진 경로는 각각 유지했다. 통영대전선은 기존 대전통영선 행의 ID를 유지해 교체했다. 동해선(부산-포항)·동해선(삼척-속초)는 동해선으로 통일하며 API·CSV 재수집 및 조회에서도 같은 별칭을 적용한다. 울산포항선·포항영덕선은 이번 명칭 통합 대상에 포함하지 않았다.

```json
{
  "applied": true,
  "backupPath": ".rest-area-sync/highway-routes-backup-1792649294500.json",
  "imports": [
    {
      "id": 7,
      "routeName": "통영대전선",
      "routeNumber": 35,
      "file": "C:\\Users\\Administrator\\Downloads\\통영대전선.json",
      "sha256": "b7e7f2460436845adb219834bbfb00b5bbc1dce48ed19644d582fdeb79393c1a",
      "paths": 752,
      "points": 1808,
      "bounds": {
        "south": 34.8669,
        "west": 127.45253,
        "north": 36.34143,
        "east": 128.43946
      }
    },
    {
      "id": 8,
      "routeName": "동해선",
      "routeNumber": 65,
      "file": "C:\\Users\\Administrator\\Downloads\\동해선.json",
      "sha256": "07ac30f5034a7eaf2e51debf4e3e30b947c1115d7896548237fa399039fb7540",
      "paths": 12,
      "points": 554,
      "bounds": {
        "south": 35.17832,
        "west": 128.51818,
        "north": 38.20312,
        "east": 129.42715
      }
    }
  ],
  "updatedAreas": [
    {
      "id": 224,
      "name": "양양(속초 방향)",
      "before": "동해선(삼척-속초)",
      "after": "동해선"
    },
    {
      "id": 225,
      "name": "양양(동해 방향)",
      "before": "동해선(삼척-속초)",
      "after": "동해선"
    },
    {
      "id": 263,
      "name": "양북임시(상 방향)",
      "before": "동해선(부산-포항)",
      "after": "동해선"
    },
    {
      "id": 264,
      "name": "양북임시(하 방향)",
      "before": "동해선(부산-포항)",
      "after": "동해선"
    }
  ],
  "updatedStations": [],
  "restAreaTotal": 247
}
```

백업에는 변경 전 두 노선 선형과 노선명 수정 대상 휴게소·주유소를 저장했다. 사용자 제공 원본 파일은 변경하지 않았다.
