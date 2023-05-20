import { qwikify$ } from '@builder.io/qwik-angular';
import { type SliderComponentProps, SliderComponent } from './components//slider.component';
import { type ButtonComponentProps, ButtonComponent } from './components/button.component';
import {
  TableComponent,
  type TableUserData,
  type TableComponentProps,
} from './components/table/table.component';

export const MaterialSlider = qwikify$<SliderComponentProps>(SliderComponent, {
  eagerness: 'hover',
});
export const MaterialButton = qwikify$<ButtonComponentProps>(ButtonComponent);
export const MaterialTable = qwikify$<TableComponentProps>(TableComponent);

export { ButtonComponentProps, SliderComponentProps, TableUserData, TableComponentProps };
