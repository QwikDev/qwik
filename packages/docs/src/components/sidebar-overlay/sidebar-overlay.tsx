export const hideSidebarOnDismissClick = (
  event: Event,
  overlay: HTMLElement
) => {
  if (!overlay.matches(':popover-open')) {
    return;
  }
  const target = event.target as Element;
  const isBackdropClick = target === overlay;
  const isLinkClick = !!target.closest('a[href]');
  if (isBackdropClick || isLinkClick) {
    overlay.hidePopover();
  }
};
