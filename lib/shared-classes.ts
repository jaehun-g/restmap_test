// Shared presentation presets; colors are owned by styles/tokens.css.
export const sharedClasses = {
  formError:
    "form-error p-[10px] m-[10px_0] [border:1px_solid_var(--color-danger-line)] rounded-[6px] bg-danger-soft text-danger text-ui-12 leading-[1.7]",
  editStatus: "edit-status text-ui-10 text-lounge",
  screenReaderOnly:
    "sr-only absolute w-[1px] h-[1px] p-[0] m-[-1px] overflow-hidden [clip:rect(0,_0,_0,_0)] whitespace-nowrap [border:0]",
  tablePanelHeading:
    "panel-heading flex justify-between items-center gap-[12px] min-h-[57px] p-[15px_20px] [border-bottom:1px_solid_var(--line)] shrink-0",
  tableHeadingActions: "table-heading-actions flex min-w-0 items-center gap-[9px]",
  tableSource: "table-source text-ui-10 text-muted tracking-[0.04em]",
  tableColumnsToggle:
    "table-columns-toggle p-[7px_9px] min-h-[35px] [border:1px_solid_var(--line)] rounded-[6px] bg-surface text-muted text-ui-10",
  mapButton:
    "map-button pointer-events-auto min-h-[40px] inline-flex gap-[6px] items-center p-[8px_10px] rounded-[8px] [border:1px_solid_var(--line)] bg-white text-ink text-ui-12 font-[600] [box-shadow:0_2px_8px_#26374d10]",
  eyebrow: "eyebrow text-ui-12 text-muted tracking-[0.045em] font-[600]",
  queryState:
    "query-state flex flex-col items-center justify-center gap-[12px] p-[35px_25px] min-h-[225px] text-center",
  stateIcon:
    "state-icon flex items-center justify-center w-[48px] h-[48px] rounded-[50%] bg-primary-soft text-primary",
  spinner:
    "spinner block w-[25px] h-[25px] [border:2px_solid_var(--color-primary-line)] border-t-[var(--blue)] rounded-[50%] animate-[spin_0.8s_linear_infinite]",
  detailPanel: "detail-panel flex flex-col min-h-0 h-full bg-white",
  detailHeading:
    "detail-heading flex justify-between items-center shrink-0 gap-[10px] p-[17px_20px_13px]",
  detailScroll: "detail-scroll min-h-0 overflow-y-auto overscroll-contain p-[0_20px_20px]",
  detailFacts:
    "detail-facts grid grid-cols-[1fr_1fr] gap-[14px_18px] p-[15px] [border:1px_solid_var(--line)] rounded-[10px] bg-surface",
  facilityHeading: "facility-heading flex justify-between items-center gap-[8px] m-[22px_0_12px]",
  facilityList: "facility-list grid grid-cols-[1fr_1fr] gap-[7px]",
  coordinateNote: "coordinate-note mt-[17px] text-ui-10 text-muted [overflow-wrap:anywhere]",
  sheetListHeading:
    "sheet-list-heading flex justify-between gap-[10px] p-[16px_20px_13px] shrink-0 [border-bottom:1px_solid_var(--line)]",
  searchBox:
    "search-box flex items-center gap-[8px] min-h-[42px] p-[0_11px] [border:1px_solid_var(--line)] rounded-[9px] bg-white text-muted",
  filterChip:
    "filter-chip inline-flex items-center justify-center gap-[5px] min-h-[35px] shrink-0 p-[7px_10px] [border:1px_solid_var(--line)] rounded-[20px] bg-white text-muted text-ui-10 font-[600] [box-shadow:0_2px_7px_#1c365915]",
  filterSheetScroll:
    "filter-sheet-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain p-[0_20px_15px]",
  facilitySheetTop:
    "facility-sheet-top flex justify-between items-center p-[9px_20px_14px] text-ui-12 text-muted",
  facilityCheckboxes: "facility-checkboxes grid grid-cols-[1fr_1fr] gap-[8px]",
  sheetFilterFooter: "sheet-filter-footer p-[10px_20px_15px] [border-top:1px_solid_var(--line)]",
  editorPanel: "editor-panel flex flex-col min-h-0 h-full",
  editorHeading:
    "editor-heading p-[13px_17px] flex gap-[10px] justify-between items-center [border-bottom:1px_solid_var(--line)] shrink-0",
  editorScroll: "editor-scroll min-h-0 overflow-y-auto p-[10px_17px_20px]",
  editorGrid: "editor-grid grid grid-cols-[1fr_1fr] gap-[12px]",
  editorActions:
    "editor-actions flex justify-end gap-[8px] p-[11px_17px] [border-top:1px_solid_var(--line)] bg-surface shrink-0",
} as const;
