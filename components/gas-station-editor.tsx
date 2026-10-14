"use client";
import {useState} from "react";
import {stationFields, stationServices, type GasStationRecord} from "@/lib/gas-stations";
import {
  createStationDraft,
  stationDraftDirty,
  stationRequestFromDraft,
  type StationDraft,
} from "@/lib/gas-station-editor";

export default function GasStationEditor({
  original,
  authenticated,
  onCancel,
  onSaved,
  onExpired,
  onBusy,
  onDirty,
}: {
  original: GasStationRecord;
  authenticated: boolean;
  onCancel: () => void;
  onSaved: (record: GasStationRecord) => void;
  onExpired: () => void;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => createStationDraft(original));
  const [error, setError] = useState<string | null>(null),
    [saving, setSaving] = useState(false);
  const dirty = stationDraftDirty(original, draft);
  const change = (next: StationDraft) => {
    setDraft(next);
    onDirty(stationDraftDirty(original, next));
  };
  return (
    <form
      className="editor-panel"
      onKeyDown={event => {
        if (
          event.key === "Enter" &&
          !event.nativeEvent.isComposing &&
          event.target instanceof HTMLInputElement
        )
          event.preventDefault();
      }}
      onSubmit={async event => {
        event.preventDefault();
        if (saving || !authenticated || !dirty) return;
        const request = stationRequestFromDraft(original, original.revision, draft);
        if (!request.ok) {
          setError(request.error.message);
          return;
        }
        setSaving(true);
        onBusy(true);
        setError(null);
        try {
          const response = await globalThis.fetch(`/api/admin/gas-stations/${original.id}`, {
            method: "PATCH",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(request.value),
          });
          const body = await response.json();
          if (response.status === 401) onExpired();
          if (!response.ok)
            throw new Error(body.error?.message || "저장하지 못했습니다. 초안은 유지됩니다.");
          onSaved(body.item);
        } catch (reason) {
          setError(
            reason instanceof Error ? reason.message : "저장하지 못했습니다. 초안은 유지됩니다.",
          );
        } finally {
          setSaving(false);
          onBusy(false);
        }
      }}
    >
      <div className="editor-heading">
        <div>
          <span className="eyebrow">GS 코드 {original.siteCode}</span>
          <h2>주유소 정보 수정</h2>
        </div>
        <span className="edit-status">{dirty ? "미저장 변경" : "변경 없음"}</span>
      </div>
      <div className="editor-scroll">
        {!authenticated && (
          <p className="form-error" role="alert">
            관리자 인증 후 저장해주세요. 입력 초안은 유지됩니다.
          </p>
        )}
        <fieldset disabled={saving}>
          <legend>기본정보</legend>
          <div className="editor-grid">
            {stationFields.map(field => (
              <label
                key={field.key}
                className={
                  draft.values[field.key] !==
                  (original[field.key] === null ? "" : String(original[field.key]))
                    ? "field-changed"
                    : ""
                }
              >
                <span>{field.label}</span>
                <input
                  value={draft.values[field.key]}
                  inputMode={
                    field.kind === "coordinate"
                      ? "decimal"
                      : field.kind === "time"
                        ? "numeric"
                        : undefined
                  }
                  maxLength={field.kind === "coordinate" ? 24 : field.maxLength}
                  placeholder={
                    field.kind === "time"
                      ? "HHmm (예: 0900)"
                      : "required" in field
                        ? "필수"
                        : "미등록"
                  }
                  onChange={event =>
                    change({
                      ...draft,
                      values: {...draft.values, [field.key]: event.target.value},
                    })
                  }
                />
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset disabled={saving}>
          <legend>시설·서비스</legend>
          <div className="editor-grid">
            {stationServices.map(({key, label}) => (
              <label key={key}>
                <span>{label}</span>
                <select
                  value={
                    draft.services[key] === null
                      ? "unknown"
                      : draft.services[key]
                        ? "present"
                        : "absent"
                  }
                  onChange={event =>
                    change({
                      ...draft,
                      services: {
                        ...draft.services,
                        [key]:
                          event.target.value === "unknown"
                            ? null
                            : event.target.value === "present",
                      },
                    })
                  }
                >
                  <option value="unknown">미확인</option>
                  <option value="present">있음</option>
                  <option value="absent">없음</option>
                </select>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="coordinate-note">
          좌표는 소수점 10자리까지 저장합니다. 식별자·내부 코드·결제 항목은 읽기 전용입니다.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="editor-actions">
        <button type="button" className="button secondary" disabled={saving} onClick={onCancel}>
          취소
        </button>
        <button
          type="submit"
          className="button primary"
          disabled={saving || !authenticated || !dirty}
        >
          {saving ? "저장 중" : "변경사항 저장"}
        </button>
      </div>
    </form>
  );
}
