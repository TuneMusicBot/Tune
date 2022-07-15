/* eslint-disable no-plusplus */
import { join, resolve } from "path";
import fs from "fs";

export const directory = async <T>(
  options: DirectoryOptions<T>
): Promise<number> => {
  try {
    const files = fs.readdirSync(resolve(options.path));
    let loadedFiles = 0;
    for (const file of files) {
      const filePath = join(options.path, file);
      const stat = fs.statSync(filePath);
      if (file.match(/\.(js|json|ts)$/) && stat.isFile()) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const imported = await import(filePath);
          loadedFiles++;
          options.file(stat, filePath, file, Object.values(imported)[0] as T);
          continue;
        } catch (e: any) {
          options.error(e);
          continue;
        }
      } else if (stat.isDirectory() && options.recursive) {
        // eslint-disable-next-line no-await-in-loop
        loadedFiles += await directory<T>({
          path: filePath,
          recursive: true,
          error: options.error,
          file: options.file,
        });
      }
    }
    return loadedFiles;
  } catch (e: any) {
    options.error(e);
    return 0;
  }
};

interface DirectoryOptions<T> {
  path: string;
  recursive: boolean;
  error(err: any): unknown;
  file(file: fs.Stats, path: string, name: string, imported: T): unknown;
}
