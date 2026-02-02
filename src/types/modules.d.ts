// Type declarations for modules without types

declare module "speech-rule-engine" {
  export function engineReady(): Promise<void>;
  export function setupEngine(options: {
    locale?: string;
    modality?: string;
    style?: string;
  }): void;
  export function toSpeech(latex: string): string;
}
