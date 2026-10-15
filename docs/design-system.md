# 디자인 시스템

모바일 지도와 관리자 화면은 같은 색상 토큰과 네이티브 UI 컴포넌트를 사용합니다. 기존 Tailwind CSS 4와 Turbopack 연결을 활용하며 새 패키지는 추가하지 않습니다.

## 파일과 책임

| 위치                    | 책임                                                             |
| ----------------------- | ---------------------------------------------------------------- |
| `styles/tokens.css`     | 색상·폰트의 단일 정의. Tailwind `@theme`와 기존 CSS 변수 별칭    |
| `lib/design-system.ts`  | 버튼·입력·배지 변형 및 클래스 조합                               |
| `components/ui/`        | `Button`, `IconButton`, `Input`, `Select`, `Badge`, `FilterChip` |
| `lib/shared-classes.ts` | 상세 패널, 필터 슬라이드, 편집 폼, 지도 버튼의 공통 레이아웃     |
| `styles/base.css`       | base 레이어의 기본 요소·포커스·터치 설정                         |
| `styles/map.css`        | 지도와 장소 상세의 하위 요소 스타일                              |
| `styles/mobile.css`     | 모바일 지도·슬라이드·안전 영역                                   |
| `styles/workspace.css`  | 관리자·필터의 상태/하위 선택자와 SDK가 생성하는 지도 카드        |
| `app/globals.css`       | 스타일 진입점과 Tailwind 소스 범위                               |

화면별 배치는 JSX의 정적인 Tailwind 클래스로 작성합니다. 반복되는 배치는 `sharedClasses`를 사용합니다. 복잡한 하위 선택자와 상태 선택자는 `@apply`로 유지합니다. CSS 카스케이드에 의존하는 상태를 상충하는 유틸리티로 중복 선언하지 않습니다.

카카오 SDK의 DOM 카드는 React 밖에서 생성됩니다. 해당 클래스와 선택자는 카드 크기 측정·스크롤·클릭 처리에도 쓰이므로 이름을 변경할 때 관련 `lib/map-card*`, `lib/cluster-popover`, 마커 레이어를 함께 확인해야 합니다. 카드 위치와 크기는 기존 지도 로직이 관리합니다.

## 토큰

색상을 바꿀 때는 `styles/tokens.css`를 수정합니다.

- `primary`, `primary-dark`, `primary-soft`: 주 행동과 선택 상태
- `ink`, `muted`, `line`, `surface`: 본문, 보조 정보, 경계, 배경
- `station`, `station-soft`: 주유소
- `lounge`, `lounge-soft`: 화물차 라운지
- `font-sans`: 공통 글꼴

`bg-primary`, `text-muted`, `border-line`처럼 사용합니다. 기존 `--blue`, `--line` 등은 이 토큰의 별칭으로 연결됩니다. 지도·목록의 세부 보조색과 정확한 픽셀 치수는 기존 표현을 유지하기 위해 임의 값 유틸리티를 허용합니다.

## 컴포넌트 사용

```tsx
import {Button, IconButton} from "@/components/ui/button";
import {Input, Select} from "@/components/ui/field";
import {Badge} from "@/components/ui/badge";
import {FilterChip} from "@/components/ui/filter-chip";

<Button type="submit" variant="primary" disabled={saving}>저장</Button>
<IconButton type="button" aria-label="닫기" onClick={onClose}>…</IconButton>
<Input name="name" value={name} onChange={onNameChange} required />
<Select name="route" value={route} onChange={onRouteChange}>…</Select>
<Badge variant="route">50</Badge>
<FilterChip active={selected} aria-expanded={open} onClick={onOpen}>노선</FilterChip>
```

- `Button`: `primary`, `secondary`(기본), `ghost`.
- `Input`, `Select`: `default`, `search`. 네이티브 입력·선택 동작을 유지합니다.
- `Badge`: `neutral`, `primary`, `station`, `lounge`, `route`.
- `FilterChip`: `default`, `lounge`. `active`는 선택된 조건을 표현합니다. 펼침 상태는 `aria-expanded`, 토글은 `aria-pressed`를 호출부에서 전달합니다.
- `IconButton`: `aria-label`을 필수로 받습니다.
- 기본 네이티브 속성, 이벤트, React 19의 `ref`를 전달합니다. 버튼의 기본 `type`을 변경하지 않으므로 새 폼에서는 제출 버튼과 일반 동작에 `type`을 명시하세요.
- 링크를 버튼처럼 표시할 때는 `buttonClasses()`를 `Link`나 `a`에 사용합니다.

