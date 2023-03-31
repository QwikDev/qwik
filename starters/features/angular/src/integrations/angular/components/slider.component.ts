import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import {MatSliderModule} from '@angular/material/slider';
import type { QwikifiedComponentProps, WithRequiredProps } from "@builder.io/qwik-angular";

type SliderComponentInputs = 'min' | 'max' | 'step' | 'sliderValue';

type SliderComponentOutputs = 'sliderValueChanged';

type RequiredPropValues = 'sliderValue';

// using utility types to assemble a type object for qwikified SliderComponent
// that has all inputs and typed output handlers of Angular SliderComponent
type OptionalSliderComponentProps = QwikifiedComponentProps<SliderComponent, SliderComponentInputs, SliderComponentOutputs>

// also marking "sliderValue" as required and exporting final type
export type SliderComponentProps = WithRequiredProps<OptionalSliderComponentProps, RequiredPropValues>


@Component({
    selector: 'app-slider',
    imports: [MatSliderModule, FormsModule, ReactiveFormsModule],
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <mat-slider name="slider" [min]="min" [max]="max" [step]="step" [discrete]="thumbLabel">
            <input matSliderThumb [ngModel]="sliderValue" (ngModelChange)="onSliderValueChange($event)">
        </mat-slider>
    `
})
export class SliderComponent {
    @Input() min = 0
    @Input() max = 100;
    @Input() step = 5;
    @Input() sliderValue = 20;
    @Input() thumbLabel = true;

    @Output() readonly sliderValueChanged = new EventEmitter<number>();

    onSliderValueChange(value: number) {
        this.sliderValueChanged.emit(value);
        this.sliderValue = value;
    }
}