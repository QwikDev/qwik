interface MoreIconProps {
  width: number;
  height: number;
}

export const MoreIcon = ({ width, height }: MoreIconProps) => (
  <svg width={width} height={height} fill="currentColor" viewBox="0 0 512 512">
    <title>More</title>
    <circle cx="256" cy="256" r="48" />
    <circle cx="256" cy="416" r="48" />
    <circle cx="256" cy="96" r="48" />
  </svg>
);
