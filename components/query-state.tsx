import Icon from "./icon";

export default function QueryState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading)
    return (
      <div className="query-state" role="status">
        <span className="spinner" />
        <strong>휴게소를 불러오는 중이에요</strong>
        <p>잠시만 기다려주세요.</p>
      </div>
    );
  if (error)
    return (
      <div className="query-state" role="alert">
        <span className="state-icon">
          <Icon name="info" size={24} />
        </span>
        <strong>휴게소를 불러오지 못했어요</strong>
        <p>{error}</p>
        <button className="button secondary" onClick={onRetry}>
          <Icon name="refresh" size={16} />
          다시 조회
        </button>
      </div>
    );
  return (
    <div className="query-state">
      <span className="state-icon">
        <Icon name="pin" size={24} />
      </span>
      <strong>등록된 휴게소가 없어요</strong>
      <p>조회된 휴게소 정보가 없습니다.</p>
    </div>
  );
}
