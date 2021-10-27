extern crate insta;
use super::*;

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
fn example_5() {
    test_input(
        "test.tsx",
        r#"
export const sym1 = qHook((ctx) => console.log("1"));
    "#,
    )
}

#[test]
fn example_6() {
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
fn optimize_fixture_1() {
    test_fixture("");
}

fn test_fixture(folder: &str) {
    let res = transform_workdir(&FSConfig {
        project_root: folder.to_string(),
        source_maps: true,
        minify: false,
        transpile: false,
    });
    insta::assert_debug_snapshot!(res);
}

fn test_input(filename: &str, code: &str) {
    let res = transform(Config {
        code: code.as_bytes().to_vec(),
        filename: filename.to_string(),
        source_maps: true,
        minify: false,
        transpile: false,
    });
    match res {
        Ok(v) => {
            let s = v.to_string();
            insta::assert_display_snapshot!(if let Some(code) = s.code { code } else { "".to_string() });
            insta::assert_display_snapshot!(if let Some(map) = s.map { map } else { "".to_string() });
            insta::assert_debug_snapshot!(v.diagnostics);
        }
        Err(err) => {
            insta::assert_display_snapshot!(err);
        }
    }
}