`cn()`은 조건에 따라 문자열을 합치는 함수이며 충돌하는 Tailwind 클래스를 제거하지 않습니다. 같은 속성의 기본값과 변형을 함께 붙이면 클래스 작성 순서와 다른 결과가 나올 수 있습니다. 변형 함수에서 하나만 선택하거나 명시적인 상태 선택자를 사용하세요. Tailwind가 찾을 수 있도록 클래스 이름을 문자열로 완성해서 작성합니다.

## shadcn/ui 판단

이번 범위에는 도입하지 않습니다. 현재 공통 UI는 네이티브 버튼·입력·선택과 프로젝트 전용 지도 카드입니다. 기존 슬라이드는 선택 해제·포커스 복귀·Escape·지도 표시 영역 계산과 연결되어 있어 새 Dialog/Select로 교체하는 작업이 추가됩니다.

| 항목           | 현재 공통 컴포넌트                                | shadcn/ui 도입 시                                                                                    |
| -------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 도입 필요성    | 기존 React·네이티브 요소로 현재 요구를 충족       | 복잡한 Dialog, Popover, Combobox가 여러 화면에 필요할 때 이점                                        |
| 용량·실행 비용 | 추가 의존성 0개. 작은 래퍼와 정적 Tailwind CSS    | 선택한 registry 항목에 따라 스타일 조합·headless UI 의존성 추가. 실제 번들 변화는 도입안별 측정 필요 |
| 유지보수       | 현재 코드와 기존 테스트가 책임 범위               | 복사한 컴포넌트 코드를 프로젝트에서 관리하고 upstream 수정도 검토해야 함                             |
| 대안 비용      | 네이티브 속성 전달·공통 스타일을 최소 래퍼로 구현 | 복잡한 접근성 상호작용을 직접 구현하는 비용을 줄일 수 있음                                           |
| 이번 득실      | 기존 지도 동작을 유지하면서 중복 스타일 정리      | 현재 단순 컨트롤에는 전환 비용이 절감 효과보다 큼                                                    |

shadcn/ui는 완성된 컴포넌트 코드를 배포하는 방식입니다. 일괄 설치를 전제하지 않습니다. 추후 후보가 생기면 해당 항목의 Base/Radix 구현, 실제 추가 의존성과 하위 의존성, tree shaking 및 번들 측정, 릴리스·유지보수 상태를 검토한 뒤 도입을 제안합니다. 이번에는 추가할 라이브러리가 없어 해당 패키지의 크기나 업데이트 주기를 추정하지 않습니다.

- [Tailwind theme 변수](https://tailwindcss.com/docs/theme)
- [Tailwind directives](https://tailwindcss.com/docs/functions-and-directives)
- [shadcn/ui 배포 방식](https://ui.shadcn.com/docs)
- [Button registry 예시](https://ui.shadcn.com/r/styles/new-york/button.json)

## 검증

`npm test`, `npm run lint`, `npm run build`를 실행합니다. `tests/design-system.test.mts`는 실제 앱 소스 검색과 Tailwind 컴파일로 생성된 CSS를 확인하고, 이전 스타일의 사용 중인 111개 표현·647개 선언을 비교합니다. 같은 클래스에 여러 번 선언된 스타일은 원래 순서대로 병합한 기준을 사용합니다. 사용되지 않는 이전 클래스는 기준에서 제외했습니다.

공통 컨트롤의 네이티브 폼 속성·암묵적 제출·접근성 속성·선택 상태는 서버 렌더링으로 검증합니다. 기존 지도·필터·카드 테스트도 유지합니다. 이 검증은 실제 브라우저의 픽셀·SDK 배치를 대신하지 않습니다. 모바일 320/375/430px·가로 화면에서 검색, 필터 시트, 라운지, 카드/더보기/뒤로가기와 관리자 표·편집 폼은 별도 화면 확인 대상입니다.
