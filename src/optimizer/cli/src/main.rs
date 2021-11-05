use clap::Parser;
use path_absolutize::*;
use qwik_core::{transform_workdir, Bundling, FSConfig};

/// Qwik CLI allows to optimize qwik projects before bundling
#[derive(Parser)]
#[clap(version = "0.1")]
struct Opts {
    #[clap(subcommand)]
    subcmd: SubCommand,
}

#[derive(Parser)]
enum SubCommand {
    #[clap(version = "1.3")]
    Optimize(Optimize),
}

/// A subcommand for optimizing qwik projects
#[derive(Parser)]
struct Optimize {
    #[clap(short, long, default_value = ".")]
    project: String,

    /// Print debug info
    #[clap(short, long)]
    dest: String,

    #[clap(short)]
    minify: bool,

    #[clap(short)]
    sourcemaps: bool,
}

fn main() {
    let opts: Opts = Opts::parse();

    // You can handle information about subcommands by requesting their matches by name
    // (as below), requesting just the name used, or both at the same time

    let err = match opts.subcmd {
        SubCommand::Optimize(t) => optimize(t).err(),
    };

    if let Some(err) = err {
        println!("ERROR: {}", err);
    }
}

fn optimize(t: Optimize) -> Result<qwik_core::TransformResult, Box<dyn std::error::Error>> {
    let path = std::env::current_dir()?;
    let input = path
        .join(t.project)
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
        project_root: input,
        glob: None,
        source_maps: true,
        minify: false,
        transpile: true,
        bundling: Bundling::Single,
    })?;

    result.write_to_fs(&output)?;
    return Ok(result);
}
