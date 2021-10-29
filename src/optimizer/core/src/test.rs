extern crate insta;
use super::*;
use serde_json::*;

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
    )
}


#[test]
fn example_6() {
    test_input(
        "test.tsx",
        r#"
export const sym1 = qHook((ctx) => console.log("1"));
    "#,
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
    )
}


// #[test]
// fn optimize_fixture_1() {
//     test_fixture("hello-world");
// }

fn test_fixture(folder: &str) {
    let res = transform_workdir(&FSConfig {
        project_root: folder.to_string(),
        source_maps: true,
        minify: false,
        transpile: false,
    });
    match res {
        Ok(results) => {
            for file in results {
                match file {
                    Ok(v) => {
                        let s = v.to_string();
                        let code = if let Some(code) = s.code { code } else { "".to_string() };
                        let map = if let Some(map) = s.map { map } else { "".to_string() };
                        let output = format!("== CODE ==\n\n{}== MAP ==\n\n{}== DIAGNOSTICS ==\n\n{:?}", code, map, v.diagnostics);
                        insta::assert_display_snapshot!(output);
                    }
                    Err(err) => {
                        insta::assert_display_snapshot!(err);
                    }
                }
            }
        }
        Err(err) => {
            insta::assert_display_snapshot!(err);
        }
    }
}

fn test_input(filename: &str, code: &str) {
    let mut ctx = transform::TransformContext::new();
    let res = transform(Config {
        code: code.as_bytes().to_vec(),
        filename: filename.to_string(),
        source_maps: true,
        minify: false,
        transpile: false,
        context: &mut ctx,
    });
    match res {
        Ok(v) => {
            let s = v.to_string();
            let code = if let Some(code) = s.code { code } else { "".to_string() };
            let map = if let Some(map) = s.map { map } else { "".to_string() };
            let hooks = if let Some(hooks) = v.hooks { serde_json::to_string_pretty(&hooks).unwrap() } else { "".to_string() };
            let output = format!("== CODE ==\n\n{}\n\n== MAP ==\n\n{}\n\n== HOOKS ==\n\n{}\n\n== DIAGNOSTICS ==\n\n{:?}", code, map, hooks, v.diagnostics);
            insta::assert_display_snapshot!(output);
        }
        Err(err) => {
            insta::assert_display_snapshot!(err);
        }
    }
}
