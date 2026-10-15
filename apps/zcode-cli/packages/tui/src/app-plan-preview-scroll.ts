export type PlanPreviewScrollHandle = {
  pageSize: number;
  scrollBy(deltaY: number): void;
};

let activePlanPreviewScroll: PlanPreviewScrollHandle | undefined;

export function setActivePlanPreviewScroll(handle: PlanPreviewScrollHandle | undefined): void {
  activePlanPreviewScroll = handle;
}

export function scrollActivePlanPreview(deltaY: number): void {
  activePlanPreviewScroll?.scrollBy(deltaY);
}

export function activePlanPreviewPageSize(): number {
  return activePlanPreviewScroll?.pageSize ?? 10;
}
