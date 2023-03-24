import { Component, EventEmitter, Input, Output } from "@angular/core";
import { qwikify$ } from "@builder.io/qwik-angular";

@Component({
    selector: 'my-qwik-ng',
    standalone: true,
    template: `
        Angular Component!
        <ng-content></ng-content>
        <br/>
        <br/>
        Content Option: {{ contentOption }}

        <button (click)="processHelloOutput('hello from template!')">Emit hello!</button>
    `
})
export class  MyQwikNgComponent {
    @Input() contentOption: 'one' | 'two' = 'two';

    @Output() hello2 = new EventEmitter<string>();

    processHelloOutput(greeting: string) {
        this.hello2.emit(greeting)
    }
}

export const Internal = qwikify$<{contentOption: 'one' | 'two', hello2?: () => any}>(MyQwikNgComponent);