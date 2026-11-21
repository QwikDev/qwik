// Stands in for a lightbox library (PhotoSwipe in the storefront benchmark): only a click on a slide runs it.
export const openLightbox = (images: string[], index: number) => `lightbox ${images[index]}`;
