import { Component } from '@devtools/kit';
import { ServerContext } from '../types';
import fsp from 'node:fs/promises';
import fg from 'fast-glob';

export const getComponentsFunctions = ({ config }: ServerContext) => {
  const getComponentName = (code: string) => {
    const exportDefaultRegex = /export\s+default\s+component\$\(\s*.*\s*\);/;
    if (exportDefaultRegex.test(code)) {
      return 'default';
    }

    const namedExportRegex =
      /export\s+(const|let|var|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*component\$\(/;
    const match = code.match(namedExportRegex);

    return match ? match[2] : 'default';
  };

  const getComponents = async (): Promise<Component[]> => {
    const components: Component[] = [];

    const filesOnSrc = await fg(`${config.root}/src/**/*.tsx`, {
      onlyFiles: true,
    });

    const componentsFiles = filesOnSrc.filter((file) => !file.includes('/src/routes/'));

    const componentsSourceCode = await Promise.all(
      componentsFiles.map(async (file) => {
        const sourceCode = await fsp.readFile(file, 'utf-8');

        return {
          file,
          sourceCode,
        };
      })
    );

    for (const { sourceCode, file } of componentsSourceCode) {
      if (!sourceCode.includes('component$')) continue;

      const name = getComponentName(sourceCode);

      components.push({
        fileName: file.split('/').pop()!,
        name,
        file,
      });
    }

    return Promise.resolve(components);
  };

  return {
    getComponents,
  };
};
