declare module "busboy" {
  interface BusboyConfig {
    headers: Record<string, string>;
    limits?: {
      files?: number;
      fileSize?: number;
    };
  }

  interface FileInfo {
    filename: string;
    mimeType: string;
  }

  interface BusboyFileStream extends NodeJS.ReadableStream {
    on(event: "data", listener: (chunk: Buffer) => void): this;
    on(event: "limit", listener: () => void): this;
  }

  interface BusboyInstance extends NodeJS.WritableStream {
    on(event: "field", listener: (fieldName: string, value: string) => void): this;
    on(
      event: "file",
      listener: (fieldName: string, file: BusboyFileStream, info: FileInfo) => void,
    ): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "finish", listener: () => void): this;
    end(chunk?: Buffer): void;
  }

  export default function Busboy(config: BusboyConfig): BusboyInstance;
}
