interface CloseIconProps {
  width: number;
  height: number;
}

export const CloseIcon = ({ width, height }: CloseIconProps) => (
  <svg width={width} height={height} viewBox="0 0 10 10">
    <path
      d="M0 0L10 10M10 0L0 10"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>
);
