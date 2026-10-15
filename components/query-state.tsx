import {sharedClasses} from "@/lib/shared-classes";
import {Button} from "@/components/ui/button";
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
      <div className={sharedClasses.queryState} role="status">
        <span className={sharedClasses.spinner} />
        <strong>휴게소를 불러오는 중이에요</strong>
        <p>잠시만 기다려주세요.</p>
      </div>
    );
  if (error)
    return (
      <div className={sharedClasses.queryState} role="alert">
        <span className={sharedClasses.stateIcon}>
          <Icon name="info" size={24} />
        </span>
        <strong>휴게소를 불러오지 못했어요</strong>
        <p>{error}</p>
        <Button onClick={onRetry} variant="secondary">
          <Icon name="refresh" size={16} />
          다시 조회
        </Button>
      </div>
    );
  return (
    <div className={sharedClasses.queryState}>
      <span className={sharedClasses.stateIcon}>
        <Icon name="pin" size={24} />
      </span>
      <strong>등록된 휴게소가 없어요</strong>
      <p>조회된 휴게소 정보가 없습니다.</p>
    </div>
  );
}
