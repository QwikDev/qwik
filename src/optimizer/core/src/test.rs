extern crate insta;

use super::*;
use serde_json::to_string_pretty;

#[test]
fn example_1() {
    test_input(
        "test.tsx",
        r#"
const Header = qComponent({
  "onMount": qHook(() => { console.log("mount") }),
  onRender: qHook(() => {
    return (
      <div onClick={qHook((ctx) => console.log(ctx))}/>
    );
  })
});
    "#,
        false,
    )
}

#[test]
fn example_2() {
    test_input(
        "test.tsx",
        r#"
export const Header = qComponent({
  "onMount": qHook(() => { console.log("mount") }),
  onRender: qHook(() => {
    return (
      <div onClick={qHook((ctx) => console.log(ctx))}/>
    );
  })
});
    "#,
        false,
    )
}

#[test]
fn example_3() {
    test_input(
        "test.tsx",
        r#"
export const App = () => {
    const Header = qComponent({
        "onMount": qHook(() => { console.log("mount") }),
        onRender: qHook(() => {
            return (
            <div onClick={qHook((ctx) => console.log(ctx))}/>
            );
        })
    });
    return Header;
});
    "#,
        false,
    )
}

#[test]
fn example_4() {
    test_input(
        "test.tsx",
        r#"
export function App() {
    const Header = qComponent({
        "onMount": qHook(() => { console.log("mount") }),
        onRender: qHook(() => {
            return (
            <div onClick={qHook((ctx) => console.log(ctx))}/>
            );
        })
    });
    return Header;
}
    "#,
        false,
    )
}

#[test]
fn example_5() {
    test_input(
        "test.tsx",
        r#"
export const Header = qComponent({
    onRender: qHook(() => {
        return (
            <>
                <div onClick={qHook((ctx) => console.log("1"))}/>
                <div onClick={qHook((ctx) => console.log("2"))}/>
            </>
        );
    })
});
    "#,
        false,
    )
}

#[test]
fn example_6() {
    test_input(
        "test.tsx",
        r#"
export const sym1 = qHook((ctx) => console.log("1"));
    "#,
        false,
    )
}

#[test]
fn example_7() {
    test_input(
        "test.tsx",
        r#"
import {qHook} from '@builderio/qwik';


const Header = qComponent({
    "onMount": qHook(() => { console.log("mount") }),
    onRender: qHook(() => {
      return (
        <div onClick={qHook((ctx) => console.log(ctx))}/>
      );
    })
  });

const App = qComponent({
    onRender: qHook(() => {
        return (
        <Header/>
        );
    })
});"#,
        false,
    )
}

#[test]
fn example_8() {
    test_input(
        "test.tsx",
        r#"
import {qHook} from '@builderio/qwik';

const Header = qComponent({
    onRender: qHook((hola) => {
      const hola = this;
      const {something, styff} = hola;
      const hello = hola.nothere.stuff[global];
      return (
        <Header/>
      );
    })
  });
"#,
        false,
    )
}

#[test]
fn example_9() {
    test_input(
        "test.tsx",
        r#"
const Header = qHook((decl1, {decl2}, [decl3]) => {
    const {decl4, key: decl5} = this;
    let [decl6, ...decl7] = stuff;
    const decl8 = 1, decl9;
    function decl10(decl11, {decl12}, [decl13]) {}
    class decl14 {
        method(decl15, {decl16}, [decl17]) {}
    }
    try{}catch(decl18){}
    try{}catch({decl19}){}
});
    "#,
        false,
    )
}

#[test]
fn example_10() {
    test_input(
        "project/test.tsx",
        r#"
const Header = qHook((decl1, {decl2}, [decl3]) => {

    const hola = ident1.no;
    ident2;
    const a = ident1 + ident3;
    const b = ident1 + ident3;
    ident4(ident5, [ident6], {ident7}, {key: ident8});
    class Some {
        prop = ident9;
        method() {
            return ident10;
        }
    }

    return (
        <div onClick={(ident11) => ident11 + ident12} required={false}/>
    )
});
    "#,
        false,
    )
}

#[test]
fn example_11() {
    test_input(
        "/user/project/test.tsx",
        r#"
import {foo, bar as bbar} from "dep";
import * as dep2 from "dep2";
import dep3 from "dep3/something";

export const Header = qComponent({
    onRender: qHook(() => {
        return (
            <Header onClick={qHook((ev) => dep3(ev))}>
                {dep2.stuff()}{bbar()}
            </Header>
        );
    })
});

export const App = qComponent({
    onRender: qHook(() => {
        return (
            <Header>{foo()}</Header>
        );
    })
});
    "#,
        false,
    )
}
// fn test_fixture(folder: &str) {
//     let res = transform_workdir(&FSConfig {
//         project_root: folder.to_string(),
//         source_maps: true,
//         minify: false,
//         transpile: false,
//     });
//     match res {
//         Ok(results) => {
//             for file in results {
//                 match file {
//                     Ok(v) => {
//                         let s = v.to_string();
//                         let code = if let Some(code) = s.code { code } else { "".to_string() };
//                         let map = if let Some(map) = s.map { map } else { "".to_string() };
//                         let output = format!("== CODE ==\n\n{}== MAP ==\n\n{}== DIAGNOSTICS ==\n\n{:?}", code, map, v.diagnostics);
//                         insta::assert_display_snapshot!(output);
//                     }
//                     Err(err) => {
//                         insta::assert_display_snapshot!(err);
//                     }
//                 }
//             }
//         }
//         Err(err) => {
//             insta::assert_display_snapshot!(err);
//         }
//     }
// }

fn test_input(filename: &str, code: &str, print_ast: bool) {
    let res = transform_input(&MultiConfig {
        input: vec![FileInput {
            code: code.as_bytes().to_vec(),
            path: filename.to_string(),
        }],
        source_maps: true,
        minify: false,
        transpile: false,
        print_ast,
        bundling: Bundling::PerHook,
    });
    match res {
        Ok(v) => {
            let input = code.to_string();
            let mut output = format!("==INPUT==\n\n{}", input);

            for module in v.modules {
                let s = module.to_string();
                output +=
                    format!("\n============================= {}==\n\n{}", s.path, s.code).as_str();
                // let map = if let Some(map) = s.map { map } else { "".to_string() };
                // output += format!("\n== MAP ==\n{}", map).as_str();
            }
            let hooks = to_string_pretty(&v.hooks).unwrap();
            output += format!(
                "\n== HOOKS ==\n\n{}\n\n== DIAGNOSTICS ==\n\n{:?}",
                hooks, v.diagnostics
            )
            .as_str();
            insta::assert_display_snapshot!(output);
        }
        Err(err) => {
            insta::assert_display_snapshot!(err);
        }
    }
}
