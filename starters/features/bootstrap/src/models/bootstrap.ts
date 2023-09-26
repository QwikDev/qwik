export interface BsComponentProps {
  text?: string;
  colorVariant: string;
}

export interface BsSpinnerComponentProps extends BsComponentProps {
  growing: boolean;
}
