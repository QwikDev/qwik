/* eslint-disable */

import { $, component$, useSignal } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { Link } from "@builder.io/qwik-city";
import { Internal } from "~/integrations/angular/components";

export default component$(() => {

    const contentOptionSig = useSignal<'one' | 'two'>('one');

    return (
        <div>
            <h1>
                Welcome to Qwik <span class="lightning">⚡️</span>
            </h1>

            <div style="background-color: lightsteelblue">
                <Internal client:hover contentOption={contentOptionSig.value} hello2={$(() => console.log('hello handler'))}>
                    <div id="meow">I am projected {contentOptionSig.value}</div>
                </Internal>
            {/* <StandaloneQwikified contentOption={contentOptionSig.value} hello={$(() => console.log('hello handler'))}>
                <div id="meow">I am projected {contentOptionSig.value}</div>
            </StandaloneQwikified> */}
            </div>

            <button onClick$={$(() => {
                contentOptionSig.value = contentOptionSig.value === 'two' ? 'one' : 'two';
            })}>Wake up by update of the bound data: "{contentOptionSig.value}"</button>

            <Link class="mindblow" href="/flower/">
                Blow my mind 🤯
            </Link>
            <Link class="todolist" href="/todolist/">
                TODO demo 📝
            </Link>
        </div>
    );
});

export const head: DocumentHead = {
    title: "Welcome to Qwik",
    meta: [
        {
            name: "description",
            content: "Qwik site description",
        },
    ],
};
