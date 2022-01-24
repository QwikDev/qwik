use super::*;
use serde_json::to_string_pretty;

#[test]
fn example_1() {
    test_input(
        "test.tsx",
        r#"
import { qHook, qComponent, onRender, h } from '@builder.io/qwik';

const Header = qComponent(qHook(() => {
  console.log("mount");
  onRender(qHook(() => {
    return (
      <div onClick={qHook((ctx) => console.log(ctx))}/>
    );
  }));
}));
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
import { qHook, qComponent, onRender, h } from '@builder.io/qwik';
export const Header = qComponent(() => {
  console.log("mount");
  onRender(() => {
    return (
      <div onClick={qHook((ctx) => console.log(ctx))}/>
    );
  });
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
import { qHook, qComponent, onRender, h } from '@builder.io/qwik';
export const App = () => {
    const Header = qComponent(() => {
        console.log("mount");
        onRende(() => {
            return (
                <div onClick={qHook((ctx) => console.log(ctx))}/>
            );
        });
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
import { qHook, qComponent, onRender, h } from '@builder.io/qwik';
export function App() {
    const Header = qComponent(() => {
        console.log("mount");
        return onRender(() => {
            return (
                <div onClick={qHook((ctx) => console.log(ctx))}/>
            );
        });
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
import { qHook, qComponent, onRender, h } from '@builder.io/qwik';
export const Header = qComponent(() => {
    onRender(() => {
        return (
            <>
                <div onClick={(ctx) => console.log("1")}/>
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
import { qHook, qComponent, h } from '@builder.io/qwik';
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
import { qHook, qComponent, onRender, h } from '@builder.io/qwik';

export const Header = qComponent(() => {
    console.log("mount");
    onRender(() => {
      return (
        <div onClick={qHook((ctx) => console.log(ctx))}/>
      );
    });
  });

const App = qComponent(() => {
    onRender(() => {
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
import { qHook, qComponent, onRender, h } from '@builder.io/qwik';

export const Header = qComponent(() => {
    onRender((hola) => {
        const hola = this;
        const {something, styff} = hola;
        const hello = hola.nothere.stuff[global];
        return (
        <Header/>
        );
    });
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
import { qHook, qComponent, h } from '@builder.io/qwik';
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
import { qHook, qComponent, h } from '@builder.io/qwik';
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
import { qHook, qComponent, onRender, h } from '@builder.io/qwik';
import {foo, bar as bbar} from "../state";
import * as dep2 from "dep2";
import dep3 from "dep3/something";

export const Header = qComponent(() => {
    onRender(() => {
        return (
            <Header onClick={qHook((ev) => dep3(ev))}>
                {dep2.stuff()}{bbar()}
            </Header>
        );
    });
});

export const App = qComponent(() => {
    onRender(() => {
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
import { qHook, qComponent, h } from '@builder.io/qwik';
export const Header = qComponent(() => {
    onRender(() => console.log("hello sym2"), "sym2")
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
import { qHook, qComponent, onRender, h } from '@builder.io/qwik';
export const Header = qComponent(() => {
    onRender(() => console.log("hello sym2"), "2sym")
});

    "#,
        EntryStrategy::Single,
        MinifyMode::Simplify,
        false,
    );
}

#[test]
fn example_functional_component() {
    test_input(
        "test.tsx",
        r#"
        import { qHook, qComponent, onRender, h } from '@builder.io/qwik';
        const Header = qComponent(() => {
            const thing = useState();
            const {foo, bar} = foo();

            onRender(() => {
                return (
                    <div>{thing}</div>
                );
            });
        });
    "#,
        EntryStrategy::Hook,
        MinifyMode::None,
        false,
    );
}

#[test]
fn example_functional_component_2() {
    test_input(
        "test.tsx",
        r#"
import { qHook, qComponent, h, onRender } from '@builder.io/qwik';
export const useCounter = () => {
    return useState({count: 0});
}

export const STEP = 1;

export const App = qComponent((props) => {
    const state = useCounter();
    const thing = useState({thing: 0});
    const STEP_2 = 2;

    return onRender(() => {
        const count2 = state.count * 2;
        return (
            <div on:click={() => state.count+=count2 }>
                <span>{state.count}</span>
                {buttons.map(btn => (
                    <button
                        on:click={() => state.count += btn.offset + thing + STEP + STEP_2 + props.step}
                    >
                        {btn.name}
                    </button>
                ))}

            </div>

        )
    });
    })
    "#,
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        true,
    );
}

#[test]
fn example_functional_component_capture_props() {
    test_input(
        "test.tsx",
        r#"
import { qHook, qComponent, h, onRender } from '@builder.io/qwik';

export const App = qComponent(({count, rest: [I2, {I3, v1: [I4], I5=v2, ...I6}, I7=v3, ...I8]}) => {
    const state = useState({count: 0});
    const {rest: [C2, {C3, v1: [C4], C5=v2, ...C6}, C7=v3, ...C8]} = foo();
    return onRender(() => {
        return (
            <div on:click={() => state.count += count + total }>
                {I2}{I3}{I4}{I5}{I6}{I7}{I8}
                {C2}{C3}{C4}{C5}{C6}{C7}{C8}
                {v1}{v2}{v3}
            </div>
        )
    });
})
    "#,
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        true,
    );
}

#[test]
fn example_multi_capture() {
    test_input(
        "test.tsx",
        r#"
import { qHook, qComponent, h, onRender } from '@builder.io/qwik';

export const Foo = qComponent(({foo}) => {
    const arg0 = 20;
    return onRender(() => {
        const fn = ({aaa}) => aaa;
        return (
            <div>
              {foo}{fn()}{arg0}
            </div>
        )
    });
})

export const Bar = qComponent(({bar}) => {
    return onRender(() => {
        return (
            <div>
              {bar}
            </div>
        )
    });
})

    "#,
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        false,
    );
}

#[test]
fn example_with_tagname() {
    test_input(
        "test.tsx",
        r#"
import { qHook, qComponent, h, onRender } from '@builder.io/qwik';

export const Foo = qComponent("my-foo", () => {
    return onRender(() => {
        return (
            <div>
            </div>
        )
    });
})
    "#,
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        false,
    );
}

#[test]
fn example_with_style() {
    test_input(
        "test.tsx",
        r#"
import { qHook, qComponent, h, onRender, withStyle } from '@builder.io/qwik';

export const Foo = qComponent("my-foo", () => {
    withStyle('.class {}');
    return onRender(() => {
        return (
            <div class="class"/>
        )
    });
})
    "#,
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        false,
    );
}

#[test]
fn example_lightweight_functional() {
    test_input(
        "test.tsx",
        r#"
import { qHook, qComponent, h, onRender } from '@builder.io/qwik';

export const Foo = qComponent("my-foo", ({color}) => {
    return onRender(() => {
        return (
            <div>
                <Button {...props} />
                <ButtonArrow {...props} />
            </div>
        )
    });
})

export function Button({color}) {
    return (
        <button color={color} on:click={()=>console.log(text, color)}>{text}</button>
    );
}

export const ButtonArrow = ({color}) => {
    return (
        <button color={color} on:click={()=>console.log(text, color)}>{text}</button>
    );
}
    "#,
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        false,
    );
}

#[test]
fn example_invalid_references() {
    test_input(
        "test.tsx",
        r#"
import { qHook, qComponent, h, onRender } from '@builder.io/qwik';

const I1 = 12;
const [I2, {I3, v1: [I4], I5=v2, ...I6}, I7=v3, ...I8] = obj;
function I9() {}
class I10 {}

export const App = qComponent(({count}) => {
    console.log(I1, I2, I3, I4, I5, I6, I7, I8, I9);
    console.log(itsok, v1, v2, v3, obj);
    return onRender(() => {
        return (
            <I10></I10>
        )
    });
})
    "#,
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        true,
    );
}

#[test]
fn example_capturing_fn_class() {
    test_input(
        "test.tsx",
        r#"
import { qHook, qComponent, h, onRender } from '@builder.io/qwik';

export const App = qComponent(() => {
    function hola() {
      console.log('hola');
    }
    class Thing {}
    class Other {}

    return onRender(() => {
      hola();
      new Thing();
      return (
          <div></div>
      )
    });
  })
    "#,
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        true,
    );
}

#[test]
fn example_renamed_exports() {
    test_input(
        "test.tsx",
        r#"
import { qComponent as Component, onRender as $, useState } from '@builder.io/qwik';

export const App = Component((props) => {
    const state = useState({thing: 0});

    return $(() => (
        <div>{state.thing}</div>
    ));
});
    "#,
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        true,
    );
}

#[test]
fn example_exports() {
    test_input(
        "project/test.tsx",
        r#"
import { qHook, qComponent, onRender, h } from '@builder.io/qwik';

export const [a, {b, v1: [c], d=v2, ...e}, f=v3, ...g] = obj;

const exp1 = 1;
const internal = 2;
export {exp1, internal as expr2};

export function foo() { }
export class bar {}

export default function DefaultFn() {}

export const Header = qComponent(() => {
    onRender(() => (
        <Footer>
            <div>{a}{b}{c}{d}{e}{f}{exp1}{internal}{foo}{bar}{DefaultFn}</div>
            <div>{v1}{v2}{v3}{obj}</div>
        </Footer>
    ))
});

export const Footer = qComponent();

    "#,
        EntryStrategy::Hook,
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
import { qHook, qComponent, onRender, h } from '@builder.io/qwik';
import thing from 'lib';
import * as all from 'lib';
import {s as se} from 'lib';


export const Header = qComponent(() => {
    onRender(() => <Footer>{thing}{all()}{se()}</Footer>)
});

export const Footer = qComponent();


    "#,
        EntryStrategy::Single,
        MinifyMode::Minify,
        true,
    );
}

#[test]
fn example_jsx() {
    test_input(
        "test.tsx",
        r#"
import { qHook, qComponent, h, onRender, withStyle } from '@builder.io/qwik';

export const Lightweight = () => {
    return (
        <div>
            <>
                <div/>
                <button/>
            </>
        </div>
    )
};

export const Foo = qComponent("my-foo", () => {
    return onRender(() => {
        return (
            <div>
                <>
                    <div class="class"/>
                    <div class="class"></div>
                    <div class="class">12</div>
                </>
                <div class="class">
                    <Lightweight/>
                </div>
                <div class="class">
                    <div/>
                    <div/>
                    <div/>
                </div>
                <div class="class">
                    {children}
                </div>
            </div>
        )
    });
})
    "#,
        EntryStrategy::Hook,
        MinifyMode::Simplify,
        true,
    );
}

#[test]
fn example_jsx_listeners() {
    test_input(
        "test.tsx",
        r#"
import { qHook, qComponent, h, onRender, withStyle } from '@builder.io/qwik';

export const Foo = qComponent("my-foo", () => {

    return onRender(() => {
        return (
            <div
                on:click={()=>console.log('on:click')}
                onDocument:scroll={()=>console.log('onDocument:scroll')}
                onWindow:scroll={()=>console.log('onWindow:scroll')}
            />
        )
    });
})
    "#,
        EntryStrategy::Hook,
        MinifyMode::Simplify,
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
