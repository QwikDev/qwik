import { Component } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'input-clearable-example',
  template: `
    <mat-form-field class="example-form-field">
      <mat-label>Clearable input</mat-label>
      <input matInput type="text" [(ngModel)]="value" />
      <button *ngIf="value" matSuffix mat-icon-button aria-label="Clear" (click)="value = ''">
        <mat-icon>close</mat-icon>
      </button>
    </mat-form-field>
  `,
  standalone: true,
  providers: [],
  imports: [
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    CommonModule,
  ],
})
export class InputComponent {
  value = 'Clear me';
}
