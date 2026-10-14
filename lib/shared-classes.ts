// Shared presentation presets; colors are owned by styles/tokens.css.
export const sharedClasses = {
  mapButton:
    "map-button pointer-events-auto min-h-[40px] inline-flex gap-[6px] items-center p-[8px_10px] rounded-[8px] [border:1px_solid_#e3e8ef] bg-white text-[#334e73] text-[12px] font-[600] [box-shadow:0_2px_8px_#26374d10]",
  eyebrow: "eyebrow text-[11px] text-muted tracking-[0.045em] font-[600]",
  queryState:
    "query-state flex flex-col items-center justify-center gap-[12px] p-[35px_25px] min-h-[225px] text-center",
  stateIcon:
    "state-icon flex items-center justify-center w-[48px] h-[48px] rounded-[50%] bg-primary-soft text-[#6b94d2]",
  spinner:
    "spinner block w-[25px] h-[25px] [border:2px_solid_#dfebff] border-t-[var(--blue)] rounded-[50%] animate-[spin_0.8s_linear_infinite]",
  detailPanel: "detail-panel flex flex-col min-h-0 h-full bg-white",
  detailHeading:
    "detail-heading flex justify-between items-center shrink-0 gap-[10px] p-[17px_20px_13px]",
  detailScroll: "detail-scroll min-h-0 overflow-y-auto overscroll-contain p-[0_20px_20px]",
  detailFacts:
    "detail-facts grid grid-cols-[1fr_1fr] gap-[14px_18px] p-[15px] [border:1px_solid_var(--line)] rounded-[10px] bg-[#fafbfd]",
  facilityHeading: "facility-heading flex justify-between items-center gap-[8px] m-[22px_0_12px]",
  facilityList: "facility-list grid grid-cols-[1fr_1fr] gap-[7px]",
  coordinateNote: "coordinate-note mt-[17px] text-[9px] text-[#8a97a8] [overflow-wrap:anywhere]",
  sheetListHeading:
    "sheet-list-heading flex justify-between gap-[10px] p-[16px_20px_13px] shrink-0 [border-bottom:1px_solid_var(--line)]",
  searchBox:
    "search-box flex items-center gap-[8px] min-h-[42px] p-[0_11px] [border:1px_solid_#e2e8f0] rounded-[9px] bg-white text-[#7b8da6]",
  filterChip:
    "filter-chip inline-flex items-center justify-center gap-[5px] min-h-[35px] shrink-0 p-[7px_10px] [border:1px_solid_#e4e9f1] rounded-[20px] bg-white text-[#66768a] text-[10px] font-[600] [box-shadow:0_2px_7px_#1c365915]",
  filterSheetScroll:
    "filter-sheet-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain p-[0_20px_15px]",
  facilitySheetTop:
    "facility-sheet-top flex justify-between items-center p-[9px_20px_14px] text-[11px] text-[#7c8da5]",
  facilityCheckboxes: "facility-checkboxes grid grid-cols-[1fr_1fr] gap-[8px]",
  sheetFilterFooter: "sheet-filter-footer p-[10px_20px_15px] [border-top:1px_solid_var(--line)]",
  editorPanel: "editor-panel flex flex-col min-h-0 h-full",
  editorHeading:
    "editor-heading p-[13px_17px] flex gap-[10px] justify-between items-center [border-bottom:1px_solid_var(--line)] shrink-0",
  editorScroll: "editor-scroll min-h-0 overflow-y-auto p-[10px_17px_20px]",
  editorGrid: "editor-grid grid grid-cols-[1fr_1fr] gap-[12px]",
  editorActions:
    "editor-actions flex justify-end gap-[8px] p-[11px_17px] [border-top:1px_solid_var(--line)] bg-[#fafcff] shrink-0",
} as const;
