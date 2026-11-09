# 양북임시·부안 방향 보정

반영 시각: 2026-10-22T06:22:02.738Z

사용자 확인에 따라 양북임시 상→울산·하→포항, 부안 상→서울·하→목포로 보정했다. 이름, direction_label, route_direction을 변경하고 표준 코드·ID·좌표는 유지했다. 코드별 보정 및 기존 원천 이름 매핑으로 API·CSV 동기화 후에도 보정값을 유지한다.

```json
{
  "applied": true,
  "count": 4,
  "backupPath": ".rest-area-sync/rest-area-directions-backup-1792650122287.json",
  "changes": [
    {
      "id": 227,
      "code": "000376",
      "before": "부안상쉼터",
      "after": "부안쉼터(서울 방향)",
      "direction": "서울 방향"
    },
    {
      "id": 228,
      "code": "000377",
      "before": "부안하쉼터",
      "after": "부안쉼터(목포 방향)",
      "direction": "목포 방향"
    },
    {
      "id": 263,
      "code": "000501",
      "before": "양북임시(상 방향)",
      "after": "양북임시(울산 방향)",
      "direction": "울산 방향"
    },
    {
      "id": 264,
      "code": "000502",
      "before": "양북임시(하 방향)",
      "after": "양북임시(포항 방향)",
      "direction": "포항 방향"
    }
  ]
}
```
