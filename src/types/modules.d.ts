// Type declarations for modules without types

declare module "speech-rule-engine" {
  export function engineReady(): Promise<void>;
  export function setupEngine(options: {
    locale?: string;
    domain?: string;
    modality?: string;
    style?: string;
    speech?: string;
  }): Promise<void>;
  export function resetEngine(): void;
  export function toSpeech(mml: string): string;
}
