import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'qwik-angular-demo',
  standalone: true,
  styleUrls: ['./demo.component.css'],
  templateUrl: './demo.component.html',
})
export class QwikAngularDemo {
  @Input() contentOption: 'one' | 'two' = 'two';

  @Output() hello = new EventEmitter<string>();

  processOutput(greeting: string) {
    this.hello.emit(greeting);
  }
}
