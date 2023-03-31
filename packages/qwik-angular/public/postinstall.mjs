import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";

const rootTsxPath = resolve("src/root.tsx");
const importStatement = `import './theme.scss';`;

if (existsSync(rootTsxPath)) {
    let rootTsxContent = readFileSync(rootTsxPath, "utf-8");
    const indexToInsert = rootTsxContent.indexOf(`import './global.css';`);
    if (indexToInsert !== -1) {
        const before = rootTsxContent.slice(0, indexToInsert);
        const after = rootTsxContent.slice(indexToInsert);
        rootTsxContent = `${before}${importStatement}\n${after}`;
    } else {
        rootTsxContent = `${importStatement}\n${rootTsxContent}`;
    }
    writeFileSync(rootTsxPath, rootTsxContent);
}
