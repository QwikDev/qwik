import { u as useLexicalScope, a as useStore, j as jsx, q as qrl, H as Host } from './core-3bbc8927.js';
import { Logo } from './logo.js';

const App_onRender_input_onInput=b=>{const[c]=useLexicalScope(),d=b.target;c.name=d.value;};

const App_render=()=>{const g=useStore({name:"World"});return /*#__PURE__*/ jsx(Host,{class:"my-app p-20",children:[/*#__PURE__*/ jsx(Logo,{class:"mb-10"}),/*#__PURE__*/ jsx("h1",{class:"text-3xl mb-2",children:"Congratulations Qwik is working!"}),/*#__PURE__*/ jsx("h2",{class:"text-2xl my-1",children:"Next steps:"}),/*#__PURE__*/ jsx("ol",{class:"list-decimal list-inside ml-10",children:[/*#__PURE__*/ jsx("li",{children:"Open dev-tools network tab and notice that no JavaScript was downloaded to render this page. (Zero JavaScript no matter the size of your app.)"}),/*#__PURE__*/ jsx("li",{children:["Try interacting with this component by changing"," ",/*#__PURE__*/ jsx("input",{value:g.name,class:"border-2 border-solid border-blue-500",placeholder:"Write some text",onInputQrl:qrl(()=>Promise.resolve().then(function () { return entry_hooks; }),"App_onRender_input_onInput",[g])}),"."]}),/*#__PURE__*/ jsx("li",{children:["Observe that the binding changes: ",/*#__PURE__*/ jsx("code",{children:["Hello ",g.name,"!"]})]}),/*#__PURE__*/ jsx("li",{children:"Notice that Qwik automatically lazily-loaded and resumed the component upon interaction without the developer having to code that behavior. (Lazy hydration is what gives even large apps instant on behavior.)"}),/*#__PURE__*/ jsx("li",{children:["Read the docs ",/*#__PURE__*/ jsx("a",{href:"https://github.com/builderio/qwik",children:"here"}),"."]}),/*#__PURE__*/ jsx("li",{children:"Replace the content of this component with your code."}),/*#__PURE__*/ jsx("li",{children:"Build amazing web-sites with unbeatable startup performance."})]}),/*#__PURE__*/ jsx("hr",{class:"mt-10"}),/*#__PURE__*/ jsx("p",{class:"text-center text-sm mt-2",children:["Made with ❤️ by"," ",/*#__PURE__*/ jsx("a",{target:"_blank",href:"https://www.builder.io/",children:"Builder.io"})]})]});};

const Logo_render=()=>/*#__PURE__*/ jsx(Host,{style:{"text-align":"center"},children:/*#__PURE__*/ jsx("a",{href:"https://github.com/builderio/qwik",children:/*#__PURE__*/ jsx("img",{alt:"Qwik Logo",width:400,src:"https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F667ab6c2283d4c4d878fb9083aacc10f"})})});

var entry_hooks = /*#__PURE__*/Object.freeze({
	__proto__: null,
	App_onRender_input_onInput: App_onRender_input_onInput,
	App_render: App_render,
	Logo_render: Logo_render
});

export { App_onRender_input_onInput, App_render, Logo_render };
