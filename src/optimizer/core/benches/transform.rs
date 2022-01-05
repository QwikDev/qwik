extern crate criterion;

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use qwik_core::*;

fn transform_benchmark(b: &mut Criterion) {
    b.bench_function("transform", |b| {
        b.iter(|| {
            let code = r#"
    import {qHook} from '@builder.io/qwik';


    const Header2 = qComponent({
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
    });
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
            "#;
            transform_modules(black_box(TransformModulesOptions {
                root_dir: "/user/qwik/src/".into(),
                input: vec![TransformModuleInput {
                    code: code.into(),
                    path: "file.tsx".into(),
                }],
                source_maps: true,
                minify: MinifyMode::None,
                transpile: false,
                entry_strategy: EntryStrategy::Hook,
            }))
        })
    });
}

criterion_group!(benches, transform_benchmark);
criterion_main!(benches);
