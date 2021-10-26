extern crate insta;
use super::*;

#[test]
fn parses_code() {
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
            insta::assert_display_snapshot!(s.code.unwrap());
            insta::assert_display_snapshot!(s.map.unwrap());
        }
        Err(err) => {
            insta::assert_display_snapshot!(err);
        }
    }
}
