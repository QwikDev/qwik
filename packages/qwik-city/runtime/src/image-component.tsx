import { useId, type QRL, type QwikIntrinsicElements } from '@builder.io/qwik';
import {
  component$,
  createContextId,
  useContext,
  useContextProvider,
  useSignal,
  useTask$,
} from '@builder.io/qwik';

export const DEFAULT_RESOLUTIONS = [3840, 1920, 1280, 960, 640];

type ImageAttributes = QwikIntrinsicElements['img'];

/**
 * @alpha
 */
export type ImageState = {
  resolutions?: number[];
  imageTransformer$?: QRL<(params: ImageTransformerProps) => string>;
};

/**
 * @alpha
 */
export type ImageTransformerProps = {
  src: string;
  width: number;
  height: number | undefined;
};

/**
 * @alpha
 */
export interface ImageProps extends ImageAttributes {
  placeholder?: string;
  style?: Record<string, string | number>;
  aspectRatio?: number;
  layout: 'fixed' | 'constrained' | 'fullWidth';
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down' | 'inherit' | 'initial';
}

export const ImageContext = createContextId<ImageState>('ImageContext');

/**
 * @alpha
 */
export const useImageProvider = (state: ImageState) => {
  useContextProvider(ImageContext, state);
};

export const getStyles = ({
  placeholder,
  width,
  height,
  aspectRatio,
  objectFit = 'cover',
  layout,
}: Pick<
  ImageProps,
  'placeholder' | 'width' | 'height' | 'aspectRatio' | 'objectFit' | 'layout'
>): Record<string, string | undefined> => {
  const isValid = (value?: string | number) => value || value === 0;

  if (height === 'auto' && width === 'auto' && isValid(aspectRatio)) {
    console.warn(`To use the aspect ratio either set the width or the height`);
  }

  if (height !== 'auto' && layout !== 'fixed' && isValid(aspectRatio)) {
    console.warn(`To maintain the aspect ratio we set 'height: "auto"'`);
  }

  const baseStyles = {
    'object-fit': objectFit,
    background: placeholder || 'transparent',
  };

  switch (layout) {
    case 'fixed':
      return {
        ...baseStyles,
        width: isValid(width) ? `${width}px` : undefined,
        height: isValid(height) ? `${height}px` : undefined,
      };
    case 'constrained':
      return {
        ...baseStyles,
        width: '100%',
        height: isValid(aspectRatio) ? 'auto' : undefined,
        'max-width': isValid(width) ? `${width}px` : undefined,
        'max-height': isValid(height) ? `${height}px` : undefined,
        'aspect-ratio': isValid(aspectRatio) ? `${aspectRatio}` : undefined,
      };
    case 'fullWidth': {
      const heightStyle = {
        height: isValid(aspectRatio) ? 'auto' : isValid(height) ? `${height}px` : undefined,
      };
      return {
        ...baseStyles,
        ...heightStyle,
        width: '100%',
        'aspect-ratio': isValid(aspectRatio) ? `${aspectRatio}` : undefined,
      };
    }
  }
};

export const getSizes = ({ width, layout }: Pick<ImageProps, 'width' | 'layout'>) => {
  if (!width || !layout) {
    return undefined;
  }
  switch (layout) {
    case `constrained`:
      return `(min-width: ${width}px) ${width}px, 100vw`;
    case `fixed`:
      return `${width}px`;
    case `fullWidth`:
      return `100vw`;

    default:
      return undefined;
  }
};

export const getSrcSet = async ({
  src = '',
  width,
  height,
  aspectRatio,
  layout,
  resolutions,
  imageTransformer$,
}: Pick<ImageProps, 'src' | 'width' | 'height' | 'aspectRatio' | 'layout'> &
  ImageState): Promise<string> => {
  const breakpoints = getBreakpoints({
    width: typeof width === 'string' ? parseInt(width, 10) : width,
    layout,
    resolutions: resolutions || DEFAULT_RESOLUTIONS,
  });

  const srcSets = [];
  for await (const breakpoint of breakpoints.sort()) {
    let transformedHeight = typeof height === 'string' ? parseInt(height, 10) : height;
    if (height && aspectRatio) {
      transformedHeight = Math.round(breakpoint * aspectRatio);
    }

    if (!imageTransformer$) {
      srcSets.push(`${src} ${breakpoint}w`);
      continue;
    }

    const transformed = await imageTransformer$({
      src,
      width: breakpoint,
      height: transformedHeight,
    });

    srcSets.push(`${transformed} ${breakpoint}w`);
  }

  return srcSets.join(',\n');
};

export const getBreakpoints = ({
  width: widthAttribute,
  layout,
  resolutions = [],
}: Pick<ImageProps, 'width' | 'layout'> & Pick<ImageState, 'resolutions'>): number[] => {
  if (layout === 'fullWidth') {
    return resolutions;
  }
  if (!widthAttribute) {
    return [];
  }
  const width = typeof widthAttribute === 'string' ? parseInt(widthAttribute, 10) : widthAttribute;
  const doubleWidth = width * 2;
  if (layout === 'fixed') {
    return [width, doubleWidth];
  }
  if (layout === 'constrained') {
    return [width, doubleWidth, ...resolutions.filter((w) => w < doubleWidth)];
  }

  return [];
};

/**
 * @alpha
 */
export const Image = component$<ImageProps>((props) => {
  const state = useContext(ImageContext);
  const { resolutions, imageTransformer$, loading, ...imageAttributes } = {
    ...state,
    ...props,
  };
  const style = { ...props.style, ...getStyles(props) };
  const sizes = getSizes(props);
  const srcSetSignal = useSignal('');

  const { src, width, height, aspectRatio, layout } = imageAttributes;
  useTask$(async () => {
    srcSetSignal.value = await getSrcSet({
      src,
      width,
      height,
      aspectRatio,
      layout,
      resolutions,
      imageTransformer$,
    });
  });

  return (
    <img
      id={useId()}
      loading={loading || 'lazy'}
      decoding="async"
      {...imageAttributes}
      style={style}
      width={['fullWidth', 'constrained'].includes(layout) ? undefined : width}
      height={['fullWidth', 'constrained'].includes(layout) ? undefined : height}
      srcSet={srcSetSignal.value}
      sizes={sizes}
    />
  );
});
