#![deny(clippy::all)]
#![deny(clippy::perf)]
#![deny(clippy::nursery)]

use std::path::PathBuf;

use clap::{App, AppSettings, Arg};
use path_absolutize::Absolutize;
use qwik_core::{transform_fs, EntryStrategy, MinifyMode, TransformFsOptions};

struct OptimizerInput {
    glob: Option<String>,
    src: PathBuf,
    dest: PathBuf,
    strategy: EntryStrategy,
    transpile: bool,
    minify: MinifyMode,
    sourcemaps: bool,
    explicity_extensions: bool,
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
                        .possible_values(["single", "hook", "smart", "component"])
                        .takes_value(true)
                        .about("entry strategy used to group hooks"),
                )
                .arg(
                    Arg::new("no-transpile")
                    .long("no-transpile")
                    .about("transpile TS and JSX into JS").takes_value(false)
                 )
                .arg(Arg::new("minify").long("minify").possible_values(["minify", "simplify", "none"]).takes_value(true).about("outputs minified source code"))
                .arg(Arg::new("sourcemaps").long("sourcemaps").about("generates sourcemaps").takes_value(false))
                .arg(Arg::new("extensions").long("extensions").about("keep explicit extensions on imports").takes_value(false)),
        )
        .get_matches();

    // You can check for the existence of subcommands, and if found use their
    // matches just as you would the top level app
    if let Some(matches) = matches.subcommand_matches("optimize") {
        // "$ myapp test" was run
        let strategy = match matches.value_of("strategy") {
            Some("hook") => EntryStrategy::Hook,
            Some("single") => EntryStrategy::Single,
            Some("component") => EntryStrategy::Component,
            Some("smart") | None => EntryStrategy::Smart,
            _ => panic!("Invalid strategy option"),
        };

        let minify = match matches.value_of("minify") {
            Some("none") => MinifyMode::None,
            Some("simplify") | None => MinifyMode::Simplify,
            _ => panic!("Invalid minify option"),
        };
        optimize(OptimizerInput {
            src: matches.value_of_t_or_exit("src"),
            dest: matches.value_of_t_or_exit("dest"),
            glob: None,
            strategy,
            minify,
            explicity_extensions: matches.is_present("extensions"),
            transpile: !matches.is_present("no-transpile"),
            sourcemaps: matches.is_present("sourcemaps"),
        })?;
    }
    Ok(())
}

fn optimize(
    optimizer_input: OptimizerInput,
) -> Result<qwik_core::TransformOutput, Box<dyn std::error::Error>> {
    let current_dir = std::env::current_dir()?;
    let root_dir = current_dir.join(optimizer_input.src).canonicalize()?;

    let result = transform_fs(TransformFsOptions {
        root_dir: root_dir.to_string_lossy().to_string(),
        glob: optimizer_input.glob,
        source_maps: optimizer_input.sourcemaps,
        minify: optimizer_input.minify,
        transpile: optimizer_input.transpile,
        entry_strategy: optimizer_input.strategy,
        explicity_extensions: optimizer_input.explicity_extensions,
        dev: true,
        scope: None,
    })?;

    result.write_to_fs(&current_dir.join(optimizer_input.dest).absolutize()?)?;
    Ok(result)
}
