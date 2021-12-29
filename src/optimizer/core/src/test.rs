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
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        false,
    );
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
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        false,
    );
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
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        false,
    );
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
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        false,
    );
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
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        false,
    );
}

#[test]
fn example_6() {
    test_input(
        "test.tsx",
        r#"
export const sym1 = qHook((ctx) => console.log("1"));
    "#,
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        false,
    );
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
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        false,
    );
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
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        false,
    );
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
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        false,
    );
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
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        false,
    );
}

#[test]
fn example_11() {
    test_input(
        "project/test.tsx",
        r#"
import {foo, bar as bbar} from "../state";
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
        EntryStrategy::Single,
        MinifyMode::Simplify,
        false,
    );
}

#[test]
fn example_12() {
    test_input(
        "project/test.tsx",
        r#"
export const Header = qComponent({
    onRender: qHook(() => console.log("hello sym2"), "sym2")
});

    "#,
        EntryStrategy::Single,
        MinifyMode::Simplify,
        false,
    );
}

#[test]
fn example_13() {
    test_input(
        "project/test.tsx",
        r#"
export const Header = qComponent({
    onRender: qHook(() => console.log("hello sym2"), "2sym")
});

    "#,
        EntryStrategy::Single,
        MinifyMode::Simplify,
        false,
    );
}

#[test]
fn issue_117() {
    test_input(
        "project/test.tsx",
        r#"
export const cache = patternCache[cacheKey] || (patternCache[cacheKey]={});
    "#,
        EntryStrategy::Single,
        MinifyMode::Simplify,
        false,
    );
}

#[test]
fn issue_118() {
    test_input(
        "project/test.tsx",
        r#"
import {qHook, h} from '@builderio/qwik';
import thing from 'lib';
import * as all from 'lib';
import {s as se} from 'lib';


export const Header = qComponent({
    onMount: <div/>,
    onRender: qHook(() => <Footer>{thing}{all()}{se()}</Footer>)
});

export const Footer = qComponent();


    "#,
        EntryStrategy::Single,
        MinifyMode::Minify,
        true,
    );
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

fn test_input(
    filename: &str,
    code: &str,
    entry_strategy: EntryStrategy,
    minify: MinifyMode,
    transpile: bool,
) {
    let res = transform_modules(TransformModulesOptions {
        root_dir: "/user/qwik/src/".into(),
        input: vec![TransformModuleInput {
            code: code.to_string(),
            path: filename.to_string(),
        }],
        source_maps: true,
        minify,
        transpile,
        entry_strategy,
    });
    match res {
        Ok(v) => {
            let input = code.to_string();
            let mut output = format!("==INPUT==\n\n{}", input);

            for module in v.modules {
                let is_entry = if module.is_entry { "(ENTRY POINT)" } else { "" };
                output += format!(
                    "\n============================= {} {}==\n\n{}",
                    module.path, is_entry, module.code
                )
                .as_str();
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
