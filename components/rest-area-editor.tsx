"use client";
import {sharedClasses} from "@/lib/shared-classes";
import {Input, Select} from "@/components/ui/field";
import {Button} from "@/components/ui/button";
import {useState} from "react";
import {scalarFields, type ScalarKey} from "@/lib/rest-area-fields";
import {facilityDefinitions, type RestAreaRecord} from "@/lib/rest-areas";
import {editorIsDirty, requestFromDraft, type EditorDraft} from "@/lib/rest-area-editor";
import Icon from "./icon";
const groups: {
  label: string;
  fields: ScalarKey[];
}[] = [
  {label: "기본정보", fields: ["name", "phone", "restAreaType"]},
  {
    label: "노선정보",
    fields: ["routeName", "routeNumber", "routeDirection", "directionLabel"],
  },
  {label: "좌표", fields: ["latitude", "longitude"]},
  {label: "주차", fields: ["parkingCount"]},
];
export default function RestAreaEditor({
  original,
  draft,
  onChange,
  authenticated,
  onCancel,
  onSaved,
  onExpired,
  onBusy,
}: {
  original: RestAreaRecord;
  draft: EditorDraft;
  onChange: (draft: EditorDraft) => void;
  authenticated: boolean;
  onCancel: () => void;
  onSaved: (record: RestAreaRecord) => void;
  onExpired: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = editorIsDirty(original, draft);
  return (
    <form
      className={sharedClasses.editorPanel}
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
        setError(null);
        const payload = requestFromDraft(original, original.revision, draft);
        if (!payload.ok) {
          setError(payload.error.message);
          return;
        }
        setSaving(true);
        onBusy(true);
        try {
          const response = await fetch(`/api/admin/rest-areas/${original.id}`, {
            method: "PATCH",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload.value),
          });
          const data = await response.json();
          if (response.status === 401) onExpired();
          if (!response.ok)
            throw new Error(data.error?.message || "저장하지 못했습니다. 입력 초안은 유지됩니다.");
          onSaved(data.item);
        } catch (reason) {
          setError(
            reason instanceof Error
              ? reason.message
              : "저장하지 못했습니다. 입력 초안은 유지됩니다.",
          );
        } finally {
          setSaving(false);
          onBusy(false);
        }
      }}
    >
      <div className={sharedClasses.editorHeading}>
        <div>
          <span className={sharedClasses.eyebrow}>ID {original.id} · test_lounge</span>
          <h2>휴게소 정보 수정</h2>
        </div>
        <span className="edit-status text-[9px] text-[#a68350]">
          {dirty ? "미저장 변경" : "변경 없음"}
        </span>
      </div>
      <div className={sharedClasses.editorScroll}>
        {!authenticated && (
          <p
            className="form-error p-[10px] m-[10px_0] [border:1px_solid_#f0d6d1] rounded-[6px] bg-[#fff7f5] text-[11px] leading-[1.7]"
            role="alert"
          >
            인증이 만료되었거나 편집이 잠겼습니다. 관리자 인증 후 저장해주세요. 입력 초안은
            유지됩니다.
          </p>
        )}
        {groups.map(group => (
          <fieldset key={group.label} disabled={saving}>
            <legend>{group.label}</legend>
            <div className={sharedClasses.editorGrid}>
              {group.fields.map(key => {
                const field = scalarFields.find(entry => entry.key === key)!;
                const before = original[key] === null ? "" : String(original[key]);
                const changed = draft.values[key] !== before;
                return (
                  <label
                    key={key}
                    className={
                      changed
                        ? "field-changed"
                        : !before && key === "routeName"
                          ? "field-missing"
                          : ""
                    }
                  >
                    <span>
                      {field.label}
                      {changed && <small>수정됨</small>}
                    </span>
                    <Input
                      value={draft.values[key]}
                      onChange={event =>
                        onChange({
                          ...draft,
                          values: {
                            ...draft.values,
                            [key]: event.target.value,
                          },
                        })
                      }
                      inputMode={
                        field.kind === "coordinate"
                          ? "decimal"
                          : field.kind === "integer"
                            ? "numeric"
                            : undefined
                      }
                      maxLength={field.kind === "text" ? field.maxLength : 24}
                      placeholder={"required" in field ? "필수" : "미등록"}
                    />
                    {changed && (
                      <small className="previous-value block text-[#a2adbd] text-[8px] mt-[3px] [overflow-wrap:anywhere]">
                        기존: {before || "미등록"}
                      </small>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        <fieldset disabled={saving}>
          <legend>편의시설</legend>
          <div className={sharedClasses.editorGrid}>
            {facilityDefinitions.map(([key, label]) => (
              <label
                key={key}
                className={
                  draft.facilities[key] !== original.facilities[key]
                    ? "field-changed"
                    : key === "has_truck_lounge" && original.facilities[key] === null
                      ? "field-missing"
                      : ""
                }
              >
                <span>
                  {label}
                  {draft.facilities[key] !== original.facilities[key] && <small>수정됨</small>}
                </span>
                <Select
                  value={
                    draft.facilities[key] === null
                      ? "unknown"
                      : draft.facilities[key]
                        ? "present"
                        : "absent"
                  }
                  onChange={event =>
                    onChange({
                      ...draft,
                      facilities: {
                        ...draft.facilities,
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
                </Select>
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p
            className="form-error p-[10px] m-[10px_0] [border:1px_solid_#f0d6d1] rounded-[6px] bg-[#fff7f5] text-[11px] leading-[1.7]"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
      <div className={sharedClasses.editorActions}>
        <Button type="button" disabled={saving} onClick={onCancel} variant="secondary">
          취소
        </Button>
        <Button disabled={!dirty || !authenticated || saving} variant="primary">
          <Icon name="check" size={16} />
          {saving ? "저장 중…" : "변경사항 저장"}
        </Button>
      </div>
    </form>
  );
}
