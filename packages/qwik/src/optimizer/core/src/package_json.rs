pub use crate::entry_strategy::EntryStrategy;
pub use crate::parse::{ErrorBuffer, HookAnalysis, MinifyMode, TransformModule, TransformOutput};

#[cfg(feature = "fs")]
pub fn find_modules(
    src_dir: &std::path::Path,
    vendor_dirs: Vec<String>,
    files: &mut Vec<std::path::PathBuf>,
) -> std::io::Result<()> {
    for root in &vendor_dirs {
        find_files(std::path::Path::new(root), files)?;
    }
    find_files(src_dir, files)
}

#[cfg(feature = "fs")]
fn find_files(dir: &std::path::Path, files: &mut Vec<std::path::PathBuf>) -> std::io::Result<()> {
    if dir.is_dir() {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                match path.file_name().and_then(|p| p.to_str()) {
                    Some("node_modules" | "dist" | "build") => {}
                    _ => {
                        find_files(&path, files)?;
                    }
                }
            } else {
                let ext = path.extension().and_then(|p| p.to_str());
                if let Some("ts" | "tsx" | "js" | "jsx") = ext {
                    files.push(path);
                }
            }
        }
    } else {
        let ext = dir.extension().and_then(|p| p.to_str());
        if let Some("ts" | "tsx" | "js" | "jsx") = ext {
            files.push(dir.to_path_buf());
        }
    }
    Ok(())
}
