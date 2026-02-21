declare module '@jscad/json-serializer' {
  export function serialize(options: Record<string, unknown>, ...objects: unknown[]): string[];
  export const mimeType: string;
}
