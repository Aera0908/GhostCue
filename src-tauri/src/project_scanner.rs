use std::fs;
use std::path::{Path, PathBuf};
use log::info;

const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".cache",
    ".venv",
    "venv",
    "env",
    "__pycache__",
    ".idea",
    ".vscode",
    "vendor",
    "bin",
    "obj",
];

const MAX_TOTAL_CHARS: usize = 20_000;
const MAX_FILE_CHARS: usize = 4_000;

#[tauri::command]
pub async fn select_directory_dialog() -> Result<Option<String>, String> {
    info!("Opening native folder selection dialog...");
    let folder = rfd::AsyncFileDialog::new()
        .set_title("Select Project / Codebase Folder")
        .pick_folder()
        .await;

    Ok(folder.map(|f| f.path().to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn scan_project_directory(directory_path: String) -> Result<String, String> {
    let clean_path = directory_path.trim();
    if clean_path.is_empty() {
        return Err("Directory path cannot be empty".to_string());
    }

    let root_path = PathBuf::from(clean_path);
    if !root_path.exists() {
        return Err(format!("Directory path does not exist: {}", clean_path));
    }
    if !root_path.is_dir() {
        return Err(format!("Path is not a directory: {}", clean_path));
    }

    info!("Scanning project directory for interview context: {:?}", root_path);

    let mut result = String::new();
    let dir_name = root_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(clean_path);

    result.push_str(&format!("### Project Root: {}\nPath: {}\n\n", dir_name, clean_path));

    // 1. Generate Directory Tree (up to depth 3)
    result.push_str("#### 1. Repository Layout & File Tree:\n```\n");
    let mut tree_lines = Vec::new();
    collect_tree(&root_path, &root_path, 0, 3, &mut tree_lines);
    result.push_str(&tree_lines.join("\n"));
    result.push_str("\n```\n\n");

    // 2. Extract Key Manifests and Readmes
    result.push_str("#### 2. Project Documentation & Tech Stack Manifests:\n");
    let key_files = find_key_files(&root_path, 2);

    for file_path in key_files {
        if result.len() >= MAX_TOTAL_CHARS {
            result.push_str("\n[Context length limit reached - key architecture captured]\n");
            break;
        }

        if let Ok(content) = fs::read_to_string(&file_path) {
            let rel_path = file_path
                .strip_prefix(&root_path)
                .unwrap_or(&file_path)
                .to_string_lossy();

            let truncated: String = content.chars().take(MAX_FILE_CHARS).collect();
            result.push_str(&format!(
                "\n--- [{}] ---\n```\n{}\n```\n",
                rel_path,
                truncated.trim()
            ));
        }
    }

    Ok(result)
}

fn collect_tree(root: &Path, current: &Path, depth: usize, max_depth: usize, lines: &mut Vec<String>) {
    if depth > max_depth || lines.len() > 60 {
        return;
    }

    let entries = match fs::read_dir(current) {
        Ok(e) => e,
        Err(_) => return,
    };

    let mut sorted_entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
    sorted_entries.sort_by_key(|e| e.file_name());

    for entry in sorted_entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') && name != ".env.example" {
            continue;
        }
        if IGNORED_DIRS.contains(&name.as_str()) {
            continue;
        }

        let indent = "  ".repeat(depth);
        if path.is_dir() {
            lines.push(format!("{}[DIR] {}/", indent, name));
            collect_tree(root, &path, depth + 1, max_depth, lines);
        } else {
            lines.push(format!("{}{}", indent, name));
        }

        if lines.len() > 60 {
            lines.push(format!("{}... (and more files)", indent));
            break;
        }
    }
}

fn find_key_files(root: &Path, max_depth: usize) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let priority_names = [
        "README.md",
        "readme.md",
        "README.txt",
        "package.json",
        "Cargo.toml",
        "pyproject.toml",
        "requirements.txt",
        "go.mod",
        "pom.xml",
        "build.gradle",
        "docker-compose.yml",
        "Dockerfile",
        "ARCHITECTURE.md",
        "architecture.md",
        "DESIGN.md",
    ];

    collect_priority_files(root, root, 0, max_depth, &priority_names, &mut files);
    files
}

fn collect_priority_files(
    root: &Path,
    current: &Path,
    depth: usize,
    max_depth: usize,
    priority_names: &[&str],
    files: &mut Vec<PathBuf>,
) {
    if depth > max_depth || files.len() >= 8 {
        return;
    }

    let entries = match fs::read_dir(current) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if IGNORED_DIRS.contains(&name.as_str()) {
            continue;
        }

        if path.is_file() {
            if priority_names.iter().any(|&p| p.eq_ignore_ascii_case(&name)) {
                files.push(path.clone());
            }
        } else if path.is_dir() && depth < max_depth {
            collect_priority_files(root, &path, depth + 1, max_depth, priority_names, files);
        }
    }
}
