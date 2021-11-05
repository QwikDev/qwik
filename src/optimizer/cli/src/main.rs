use clap::{App, AppSettings, Arg};
use path_absolutize::*;
use qwik_core::{transform_workdir, EntryStrategy, FSConfig};

struct Optimize {
    glob: Option<String>,
    src: String,
    dest: String,
    strategy: EntryStrategy,
    transpile: bool,
    minify: bool,
    sourcemaps: bool,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let matches = App::new("qwik")
        .version("1.0")
        .setting(
            AppSettings::ArgRequiredElseHelp
                | AppSettings::SubcommandRequiredElseHelp
                | AppSettings::InferSubcommands
                | AppSettings::DisableHelpSubcommand,

        )
        .about("Qwik CLI allows to optimize qwik projects before bundling")
        .subcommand(
            App::new("optimize")
                .about("takes a source directory of qwik code and outputs an optimized version that lazy loads")
                .setting(AppSettings::ArgRequiredElseHelp)
                .arg(
                    Arg::new("src")
                        .short('s')
                        .long("src")
                        .default_value(".")
                        .takes_value(true)
                        .about("relative path to the source directory"),
                )
                .arg(
                    Arg::new("dest")
                        .short('d')
                        .long("dest")
                        .required(true)
                        .takes_value(true)
                        .about("relative path to the output directory"),
                )
                .arg(
                    Arg::new("glob")
                        .short('g')
                        .long("glob")
                        .takes_value(true)
                        .about("glob used to match files within the source directory"),
                )
                .arg(
                    Arg::new("strategy")
                    .long("strategy")
                        .possible_values(["single", "per-hook"])
                        .about("entry strategy used to group hooks"),
                )
                .arg(Arg::new("no-transpile").long("no-transpile").about("transpile TS and JSX into JS").takes_value(false))
                .arg(Arg::new("minify").long("minify").about("outputs minified source code").takes_value(false))
                .arg(Arg::new("sourcemaps").long("sourcemaps").about("generates sourcemaps").takes_value(false)),
        )
        .get_matches();

    // You can check for the existence of subcommands, and if found use their
    // matches just as you would the top level app
    if let Some(ref matches) = matches.subcommand_matches("optimize") {
        // "$ myapp test" was run
        let mut strategy = EntryStrategy::Single;
        if matches.value_of("strategy") == Some("per-hook") {
            strategy = EntryStrategy::PerHook;
        }
        optimize(Optimize {
            src: matches.value_of_t_or_exit("src"),
            dest: matches.value_of_t_or_exit("dest"),
            glob: None,
            strategy,
            minify: matches.is_present("minify"),
            transpile: !matches.is_present("no-transpile"),
            sourcemaps: matches.is_present("sourcemaps"),
        })?;
    }
    return Ok(());
}

fn optimize(t: Optimize) -> Result<qwik_core::TransformResult, Box<dyn std::error::Error>> {
    let path = std::env::current_dir()?;
    let input = path
        .join(t.src)
        .canonicalize()?
        .to_str()
        .unwrap()
        .to_string();
    let output = std::path::Path::new(&path.join(t.dest))
        .absolutize()?
        .to_str()
        .unwrap()
        .to_string();

    let result = transform_workdir(&FSConfig {
        root_dir: input,
        glob: t.glob,
        source_maps: t.sourcemaps,
        minify: t.minify,
        transpile: t.transpile,
        entry_strategy: t.strategy,
    })?;
    // dbg!(&result);

    result.write_to_fs(&output)?;
    return Ok(result);
}
