export type ScreenRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

/** 검색·필터·슬라이드와 키보드가 차지하지 않는 화면 영역입니다. */
export function cardDisplayArea(
  canvas: ScreenRect,
  headerBottom: number,
  sheetTop: number,
  screen?: ScreenRect,
): ScreenRect {
  const left = Math.max(canvas.left, screen?.left ?? canvas.left);
  const right = Math.max(left, Math.min(canvas.right, screen?.right ?? canvas.right));
  const top = Math.max(canvas.top, headerBottom + 8, screen?.top ?? canvas.top);
  const bottom = Math.max(
    top,
    Math.min(canvas.bottom, sheetTop - 10, screen?.bottom ?? canvas.bottom),
  );
  return {left, right, top, bottom, width: right - left, height: bottom - top};
}

export function cardSizeLimit(view: ScreenRect, fixedHeight: number) {
  const width = Math.max(0, Math.min(280, view.width - 32));
  const height = Math.max(0, view.height - 16);
  return {width, height, hidden: width < 120 || height < fixedHeight + 24};
}

/** 지도 내부 안내와 범례를 피합니다. 관리자·모바일 모두 같은 기준을 사용합니다. */
export function mapCardOverlayArea(
  view: ScreenRect,
  topbar?: ScreenRect,
  legend?: ScreenRect,
): ScreenRect {
  const top = Math.max(view.top, topbar?.height ? topbar.bottom + 8 : view.top);
  const bottom = Math.max(
    top,
    Math.min(view.bottom, legend?.height ? legend.top - 8 : view.bottom),
  );
  // DOMRect의 속성은 프로토타입 getter라 스프레드로 복사되지 않으므로 명시적으로 지정합니다.
  return {left: view.left, right: view.right, width: view.width, top, bottom, height: bottom - top};
}

/** panBy는 카드가 벗어난 거리만 이동하며 줌과 검색 범위를 바꾸지 않습니다. */
export function cardPanOffset(box: ScreenRect, view: ScreenRect) {
  const left = view.left + 16,
    right = view.right - 16;
  const top = view.top + 8,
    bottom = view.bottom - 8;
  const x = box.left < left ? box.left - left : box.right > right ? box.right - right : 0;
  const y = box.top < top ? box.top - top : box.bottom > bottom ? box.bottom - bottom : 0;
  return {x, y};
}
