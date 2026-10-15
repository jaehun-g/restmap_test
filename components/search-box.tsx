"use client";
import {sharedClasses} from "@/lib/shared-classes";
import {Input} from "@/components/ui/field";
import {IconButton} from "@/components/ui/button";
import Icon from "./icon";
import type {useSearchQuery} from "@/hooks/use-search-query";
export default function SearchBox({
  search,
  disabled = false,
  includeStations = false,
}: {
  search: ReturnType<typeof useSearchQuery>;
  disabled?: boolean;
  includeStations?: boolean;
}) {
  return (
    <div className={sharedClasses.searchBox}>
      <Icon name="search" size={18} />
      <Input
        type="search"
        value={search.input}
        placeholder={includeStations ? "휴게소·노선·주유소 검색" : "휴게소명·노선명 검색"}
        aria-label={
          includeStations ? "휴게소명·노선명·주유소명·주소 검색" : "휴게소명과 노선명 검색"
        }
        disabled={disabled}
        onChange={event =>
          event.target.value === "" ? search.clear() : search.setInput(event.target.value)
        }
        onKeyDown={event => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            search.flush();
          }
        }}
        variant="search"
      />
      {search.input && (
        <IconButton disabled={disabled} aria-label="검색어 지우기" onClick={() => search.clear()}>
          <Icon name="close" size={16} />
        </IconButton>
      )}
    </div>
  );
}
