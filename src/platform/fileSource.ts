import { detectFormat } from '../formats/detect';

export interface PickedFile {
  name: string;
  size: number;
  data: ArrayBuffer;
}

export function isSupportedFile(file: File): boolean {
  return detectFormat(file.name) !== null;
}

export async function readPickedFile(file: File): Promise<PickedFile> {
  const data = await file.arrayBuffer();
  return { name: file.name, size: file.size, data };
}
