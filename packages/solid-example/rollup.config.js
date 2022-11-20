

import withSolid from "rollup-preset-solid";

export default withSolid([
    { 
        input: "src/App.tsx",
        solidOptions: {
            hydratable: true
        },
         output: {
            file: "./dist/esm/App.js",
            format: "module"
        } 
    }, 
    {
        input: "src/App.tsx",
        solidOptions: {
            generate: "ssr",
            hydratable: true
        },
        output: {
            file: "./dist/esm/App.ssr.js",
            format: "esm"
        } 
    }
]);
