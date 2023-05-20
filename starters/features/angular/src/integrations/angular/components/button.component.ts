import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { QwikifiedComponentProps } from '@builder.io/qwik-angular';

type ButtonComponentInputProps = 'color';

export type ButtonComponentProps = QwikifiedComponentProps<
  ButtonComponent,
  ButtonComponentInputProps
>;

@Component({
  imports: [MatButtonModule],
  standalone: true,
  template: `
    <button mat-raised-button [color]="color">
      <ng-content></ng-content>
    </button>
  `,
})
export class ButtonComponent {
  @Input() color: 'primary' | 'accent' | 'warn' = 'primary';
}
